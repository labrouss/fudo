# @fudo/kuma-notifications

Notification providers from [Uptime Kuma](https://github.com/louislam/uptime-kuma) (MIT License, see `LICENSE`),
vendored **unmodified** in `server/notification-providers/`. Fudo-specific files:

| File | Purpose |
|---|---|
| `index.js` | Loader and `send()` adapter |
| `context.js` | Base URL used in links |
| `server/settings.js`, `server/util-server.js`, `src/util.js` | Shims for the Kuma internals the providers import |
| `providers.json` | Generated form definitions (labels from Kuma's `en.json`) |

Regenerate after updating Kuma:

```bash
git clone --depth 1 https://github.com/louislam/uptime-kuma.git /tmp/uptime-kuma
node scripts/kuma/generate.mjs /tmp/uptime-kuma
```
