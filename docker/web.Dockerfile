FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY apps apps
COPY locales locales
# the user guide is bundled into the interface (Help)
COPY docs/guide docs/guide
RUN pnpm install --frozen-lockfile && pnpm --filter @fudo/web build

FROM nginx:1.27-alpine
# openssl: self-signed certificates (FUDO_TLS=self-signed) and certificate checks at start
RUN apk add --no-cache openssl
# 40-fudo.sh writes the server configuration at start: HTTP, or HTTPS with HTTP/2 (FUDO_TLS)
COPY docker/nginx/locations.conf /etc/fudo/nginx/locations.conf
COPY --chmod=755 docker/nginx/40-fudo.sh /docker-entrypoint.d/40-fudo.sh
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80 443
