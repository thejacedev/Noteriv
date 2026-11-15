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
