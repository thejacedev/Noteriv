#!/usr/bin/env python3
"""Write latest.json, the file an installed Noteriv reads to find an update.

    packaging/updater-manifest.py <folder with the release files> <tag> [-o latest.json]

A copy of Noteriv that can replace itself (the AppImage, the macOS app, an
install made by one of the two Windows installers) downloads the file named
here for its kind and installs it only when the signature given here matches
the public key the app was built with. So for each kind this takes the release
file and the signature the build made for it, checks the one against the other
with that public key (plugins.updater.pubkey in tauri.conf.json), and writes
both down.

It stops with an error when a file or a signature is missing or does not
match. Every release up to 3.0.1 went out with empty signatures, and no copy
could install an update from inside the app.

The .deb and the .rpm are left out on purpose. The app cannot replace files
that a package manager owns without asking for the administrator password, and
the AUR and COPR packages are made from the .deb, so a copy that thinks it is
a .deb is not always on a system with dpkg. Those copies say that a new
version is out and open the download page.

Needs `minisign` for the check.
"""

import argparse
import base64
import datetime
import json
import os
import pathlib
import subprocess
import sys
import tempfile

REPO = os.environ.get("GITHUB_REPOSITORY") or "thejacedev/Noteriv"
CONFIG = pathlib.Path(__file__).resolve().parent.parent / "desktop" / "src-tauri" / "tauri.conf.json"

# What the app asks for: "<system>-<processor>-<kind of install>" first, then
# "<system>-<processor>". The second is all that older copies ask for, so it
# names the file most of them were installed from.
FILES = [
    ("the AppImage", "*.AppImage", True, ["linux-x86_64", "linux-x86_64-appimage"]),
    # One file for both: the macOS build is a universal one.
    ("the macOS app", "*.app.tar.gz", False, ["darwin-x86_64", "darwin-aarch64", "darwin-x86_64-app", "darwin-aarch64-app"]),
    ("the Windows setup program", "*-setup.exe", True, ["windows-x86_64", "windows-x86_64-nsis"]),
    ("the Windows .msi", "*.msi", True, ["windows-x86_64-msi"]),
]


def fail(message):
    print(f"::error::{message}")
    sys.exit(1)


def public_key():
    """The key itself: the second line of what the config holds in base64."""
    stored = json.loads(CONFIG.read_text())["plugins"]["updater"]["pubkey"]
    lines = base64.b64decode(stored).decode().strip().splitlines()
    if len(lines) != 2:
        fail(f"plugins.updater.pubkey in {CONFIG.name} is not a minisign public key")
    return lines[1].strip()


def check(file, signature, key):
    """True when `signature` (the text of a .sig file) is `key`'s signature of `file`."""
    try:
        decoded = base64.b64decode(signature, validate=True)
    except ValueError:
        return False
    with tempfile.NamedTemporaryFile(suffix=".minisig") as plain:
        plain.write(decoded)
        plain.flush()
        done = subprocess.run(
            ["minisign", "-V", "-P", key, "-m", str(file), "-x", plain.name],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
    if done.returncode != 0:
        print(done.stdout.strip())
    return done.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Write latest.json for a Noteriv release.")
    parser.add_argument("folder", type=pathlib.Path, help="the folder that holds the release files and their .sig files")
    parser.add_argument("tag", help="the release tag, such as v3.0.2")
    parser.add_argument("-o", "--output", type=pathlib.Path, help="where to write (default: latest.json in the folder)")
    args = parser.parse_args()

    if not args.tag.startswith("v") or not args.tag[1:2].isdigit():
        fail(f"'{args.tag}' is not a release tag such as v3.0.2")
    version = args.tag[1:]
    key = public_key()
    base = f"https://github.com/{REPO}/releases/download/{args.tag}"

    platforms = {}
    for what, pattern, versioned, names in FILES:
        found = sorted(args.folder.glob(pattern))
        if len(found) != 1:
            fail(f"Expected one file for {what} ({pattern}), found {len(found)}: {[f.name for f in found]}")
        file = found[0]
        if versioned and f"_{version}_" not in file.name:
            fail(f"{file.name} is not a file of version {version}")
        sig = file.with_name(file.name + ".sig")
        if not sig.is_file():
            fail(f"{file.name} has no signature ({sig.name}). Was the build run with createUpdaterArtifacts and the signing key?")
        signature = sig.read_text().strip()
        if not check(file, signature, key):
            fail(f"{sig.name} is not a signature of {file.name} by the key in {CONFIG.name}. Is TAURI_SIGNING_PRIVATE_KEY the key that belongs to it?")
        print(f"{file.name}: signed by the key the app carries")
        for name in names:
            platforms[name] = {"signature": signature, "url": f"{base}/{file.name}"}

    manifest = {
        "version": version,
        "notes": "See release notes on GitHub.",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    output = args.output or args.folder / "latest.json"
    output.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"--- {output} ---")
    print(output.read_text())


if __name__ == "__main__":
    main()
