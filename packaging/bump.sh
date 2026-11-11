#!/usr/bin/env bash
# Regenerate the AUR and winget package files for a published Noteriv release.
#
#   packaging/bump.sh          latest published release
#   packaging/bump.sh 2.4.9    a specific release
#
# Checksums come from the release assets, so run this after the release
# workflow has finished. It only edits files here; publishing is separate:
#   AUR     copy aur/PKGBUILD and aur/.SRCINFO into the AUR git repo and push
#   winget  open a PR to microsoft/winget-pkgs with the winget/manifests tree
# The Scoop bucket and Homebrew tap live in their own repos and update
# themselves (see README.md in this folder).
set -euo pipefail
cd "$(dirname "$0")"

REPO="thejacedev/Noteriv"
WINGET_ROOT="winget/manifests/t/thejacedev/Noteriv"

api() {
  local auth=()
  [ -n "${GH_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GH_TOKEN")
  curl -fsSL "${auth[@]}" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/$1"
}
# sha256 of a release asset: the API's digest when present, else download it.
asset_sha() {
  local name="$1" url digest
  url=$(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .browser_download_url' <<<"$rel")
  [ -n "$url" ] || { echo "Release v$version has no $name" >&2; exit 1; }
  digest=$(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .digest // empty' <<<"$rel")
  if [[ "$digest" == sha256:* ]]; then echo "${digest#sha256:}"; else curl -fsSL "$url" | sha256sum | cut -d' ' -f1; fi
}

want="${1:-}"; want="${want#v}"
if [ -n "$want" ] && ! [[ "$want" =~ ^[0-9]+(\.[0-9]+){1,3}$ ]]; then
  echo "Not a version number: '$want'" >&2; exit 1
fi
if [ -n "$want" ]; then rel=$(api "releases/tags/v$want"); else rel=$(api "releases/latest"); fi
version=$(jq -r '.tag_name' <<<"$rel"); version="${version#v}"
released=$(jq -r '.published_at' <<<"$rel" | cut -c1-10)

deb_sha=$(asset_sha "Noteriv_${version}_amd64.deb")
exe_sha=$(asset_sha "Noteriv_${version}_x64-setup.exe")
license_sha=$(curl -fsSL "https://raw.githubusercontent.com/$REPO/v${version}/LICENSE" | sha256sum | cut -d' ' -f1)
for h in "$deb_sha" "$exe_sha" "$license_sha"; do
  [[ "$h" =~ ^[0-9a-f]{64}$ ]] || { echo "Bad sha256: '$h'" >&2; exit 1; }
done

# --- AUR -------------------------------------------------------------------
old=$(sed -n -E 's/^pkgver=(.+)$/\1/p' aur/PKGBUILD)
mapfile -t old_sums < <(sed -n -E 's/^\tsha256sums = ([0-9a-f]{64})$/\1/p' aur/.SRCINFO)
[ -n "$old" ] && [ "${#old_sums[@]}" -eq 2 ] || { echo "Unexpected aur/ file layout" >&2; exit 1; }
sed -i -E "s/^pkgver=.*/pkgver=$version/; s/^pkgrel=.*/pkgrel=1/" aur/PKGBUILD
sed -i -E "s/^(\tpkgver = ).*/\1$version/; s/^(\tpkgrel = ).*/\11/" aur/.SRCINFO
sed -i "s/${old//./\\.}/$version/g" aur/.SRCINFO
# Replace the two checksums by position (deb first, LICENSE second).
for f in aur/PKGBUILD aur/.SRCINFO; do
  awk -v a="${old_sums[0]}" -v b="${old_sums[1]}" -v na="$deb_sha" -v nb="$license_sha" '
    !d && index($0, a) { sub(a, na); d = 1; print; next }
    !l && index($0, b) { sub(b, nb); l = 1 }
    { print }' "$f" > "$f.tmp"
  cat "$f.tmp" > "$f"; rm -f "$f.tmp"
done

# --- winget ----------------------------------------------------------------
prev=$(ls "$WINGET_ROOT" | sort -V | tail -1)
if [ "$prev" != "$version" ]; then
  mv "$WINGET_ROOT/$prev" "$WINGET_ROOT/$version"
fi
for f in "$WINGET_ROOT/$version"/*.yaml; do
  sed -i -E \
    -e "s/^(PackageVersion: ).*/\1$version/" \
    -e "s/^(ReleaseDate: ).*/\1$released/" \
    -e "s/^(  InstallerSha256: ).*/\1${exe_sha^^}/" \
    -e "s#(releases/download/v)[0-9.]+(/Noteriv_)[0-9.]+(_x64-setup\.exe)#\1$version\2$version\3#" \
    -e "s#(releases/tag/v)[0-9.]+#\1$version#" \
    "$f"
done

echo "packaging/aur and packaging/winget now describe Noteriv $version (released $released)."
