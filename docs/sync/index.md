---
title: Sync Overview
order: 1
---

# Sync Overview

Noteriv provides built-in synchronization to keep your notes backed up and accessible across devices. There are three sync providers, each suited to a different workflow. You can use one or combine several -- for example, git sync for version control and folder sync for real-time cloud backup.

## Sync Providers

### Git Sync

Git sync uses the `git` command-line tool to commit and push your vault to a GitHub repository. On the desktop app, Noteriv runs real git operations (fetch, pull, stash, commit, push) in the background. On the mobile app, where a git binary is not available, Noteriv communicates directly with the GitHub REST API to push and pull files.

Git sync is the most robust option for version control. Every change is committed with a timestamp message, so you have a full history of your vault that you can browse, diff, and roll back using standard git tools.

See [Git Sync](./git-sync.md) for desktop setup and details.
See [Mobile Sync](./mobile-sync.md) for mobile-specific behavior.

### Folder Sync

Folder sync mirrors your vault to a local folder on your file system. The target folder is typically a directory managed by a cloud storage provider -- Google Drive, Dropbox, OneDrive, or iCloud. The cloud provider's own sync client handles uploading the files to the cloud.

Folder sync is bidirectional by default: files modified locally are copied to the target, and files modified in the target are copied back. Direction can be configured as push-only, pull-only, or two-way.

See [Folder Sync](./folder-sync.md) for details.

### WebDAV Sync

WebDAV sync connects your vault to any WebDAV-compatible server, such as Nextcloud, ownCloud, or a self-hosted WebDAV endpoint. Noteriv pushes and pulls files over HTTP using the WebDAV protocol. This option is ideal for users who run their own cloud infrastructure and want to avoid third-party services.

See [WebDAV Sync](./webdav-sync.md) for details.

## Auto-Sync

When configured, Noteriv automatically syncs at regular intervals. The default interval is every 5 seconds. This means changes you make are committed and pushed (git) or copied (folder/WebDAV) within seconds, without manual intervention.

The auto-sync interval is configurable in Settings under the Sync section. You can set it from 1 second (aggressive, suitable for fast connections) to several minutes (conservative, suitable for metered connections), or disable it entirely and sync manually.

### Sync on Save

In addition to the interval timer, git sync can be configured to trigger automatically every time you save a file (`Ctrl+S`). This is controlled by the "Auto-sync on save" toggle in the git sync settings panel.

## Manual Sync

You can trigger a sync at any time:

- **Keyboard shortcut**: `Ctrl+Shift+G` runs a full git sync cycle (fetch, pull, commit, push).
- **Sidebar button**: The git sync panel in the sidebar has Sync and Pull buttons.
- **Command palette**: Search for "Sync Now" in `Ctrl+P`.

## Sync Status Indicator

The sidebar displays a colored dot indicating the current sync state:

| Color | Meaning |
|---|---|
| Green | Up to date -- no uncommitted changes, not ahead of remote |
| Yellow | Uncommitted changes -- local modifications that have not been committed |
| Blue | Ahead of remote -- commits exist locally that have not been pushed |

The indicator also shows the current branch name and counts of changes, ahead commits, and behind commits (e.g., "main -- 3 changes -- 1 ahead").

## Conflict Resolution

### Git Sync

Git sync uses `pull --rebase` to integrate remote changes. If a conflict occurs (the same line was modified both locally and remotely), git's standard conflict markers are inserted into the file:

```
<<<<<<< HEAD
Your local change
=======
Remote change
>>>>>>> origin/main
```

You will need to resolve these manually by editing the file and removing the markers. After resolution, the next sync cycle will commit and push the resolved file.

To minimize conflicts, Noteriv stashes any uncommitted local changes before pulling, then pops the stash after the pull completes. This prevents pull failures due to dirty working trees.

### Folder Sync

Folder sync resolves conflicts by **modification time**: the file with the more recent modification timestamp wins. This is simple and works well for single-user workflows, but can cause data loss if two devices modify the same file within the same sync interval. For multi-device editing, git sync is the safer choice.

### WebDAV Sync

WebDAV sync uses the same modification-time strategy as folder sync.

## Provider Comparison

| Feature | Git | Folder | WebDAV |
|---|---|---|---|
| Version history | Full git log | None (overwrite) | None (overwrite) |
| Conflict handling | Merge/rebase | Last-modified wins | Last-modified wins |
| Requires internet | For push/pull | No (local folder) | Yes |
| Setup complexity | Moderate (token) | Low (pick folder) | Moderate (URL/auth) |
| Mobile support | Yes (via GitHub API) | No | No |
| Self-hostable | Yes (any git server) | Yes | Yes |

## Settings Location

Sync configuration is stored per-vault. Each vault can have its own git remote, folder target, and WebDAV server. This means you can sync your work vault to a company GitHub repo and your personal vault to a personal Nextcloud server, all within the same Noteriv installation.

On desktop, sync settings are accessed from:

1. **Sidebar**: The git sync panel at the bottom of the sidebar shows status and has a gear icon for settings.
2. **Settings modal**: Settings > Sync section, where you configure the auto-sync interval, pull-on-open behavior, and additional sync providers (folder, WebDAV).

On mobile, sync settings are in the vault settings screen.

## What Gets Synced

All files in the vault directory are included in sync, with a few exceptions:

- `.noteriv/` directory: Contains application configuration and is excluded from git commits.
- `.trash/` directory: Contains soft-deleted files and is excluded from git sync.
- `.DS_Store` and `Thumbs.db`: Operating system metadata files, excluded via `.gitignore`.
- `*.tmp` files: Temporary files, excluded via `.gitignore`.

Markdown files, canvas files, drawing files, images, PDFs, PDF annotation sidecars, and all other vault content is synced.

## Security

### Git Tokens

Git authentication uses personal access tokens (PATs) or OAuth tokens. On desktop, tokens are passed to git via a temporary `GIT_ASKPASS` script that is created, used, and immediately deleted for each git operation. The token is never written to the git credential store or to any persistent file.

On mobile, the GitHub token is stored in the app's secure storage, tied to the specific vault configuration.

### WebDAV Credentials

WebDAV username and password are stored in the vault configuration. They are transmitted over HTTPS to the WebDAV server. Ensure your WebDAV server uses HTTPS to prevent credential interception.

## Troubleshooting

- **"Sync failed" with no details**: Check that your git remote URL is correct and your token has `repo` scope.
- **Merge conflicts appearing in files**: Resolve the conflict markers manually, save the file, and sync again.
- **Folder sync not detecting changes**: Ensure the target folder is accessible and not locked by another process.
- **WebDAV connection refused**: Verify the server URL includes the protocol (`https://`) and the correct port.
