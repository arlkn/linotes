# Architecture

Linotes is a [Tauri 2](https://v2.tauri.app) application: a Rust process owns the window,
the notes folder and the search index, and a React interface runs in the system web view
(WebKitGTK on Linux).

```text
┌──────────────────────────── WebKitGTK web view ────────────────────────────┐
│ React UI (src/)                                                            │
│   components/   presentational pieces (sidebar, notes list, editor, …)     │
│   features/     state + actions (zustand stores, Markdown, autosave, …)    │
│   lib/backend/  typed IPC client ─────────────┐                            │
└───────────────────────────────────────────────┼────────────────────────────┘
                   Tauri IPC (allow-listed commands only)
┌───────────────────────────────────────────────┼────────────────────────────┐
│ Rust (src-tauri/src/)                          ▼                            │
│   commands/     thin command handlers, native dialogs                      │
│   storage/      Library: the only code that writes to the notes folder     │
│   database/     SQLite index, migrations, corruption recovery              │
│   search/       FTS5 queries                                               │
│   filesystem/   atomic writes, crash recovery, path validation, watcher    │
│   import_export/ import (validated) and export (ZIP)                       │
│   security/     link and navigation policy                                 │
└────────────────────────────────────────────────────────────────────────────┘
          │ Markdown files (source of truth)        │ index.sqlite (cache)
          ▼                                          ▼
   ~/Documents/Linotes/…                    ~/.local/share/linotes/index/
```

## Principles

1. **Files are the source of truth.** Every piece of note data — text, title, timestamps,
   favorite and trash state — is stored in the note's Markdown file. SQLite holds only derived
   data (search index, list metadata) and can be deleted at any time.
2. **No silent data loss.** Writes are atomic; saves carry the revision the editor started from
   and are refused if the file changed meanwhile; interrupted saves are recovered on start-up;
   Markdown the rich editor cannot represent is edited as Markdown instead of being dropped.
3. **Least privilege.** The web view cannot touch the filesystem, run programs or open network
   connections. It can only call the commands listed in `src-tauri/build.rs`, each granted in
   `src-tauri/capabilities/default.json`.

## Backend (Rust)

| Module | Responsibility |
| --- | --- |
| `lib.rs` | Builder, plugins, window creation (with navigation guards), close handling |
| `state.rs` | `AppState`: settings, the open `Library`, the file watcher, library status |
| `paths.rs` | XDG directories (`LINOTES_PROFILE_DIR` redirects everything for testing) |
| `settings.rs` | Preferences in `$XDG_CONFIG_HOME/linotes/settings.json`, validated and clamped |
| `storage/library.rs` | Create, read, save (conflict-checked), favorite, move, trash, restore, delete |
| `storage/folders.rs` | Folders as directories: list, create, rename, delete (notes go to the Trash) |
| `storage/sync.rs` | Reconciles the index with the disk; resolves note identity |
| `storage/note_file.rs` | Frontmatter parsing and line-preserving editing; BOM/CRLF preserved |
| `storage/markdown.rs` | Plain-text extraction (pulldown-cmark) for search and previews |
| `storage/attachments.rs` | Images: storing, safe serving paths, link rewriting on move and import |
| `database/` | Connection, `PRAGMA user_version` migrations, corrupt-index replacement |
| `search/` | FTS5 queries with safe query building, highlights and scopes |
| `filesystem/atomic.rs` | Temp-file + fsync + rename writes; no-clobber creates and renames |
| `filesystem/recovery.rs` | Resolves leftover temp files after a crash |
| `filesystem/safe_path.rs` | Validation of library-relative paths (no `..`, no hidden, no symlink escape) |
| `filesystem/watcher.rs` | Debounced `notify` watcher → index sync → `library-changed` event |
| `import_export/` | Import of files/folders with per-file results; ZIP and single-note export |
| `security/` | External link policy, navigation policy, forbidden notes folders |

All commands are `async` and run blocking work on a worker thread, so the UI thread never waits
on disk I/O. The library is guarded by a mutex; the watcher's syncs and user operations are
serialised through it, which is also how Linotes recognises its own writes (the index already
matches the file, so a sync reports nothing).

### Note identity

A note keeps the `id` in its frontmatter. Files without one (e.g. copied in from elsewhere) get a
deterministic id derived from their path, which the index keeps when Linotes moves the file; the
id is written to the file the first time Linotes saves it. If two files claim the same id (a
note duplicated in a file manager), the one already indexed keeps it and the other gets a new id.

### Saving

```text
editor ──save(id, title, markdown, expectedRev)──▶ Library::save_note
  1. read the file; if its body hash ≠ expectedRev → Conflict (nothing written)
  2. update managed frontmatter keys line-by-line, keep all other lines
  3. write atomically (temp file → fsync → rename → fsync dir)
  4. if the title changed, rename the file (no-clobber) to match
  5. update the index from what is now on disk → return the new revision
```

Metadata changes (favorite, trash) rewrite only the frontmatter, so the editor's revision stays
valid and they never conflict with unsaved typing.

## Frontend (TypeScript)

- **State**: three small [zustand](https://github.com/pmndrs/zustand) stores —
  `features/notes/store.ts` (notes, folders, view, selection, search),
  `features/editor/store.ts` (open note, save pipeline) and `features/settings/store.ts`.
  Operations that touch several stores live in `features/*/actions.ts`.
- **Backend access**: `lib/backend` defines one `Backend` interface with two implementations:
  Tauri IPC, and an in-memory backend used by `npm run dev` in a browser and by tests.
- **Editor**: [TipTap](https://tiptap.dev) (ProseMirror) for rich text; CodeMirror 6 for
  Markdown mode.
- **Quick switcher** (`Ctrl+P`): `features/notes/quick-switch.ts` ranks the note summaries
  already in memory by title, so it needs no backend call per keystroke.
- **Large libraries**: the notes list has one shared right-click menu (a Radix menu per row
  would add document-wide key listeners per note), and dates are formatted with cached
  `Intl` formatters. When several selections overlap, only the newest one decides what the
  list highlights.

### Markdown serialisation

`features/editor/markdown/` converts between Markdown and the editor document:

- **Dialect**: CommonMark + GFM strikethrough + GFM task lists; underline is written as
  `<u>…</u>`. Parsing uses markdown-it; serialising uses prosemirror-markdown with custom rules.
- **Faithful by construction**: soft line breaks, tight/loose lists and ordered-list start
  numbers are kept as document attributes, so saving does not reflow a note.
- **Readable output**: characters are escaped only where Markdown would misread them
  (`snake_case`, `~/path`, `a * b` stay as typed).
- **Verified saves**: every serialisation is parsed back and compared with the document; if it
  would not round-trip, a strictly escaped form is written instead.
- **Safe opening**: when a note is opened, it is parsed, re-serialised, and both versions are
  rendered. If the rendering differs, or the note contains tables, raw HTML or mixed task lists,
  it opens in Markdown mode with an explanation instead of being altered.
- **Images** are inline `image` nodes. Their paths are kept in the form parsing gives back
  (readable Unicode; spaces are written as `%20`), so every path survives saving.

### Images and files

```text
drop from Files ──(native, wry)──▶ files-dropped {id, x, y} ──add_dropped_files(noteId, id)──┐
copied files / picture ──paste_files(noteId) (GTK clipboard, read natively)─────────────────┤
toolbar ──choose_image(noteId) (file chooser in Rust)───────────────────────────────────────┤
images the page has (Chromium paste/drop) ──save_image(noteId, bytes)──────────────────────┤
                                                                                            ▼
  Library::add_file / save_image
  1. images (PNG, JPEG, GIF, WebP, AVIF, BMP, SVG; ≤ 25 MB, checked by content) and other
     files (≤ 100 MB) are written to attachments/ under a free name (never overwriting)
  2. return a link relative to the note's folder → ![](../attachments/diagram.png)
     or [Report.pdf](../attachments/Report.pdf)

<img src="linotes-image://localhost/attachments%2Fdiagram.png">
  └─ storage::read_image: only image files inside the notes folder (no `..`, hidden
     folders or symlinks out of it), served with their sniffed type; SVG can't run scripts
```

- WebKitGTK gives the page no data for files dropped from the file manager or pasted after
  copying them there (nor for a copied picture). Drops are therefore taken by the native drop
  handler: the backend keeps the paths and the page claims them by id, so paths still never come
  from the web view. An empty paste asks the backend to read the clipboard.
- Links are relative to the note's file, so other Markdown editors find the files too. Moving
  a note rewrites its image and file links for the new folder (`storage/attachments.rs`); only
  the link destinations change. Trashed notes resolve images against the folder they came from.
- Ctrl+Click on a link to a file calls `open_linked_file`: files inside the notes folder open in
  their usual app if they are a common document, image, audio, video or archive type and not
  executable; anything else is shown in Files.
- Importing Markdown copies the local images it links to (inside the imported folder, or next
  to an imported file) into `attachments/`.
- Web images are never fetched: the CSP allows images only from the app, `data:`, `blob:` and
  `linotes-image:`, and the editor shows web images as a card with an "Open in Browser" button.

Opening a note never modifies it; only editing does. Rich-mode edits normalise syntax
(`*` bullets become `-`, setext headings become `#`), which renders identically.

### Autosave

Edits mark the note dirty; a save runs 800 ms after typing stops, and at least every 5 s during
continuous typing. Pending edits are always flushed before switching notes, changing folders or
closing the window (the window waits for the frontend to confirm). Only one save runs at a
time; a save that has to wait re-checks afterwards, so two saves never start from the same
revision. Failed saves are retried and shown in the status bar; conflicts and missing files show
a banner with explicit choices.

## Security model (summary)

- Capabilities grant only event listening, log writing and Linotes' own commands.
- File dialogs are opened by Rust, so every path used for import/export or as the notes folder
  comes from an explicit user action — the web view never supplies filesystem paths.
- Library-relative paths from the UI are validated (no absolute paths, `..`, hidden components,
  control characters or symlink escapes).
- The window may only navigate to the app itself; new windows are denied; a strict CSP applies.
- External links open in the default browser only for `http`, `https` and `mailto`.
- Images are served only from inside the notes folder, by the `linotes-image:` protocol; web
  images are never loaded.
- Imported Markdown is never rendered as HTML: raw HTML is shown as source in Markdown mode.

See [SECURITY.md](../SECURITY.md) for limitations and how to report issues.

## Testing

| Layer | Tool | Location |
| --- | --- | --- |
| Rust storage, search, migrations, import/export, settings | `cargo test` | `src-tauri/src/**` |
| Markdown round-trips (incl. 600 adversarial strings) | Vitest | `src/features/editor/markdown/` |
| Autosave, conflicts, modes, settings persistence | Vitest | `src/features/**/**.test.ts` |
| App integration (jsdom) | Vitest + Testing Library | `src/app/App.test.tsx` |
| UI workflows in a real engine | Playwright (Chromium) | `e2e/` |
| Timings with 5,000 notes | `cargo test --release large_library -- --ignored --nocapture`, `node scripts/bench-ui.mjs` | `src-tauri/src/storage/tests.rs`, `scripts/` |
