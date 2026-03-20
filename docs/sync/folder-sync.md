---
title: Folder Sync
order: 3
---

# Folder Sync

Folder sync mirrors your Noteriv vault to a local folder on your file system. The target folder is typically a directory managed by a cloud storage client -- Google Drive, Dropbox, OneDrive, or iCloud Drive. The cloud provider's own sync engine handles uploading files to the cloud and downloading changes from other devices. Noteriv's job is to keep the vault and the target folder in sync with each other.

This approach is simple, requires no tokens or server configuration, and works with any cloud service that exposes a local folder.

## How It Works

Folder sync operates on a **file-level copy** model. It walks both the vault directory and the target directory, compares files by relative path, and copies whichever version is newer based on the file's last-modified timestamp.

The sync happens in two passes:

### Push Pass (Local to Target)

For every file in the vault directory, Noteriv checks whether the file exists in the target directory at the same relative path. If the file does not exist in the target, or the local file has a more recent modification time, the local file is copied to the target.

### Pull Pass (Target to Local)

For every file in the target directory, Noteriv checks whether the file exists in the vault at the same relative path. If the file does not exist locally, or the target file has a more recent modification time, the target file is copied to the vault.

Both passes run in a single sync cycle. The result is that the vault and the target converge to the same state: every file present in either location ends up in both locations, with the most recently modified version winning.

## Configuration

Folder sync is configured in Settings > Sync > Additional Sync Provider.

### Target Path

The local folder to sync to. Click "Browse" to open a directory picker, or type the path directly. Common choices:

| Provider | Typical Path (macOS) | Typical Path (Windows) | Typical Path (Linux) |
|---|---|---|---|
| Google Drive | `~/Google Drive/Noteriv` | `G:\My Drive\Noteriv` | `~/google-drive/Noteriv` |
| Dropbox | `~/Dropbox/Noteriv` | `C:\Users\you\Dropbox\Noteriv` | `~/Dropbox/Noteriv` |
| OneDrive | `~/OneDrive/Noteriv` | `C:\Users\you\OneDrive\Noteriv` | `~/OneDrive/Noteriv` |
| iCloud Drive | `~/Library/Mobile Documents/com~apple~CloudDocs/Noteriv` | N/A | N/A |

If the target directory does not exist, Noteriv creates it automatically (including intermediate directories) on the first sync.

### Sync Direction

You can control which direction files flow:

| Direction | Behavior |
|---|---|
| **Two-way (push & pull)** | Default. Files flow in both directions based on modification time. |
| **Push only (local to folder)** | Vault changes are copied to the target. Target changes are ignored. |
| **Pull only (folder to local)** | Target changes are copied to the vault. Vault changes are not copied out. |

Push-only mode is useful for one-way backup: your vault is the authoritative copy, and the target folder is a read-only mirror. Pull-only mode is useful when another tool writes to the target folder and you want Noteriv to import those changes.

## Testing the Connection

Before the first sync, you can click the "Test Connection" button in settings. This verifies that:

1. The target path is accessible.
2. Noteriv has write permission to the target directory.

The test creates a small temporary file (`.noteriv-test`), verifies it was written, and then deletes it. If the test fails, check that the path exists and that your user account has write access.

## Sync Interval

Folder sync runs on the same auto-sync timer as git sync (default: every 5 seconds). Each interval tick triggers the push and pull passes described above. Since file copies are local disk operations, each sync cycle typically completes in under a second, even for vaults with hundreds of files.

You can adjust the interval in Settings > Sync > Auto sync interval.

## What Gets Synced

The folder sync walks the vault directory recursively and includes all files. There is no `.gitignore`-style exclusion for folder sync -- every file in the vault is mirrored to the target.

This includes:

- Markdown notes (`.md`)
- Canvas files (`.canvas`)
- Drawing files (`.drawing`)
- Images (`.png`, `.jpg`, `.svg`, etc.)
- PDFs (`.pdf`)
- PDF annotation sidecars (`.pdf-annotations.json`)
- Configuration files in `.noteriv/`

If you want to exclude certain files from folder sync, move them outside the vault directory.

## Conflict Resolution

Folder sync uses a **last-modified-wins** strategy. When the same file has been modified in both the vault and the target since the last sync, the version with the more recent modification timestamp is the one that gets copied.

This works well for single-user workflows where you edit on one device at a time. However, it can cause data loss in edge cases:

- If you edit a file on device A, then edit the same file on device B before device A's changes have synced to the target, the version with the later timestamp overwrites the earlier one. The earlier changes are lost.
- There are no conflict markers or merge logic. The losing version is simply overwritten.

For workflows where multiple devices may edit the same file concurrently, git sync is the safer option because it detects conflicts and inserts merge markers instead of silently overwriting.

## Directory Structure

Folder sync preserves the vault's directory structure in the target. If your vault contains:

```
vault/
  daily/
    2026-03-20.md
    2026-03-19.md
  projects/
    website-redesign.md
  inbox.md
```

The target folder will mirror this structure exactly:

```
target/
  daily/
    2026-03-20.md
    2026-03-19.md
  projects/
    website-redesign.md
  inbox.md
```

New directories in the vault are created in the target automatically. The `ensureParentDir` helper creates any missing intermediate directories before copying a file.

## File Deletion

Folder sync does **not** propagate deletions. If you delete a file from the vault, it is not deleted from the target. Similarly, if a file is deleted from the target, it is not deleted from the vault. This is a safety measure to prevent accidental data loss.

The consequence is that the target folder may accumulate files that have been deleted from the vault. To clean up, manually delete unwanted files from the target, or periodically re-sync by deleting the target folder entirely and letting the next push recreate it.

## Cloud Provider Notes

### Google Drive

Google Drive's desktop app (Backup and Sync or Google Drive for Desktop) syncs a local folder to Google Drive cloud storage. Point Noteriv's folder sync target to a subfolder inside the Google Drive folder. Changes are uploaded automatically by Google's client.

### Dropbox

Dropbox's desktop app syncs the `~/Dropbox` folder. Create a `Noteriv` subfolder and set it as the target. Dropbox has fast sync with LAN detection.

### OneDrive

Microsoft OneDrive syncs the `~/OneDrive` folder. Works the same way -- create a `Noteriv` subfolder and point folder sync to it.

### iCloud Drive

On macOS, iCloud Drive files live in `~/Library/Mobile Documents/com~apple~CloudDocs/`. Create a `Noteriv` folder there. Note that iCloud may "evict" (remove) local copies of files to save disk space. If this happens, the files will appear as placeholders and may not be readable by folder sync until they are re-downloaded.

## Combining with Git Sync

You can use folder sync alongside git sync. A common pattern:

1. **Git sync** for version history and cross-device sync via GitHub.
2. **Folder sync** to a Google Drive/Dropbox folder as a secondary backup.

Both run on the same timer, so every sync interval commits to git and copies to the target folder. This gives you the best of both worlds: full version history from git, plus a cloud backup that is accessible from any device with the cloud provider's app.

## Limitations

- No conflict resolution beyond last-modified-wins.
- Deletions are not propagated.
- No incremental or delta sync -- files are copied in full on every modification.
- Very large files (videos, large binaries) may slow down the sync cycle since they are copied on every modification.
- Folder sync is desktop-only. The mobile app does not support folder sync (use mobile git sync instead).
- Symlinks are not followed. Only regular files and directories are synced.
