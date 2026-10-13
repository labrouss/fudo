# Builds either the api or the worker: --build-arg APP=api|worker
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY apps apps
COPY locales locales
COPY themes themes
RUN pnpm install --frozen-lockfile
ARG APP
RUN pnpm --filter @fudo/${APP} build \
 && pnpm --filter @fudo/${APP} deploy --prod /out

FROM node:22-alpine
# iputils ping for Ping monitors (busybox ping lacks some options); needs CAP_NET_RAW or ping_group_range
RUN apk add --no-cache iputils
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out ./
COPY packages/db/migrations ./migrations
# language files (the API serves them; LOCALES_DIR can add or override languages)
COPY locales ./locales
COPY themes ./themes
# backups (BACKUP_DIR): owned by node, so a fresh volume mounted here is writable
RUN mkdir -p /backups && chown node:node /backups
USER node
CMD ["node", "dist/index.js"]
