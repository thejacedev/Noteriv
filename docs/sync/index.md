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
See [What Syncs](./what-syncs.md) for choosing which files it carries.

### WebDAV Sync

WebDAV sync connects your vault to any WebDAV-compatible server, such as Nextcloud, ownCloud, or a self-hosted WebDAV endpoint. Noteriv pushes and pulls files over HTTP using the WebDAV protocol. This option is ideal for users who run their own cloud infrastructure and want to avoid third-party services.

WebDAV sync can encrypt the contents of files on your device before they are uploaded (desktop app, after 2.4.13). File and folder names are not encrypted.

See [WebDAV Sync](./webdav-sync.md) for details.
See [What Syncs](./what-syncs.md) for choosing which files it carries.

## Auto-Sync

When configured, Noteriv automatically syncs at regular intervals. On desktop the default interval is every 5 minutes. This means changes you make are committed and pushed (git) or copied (folder/WebDAV) without manual intervention.

The auto-sync interval is configurable in Settings under the Sync section. On desktop you can set it to 1, 5, 10 or 30 minutes, or disable it entirely and sync manually.

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

Folder sync keeps both versions when a file changed on both sides since the last sync. In two-way mode the newer one keeps the note's name and the other is saved next to it as a conflict copy. See [Folder Sync](./folder-sync.md#conflicts).

### WebDAV Sync

WebDAV sync keeps both versions when a file changed on both sides since the last sync. The newer one keeps the note's name and the other is saved next to it as a conflict copy. See [WebDAV Sync](./webdav-sync.md#conflicts).

## Provider Comparison

| Feature | Git | Folder | WebDAV |
|---|---|---|---|
| Version history | Full git log | None (overwrite) | None (overwrite) |
| Conflict handling | Merge/rebase | Keeps both versions | Keeps both versions |
| Requires internet | For push/pull | No (local folder) | Yes |
| Setup complexity | Moderate (token) | Low (pick folder) | Moderate (URL/auth) |
| Mobile support | Yes (via GitHub API) | No | No |
| Self-hostable | Yes (any git server) | Yes | Yes |
| Choosing what syncs | Through `.gitignore` | Yes (after 2.4.13) | Yes (after 2.4.13) |
| Encrypts file contents | No | No | Optional (after 2.4.13) |

## Settings Location

The Git remote is stored per vault, so each vault can sync to its own repository. The additional sync provider is not. The folder target or WebDAV server, the choice of what syncs and the WebDAV encryption password are stored once, in Noteriv's settings on the device, and are used for whichever vault is open. If you open more than one vault on a device, they all sync with the same target folder or remote path.

On desktop, sync settings are accessed from:

1. **Sidebar**: The git sync panel at the bottom of the sidebar shows status and has a gear icon for settings.
2. **Settings modal**: Settings > Sync section, where you configure the auto-sync interval, pull-on-open behavior, and additional sync providers (folder, WebDAV). Once a provider is picked, the same section holds the choice of what it syncs and, for WebDAV, the encryption password.

On mobile, sync settings are in the vault settings screen.

## What Gets Synced

All files in the vault directory are included in sync, with a few exceptions:

- `.noteriv/` directory: Contains application configuration and is excluded from git commits.
- `.trash/` directory: Contains soft-deleted files and is excluded from git sync.
- `.DS_Store` and `Thumbs.db`: Operating system metadata files, excluded via `.gitignore`.
- `*.tmp` files: Temporary files, excluded via `.gitignore`.

Markdown files, canvas files, drawing files, images, PDFs, PDF annotation sidecars, and all other vault content is synced.

The list above is for Git sync. Folder sync and WebDAV sync carry a narrower set of files. Notes and other text files always sync. Images and PDFs sync unless you turn them off, audio and video sync only if you turn them on, and other file types never sync. You can also leave folders out, and add the vault's bookmarks, property types and saved layouts. These choices are in the desktop app and were added after 2.4.13. See [What Syncs](./what-syncs.md).

## Security

### Git Tokens

Git authentication uses personal access tokens (PATs) or OAuth tokens. On desktop, tokens are passed to git via a temporary `GIT_ASKPASS` script that is created, used, and immediately deleted for each git operation. The token is never written to the git credential store or to any persistent file.

On mobile, the GitHub token is stored in the app's secure storage, tied to the specific vault configuration.

### WebDAV Credentials

WebDAV username and password are stored in Noteriv's settings file on the device, not in the vault. They are transmitted over HTTPS to the WebDAV server. Ensure your WebDAV server uses HTTPS to prevent credential interception.

### WebDAV Encryption

WebDAV sync can encrypt the contents of files on the device before they are uploaded (desktop app, after 2.4.13). File and folder names are not encrypted, and folder sync is not encrypted. Every device needs the same encryption password, and a forgotten password cannot be recovered. The password is stored in Noteriv's settings file on the device, like the WebDAV password, and is not sent to the server. See [Encryption](./webdav-sync.md#encryption).

## Troubleshooting

- **"Sync failed" with no details**: Check that your git remote URL is correct and your token has `repo` scope.
- **Merge conflicts appearing in files**: Resolve the conflict markers manually, save the file, and sync again.
- **Folder sync not detecting changes**: Ensure the target folder is accessible and not locked by another process.
- **WebDAV connection refused**: Verify the server URL includes the protocol (`https://`) and the correct port.
- **WebDAV sync stops with a message about encryption**: The encryption password on this device does not fit the remote folder. See [When a Sync Stops](./webdav-sync.md#when-a-sync-stops).
- **A file is missing on the other side**: Folder sync and WebDAV sync only carry the file types and folders you have chosen. See [What Syncs](./what-syncs.md).
