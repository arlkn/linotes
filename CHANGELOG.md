# Changelog

All notable changes to Linotes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - Unreleased

First version.

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
