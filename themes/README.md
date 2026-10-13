# Themes

Every file in this folder is a theme: `solarized.json` adds a theme with the id `solarized`.
Users choose themes under **Settings**. Files are picked up while Fudo runs; no restart is needed.

## Adding a theme without rebuilding

Mount a folder and point `THEMES_DIR` at it (see `docker-compose.yml`). A file there with the same
name as a built-in theme is **merged over it**, so re-branding the built-in Dark theme takes one line:

```json
{ "colors": { "brand": "#00a3e0" } }
```

## File format

```json
{
  "_meta": {
    "name": "Solarized Dark",
    "mode": "dark",
    "extends": "dark",
    "description": "Ethan Schoonover's palette.",
    "authors": ["Your Name"]
  },
  "colors": {
    "ground": "#002b36",
    "surface": "#073642",
    "ink": "#eee8d5",
    "accent": "#268bd2"
  }
}
```

- **File name**: lower-case letters, digits and dashes (`solarized-dark.json`).
- **`mode`**: `light` or `dark`; tells browsers how to draw scrollbars, date pickers and other native controls. Inherited from the extended theme when omitted.
- **`extends`** (optional): start from another theme and change only some colours. Dark themes should extend `dark`, so everything you do not set is already dark.
- **`colors`**: any subset of the colours below. Anything not set comes from the extended theme, and finally from `light`.
- **Values** must be plain colours: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` or `hsla()`. Anything else (names like `red`, `url()`, `var()`) is ignored with a warning, so a theme cannot load external resources or inject CSS.

## Checking a theme

```sh
pnpm themes:check                 # the built-in themes
pnpm themes:check ./themes-extra  # plus your own folder
```

The check reports errors (bad file names, unknown colour names, invalid values, `extends` loops) and
warns when text is hard to read: body text needs a contrast of at least 4.5:1 against its background,
status colours and large text 3:1 (WCAG 2.1 AA).

## Tips

- The **status colours** (`st-*`) carry meaning in charts, heartbeat strips and the dependency map; keep Up green-ish and Down red-ish so they read at a glance, and different enough from each other for colour-blind users (vary lightness, not just hue).
- The **sidebar** (`night-*`) can stay dark in a light theme, as in `light.json`.
- `inverse` / `on-inverse` are the primary buttons and selected filters: a light theme uses dark buttons, a dark theme usually light ones (Monokai uses its green).
- Keep `code-bg` dark or light consistently with `code-fg`: code snippets (push URLs, YAML) use them.
- The white behind the two-factor QR code is fixed on purpose: scanners need dark-on-light.

## Colours

**Surfaces**

| Colour | Used for | Light |
|---|---|---|
| `ground` | Page background | `#f4f3ef` |
| `surface` | Cards, dialogs | `#ffffff` |
| `surface-2` | Page header, hover rows | `#fbfaf7` |
| `control` | Inputs, buttons, selects | `#ffffff` |

**Text**

| Colour | Used for | Light |
|---|---|---|
| `ink` | Main text | `#16181d` |
| `ink-2` | Secondary text | `#3f3e39` |
| `muted` | Hints, labels | `#5f5d56` |
| `link` | Links | `#2f5fa7` |

**Lines and inputs**

| Colour | Used for | Light |
|---|---|---|
| `line` | Borders | `#e2dfd6` |
| `line-2` | Row separators | `#f1eee7` |
| `field` | Input borders | `#d6d3c9` |
| `field-hover` | Input border on hover | `#b9b5a8` |

**Accent and buttons**

| Colour | Used for | Light |
|---|---|---|
| `accent` | Focus ring, charts, highlights | `#2f5fa7` |
| `brand` | Logo red: active marker, badges | `#d42a3c` |
| `on-brand` | Text on brand | `#ffffff` |
| `inverse` | Primary buttons, selected filters | `#16181d` |
| `inverse-hover` | Primary button hover | `#2b2e35` |
| `on-inverse` | Text on primary buttons | `#ffffff` |

**Status colours**

| Colour | Used for | Light |
|---|---|---|
| `st-up` | Up | `#2e8b63` |
| `st-up-soft` | Mostly up (availability bars) | `#7cc19f` |
| `st-degraded` | Degraded | `#c58723` |
| `st-down` | Down | `#c0392b` |
| `st-impacted` | Impacted | `#df7835` |
| `st-maint` | Maintenance | `#6b8fc9` |
| `st-unknown` | Unknown / pending | `#b9b5a8` |
| `st-live` | Live connection dot | `#3fb67f` |

**Pills and banners**

| Colour | Used for | Light |
|---|---|---|
| `up-bg` | Up pill background | `#e3f1ea` |
| `up-fg` | Up pill text | `#135c43` |
| `down-bg` | Down pill background | `#fbe4e1` |
| `down-fg` | Down pill text | `#9a1c12` |
| `down-soft` | Down node background | `#fdf3f1` |
| `down-line` | Down banner border | `#e6b3ad` |
| `warn-bg` | Warning pill background | `#fbefd7` |
| `warn-fg` | Warning pill text | `#7a4b06` |
| `risk-soft` | At-risk banner background | `#fbf6e8` |
| `risk-line` | At-risk banner border | `#ecd9a4` |
| `info-bg` | Info pill background | `#eef2f9` |
| `info-fg` | Info pill text | `#23467f` |
| `info-line` | Info banner border | `#c7d4ec` |
| `neu-bg` | Neutral pill background | `#f1eee7` |
| `neu-fg` | Neutral pill text | `#3f3e39` |
| `impact-bg` | Impacted pill background | `#fde7d7` |
| `impact-fg` | Impacted pill text | `#8a3b0b` |
| `impact-soft` | Impacted banner background | `#fdf1e7` |
| `impact-line` | Impacted banner border | `#f3c9a6` |
| `impact-ink` | Impacted banner text | `#6b2e08` |

**Charts and topology**

| Colour | Used for | Light |
|---|---|---|
| `chart-ref` | Chart max line | `#a8a59b` |
| `chart-down` | Chart down band | `#f3c4bd` |
| `chart-p95` | Chart p95 line | `#8f6ac8` |
| `chart-maint` | Chart maintenance band | `#dfe7f5` |
| `bar-empty` | Empty heartbeat/availability bar | `#e4e1d8` |
| `topo-grid` | Topology grid | `#f4f2ec` |
| `topo-app` | Topology application box | `#fbfaf7` |
| `topo-app-line` | Topology application border | `#cfcabd` |
| `topo-edge` | Topology edge | `#b9b5a8` |

**Sidebar**

| Colour | Used for | Light |
|---|---|---|
| `night` | Sidebar background | `#1b1d22` |
| `night-2` | Sidebar inputs | `#25282e` |
| `night-line` | Sidebar borders | `#33363e` |
| `night-hover` | Sidebar hover | `#22252b` |
| `night-active` | Sidebar active item | `#2b2e35` |
| `night-text` | Sidebar text | `#c9c7bf` |
| `night-ink` | Sidebar strong text | `#e7e5df` |
| `night-strong` | Sidebar highlighted text | `#ffffff` |
| `night-muted` | Sidebar labels | `#9a988f` |
| `night-faint` | Sidebar disabled items | `#7d7b74` |
| `night-avatar` | Avatar | `#3a3e47` |

**Code and overlays**

| Colour | Used for | Light |
|---|---|---|
| `code-bg` | Code snippet background | `#1b1d22` |
| `code-fg` | Code snippet text | `#e7e5df` |
| `backdrop` | Dialog backdrop | `rgba(22, 24, 29, .45)` |
| `shadow` | Dialog shadow | `rgba(22, 24, 29, .25)` |
