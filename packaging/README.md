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
