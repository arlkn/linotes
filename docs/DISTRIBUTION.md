# Distributing Linotes

This is the plan for getting Linotes into Linux app stores. Nothing here is published yet.

| Channel | Reaches | Status |
| --- | --- | --- |
| GitHub Releases (`.deb`, `.rpm`, AppImage) | Everyone, manual install | Ready — tag `vX.Y.Z` and the release workflow builds a draft release |
| **Flathub** | GNOME Software, KDE Discover, Fedora, Mint, elementary, … | Not submitted — needs a manifest written by a person ([see below](#flathub)) |
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

Flathub has a [generative AI policy](https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy)
that applies directly to Linotes, which was built with AI assistance (see
[How Linotes was built](../README.md#how-linotes-was-built)):

- **The manifest must be written by a person.** Flathub manifests must not contain AI-generated
  or AI-assisted content. The manifest in [`flatpak/`](../flatpak/) was written with AI assistance
  and is only for local testing — do not submit it or base a submission on it.
- **The submission must be made by a person.** AI tools must not open or automate the pull request,
  or write its commit messages, description, review comments or replies.
- **AI use must be disclosed.** The submission must state which code, documentation, packaging and
  other material in the app is AI-generated. Reviewers may reject a submission based on the extent
  of generated material.
- **The app needs a track record.** Flathub expects a meaningful history of development, evidence
  of real-world use and a clear commitment to maintenance.

When those conditions can be met, follow Flathub's
[submission guide](https://docs.flathub.org/docs/for-app-authors/submission) and
[Tauri's Flatpak guide](https://v2.tauri.app/distribute/flatpak/). Flathub builds apps from source
without network access. The desktop entry and AppStream metadata in `flatpak/` belong to Linotes
itself (disclosed as AI-assisted) and can be installed by a manifest.

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
