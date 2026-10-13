# Translations

Every `<language-code>.json` file in this folder is a language. Fudo finds new files automatically
(no code changes; the API re-reads the folder when files change).

## Add a language

1. Copy `en.json` to your language code, e.g. `de.json`, `pt-BR.json` (BCP 47 codes).
2. Set `_meta`:
   ```json
   "_meta": { "name": "Deutsch", "englishName": "German", "dir": "ltr", "authors": ["Your Name"] }
   ```
   `name` is the language's name in that language; use `"dir": "rtl"` for Arabic, Hebrew, …
3. Translate the values, never the keys. Untranslated keys show English, so partial files work.
4. Check your file: `pnpm i18n:check` (placeholders, invalid files, completeness).

## Message format

- Placeholders: `"Opened {when}"`: keep `{when}` unchanged, move it where your grammar needs it.
- Plurals: `"{count, plural, one {# incident} other {# incidents}}"`. Use the plural categories of
  your language (`zero`, `one`, `two`, `few`, `many`, `other`; see the CLDR plural rules), `#` is the number.
  Example (Polish): `"{count, plural, one {# błąd} few {# błędy} many {# błędów} other {# błędu}}"`.
  Missing categories fall back to `other`.
- Keep product and protocol names (vCenter, SNMP, TLS, SLA, MTTR, …) as your IT teams use them.

## Server messages (`msg.*`)

Check results, incident titles, timeline entries and application/asset summaries are stored as
message codes with parameters, not as English text. Their English templates live in
`packages/shared/src/messages.ts`; `pnpm i18n:sync` copies them into `en.json` as `msg.<code>` keys.
Translate them like any other key and keep every `{placeholder}`. Plurals work as elsewhere, e.g.
`"msg.domain.expires": "Λήγει στις {date} ({days, plural, one {# ημέρα} other {# ημέρες}})"`.
Values that start with `@` refer to another message (a VM power state inside a sentence), so
translate those keys too (`msg.vcenter.state.POWERED_OFF`). Text that comes from the monitored
device itself (a server banner, a model name) is shown as it is.

To add a message in code: add the code and English template to `MESSAGES`, return it from the
runner as a part (`["tcp.open", { port }]`), and run `pnpm i18n:sync`.

## Notifications and emails (`notify.*`)

Notification texts (subject, headline, fact labels, test messages) and the invitation, 2FA-reset
and test emails live in `packages/notify/src/texts.ts`; `pnpm i18n:sync` copies them into `en.json`
as `notify.*` keys. Emails keep their line breaks (`\n`). Durations reuse `unit.min`, `unit.h`
and `unit.d`; languages whose words agree with the number can use plural forms there too (see `ar.json`).

## Reports (`report.*`)

PDF report and report-email texts live in `packages/reports/src/texts.ts` (synced as `report.*`).
Table headers are narrow: prefer short words or common abbreviations (`Inc.`, `KW` for German weeks).
Check a language by rendering a report and looking at it: the table cells wrap only between words.

## API error messages (`api.*`)

Error messages stay English in the code. `pnpm i18n:sync` scans the API and the validation schemas
and writes every message to `en.json` as an `api.*` key; the web interface sends its language in
the `x-fudo-lang` header and the API answers in it. Messages with live values are templates
(`"Cannot connect to the SMTP server{at}: {msg}"`): keep every `{placeholder}`; numbers may use
plural forms (`{seconds, plural, one {…} other {…}}`). Sentences built from a noun ("Application
not found", "This asset belongs to another tenant…") are separate keys, so adjectives can agree.
When you add an error in code, write it as a plain English literal and run `pnpm i18n:sync`.

## Translating the help

The help (Help in the sidebar, and `docs/guide/` on GitHub) is written in English. Translations go
in `docs/guide/<lang>/<page>.md`, one page at a time; untranslated pages are shown in English.

```sh
pnpm docs:check --new el getting-started   # creates docs/guide/el/getting-started.md
```

The new file is the English page with a first line such as
`<!-- translation-of: getting-started.md#ea57bfb7 -->`. **Keep that line** and translate the rest.
It records which version of the English page you translated: when the English page changes, the
app shows your page as *possibly outdated* (with a link to the English original) and
`pnpm docs:check` lists it. After updating your translation, run
`pnpm docs:check --stamp docs/guide/el/getting-started.md`.

Links: `--new` points links to other guide pages at the English versions (`../concepts.md`). When
that page is translated too, you may link to it directly (`concepts.md`); in the app both work.
Keep headings' meaning and the code blocks unchanged (commands and YAML stay as they are).
`pnpm docs:check` reports broken links and shows how much of each language is translated.

## Right-to-left languages

Set `"dir": "rtl"` in `_meta` (Arabic, Hebrew, Persian, Urdu, …). The whole interface mirrors
(sidebar, spacing, borders, arrows); charts, heartbeat strips, the dependency map, host names, URLs
and code stay left to right. Arabic uses Western digits (0–9) for numbers and dates, as
infrastructure tools usually do. In texts, write flow arrows the way they read in your language
(Arabic: `التطبيق ← الفحوصات ← البنية التحتية`).
PDF reports in right-to-left languages are laid out word by word following the Unicode
bidirectional rules (tables and headers are mirrored).

## Without rebuilding the images

Mount a folder with extra or corrected files and set `LOCALES_DIR` (see `docker-compose.yml`).
Files there add languages or override single keys of the built-in ones.

## Keys

- `en.json` is the source. Developers use `t("key")` in the web app; `pnpm i18n:check` lists missing
  and unused keys, `pnpm i18n:check --prune` removes unused ones.
- `def.*` keys (monitor types and fields, channel types, templates, asset kinds) are generated from the
  definitions with `pnpm i18n:sync`.
- Notification provider forms (Uptime Kuma providers) use Kuma's own translations when available.
