#!/usr/bin/env bash
# Builds the signed APT repository that .github/workflows/apt.yml publishes on GitHub Pages.
#
# Usage: scripts/build-apt-repo.sh <deb-dir> <output-dir> <repository-url>
#
# Signs with the secret key in the GnuPG keyring (set APT_SIGNING_KEY_ID when there
# is more than one). Needs dpkg-scanpackages (dpkg-dev), gpg and gzip.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "Usage: $0 <deb-dir> <output-dir> <repository-url>" >&2
  exit 2
fi
debs=$1
out=$2
url=${3%/}

key=${APT_SIGNING_KEY_ID:-}
if [ -z "$key" ]; then
  mapfile -t keys < <(gpg --batch --with-colons --list-secret-keys | awk -F: '$1 == "sec" { sec = 1 } $1 == "fpr" && sec { print $10; sec = 0 }')
  if [ ${#keys[@]} -ne 1 ]; then
    echo "Expected one secret key, found ${#keys[@]}; set APT_SIGNING_KEY_ID." >&2
    exit 1
  fi
  key=${keys[0]}
fi

shopt -s nullglob
packages=("$debs"/*.deb)
if [ ${#packages[@]} -eq 0 ]; then
  echo "No .deb files in $debs" >&2
  exit 1
fi

rm -rf "$out"
pool=pool/main/l/linotes
lists=dists/stable/main/binary-amd64
mkdir -p "$out/$pool" "$out/$lists"

# Debian-style file names: <package>_<version>_<architecture>.deb
for deb in "${packages[@]}"; do
  read -r name version arch < <(dpkg-deb --show --showformat '${Package} ${Version} ${Architecture}\n' "$deb")
  cp "$deb" "$out/$pool/${name}_${version}_${arch}.deb"
done

cd "$out"
dpkg-scanpackages --multiversion "$pool" /dev/null > "$lists/Packages"
gzip -9 --no-name --keep "$lists/Packages"

cd dists/stable
{
  echo "Origin: Linotes"
  echo "Label: Linotes"
  echo "Suite: stable"
  echo "Codename: stable"
  echo "Date: $(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S UTC')"
  echo "Architectures: amd64"
  echo "Components: main"
  echo "Description: Linotes, local-first Markdown notes for Linux"
  echo "SHA256:"
  for file in main/binary-amd64/Packages main/binary-amd64/Packages.gz; do
    printf ' %s %s %s\n' "$(sha256sum "$file" | cut -d ' ' -f 1)" "$(stat -c %s "$file")" "$file"
  done
} > Release
gpg --batch --yes --local-user "$key" --digest-algo SHA512 --clearsign --output InRelease Release
gpg --batch --yes --local-user "$key" --digest-algo SHA512 --armor --detach-sign --output Release.gpg Release
cd ../..

# The public key, on its own and embedded in a ready-made deb822 sources file
# (apt 2.4+ accepts an inline key in Signed-By; blank lines become " .").
gpg --batch --armor --export --export-options export-minimal "$key" > linotes.asc
{
  echo "Types: deb"
  echo "URIs: $url"
  echo "Suites: stable"
  echo "Components: main"
  echo "Architectures: amd64"
  echo "Signed-By:"
  sed -e 's/^$/./' -e 's/^/ /' linotes.asc
} > linotes.sources

cat > index.html <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linotes APT repository</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; color: #242424; background: #faf9f6; }
  pre { background: #fff; border: 1px solid #e5e1dc; border-radius: 8px; padding: 0.75rem 1rem; overflow-x: auto; }
  a { color: #c74616; }
  @media (prefers-color-scheme: dark) {
    body { color: #f5f5f5; background: #1b1b1b; }
    pre { background: #222; border-color: #3a3a3a; }
    a { color: #e95420; }
  }
</style>
</head>
<body>
<h1>Linotes APT repository</h1>
<p>Packages of <a href="https://github.com/arlkn/linotes">Linotes</a> for Ubuntu 22.04+, Debian 12+ and other
Debian-based distributions (64-bit x86).</p>
<p>Add the repository once:</p>
<pre>sudo curl -fsSLo /etc/apt/sources.list.d/linotes.sources $url/linotes.sources</pre>
<p>Then install Linotes; later versions arrive with your normal system updates:</p>
<pre>sudo apt update &amp;&amp; sudo apt install linotes</pre>
<p>Signing key: <a href="linotes.asc">linotes.asc</a>, fingerprint <code>$key</code>.</p>
</body>
</html>
EOF

echo "Built the APT repository in $out, signed with $key"
