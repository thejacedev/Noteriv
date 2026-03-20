---
title: Mobile Sync
order: 5
---

# Mobile Sync

The Noteriv mobile app (iOS and Android, built with React Native and Expo) supports vault synchronization with GitHub repositories. Since mobile platforms do not have a `git` binary available, the mobile app communicates directly with the GitHub REST API to push and pull files. The experience is designed to feel seamless -- you set up a repository once, and your notes sync automatically in the background.

## How It Differs from Desktop Git Sync

On the desktop, Noteriv calls the system `git` binary to run standard git commands (fetch, pull, commit, push). On mobile, there is no git binary, so the app uses the **GitHub Contents API** and **Git Trees API** to achieve the same result through HTTP requests.

| Operation | Desktop | Mobile |
|---|---|---|
| List remote files | `git fetch` + local tree | `GET /repos/:owner/:repo/git/trees/:branch?recursive=1` |
| Download a file | `git pull` | `GET /repos/:owner/:repo/contents/:path` |
| Upload a file | `git add` + `git commit` + `git push` | `PUT /repos/:owner/:repo/contents/:path` |
| Delete remote file | `git rm` + `git commit` + `git push` | Not supported (files persist on remote) |
| Authentication | Temporary `GIT_ASKPASS` script | `Authorization: Bearer <token>` header |

The trade-off is that mobile sync is slower for large vaults (each file requires an individual API request) and does not support advanced git features like branching, merging, or rebasing. It is designed for the common case: syncing a personal vault between your phone and your computer.

## Setup

### Connecting a Repository

1. Open the Noteriv mobile app.
2. Go to Settings (gear icon).
3. Tap "GitHub Sync" under the vault settings.
4. Enter your GitHub repository URL. Both HTTPS formats are supported:
   - `https://github.com/username/repo`
   - `https://github.com/username/repo.git`
   SSH URLs (`git@github.com:username/repo.git`) are also parsed correctly.
5. Enter your GitHub personal access token with `repo` scope.
6. Tap "Save".

The app parses the URL to extract the repository owner and name, which are used to construct API endpoint URLs.

### Generating a Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) on your computer or phone browser.
2. Click "Generate new token (classic)".
3. Give it a descriptive name like "Noteriv Mobile".
4. Select the `repo` scope (full control of private repositories).
5. Generate the token and copy it.
6. Paste it into Noteriv's GitHub Sync settings.

Fine-grained tokens are also supported as long as they have read and write access to the repository's contents.

### Token Storage

The GitHub token is stored securely in the app's per-vault configuration. It is associated with a specific vault, so different vaults can use different tokens and different repositories.

## Sync Operations

### Pull

The pull operation downloads files from GitHub to the local vault:

1. **Detect default branch**: Queries `GET /repos/:owner/:repo` and reads the `default_branch` field (usually `main`).
2. **Get remote tree**: Queries `GET /repos/:owner/:repo/git/trees/:branch?recursive=1` to get a flat list of all files in the repository, including their paths, types, and SHA hashes.
3. **Filter files**: Keeps only blob (file) entries that are Markdown files (`.md` or `.markdown`) and are not inside the `.noteriv/` directory.
4. **Compare with local**: For each remote file, checks if a local copy exists. If the local copy matches the remote content, it is skipped.
5. **Download changed files**: For files that are new or modified, calls `GET /repos/:owner/:repo/contents/:path` to retrieve the file content (base64-encoded), decodes it, and writes it to the local filesystem.
6. **Delete removed files**: Local files that no longer exist on the remote (excluding `.noteriv/` and `.trash/`) are deleted from the device.

### Push

The push operation uploads local files to GitHub:

1. **Get remote tree**: Same as pull -- fetches the full remote tree to know which files exist and their SHA hashes.
2. **List local files**: Scans the vault directory for all Markdown files.
3. **Compare with remote**: For each local file, fetches the remote version and compares content. If they match, the file is skipped.
4. **Upload new/changed files**: For files that are new or have different content, calls `PUT /repos/:owner/:repo/contents/:path` with the base64-encoded content, the existing SHA (for updates) or no SHA (for new files), and a commit message.

Each `PUT` request creates an individual commit on the remote with the message "Sync from Noteriv Mobile". This means a push of 10 modified files creates 10 separate commits. While this is noisier than the desktop's single-commit approach, it ensures each file change is tracked independently.

### Full Sync

The `sync()` function runs a pull followed by a push:

1. Pull all remote changes to local.
2. Push all local changes to remote.

This order (pull first) ensures that remote changes are downloaded before local changes are uploaded, reducing the chance of overwriting a remote file that was updated on another device.

## Auto-Sync

When a GitHub repository is configured, the mobile app runs a full sync cycle every 5 seconds. The auto-sync timer starts when you open a vault and stops when you leave the vault or close the app.

The sync is non-blocking -- it runs in the background while you continue editing. A sync indicator in the UI shows when a sync is in progress. If a sync cycle fails (network error, token expired), the error is logged but does not interrupt your workflow. The next cycle will retry.

## Fresh Clone

The "Fresh Clone" button in sync settings performs a destructive re-download of the entire vault from GitHub:

1. **Delete all local files**: Every file and directory in the vault is deleted, except `.noteriv/` (configuration) and `.trash/` (soft-deleted files).
2. **Download everything**: All files from the remote repository (not just Markdown -- everything) are downloaded and written to the vault directory.

Fresh Clone is useful when:

- Your local vault has become corrupted or out of sync.
- You want to start fresh on a new device.
- You accidentally deleted files locally and want to restore from the remote.

This operation is irreversible for local-only files. Any files that exist locally but not on the remote will be permanently deleted. The UI shows a confirmation dialog before proceeding.

## SHA Caching

To minimize redundant API requests, the mobile sync maintains an in-memory cache of file SHA hashes. The cache maps `owner/repo:path` keys to SHA values. When comparing local and remote files, the cached SHA can identify unchanged files without downloading their content.

The cache is populated during each sync cycle when the remote tree is fetched. It is cleared when the app is restarted.

## Base64 Encoding

The GitHub Contents API transmits file content as base64-encoded strings. The mobile sync includes custom base64 encode and decode functions that work in the React Native JavaScript runtime (Hermes). These functions handle UTF-8 content correctly, using `encodeURIComponent` / `decodeURIComponent` for the encoding bridge.

The encoder uses the native `btoa` function when available (polyfilled in most React Native environments) and falls back to a manual implementation for environments where it is not present.

## Error Handling

Each file operation (download, upload) is wrapped in a try-catch block. Errors for individual files are collected into an `errors` array in the `SyncResult`:

```typescript
interface SyncResult {
  pulled: number;   // files downloaded
  pushed: number;   // files uploaded
  errors: string[]; // error messages for failed operations
}
```

If a single file fails (e.g., a 404 for a file that was deleted between tree fetch and content fetch), the sync continues with the remaining files. The total pulled/pushed counts and any error messages are available for display in the UI.

## Rate Limiting

The GitHub API has rate limits:

- **Authenticated requests**: 5,000 per hour.
- **Contents API**: Each file download or upload counts as one request.

For a vault with 500 Markdown files, a full sync cycle makes roughly 500-1,000 API requests (tree fetch, content checks, uploads). With the default 5-second interval, this can approach the rate limit if every file changes on every cycle. In practice, most cycles transfer only a few files, so rate limits are rarely hit.

If you encounter rate limiting (`403` responses), increase the sync interval or reduce the number of files being synced.

## Skipped Paths

The following paths are excluded from sync:

- **`.noteriv/`**: Application configuration directory. Contains vault settings, themes, and other metadata that should not be synced.
- **`.trash/`**: Soft-deleted files. Kept locally for recovery but not synced to remote.

All other files participate in sync.

## Limitations

- **GitHub only**: Mobile sync works exclusively with GitHub. GitLab, Bitbucket, and other git hosts are not supported.
- **No merge/rebase**: If the same file is modified both locally and remotely, the last writer wins. There are no conflict markers or merge logic on mobile.
- **Individual commits per file**: Each pushed file creates its own commit, resulting in verbose commit history.
- **Markdown files only for pull**: The pull operation filters to `.md` and `.markdown` files. Other file types (images, PDFs, canvases) are not pulled unless using Fresh Clone.
- **No branch support**: Mobile sync always operates on the repository's default branch. You cannot switch branches or create pull requests from the mobile app.
- **No offline queue**: If the device is offline, the sync cycle fails silently. Changes are not queued and retried -- they will be pushed on the next successful cycle.
- **No binary file support in regular sync**: Binary files (images, PDFs) are not synced in regular push/pull cycles. Use Fresh Clone to download all file types.

## Troubleshooting

| Problem | Solution |
|---|---|
| "Invalid GitHub remote URL" | Check that the URL follows the format `https://github.com/owner/repo`. |
| "Failed to get repo info: 401" | Your token is invalid or expired. Generate a new one. |
| "Failed to get repo info: 404" | The repository does not exist, or your token does not have access. |
| Sync is slow | Normal for large vaults. Each file requires an API request. Increase the sync interval. |
| Files missing after Fresh Clone | Fresh Clone only downloads files that exist on the remote. Local-only files are deleted. |
| "Failed to put file" | The token may lack write permission. Ensure the `repo` scope is granted. |
