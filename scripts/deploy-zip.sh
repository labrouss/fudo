#!/usr/bin/env bash
# Deploys a Fudo release zip with minimal downtime and a way back.
#
#   deploy-zip.sh                  the newest fudo-v*.zip in $ZIP_DIR (by version number)
#   deploy-zip.sh path/to/fudo.zip a given zip
#   deploy-zip.sh --rollback       back to the previous release and its database
#
# How it works:
#   1. extracts the zip to a fresh folder (files removed in the new version do not linger)
#   2. carries over your own files (.env, docker-compose.override.yml, tls/)
#   3. builds the new images WHILE THE CURRENT VERSION KEEPS RUNNING; a failed build changes nothing
#   4. backs up the database (pg_dump), then switches to the new version
#   5. waits until /api/health reports the new version as healthy (database and worker)
# The previous release, its images (tagged with its version) and the database backup are kept,
# so --rollback needs no rebuild.
#
# Settings (environment): BASE (default /docker-data), ZIP_DIR (default the home of hpadmin),
# HEALTH_TIMEOUT (seconds, default 180), KEEP_BACKUPS (default 5), YES=1 (no questions).
set -Eeuo pipefail

BASE=${BASE:-/docker-data}
NAME=fudo
CURRENT="$BASE/$NAME"
PREVIOUS="$BASE/$NAME.previous"
NEW="$BASE/$NAME.new"
BACKUPS="$BASE/$NAME-backups"
ZIP_DIR=${ZIP_DIR:-$(getent passwd hpadmin | cut -d: -f6)}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
KEEP_BACKUPS=${KEEP_BACKUPS:-5}
CARRY=(.env docker-compose.override.yml tls)   # yours, not the release's
SERVICES=(api worker web)                       # the images built from the release

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
dc() { local dir=$1; shift; docker compose --project-directory "$dir" -f "$dir/docker-compose.yml" "$@"; }
version_of() { grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$1/package.json" | head -1 | sed -E 's/.*"([^"]+)"$/\1/'; }
env_get() { sed -nE "s/^$2=[\"']?([^\"']*)[\"']?[[:space:]]*\$/\\1/p" "$1/.env" | tail -1; }
keys() { if [[ -f $1 ]]; then sed -nE 's/^([A-Z_][A-Z0-9_]*)=.*/\1/p' "$1" | sort -u; fi; }
confirm() { [[ ${YES:-} == 1 ]] && return 0; read -r -p "[deploy] $1 [y/N] " a; [[ $a == y || $a == Y ]]; }
image_of() { echo "$NAME-$1"; }   # Compose names built images <project>-<service>

# one deployment at a time
mkdir -p "$BASE"
exec 9>"$BASE/.$NAME-deploy.lock"
flock -n 9 || die "another deployment is running"

health() { # dir → the health response, or nothing
  local port; port=$(env_get "$1" WEB_PORT); port=${port:-8080}
  # plain HTTP: /api/health is never redirected to HTTPS (FUDO_TLS)
  curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" 2>/dev/null || true
}
wait_healthy() { # dir version
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) body=""
  log "waiting for version $2 to report healthy (up to ${HEALTH_TIMEOUT}s)"
  while ((SECONDS < deadline)); do
    body=$(health "$1")
    [[ $body == *'"status":"ok"'* && $body == *"\"version\":\"$2\""* ]] && return 0
    sleep 3
  done
  log "last health answer: ${body:-none}"
  return 1
}
show_problem() { # dir
  dc "$1" ps || true
  for s in "${SERVICES[@]}"; do log "--- last log lines of $s"; dc "$1" logs --tail 25 "$s" 2>&1 || true; done
}

backup_db() { # dir version-from version-to → prints the dump file
  local u d out
  u=$(env_get "$1" POSTGRES_USER); d=$(env_get "$1" POSTGRES_DB)
  mkdir -p "$BACKUPS"; chmod 700 "$BACKUPS"
  out="$BACKUPS/$NAME-$2-before-$3-$(date +%Y%m%d-%H%M%S).dump"
  dc "$1" up -d --wait db >/dev/null
  dc "$1" exec -T db pg_dump -U "$u" -d "$d" -Fc >"$out.part" || { rm -f "$out.part"; return 1; }
  [[ -s $out.part ]] || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"; chmod 600 "$out"
  echo "$out"
}
restore_db() { # dir dump: replaces the database with the dump (TimescaleDB-aware)
  local u d ts; u=$(env_get "$1" POSTGRES_USER); d=$(env_get "$1" POSTGRES_DB)
  dc "$1" exec -T db psql -v ON_ERROR_STOP=1 -q -U "$u" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE);" -c "CREATE DATABASE \"$d\" OWNER \"$u\";"
  ts=$(dc "$1" exec -T db psql -At -U "$u" -d "$d" -c "SELECT count(*) FROM pg_available_extensions WHERE name = 'timescaledb'")
  if [[ $ts == 1 ]]; then
    dc "$1" exec -T db psql -v ON_ERROR_STOP=1 -q -U "$u" -d "$d" \
      -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" -c "SELECT timescaledb_pre_restore();" >/dev/null
  fi
  dc "$1" exec -T db pg_restore -U "$u" -d "$d" <"$2" || log "pg_restore reported warnings (checked by the health check below)"
  if [[ $ts == 1 ]]; then
    dc "$1" exec -T db psql -v ON_ERROR_STOP=1 -q -U "$u" -d "$d" -c "SELECT timescaledb_post_restore();" >/dev/null
  fi
}

# ---------------------------------------------------------------- rollback
if [[ ${1:-} == --rollback ]]; then
  [[ -f $BACKUPS/rollback.env ]] || die "nothing to roll back to (no $BACKUPS/rollback.env)"
  # shellcheck disable=SC1091
  source "$BACKUPS/rollback.env"   # PREV_VERSION, FAILED_VERSION, DUMP
  [[ -d $PREVIOUS ]] || die "the previous release ($PREVIOUS) is missing"
  [[ -s $DUMP ]] || die "the database backup ($DUMP) is missing"
  for s in "${SERVICES[@]}"; do docker image inspect "$(image_of "$s"):$PREV_VERSION" >/dev/null 2>&1 || die "image $(image_of "$s"):$PREV_VERSION is missing"; done
  log "rolling back from $FAILED_VERSION to $PREV_VERSION"
  log "the database goes back to the backup taken before the upgrade: changes since then are lost"
  confirm "Continue?" || die "cancelled"
  dc "$CURRENT" stop "${SERVICES[@]}"
  restore_db "$CURRENT" "$DUMP"
  for s in "${SERVICES[@]}"; do docker image tag "$(image_of "$s"):$PREV_VERSION" "$(image_of "$s"):latest"; done
  rm -rf "$BASE/$NAME.failed"; mv "$CURRENT" "$BASE/$NAME.failed"; mv "$PREVIOUS" "$CURRENT"
  dc "$CURRENT" up -d --remove-orphans --no-build
  wait_healthy "$CURRENT" "$PREV_VERSION" || { show_problem "$CURRENT"; die "version $PREV_VERSION is not healthy after the rollback"; }
  rm -f "$BACKUPS/rollback.env"
  log "rolled back: version $PREV_VERSION is running (the failed release is in $BASE/$NAME.failed)"
  exit 0
fi

# ---------------------------------------------------------------- deploy
ZIP=${1:-}
if [[ -z $ZIP ]]; then
  ZIP=$(find "$ZIP_DIR" -maxdepth 1 -name 'fudo-v*.zip' -printf '%f\n' 2>/dev/null | sort -V | tail -1)
  [[ -n $ZIP ]] || die "no fudo-v*.zip in $ZIP_DIR"
  ZIP="$ZIP_DIR/$ZIP"
fi
[[ -f $ZIP ]] || die "$ZIP not found"
unzip -tq "$ZIP" >/dev/null || die "$ZIP is damaged"

log "extracting $(basename "$ZIP")"
rm -rf "$NEW" "$NEW.tmp"; mkdir -p "$NEW.tmp"
unzip -q "$ZIP" -d "$NEW.tmp"
[[ -f $NEW.tmp/$NAME/docker-compose.yml ]] || { rm -rf "$NEW.tmp"; die "$ZIP does not contain $NAME/docker-compose.yml"; }
mv "$NEW.tmp/$NAME" "$NEW"; rm -rf "$NEW.tmp"
trap 'rm -rf "$NEW"' EXIT   # removed if anything below fails before the switch

NEW_VERSION=$(version_of "$NEW")
OLD_VERSION=""; [[ -f $CURRENT/package.json ]] && OLD_VERSION=$(version_of "$CURRENT")
log "current version: ${OLD_VERSION:-none} · new version: $NEW_VERSION"
[[ -n $NEW_VERSION ]] || die "the zip has no version in package.json"
if [[ -n $OLD_VERSION && $NEW_VERSION == "$OLD_VERSION" ]]; then
  confirm "$NEW_VERSION is already installed. Deploy it again?" || die "cancelled"
fi

for f in "${CARRY[@]}"; do if [[ -e $CURRENT/$f ]]; then cp -a "$CURRENT/$f" "$NEW/"; fi; done
if [[ ! -f $NEW/.env ]]; then
  mkdir -p "$CURRENT"; cp "$NEW/.env.example" "$CURRENT/.env.example"
  echo "No .env found: this looks like a first-time deployment." >&2
  echo "Create it from the example, fill in real secrets, and run this again:" >&2
  echo "  cp $CURRENT/.env.example $CURRENT/.env && ${EDITOR:-vi} $CURRENT/.env" >&2
  exit 1
fi
# settings new in this release: in its .env.example, not in the previous one, not in your .env
if [[ -f $CURRENT/.env.example ]]; then
  added=$(comm -23 <(keys "$NEW/.env.example") <(keys "$CURRENT/.env.example") | comm -23 - <(keys "$NEW/.env") || true)
  if [[ -n $added ]]; then log "new settings in this release (see .env.example; they have defaults): $(echo $added)"; fi
fi

# keep the running images under their version, so a rollback needs no rebuild
if [[ -n $OLD_VERSION ]]; then
  for s in "${SERVICES[@]}"; do
    if docker image inspect "$(image_of "$s"):latest" >/dev/null 2>&1; then docker image tag "$(image_of "$s"):latest" "$(image_of "$s"):$OLD_VERSION"; fi
  done
fi

log "building $NEW_VERSION (the current version keeps running)"
if ! dc "$NEW" build --pull; then
  die "the build failed; nothing was changed, ${OLD_VERSION:-the current version} keeps running"
fi

DUMP=""
if [[ -n $OLD_VERSION ]]; then
  log "backing up the database"
  DUMP=$(backup_db "$CURRENT" "$OLD_VERSION" "$NEW_VERSION") || die "the database backup failed; nothing was changed"
  log "database backup: $DUMP ($(du -h "$DUMP" | cut -f1))"
fi

log "switching to $NEW_VERSION"
trap - EXIT
rm -rf "$PREVIOUS"
if [[ -d $CURRENT ]]; then mv "$CURRENT" "$PREVIOUS"; fi
mv "$NEW" "$CURRENT"
if [[ -n $OLD_VERSION ]]; then
  printf 'PREV_VERSION=%q\nFAILED_VERSION=%q\nDUMP=%q\n' "$OLD_VERSION" "$NEW_VERSION" "$DUMP" >"$BACKUPS/rollback.env"
fi
dc "$CURRENT" up -d --remove-orphans

if ! wait_healthy "$CURRENT" "$NEW_VERSION"; then
  show_problem "$CURRENT"
  if [[ -n $OLD_VERSION ]]; then die "version $NEW_VERSION is not healthy. To go back to $OLD_VERSION: $0 --rollback"; fi
  die "version $NEW_VERSION is not healthy"
fi
log "version $NEW_VERSION is running and healthy"

# tidy up: unused image layers, and old database backups beyond KEEP_BACKUPS
docker image prune -f >/dev/null || true
if [[ -d $BACKUPS ]]; then
  find "$BACKUPS" -maxdepth 1 -name "$NAME-*.dump" -printf '%T@ %p\n' | sort -rn | tail -n +$((KEEP_BACKUPS + 1)) | cut -d' ' -f2- | xargs -r rm -f
fi
if [[ -n $OLD_VERSION ]]; then log "previous release kept in $PREVIOUS; to go back: $0 --rollback"; fi
exit 0
