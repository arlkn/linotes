# Contributing to Linotes

Thanks for your interest in improving Linotes! This guide explains how to set up a development
environment and what we expect from changes.

## Ground rules

- **Never risk user data.** Changes that touch saving, file operations or Markdown conversion
  need tests that prove nothing is lost (see `src-tauri/src/storage/tests.rs` and
  `src/features/editor/markdown/markdown.test.ts`).
- **Stay local-first and private.** No telemetry, analytics, remote fonts or network calls in
  normal operation. New IPC commands must be added to `src-tauri/build.rs` and granted in
  `src-tauri/capabilities/default.json`; never give the web view direct filesystem access.
- **Keep it simple.** Prefer a small, well-tested feature over a large one. Avoid new
  dependencies unless they clearly pay for themselves.
- **Feel native.** Follow the existing design tokens (`src/styles/globals.css`); don't hardcode
  colours in components. Every action must be reachable from the keyboard.

## Setting up

1. Install the system packages for your distribution and the Rust and Node.js toolchains — see
   [Building from source](README.md#building-from-source).
2. Install JavaScript dependencies:

   ```bash
   npm install
   ```

3. Run the desktop app with a throwaway profile (keeps your real notes untouched):

   ```bash
   LINOTES_PROFILE_DIR=/tmp/linotes-dev npm run tauri dev
   ```

   Or run only the interface in a browser, backed by in-memory sample data:

   ```bash
   npm run dev
   ```

## Project layout

```text
src/                   React + TypeScript interface
  app/                 root component and startup
  components/          UI components (ui/ holds shared primitives)
  features/            stores and actions per area (notes, editor, settings, …)
  lib/backend/         typed Tauri IPC client + in-memory backend
  styles/              design tokens and editor typography
src-tauri/             Rust backend (see docs/ARCHITECTURE.md)
  migrations/          SQL migrations for the search index
  capabilities/        permissions granted to the web view
e2e/                   Playwright tests
docs/                  architecture and storage documentation
flatpak/               Flatpak packaging (draft)
```

## Before opening a pull request

Run everything CI runs:

```bash
npm run check
```

```bash
npm run test:e2e
```

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`npm run test:e2e` needs Playwright's browser once: `npx playwright install chromium`.

Checklist:

- [ ] Tests cover the change (Rust tests for storage/search, Vitest for UI logic, Playwright for
      user-visible workflows)
- [ ] `npm run check` and clippy pass
- [ ] User-visible changes are noted in `CHANGELOG.md` under *Unreleased*
- [ ] New shortcuts are listed in `src/features/shortcuts/definitions.ts`
- [ ] Documentation is updated if behaviour or file formats change

## Database migrations

The SQLite index is versioned with `PRAGMA user_version`. To change the schema, add a new file
`src-tauri/migrations/NNNN_description.sql` and append it to `MIGRATIONS` in
`src-tauri/src/database/migrations.rs`. Never edit a migration that has been released. If the
new schema needs data that only exists in the Markdown files, set the `needs_full_reindex` flag
in the migration (see `0002_full_text_search.sql`).

## Commit messages

Use short, imperative subjects (`Fix conflict banner focus`, `Add tag filter`). Explain *why* in
the body when it isn't obvious.

## Reporting bugs

Include your distribution and version, desktop environment (GNOME, KDE…), whether you use X11 or
Wayland, the Linotes version, and steps to reproduce. Logs are in
`~/.local/share/io.github.arlkn.Linotes/logs/`. Please remove private note content before
sharing logs or screenshots.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to
uphold it.
