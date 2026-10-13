# Contributing to Fudo

Thanks for helping. Issues and pull requests are welcome.

- **Bugs**: open an issue with the Fudo version (`/api/health`), what you did, what you expected
  and what happened. Remove host names, passwords and tokens from logs.
- **Security problems**: please do not open a public issue; see [SECURITY.md](SECURITY.md).
- **Features**: open an issue first for anything larger than a small fix, so we can agree on
  the approach.
- **Translations and themes** are easy first contributions: see
  [locales/README.md](locales/README.md) (the interface and the help pages) and
  [themes/README.md](themes/README.md).

## License of contributions

Fudo is licensed under the [AGPL-3.0-or-later](LICENSE). By submitting a pull request you agree
that your contribution is licensed under the same terms.

## Pull requests

1. Set up a development environment: [docs/development.md](docs/development.md).
2. Keep changes focused; add or update tests for logic you change.
3. Before pushing: `pnpm typecheck && pnpm test && pnpm i18n:check && pnpm themes:check && pnpm docs:check`.
4. Add an entry to `CHANGELOG.md` under a new or the upcoming version.
5. Write user-facing text in plain English and keep it translatable (see
   [docs/development.md](docs/development.md#texts-and-translations)).
