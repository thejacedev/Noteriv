---
title: Folder Sync
order: 3
---

# Folder Sync

Folder sync keeps your Noteriv vault in step with another folder on your computer. That folder is usually one managed by a cloud storage client: Google Drive, Dropbox, OneDrive, or iCloud Drive. The cloud provider's own client uploads the files and brings down changes from your other devices. Noteriv's job is to keep the vault and that folder in step with each other.

This approach is simple, requires no tokens or server configuration, and works with any cloud service that exposes a local folder.

Folder sync is tested with plain folders standing in for the cloud folder. The cloud clients themselves are not part of those tests.

## Use a Folder of Its Own

Point folder sync at a folder that holds nothing but this vault, such as `~/Dropbox/Noteriv`, not at the top of your cloud drive.

In two-way mode, every note and attachment in the target folder is brought into the vault, and a file you then delete from the vault is removed from the target folder too. A target that also holds your photos or other documents would pull all of them into the vault.

Noteriv refuses to sync when the target folder is inside the vault, or the vault is inside the target folder.

## How It Works

Each device keeps a small record of what every file looked like, in the vault and in the target folder, the last time the two matched. On every sync Noteriv lists both folders, compares them with that record, and then:

| What happened since the last sync | What Noteriv does (two-way) |
|---|---|
| Changed in the vault only | Copies it to the target folder |
| Changed in the target folder only | Copies it to the vault |
| New on one side | Copies it to the other |
| Deleted on one side | Moves the other side's copy to a trash (see [File Deletion](#file-deletion)) |
| Changed on both sides | Keeps both versions (see [Conflicts](#conflicts)) |
| Nothing | Nothing. A sync with no changes writes no files |

Because changes are found by comparing with the record, a file is never copied back and forth, and a cloud client that only changes a file's modification time does not cause a copy.

The record is kept in Noteriv's own data folder on each device, not in the vault or the target folder:

- Linux: `~/.config/Noteriv/sync/`
- macOS: `~/Library/Application Support/Noteriv/sync/`
- Windows: `%APPDATA%\Noteriv\sync\`

If either folder cannot be listed completely, for example because a folder in it cannot be read, the sync stops before changing anything. After that each file stands on its own: if one file fails, the others still sync, the status bar reports the problem, and the failed file is tried again on the next sync.

## Configuration

Folder sync is configured in Settings > Sync > Additional Sync Provider.

### Target Path

The folder to sync with, as a full path. A path starting with `~/` is taken from your home folder. Common choices:

| Provider | Typical Path (macOS) | Typical Path (Windows) | Typical Path (Linux) |
|---|---|---|---|
| Google Drive | `~/Google Drive/Noteriv` | `G:\My Drive\Noteriv` | `~/google-drive/Noteriv` |
| Dropbox | `~/Dropbox/Noteriv` | `C:\Users\you\Dropbox\Noteriv` | `~/Dropbox/Noteriv` |
| OneDrive | `~/OneDrive/Noteriv` | `C:\Users\you\OneDrive\Noteriv` | `~/OneDrive/Noteriv` |
| iCloud Drive | `~/Library/Mobile Documents/com~apple~CloudDocs/Noteriv` | N/A | N/A |

If the target folder does not exist, Noteriv creates it, along with any folders above it, on the first sync.

Once a folder has been synced, Noteriv does not create it again if it goes missing. A missing target folder usually means its drive is not connected, so the sync stops with a message instead.

### Sync Direction

| Direction | Behavior |
|---|---|
| **Two-way** | Default. Changes and deletions travel in both directions. |
| **Push only (vault to folder)** | New and changed vault files are copied to the target folder. The vault is never changed, and nothing is deleted from the folder. |
| **Pull only (folder to vault)** | New and changed files in the target folder are copied to the vault. The folder is never changed, and nothing is deleted from the vault. |

Push-only mode is useful for a one-way backup: your vault is the authoritative copy. Pull-only mode is useful when another tool writes to the target folder and you want Noteriv to bring those changes in.

In the one-way modes:

- A copy that goes missing from the receiving side is made again on the next sync.
- A change made on the receiving side is left alone until the same file changes on the sending side. Then the sending side's version is copied over, and the receiving side's version is kept next to it as a conflict copy.

Changing the direction starts again from scratch, like a first sync: files that exist on only one side are copied to the other where the new direction allows it, and nothing is deleted. A note you deleted from the vault while in push-only mode is still in the folder, so switching to two-way brings it back.

## Testing the Connection

Before the first sync, you can click the "Test Connection" button in settings. This verifies that:

1. The target folder is not inside the vault, and the vault is not inside it.
2. The target path can be created, if it does not exist yet.
3. Noteriv can write to it.

The test writes a small temporary file (`.noteriv-test`) and deletes it again. If the test fails, the message says why, and a folder that is refused is not created.

In 2.4.13 the test did not make the first check: it said "Connected" for a folder inside the vault and created that folder, and sync then refused it.

## When Sync Runs

Folder sync runs:

- On the auto-sync timer. The default is every 5 minutes; change it in Settings > Sync > Auto sync interval.
- After a manual save, if "Sync on save" is on.
- When you click the sync indicator in the status bar.

All three work whether or not the vault also has a Git remote.

## What Gets Synced

Folder sync carries these file types, in every folder of the vault:

- Notes and text: `.md`, `.markdown`, `.txt`
- Vault files: `.canvas`, `.drawing`, `.json`, `.csv`, `.css`, `.yaml`, `.yml`
- Images and documents: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.avif`, `.pdf`

Other file types, such as audio and video, stay where they are. The folders `.git`, `.noteriv`, `.obsidian`, `.trash` and `node_modules` are never synced, on either side.

Attachments take up space in your cloud storage. If you do not want a file in the cloud folder, keep it outside the vault.

## Conflicts

If the same file was changed in the vault and in the target folder since the last sync, Noteriv keeps both versions. In two-way mode the newer one stays under the note's name, and the other is saved next to it as a conflict copy, on both sides:

```
Meeting notes.md
Meeting notes (conflict 2026-11-12 14-30-05).md
```

The conflict copy is an ordinary note. You can merge the two by hand and delete the one you no longer need. Nothing is merged automatically; for line-by-line merging and version history, use Git sync.

Your cloud client may also make conflict copies of its own when two devices upload at the same moment. Those arrive as ordinary new files.

## File Deletion

In two-way mode, deleting a file on one side removes it from the other on the next sync. The removed copy is not erased: it is moved to a trash on the side it is removed from.

- A note deleted in the target folder is moved to the vault's trash, and can be restored from the Trash view.
- A note deleted in the vault is moved to `.noteriv/trash` inside the target folder. Empty that folder from time to time if you do not need the copies.

A few rules keep a deletion from removing more than you meant:

- If a note is deleted on one side and edited on the other before they sync, the edit wins and the note comes back.
- If the vault looks empty, nothing is removed from the target folder. The notes are copied back instead.
- If the target folder looks empty, nothing is moved to the vault's trash. The notes are copied out again instead.
- Nothing is ever deleted on the first sync, before a record exists, or in the one-way modes.

Renaming or moving a note is seen as deleting the old file and adding a new one. Empty folders are not synced, and a folder that becomes empty is left in place.

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

## Cloud Provider Notes

### Google Drive

Google Drive's desktop app syncs a local folder to Google Drive cloud storage. Point Noteriv's folder sync target to a subfolder inside the Google Drive folder. Changes are uploaded automatically by Google's client.

### Dropbox

Dropbox's desktop app syncs the `~/Dropbox` folder. Create a `Noteriv` subfolder and set it as the target.

### OneDrive

Microsoft OneDrive syncs the `~/OneDrive` folder. Works the same way: create a `Noteriv` subfolder and point folder sync to it.

### iCloud Drive

On macOS, iCloud Drive files live in `~/Library/Mobile Documents/com~apple~CloudDocs/`. Create a `Noteriv` folder there.

iCloud may remove the local copy of a file to save disk space and leave a placeholder (`.Note.md.icloud`) in its place. Noteriv recognises that placeholder: the note is not treated as deleted, and it is skipped until iCloud downloads it again. This has not been tested against iCloud itself. If you rely on two-way sync with iCloud Drive, consider turning off "Optimize Mac Storage".

### Files Kept Online Only

OneDrive, Dropbox and Google Drive can keep a file online only while still listing it under its real name. Reading such a file makes the client download it. The first sync compares every file that exists on both sides, so it may download files your client had kept online only.

## Combining with Git Sync

You can use folder sync alongside git sync. A common pattern:

1. **Git sync** for version history and cross-device sync via GitHub.
2. **Folder sync** to a Google Drive/Dropbox folder as a secondary backup.

On each sync Git runs first, then folder sync.

## Upgrading from 2.4.12 or Earlier

Folder sync was rewritten after 2.4.12. Earlier versions decided everything by comparing file times. On Linux that copied every file back and forth on each run. On every platform, a note deleted in two-way mode came back, attachments were not synced, and a folder-only vault never synced on the timer.

After updating:

- The first sync has no record yet, so it compares every file that exists on both sides. Files that are identical are simply noted. Files that differ are treated as a conflict and both versions are kept. Nothing is deleted on this first sync.
- Images, PDFs, canvases and drawings in the vault are copied to the target folder for the first time, and any in the target folder are copied into the vault.
- In two-way mode deletions now travel, as described above.
- A vault that uses folder sync without a Git remote now syncs on the auto-sync timer. Set the interval to Off if you prefer to sync by hand.
- A target path written with `~/` now means your home folder. Earlier versions did not expand it.

Update Noteriv on every device that syncs with the same folder. A device still on 2.4.12 or earlier copies any file missing from the folder back into it, so a note deleted on an updated device comes back until every device is updated.

## Limitations

- Conflicts are resolved by keeping both versions. Nothing is merged.
- A changed file is copied whole.
- File types outside the list above are not synced, and neither are empty folders.
- A rename or move is synced as a deletion and a new file.
- Folder sync is desktop-only. The mobile app does not support folder sync (use mobile git sync instead).
- A symbolic link to a folder is not followed. A link to a file is synced as that file, and a link whose target is missing stops the sync with a message.
