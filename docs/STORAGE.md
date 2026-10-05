# Storage format and backups

Linotes stores your notes as ordinary files so that you can read, edit, back up and move them
without Linotes.

## Where things are

| What | Default location | Needed for backup? |
| --- | --- | --- |
| Notes | `~/Documents/Linotes/` (your *Documents* folder, per `xdg-user-dirs`) | **Yes** |
| Settings | `~/.config/linotes/settings.json` | Optional |
| Search index | `~/.local/share/linotes/index/*.sqlite` | No — rebuilt automatically |
| Recovered text | `~/.local/share/linotes/recovered/` | Check it if Linotes tells you |
| Logs | `~/.local/share/io.github.arlkn.Linotes/logs/` | No |

`$XDG_CONFIG_HOME` and `$XDG_DATA_HOME` are honoured. Change the notes folder in
**Settings → Storage**.

## Notes

- A note is a UTF-8 Markdown file ending in `.md` (`.markdown` is also read).
- A folder in Linotes is a directory. Nested folders are nested directories.
- The file name follows the note title. Characters that are invalid or troublesome on common
  filesystems (`/ \ : * ? " < > |`) are replaced or removed, so a note titled `Q1: plans` is
  stored as `Q1- plans.md` while its title stays `Q1: plans`.
- Hidden files and directories (names starting with `.`) are ignored, except the Trash.
- Files that are not valid UTF-8 are skipped (and reported), never modified.

### Frontmatter

Linotes manages these keys in the YAML header:

| Key | Meaning |
| --- | --- |
| `id` | Stable identity of the note (a UUID) |
| `title` | Note title (the file name is derived from it) |
| `created`, `updated` | UTC timestamps (`2026-09-29T08:15:00Z`) |
| `favorite` | `true` when the note is a favorite (absent otherwise) |
| `trashed_from`, `trashed_at` | Present only while the note is in the Trash |

Every other line of the header — your own keys, comments, formatting — is preserved exactly.
Files without a header are indexed as they are (the title comes from the file name); Linotes adds
a header the first time it saves changes to such a note. Merely opening or indexing a note never
modifies it. A byte-order mark and Windows line endings are preserved.

### Images and other files

Images and files you add to a note — pasted, dropped or inserted — are stored in `attachments/`
at the top of the notes folder (for example `attachments/diagram.png`, `attachments/Report.pdf`,
or `attachments/image-20261004-183012.png` for a pasted screenshot). Existing files are never
overwritten. The note links to them with ordinary relative Markdown links, such as
`![](../attachments/diagram.png)` or `[Report.pdf](../attachments/Report.pdf)` from a note in a
folder, so other Markdown editors find them too.

- Ctrl+Click a link to a file to open it in its usual app. Only common document, image, audio,
  video and archive files are opened; anything else (scripts, programs) is shown in Files.
- Moving a note to another folder updates its image and file links; nothing else in the file
  changes.
- Files stay when a note is deleted (other notes may use them).
- Images that a note already links to elsewhere in the notes folder (for example next to the
  note) are shown as well. Web images (`https://…`) are never loaded.
- `attachments` is not shown as a folder in Linotes, and its name is reserved at the top level.

### Trash

Deleted notes move to `.trash/` at the top of the notes folder and remember where they came from.
Restoring puts them back (recreating the folder if needed). Emptying the Trash deletes the files.

## Backups

Because notes are plain files, any backup method works:

```bash
cp -r ~/Documents/Linotes ~/Backups/Linotes-$(date +%F)
```

```bash
rsync -a ~/Documents/Linotes/ /media/backup/Linotes/
```

You can also keep the notes folder in Git, or sync it with Syncthing or Nextcloud. Linotes
watches the folder and picks up changes from other devices; if a note you are editing changes
underneath you, Linotes asks which version to keep instead of overwriting either.

**Export** (Settings → Storage → Export as ZIP) produces an archive of your notes, folders and
images (without the Trash), useful for sharing or one-off backups.

## Crash safety

- Saves write a hidden temporary file, flush it to disk, and atomically rename it over the note.
  A crash leaves either the old or the new version, never a partial file.
- On start-up, leftover temporary files are resolved: an interrupted *new* note is restored; a
  temporary file that differs from its note is moved to `~/.local/share/linotes/recovered/` and
  you are told about it. Nothing that might contain your text is deleted.
- The search index is only a cache. If it is damaged, Linotes moves it aside and rebuilds it
  from your files.

## Using another editor alongside Linotes

Edit notes with Vim, VS Code, GNOME Text Editor or anything else while Linotes is running.
Changes appear in Linotes within a second. If you edit a note in Linotes and elsewhere at the
same time, Linotes shows a banner with three options: keep your version, use the version on disk,
or save yours as a copy.
