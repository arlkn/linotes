# Changelog

All notable changes to Linotes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] - 2026-10-04

### Added

- A quick switcher: press `Ctrl+P` and type part of a title to open any note. Case, accents and
  Turkish ı/İ don't matter; an empty box lists recently edited notes.

### Changed

- Much faster with large libraries. With 5,000 notes, switching views is about 8× faster, the
  first index of a notes folder about a third faster, and checks for changes made by other
  programs (which also run after every save) take half the time.
- Typing stays quick in large libraries: every key press used to do some work for each note in
  the list.

### Fixed

- A save started while a slow save was still running could be refused as a conflict, showing a
  "changed outside Linotes" banner for your own text.
- Moving quickly through the notes list could leave the list highlighting a different note from
  the one open in the editor.

## [0.1.3] - 2026-09-30

### Changed

- A new loading screen: the Linotes penguin and name fade in while the app starts, then the app
  fades in.
- The logo is sharp at every size and zoom level, and has a faint outline in dark mode so the
  black penguin stays visible.

### Fixed

- The window no longer flashes white when Linotes starts with the dark theme.

## [0.1.2] - 2026-09-30

### Fixed

- The loading logo appeared at the left edge of the window for a moment before moving to the
  middle. The window now opens with its full size, in the saved light or dark theme, so nothing
  jumps or flashes while Linotes starts.

## [0.1.1] - 2026-09-29

### Added

- Snap package, uploaded to the Snap Store with each release (`sudo snap install linotes` once
  the store has reviewed it).
- APT repository for Ubuntu, Debian and derivatives: `sudo apt install linotes` after a one-time
  setup, with updates through the normal system updates.

### Changed

- The app icon is rebuilt from the original artwork: sharper at every size, without the dark
  background.
- The window title bar now follows the app theme, including the system light or dark preference.

### Fixed

- The `.deb` and `.rpm` packages listed their dependencies twice.

## [0.1.0] - 2026-09-29

First public release.

### Added

- Three-pane desktop interface (sidebar, notes list, editor) for GNOME and other Linux desktops,
  with light, dark and follow-system themes, ten accent colours and interface zoom.
- Notes stored as Markdown files with YAML frontmatter in `~/Documents/Linotes` or a folder of
  your choice; folders are directories.
- Rich text editor (headings, bold, italic, underline, strikethrough, code, links, lists,
  checklists, quotes, code blocks with syntax highlighting) and a Markdown source mode.
- Verified Markdown round-tripping; notes with tables, images or HTML open in Markdown mode.
- Autosave with conflict detection for notes changed outside Linotes, crash-safe atomic writes
  and recovery of interrupted saves.
- Folders (nested), favorites, recently edited notes, Trash with restore and permanent deletion,
  sorting by title, creation or modification date, drag and drop.
- Full-text search with SQLite FTS5, highlighted results and scoping.
- Live updates when files change on disk.
- Import of Markdown files and folders with per-file reports; export of notes, folders or
  everything as ZIP.
- Settings for appearance, editor, storage and keyboard shortcuts.
- Packaging for `.deb`, `.rpm` and AppImage; draft Flatpak manifest.

[Unreleased]: https://github.com/arlkn/linotes/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/arlkn/linotes/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/arlkn/linotes/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/arlkn/linotes/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/arlkn/linotes/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/arlkn/linotes/releases/tag/v0.1.0
