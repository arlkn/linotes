# Security

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability
reporting for the repository ("Report a vulnerability" under the *Security* tab), or contact a
maintainer privately. Include steps to reproduce and the Linotes version.

We aim to acknowledge reports within a few days and to publish a fix and advisory as soon as a
fix is available. Only the latest release receives security updates.

## Security model

Linotes is a local application. It protects your notes against **data loss** and against
**untrusted content** (imported or synced Markdown), and it keeps your notes **on your computer**.

### What Linotes does

- **No network use during normal operation.** No telemetry, analytics, update checks, remote
  fonts or remote content — web images in notes are shown as a card, never loaded. Links open in
  your browser only when you Ctrl+Click them (or press "Open in Browser" on a web image).
- **A locked-down web view.** The interface runs in WebKitGTK with a strict Content Security
  Policy and can only:
  - call the commands listed in `src-tauri/build.rs`, each granted explicitly in
    `src-tauri/capabilities/default.json`;
  - listen to Linotes' own events and write log lines.

  It has no filesystem, shell, process, HTTP, dialog or opener permissions of its own.
- **Paths never come from the web view.** Notes are addressed by id and folders by validated
  relative paths (no absolute paths, `..`, hidden components, control characters, or symbolic
  links that lead outside the notes folder). Files for import/export and the notes folder itself
  are chosen in native dialogs opened by the Rust side.
- **No remote navigation.** The window may only show Linotes' own pages; attempts to navigate
  elsewhere (including dropped links) and to open new windows are blocked.
- **Safe rendering of notes.** Markdown is parsed into a fixed document structure; raw HTML in a
  note is never rendered — such notes are edited as Markdown source. Search highlights are
  rendered as text.
- **Images only from the notes folder.** The page loads images through the `linotes-image:`
  protocol, which serves only image files (checked by content) inside the notes folder — no `..`,
  hidden folders or symbolic links that lead outside it. SVG images are served with a policy that
  stops scripts. Added images are checked by content and limited to 25 MB.
- **Files open only if they can't run a program.** Ctrl+Clicking a link to a file in the notes
  folder opens it in its usual app only for common document, image, audio, video and archive
  types that aren't executable; anything else is shown in Files. Files dropped on the window or
  copied in the file manager are read by the Rust side — dropped paths are kept there and claimed
  by id, so the web view still never supplies a path.
- **Controlled external links.** Only `http:`, `https:` and `mailto:` links are handed to the
  system, after validation in Rust.
- **Careful imports.** Only regular `.md`, `.markdown`, `.mdown`, `.mkd` and `.txt` files up to
  20 MB that are valid UTF-8 are imported; symbolic links and hidden files are skipped; names are
  sanitised; every skipped or failed file is reported.
- **Crash-safe writes** and conflict detection (see [docs/STORAGE.md](docs/STORAGE.md)).

### Limitations

- **Notes are not encrypted.** They are plain files readable by your user account and by any
  program running as you. Use full-disk encryption (e.g. LUKS) to protect them at rest. Linotes
  does not offer end-to-end or at-rest encryption.
- Linotes cannot protect notes from malware running under your account, or from other users
  with administrative access.
- Sync tools you use with the notes folder have their own security properties.
- WebKitGTK is provided by your distribution; keep your system updated to receive its security
  fixes.
- The Flatpak packaging is a draft and has not been reviewed.
