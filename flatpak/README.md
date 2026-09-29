# Flatpak packaging (draft)

This directory contains a **draft** Flatpak manifest, AppStream metadata and desktop entry.
It has not been built or tested yet and is not published anywhere.

## Trying it locally

Build the `.deb` first, then build and install the Flatpak for your user:

```bash
npm run tauri build
```

```bash
flatpak-builder --user --install --force-clean build-dir flatpak/io.github.arlkn.Linotes.yml
```

```bash
flatpak run io.github.arlkn.Linotes
```

## Permissions

| Permission | Why |
| --- | --- |
| `--socket=wayland`, `--socket=fallback-x11`, `--share=ipc`, `--device=dri` | Display the window with GPU acceleration |
| `--filesystem=xdg-documents/Linotes:create` | The default notes folder (`~/Documents/Linotes`) |

The sandbox has **no network access**. Choosing a different notes folder in Settings goes through
the file chooser portal, which grants access to that folder only.

## Known limitations to verify before publishing

- Folders granted through the document portal may not deliver file-change notifications, so edits
  made by other apps in such folders might only appear after restarting Linotes.
- Inside the sandbox, Linotes' settings and index live under `~/.var/app/io.github.arlkn.Linotes/`.
- The application ID `io.github.arlkn.Linotes` matches the GitHub repository `arlkn/linotes`, as Flathub
  requires. Keep it unchanged once the app is published.
- Flathub requires building from source; generate offline sources with
  [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools).
