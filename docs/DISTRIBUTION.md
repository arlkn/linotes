# Distributing Linotes

How Linotes gets to users, and the plan for the channels that are not set up yet.

| Channel | Reaches | Status |
| --- | --- | --- |
| GitHub Releases (`.deb`, `.rpm`, AppImage) | Everyone, manual install | Live — tag `vX.Y.Z` and the release workflow builds a draft release |
| **APT repository** (`sudo apt install linotes`) | Ubuntu, Debian, Mint, Pop!_OS, elementary, … | Live — updated automatically when a release is published ([see below](#apt-repository)) |
| **Flathub** | GNOME Software, KDE Discover, Fedora, Mint, elementary, … | Not submitted — needs a manifest written by a person ([see below](#flathub)) |
| **Snap Store** (`sudo snap install linotes`) | Ubuntu App Center | Name registered; the next published release is uploaded automatically ([see below](#snap-store)) |
| AUR (`linotes-bin`) | Arch Linux, Manjaro, EndeavourOS | Planned (PKGBUILD repackaging the release `.deb`) |
| AppImageHub | AppImage users | Planned |

## The app ID

Linotes' application ID is **`io.github.arlkn.Linotes`** (set in
`src-tauri/tauri.conf.json` and the files in `flatpak/`). Flathub requires `io.github.*` IDs to match
the GitHub account that hosts the repository. Do not change it after the first store release: stores
treat a new ID as a different app.

## Before the first store release

- [x] Tag a release (`v0.1.0`), publish the GitHub release built by the workflow, and update
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

## APT repository

The APT repository at <https://arlkn.github.io/linotes/> is built by
[`.github/workflows/apt.yml`](../.github/workflows/apt.yml) whenever a release is published, and
can also be rebuilt from the Actions tab. It contains the `.deb` files of the five latest published
releases, checked against each release's `SHA256SUMS`, and is signed with the key stored in the
`APT_SIGNING_KEY` secret. No packages are stored in git; GitHub Pages serves the result.

Users add the repository once, then get new versions with their normal system updates:

```bash
sudo curl -fsSLo /etc/apt/sources.list.d/linotes.sources https://arlkn.github.io/linotes/linotes.sources
sudo apt update && sudo apt install linotes
```

`linotes.sources` carries the repository's public key, so apt trusts that key for this repository
only, not system-wide. Keys inside a sources file need apt 2.4 or later (Ubuntu 22.04, Debian 12).

**One-time setup:** run `scripts/create-apt-signing-key.sh`. It creates the signing key in your
GnuPG keyring and stores it as the `APT_SIGNING_KEY` secret. Back the key up: if it is lost,
everyone who added the repository has to download the new key before updates work again.

To try a repository locally, build it from a folder of `.deb` files with
`scripts/build-apt-repo.sh <deb-folder> <output-folder> <url>`.

## Snap Store

The Snap Store has no rules against AI-assisted apps (checked September 2026). Since July 2025 it
reviews every new snap and every new revision before it becomes public.

Publishing a release runs [`.github/workflows/snap.yml`](../.github/workflows/snap.yml), which
repackages the release's `.deb` as a snap (so the snap runs the same binary) and uploads it to the
`stable` channel. The workflow can also be run by hand from the Actions tab; it then builds a `.deb`
from the chosen branch and only attaches the snap to the run, for testing with
`sudo snap install --dangerous ./linotes_*.snap`.

**One-time setup** (needs an [Ubuntu One](https://login.ubuntu.com) account):

```bash
sudo snap install snapcraft --classic
snapcraft login
snapcraft register linotes
snapcraft export-login --snaps=linotes --acls=package_access,package_push,package_update,package_release store-login.txt
gh secret set SNAPCRAFT_STORE_CREDENTIALS --repo arlkn/linotes < store-login.txt && rm store-login.txt
```

The exported login expires; when uploads start failing, export a new one the same way. Until the
secret exists, the workflow skips the upload.

About the snap:

- It uses strict confinement and the `gnome` extension, which supplies GTK and WebKitGTK from the
  shared `gnome-46-2404` runtime instead of bundling them.
- The `home` interface gives access to `~/Documents/Linotes`; Linotes detects `SNAP_REAL_HOME`, so
  notes live in your real home folder, not inside the snap. Notes folders on external drives need
  `sudo snap connect linotes:removable-media`.
- A D-Bus slot for `io.github.arlkn.Linotes.SingleInstance` lets a second launch bring the running
  window to the front instead of opening another copy.

## AUR

Publish a `linotes-bin` package whose PKGBUILD downloads the `.deb` from the GitHub release,
verifies its SHA-256, and extracts it. A source package (`linotes`) can follow later.

## Signing and integrity

- Publish SHA-256 checksums next to every release artifact.
- Consider signing tags and release artifacts (GPG or Sigstore) before the first stable release.
