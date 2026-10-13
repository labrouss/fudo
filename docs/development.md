# Development

## Architecture

```
┌────────┐   /api    ┌────────┐        ┌──────────────────────────┐
│  web   │ ────────▶ │  api   │ ─────▶ │ PostgreSQL + TimescaleDB │
│ nginx  │           │Fastify │        │  app tables · hypertables│
└────────┘           └────────┘        │  pg-boss queue (pgboss.*)│
                                       └────────────▲─────────────┘
                     ┌────────┐                     │
                     │ worker │ ────────────────────┘
                     │scheduler, checks, alerts,    │
                     │state engine, reports         │
                     └────────┘
```

| Layer | Technology |
|---|---|
| Language | TypeScript (Node.js 22) |
| API | Fastify 5, Zod |
| Database | PostgreSQL 17 + TimescaleDB, Drizzle ORM for queries, plain SQL migrations |
| Jobs | pg-boss (queue and cron inside PostgreSQL; no Redis) |
| Web | React 19 + Vite |

Guiding principles: one alert per root cause; everything configurable in the web interface;
few moving parts (PostgreSQL is the only stateful service); a pure, testable core (the status
engine has no I/O).

## Repository layout

```
apps/
  api/        REST API (Fastify)
  worker/     scheduler, checks, state engine, notifications, reports
  web/        React interface
packages/
  shared/     domain types, permissions, validation, crypto, TOTP, message catalogue, themes
  monitors/   monitor types, check runners, state machine, result recording
  engine/     dependency graph, root cause, what-if, incident planning, availability
  notify/     channel types, messages, senders, delivery outbox, server-side translations
  reports/    report data, PDF and CSV rendering, periods, email delivery
  report-fonts/  DejaVu Sans and the logo for PDF reports
  kuma-notifications/  Uptime Kuma notification providers, vendored unmodified (MIT)
  db/         Drizzle schema, SQL migrations, migration runner
locales/      language files (see locales/README.md)
themes/       themes (see themes/README.md)
docs/         this documentation; docs/guide is also shown in the app under Help
docker/       Dockerfiles and nginx configuration
scripts/      i18n tools, theme check, Uptime Kuma provider generator
```

## Local setup

Requirements: Node 22, pnpm 9, PostgreSQL with the TimescaleDB extension (for example
`docker compose up -d db` with port 5432 published).

```bash
pnpm install
cp .env.example .env        # DATABASE_URL pointing at localhost
pnpm dev                    # api :3000, worker, web :5173 (proxies /api)
```

| Command | Purpose |
|---|---|
| `pnpm dev` | api, worker and web in watch mode |
| `pnpm build` | build all apps |
| `pnpm typecheck` | type-check every package |
| `pnpm test` | unit tests |
| `pnpm migrate` | apply migrations by hand |
| `pnpm i18n:sync` | regenerate generated English texts (definitions, messages, notifications, reports, API errors) |
| `pnpm i18n:check` | validate every language file |
| `pnpm themes:check [folder]` | validate themes, including contrast |
| `pnpm docs:check` | validate help translations and links; `--new <lang> <page>` starts a translation, `--stamp <file>` marks it up to date |

Run `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, `pnpm themes:check` and `pnpm docs:check`
before opening a pull request.

## Migrations

Plain SQL files in `packages/db/migrations/NNNN_name.sql`, applied in order at API and worker
start-up (advisory-locked, one transaction per file, recorded in `schema_migrations`). Plain SQL
keeps TimescaleDB features (hypertables, continuous aggregates, policies) first-class. Keep
`packages/db/src/schema.ts` in sync for typed queries. Never edit a released migration; add a
new one.

## Texts and translations

Write user-facing text in English; never build sentences from fragments.

- **Interface texts** go through `t("key")`; add the key to `locales/en.json`.
- **Server-generated texts** (check results, incident titles, notifications, reports) live in
  catalogues (`packages/shared/src/messages.ts`, `packages/notify/src/texts.ts`,
  `packages/reports/src/texts.ts`); run `pnpm i18n:sync`.
- **API errors** stay plain English literals in the code; `pnpm i18n:sync` finds them.

Contributor guides: `locales/README.md` (translations, plurals, right-to-left) and
`themes/README.md` (themes).

## Uptime Kuma providers

`packages/kuma-notifications` contains Uptime Kuma's notification providers unmodified, plus
shims and generated form definitions. Regenerate with
`node scripts/kuma/generate.mjs <path-to-uptime-kuma-checkout>`.

## Dependencies

- **`ldapts` is pinned to 8.1.8.** Versions 8.2.0 and later were published with unresolved
  `"catalog:"` versions in their manifest; `pnpm install` accepts them, but `pnpm deploy` (the
  production install in the Docker images) fails with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`.
  Before upgrading, check the new version with `pnpm check:deploy`.
- **`pnpm check:deploy`** runs the Docker images' production install without Docker, starting clean
  (no `node_modules`, empty pnpm store and cache) like a Docker build. CI runs it on every push. Run
  it after adding or upgrading a dependency of the API or worker.

## License

Fudo's own code is AGPL-3.0-or-later (`LICENSE`). Vendored third-party code keeps its license:
Uptime Kuma providers (MIT, `packages/kuma-notifications/LICENSE`) and the DejaVu fonts
(`packages/report-fonts/LICENSE-DejaVu`); the `license` fields of those packages say so. Only add
dependencies whose licenses are compatible with the AGPL (MIT, BSD, Apache-2.0, ISC and similar).

The interface shows the version and links to the license and source code under **Help**, using
`version` and `repository` from the root `package.json`.

## Releases

Semantic versioning; the version lives in every `package.json` and is reported by `/api/health`.
Record every change in `CHANGELOG.md`.
