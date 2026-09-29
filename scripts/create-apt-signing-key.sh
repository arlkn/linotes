#!/usr/bin/env bash
# One-time setup: creates the key that signs the Linotes APT repository and
# stores it as the GitHub Actions secret APT_SIGNING_KEY (needs the GitHub CLI).
#
# The key stays in your GnuPG keyring. Back it up: if it is lost, everyone who
# added the APT repository has to download a new key before updates work again.
set -euo pipefail

uid="Linotes APT repository <193437303+arlkn@users.noreply.github.com>"

if gpg --batch --list-secret-keys "=$uid" > /dev/null 2>&1; then
  echo "Reusing the existing key for $uid"
else
  # No passphrase: GitHub Actions signs with it unattended.
  gpg --batch --passphrase '' --quick-gen-key "$uid" ed25519 sign never
fi

fingerprint=$(gpg --batch --with-colons --list-secret-keys "=$uid" | awk -F: '$1 == "fpr" { print $10; exit }')
gpg --batch --armor --export-secret-keys "$fingerprint" | gh secret set APT_SIGNING_KEY --repo arlkn/linotes

echo
echo "Stored key $fingerprint as the APT_SIGNING_KEY secret of arlkn/linotes."
echo "Back it up with:  gpg --armor --export-secret-keys $fingerprint > ~/linotes-apt-key.asc"
echo "Then move that file somewhere safe (a USB stick or password manager) and never commit it."
