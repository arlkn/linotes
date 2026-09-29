# Distributing Linotes

This is the plan for getting Linotes into Linux app stores. Nothing here is published yet.

| Channel | Reaches | Status |
| --- | --- | --- |
| GitHub Releases (`.deb`, `.rpm`, AppImage) | Everyone, manual install | Ready — tag `vX.Y.Z` and the release workflow builds a draft release |
| **Flathub** | GNOME Software, KDE Discover, Fedora, Mint, elementary, … | Manifest draft in [`flatpak/`](../flatpak/) |
| **Snap Store** | Ubuntu App Center | Recipe draft in [`snap/snapcraft.yaml`](../snap/snapcraft.yaml) |
| AUR (`linotes-bin`) | Arch Linux, Manjaro, EndeavourOS | Planned (PKGBUILD repackaging the release `.deb`) |
| AppImageHub | AppImage users | Planned |

## The app ID

Linotes' application ID is **`io.github.arlkn.Linotes`** (set in
`src-tauri/tauri.conf.json` and the files in `flatpak/`). Flathub requires `io.github.*` IDs to match
the GitHub account that hosts the repository. Do not change it after the first store release: stores
treat a new ID as a different app.

## Before the first store release

- [ ] Tag a release (`v0.1.0`), publish the GitHub release built by the workflow, and update
      `CHANGELOG.md` and the `<releases>` entry in the AppStream metadata.
- [ ] Test the release packages on a clean Ubuntu, Fedora and Arch installation.
- [ ] Replace the placeholder screenshots in the AppStream metadata if the UI changed
      (`node scripts/screenshots.mjs` regenerates `docs/screenshots/`).
- [ ] Validate metadata: `appstreamcli validate --explain flatpak/*.metainfo.xml` and
      `desktop-file-validate flatpak/*.desktop`.

## Flathub

Flathub builds everything from source **without network access**, so the draft manifest (which
repackages a local `.deb`) must be replaced by a source build:

1. Generate offline dependency lists with
   [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools):
   `flatpak-cargo-generator.py src-tauri/Cargo.lock -o cargo-sources.json` and
   `flatpak-node-generator npm package-lock.json -o node-sources.json`.
2. Build with `org.gnome.Platform` (it ships WebKitGTK 4.1) plus the Rust and Node SDK extensions,
   running `npm ci --offline` and `cargo build --release --offline`.
3. Install the binary, `io.github.arlkn.Linotes.desktop`, the metainfo file and icons
   (256×256 and 512×512 PNG) under `/app`.
4. Test locally with `flatpak-builder --user --install`, then open a pull request against
   [flathub/flathub](https://github.com/flathub/flathub) following their submission guide.

Sandbox permissions: `--filesystem=xdg-documents/Linotes:create` for the default notes folder; other
folders are granted through the file chooser portal. No network permission is requested.

## Snap Store

1. Register the name: `snapcraft register linotes`.
2. Build and test locally: `snapcraft pack`, then
   `sudo snap install --dangerous ./linotes_*.snap`.
3. Upload to the `edge` channel, test, then promote to `stable`.

The snap uses strict confinement with the `gnome` extension and the `home` and `removable-media`
interfaces. Linotes detects `SNAP_REAL_HOME`, so notes are stored in your real
`~/Documents/Linotes`, not inside the snap's private directory.

## AUR

Publish a `linotes-bin` package whose PKGBUILD downloads the `.deb` from the GitHub release,
verifies its SHA-256, and extracts it. A source package (`linotes`) can follow later.

## Signing and integrity

- Publish SHA-256 checksums next to every release artifact.
- Consider signing tags and release artifacts (GPG or Sigstore) before the first stable release.
