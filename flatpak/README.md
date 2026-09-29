# Flatpak files

> **The manifest here is not for Flathub.** `io.github.arlkn.Linotes.yml` was written with AI
> assistance, and Flathub does not accept AI-generated or AI-assisted manifests or AI-opened
> submissions. It only builds a local test Flatpak from a `.deb`. See
> [docs/DISTRIBUTION.md](../docs/DISTRIBUTION.md#flathub) for Flathub's rules.

This directory also holds Linotes' AppStream metadata and desktop entry, which any package of
Linotes can install. The manifest has not been built or tested yet.

## Trying it locally

Build the `.deb` first, then build and install the Flatpak for your user:

```bash
npm run tauri build
```

```bash
flatpak run org.flatpak.Builder --user --install --install-deps-from=flathub --force-clean --state-dir="$HOME/.cache/linotes-flatpak/state" "$HOME/.cache/linotes-flatpak/build" flatpak/io.github.arlkn.Linotes.yml
```

Keep the build folders outside the project: they contain sandbox symlink loops that break the
Vite dev server's file watcher. If the build fails with `Failure spawning rofiles-fuse` (common on
recent Ubuntu), add `--disable-rofiles-fuse`.

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

## Known limitations

- Folders granted through the document portal may not deliver file-change notifications, so edits
  made by other apps in such folders might only appear after restarting Linotes.
- Inside the sandbox, Linotes' settings and index live under `~/.var/app/io.github.arlkn.Linotes/`.
- The application ID `io.github.arlkn.Linotes` matches the GitHub repository `arlkn/linotes`, as Flathub
  requires. Keep it unchanged once the app is published.
- Flathub builds from source and requires a manifest written by a person; see
  [docs/DISTRIBUTION.md](../docs/DISTRIBUTION.md#flathub).
