# Project website

The page published on GitHub Pages: one static `index.html` with its images and fonts. No build step.

## Publish

1. In the repository on GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
2. Push to `main`. The *Website* workflow (`.github/workflows/pages.yml`) publishes this folder whenever something in it changes; it can also be run by hand from the **Actions** tab.

The site appears at https://labrouss.github.io/fudo/. Links to the repository (GitHub button, documentation, install command) point to https://github.com/labrouss/fudo, set in `<meta name="fudo:repo">` at the top of `index.html` (if that is emptied, they are worked out from the Pages address).

## Preview locally

```bash
cd site && python3 -m http.server 8000
```

Then open http://localhost:8000.

## Contents

| Path | What |
|---|---|
| `index.html` | the page: markup, styles and the small script for the outage animation, tabs and copy button |
| `img/*.webp` | screenshots of Fudo with demo data (1.5× for sharp text on high-density screens) |
| `img/social.png` | preview image for links shared on social networks and chat (1200 × 630), referenced with its full address in `og:image` |
| `fonts/` | IBM Plex, self-hosted (SIL Open Font License, `fonts/LICENSE-IBM-Plex.txt`): no requests to third parties |

## Updating the screenshots

Take them at 1440 × 900 with a device scale of 2, then save as WebP at 2160 × 1350 (quality about 82). Keep the names, or update the `src` and `alt` texts in `index.html`.
