# Packaging

Where each install channel lives and how it follows a new release.

| Channel | Lives in | On a new release |
|---|---|---|
| Scoop (Windows) | [thejacedev/scoop-bucket](https://github.com/thejacedev/scoop-bucket) | Updates itself: pinged by `release.yml`, with a daily check as fallback. Installs the new version before committing it. |
| Homebrew (macOS) | [thejacedev/homebrew-tap](https://github.com/thejacedev/homebrew-tap) | Same as Scoop. |
| Flatpak | thejacedev/flatpak (self-hosted repo) | Rebuilt when `release.yml` pings it. |
| COPR (Fedora) | `copr/noteriv.spec` | Manual: bump `Version`, rebuild the SRPM, upload. |
| AUR (Arch) | `aur/` | Run `./bump.sh`, then push `PKGBUILD` and `.SRCINFO` to the AUR git repo. |
| winget (Windows) | `winget/` | Run `./bump.sh`, then open a PR to microsoft/winget-pkgs with the new version folder. |

`./bump.sh [version]` rewrites the AUR and winget files from a published release's assets and checksums. Run it after the release workflow finishes.

## RPM signing key

`release.yml` signs the release `.rpm` with `rpmsign` and checks it against `RPM-GPG-KEY-noteriv` in this folder, the public key users import with `rpm --import`. The private key and its passphrase are the repository secrets `RPM_SIGNING_KEY` (ASCII-armored) and `RPM_SIGNING_KEY_PASSPHRASE`. A tag build fails if the key is missing or does not match this file.

Fingerprint: `C62C 1F44 8323 F48C 2EDA A27C 1EB3 C30D 4B37 42AF` (RSA 4096, no expiry).

## In-app updates

An installed copy reads `latest.json` from the newest release, downloads the file named there for its kind of install, and installs it only if the signature in `latest.json` matches the public key the app was built with (`plugins.updater.pubkey` in `desktop/src-tauri/tauri.conf.json`).

- `release.yml` builds with `desktop/src-tauri/tauri.release.conf.json`, which makes the signatures. The private key and its password are the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The build only warns when that key is not the one the public key belongs to. The `updater` job is what stops such a release: it runs `updater-manifest.py`, which checks every signature against the public key and writes `latest.json`. It also runs on a manual run of the workflow, which publishes nothing.
- The public key must never change. Every installed copy carries it and would refuse all later updates.
- `latest.json` names the AppImage, the macOS `.app.tar.gz` and the two Windows installers. The `.deb` and `.rpm` are left out on purpose: the AUR and COPR packages are made from the `.deb`, so a copy that was built as a `.deb` may be on a system without `dpkg`, and installing a package needs the administrator password. Those copies show the new version and open the download page.
