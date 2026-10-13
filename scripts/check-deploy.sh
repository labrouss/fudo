#!/bin/sh
# The production install of the Docker images (docker/node.Dockerfile), without Docker. Like a
# Docker build it starts clean: a copy without node_modules, an empty pnpm store and cache. Only
# then does "pnpm deploy" hit problems such as a published package whose manifest still contains
# unresolved "catalog:" versions (ldapts 8.2.0 and later; see packages/monitors/package.json).
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo"
(cd "$root" && tar --exclude=node_modules --exclude='*/dist' -cf - package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json apps packages locales) | tar -xf - -C "$tmp/repo"
cd "$tmp/repo"
P="--store-dir $tmp/store --config.cache-dir=$tmp/cache"
if ! out=$(pnpm install --frozen-lockfile $P 2>&1); then echo "$out" | tail -15 >&2; echo "check:deploy: pnpm install --frozen-lockfile fails" >&2; exit 1; fi
for app in api worker; do
  if ! out=$(pnpm --filter "@fudo/$app" build 2>&1 && pnpm --filter "@fudo/$app" deploy --prod "$tmp/out-$app" $P 2>&1); then
    echo "$out" | grep -E "ERR_PNPM|ERROR|error" >&2 || echo "$out" | tail -20 >&2
    echo "check:deploy: the production install of $app fails (as it would in its Docker image)" >&2
    exit 1
  fi
  echo "check:deploy: $app ok"
done
