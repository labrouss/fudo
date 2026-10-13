#!/bin/sh
# Writes nginx's configuration for Fudo before nginx starts (the official image runs
# /docker-entrypoint.d/*.sh first).
#   FUDO_TLS=off          plain HTTP on port 80 (default; e.g. behind your own reverse proxy)
#   FUDO_TLS=files        HTTPS with HTTP/2 on port 443, certificate from $FUDO_TLS_DIR:
#                         fullchain.pem (certificate + chain) and privkey.pem
#   FUDO_TLS=self-signed  the same with a certificate generated once and kept in $FUDO_TLS_DIR
# With TLS, port 80 redirects to HTTPS, except push heartbeats (/api/push/) and /api/health,
# which scripts and load balancers call over plain HTTP.
set -eu

MODE="${FUDO_TLS:-off}"
CONF_DIR="${FUDO_NGINX_CONF_DIR:-/etc/nginx/conf.d}"
TEMPLATES="${FUDO_NGINX_TEMPLATES:-/etc/fudo/nginx}"
TLS_DIR="${FUDO_TLS_DIR:-/etc/fudo/tls}"
API="${FUDO_API_UPSTREAM:-api:3000}"
HTTPS_PORT="${FUDO_HTTPS_PORT:-443}"
NAME="${FUDO_TLS_HOSTNAME:-$(hostname)}"
CERT="$TLS_DIR/fullchain.pem"
KEY="$TLS_DIR/privkey.pem"
log() { echo "fudo: $*"; }
fail() { echo "fudo: $*" >&2; exit 1; }

sed "s#__API__#$API#g" "$TEMPLATES/locations.conf" > "$CONF_DIR/fudo-locations.inc"

proxy() { # a proxied location for the plain-HTTP server when TLS is on
  cat <<CONF
  location $1 {
    proxy_pass http://$API;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
CONF
}

case "$MODE" in
  off)
    cat > "$CONF_DIR/default.conf" <<CONF
server {
  listen 80;
  server_name _;
  include $CONF_DIR/fudo-locations.inc;
}
CONF
    log "serving HTTP on port 80 (FUDO_TLS=off)"
    exit 0
    ;;
  files)
    [ -r "$CERT" ] && [ -r "$KEY" ] || fail "FUDO_TLS=files needs $CERT and $KEY (certificate with its chain, and private key). Not starting without them."
    ;;
  self-signed)
    if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
      mkdir -p "$TLS_DIR"
      openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 825 \
        -subj "/CN=$NAME" -addext "subjectAltName=DNS:$NAME,DNS:localhost,IP:127.0.0.1" \
        -keyout "$KEY" -out "$CERT" 2>/dev/null || fail "could not create a self-signed certificate in $TLS_DIR"
      chmod 600 "$KEY"
      log "created a self-signed certificate for $NAME (kept in $TLS_DIR across restarts)"
    fi
    ;;
  *) fail "FUDO_TLS must be off, files or self-signed (not \"$MODE\")" ;;
esac

openssl x509 -in "$CERT" -noout 2>/dev/null || fail "$CERT is not a PEM certificate"
openssl x509 -in "$CERT" -noout -checkend 0 >/dev/null 2>&1 || log "WARNING: the certificate in $CERT has expired"
openssl x509 -in "$CERT" -noout -checkend 2592000 >/dev/null 2>&1 || log "WARNING: the certificate in $CERT expires within 30 days"

SUFFIX=""; [ "$HTTPS_PORT" = "443" ] || SUFFIX=":$HTTPS_PORT"
# nginx 1.25.1 moved HTTP/2 from "listen ... http2" to "http2 on"
V=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9]*\)\.\([0-9]*\)\.\([0-9]*\).*#\1 \2 \3#p')
set -- $V
if [ "${1:-1}" -gt 1 ] || { [ "${1:-1}" -eq 1 ] && { [ "${2:-0}" -gt 25 ] || { [ "${2:-0}" -eq 25 ] && [ "${3:-0}" -ge 1 ]; }; }; }; then
  LISTEN="listen 443 ssl;"; H2="http2 on;"
else
  LISTEN="listen 443 ssl http2;"; H2=""
fi
HSTS=""; [ "${FUDO_HSTS:-false}" = "true" ] && HSTS='add_header Strict-Transport-Security "max-age=31536000" always;'

{
  echo "server {"
  echo "  listen 80;"
  echo "  server_name _;"
  proxy "/api/push/"
  proxy "= /api/health"
  echo "  location / { return 301 https://\$host$SUFFIX\$request_uri; }"
  echo "}"
  cat <<CONF
server {
  $LISTEN
  $H2
  server_name _;
  ssl_certificate $CERT;
  ssl_certificate_key $KEY;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:fudo:10m;
  ssl_session_timeout 1d;
  ssl_session_tickets off;
  $HSTS
  include $CONF_DIR/fudo-locations.inc;
}
CONF
} > "$CONF_DIR/default.conf"
log "serving HTTPS with HTTP/2 on port 443 (FUDO_TLS=$MODE); port 80 redirects to https://<host>$SUFFIX"
