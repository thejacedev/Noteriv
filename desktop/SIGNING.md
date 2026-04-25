# Signing & release setup

## What's already done

- Updater signing keypair is generated at `src-tauri/noteriv-updater.key` (private) and `.key.pub` (public). The pubkey is pasted into `tauri.conf.json`.
- `.gitignore` excludes both key files. **Do not commit them.**
- `.github/workflows/release.yml` is wired to use the secrets below.

## GitHub Actions secrets you must add

| Secret name | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The full contents of `src-tauri/noteriv-updater.key` (the entire base64 blob, including header/footer lines) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty string. The key was generated without a password. Set the secret to an empty value (or skip it — Tauri treats unset and empty the same). |

That's it. No Apple, no Windows code signing — unsigned builds will work; users on macOS/Windows get the standard "untrusted developer" warning on first launch and click through.

## Cutting a release

```bash
git tag v2.0.0
git push origin v2.0.0
```

The `release.yml` workflow runs on `v*` tags. It builds Linux/Mac/Windows bundles, generates `latest.json` for the auto-updater, and uploads everything to a GitHub release.

## If you lose the updater private key

1. Generate a new keypair: `npx tauri signer generate --ci -p "" -w src-tauri/noteriv-updater.key -f`.
2. Replace `pubkey` in `tauri.conf.json` with the contents of `noteriv-updater.key.pub`.
3. Update the `TAURI_SIGNING_PRIVATE_KEY` secret in GitHub.
4. Cut a release using the new key.
5. **Existing installed users will not be able to auto-update** — the old binary refuses signatures from the new pubkey. They'll have to manually download and reinstall once.

Don't lose it.
