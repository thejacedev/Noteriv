---
title: What Syncs
order: 6
---

# What Syncs

[Folder sync](./folder-sync.md) and [WebDAV sync](./webdav-sync.md) do not carry every file in the vault. Notes and other text files always sync. Images, PDFs, audio and video each have a switch. You can leave whole folders out, and you can add the vault's bookmarks, property types and saved layouts.

These options are in the desktop app and were added after 2.4.13. Versions up to 2.4.13 have none of them: what they sync is fixed.

Git sync is not affected by anything on this page. What it commits is decided by the vault's `.gitignore` file: see [Git Sync](./git-sync.md).

## The Options

The options are in Settings > Sync, under **Additional Sync Provider**. They appear below the provider's own settings once you have picked **Cloud Drive (Folder)** or **WebDAV**.

| Option | Default | What it does |
|---|---|---|
| Images | On | Syncs `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp` and `.avif` files |
| PDFs | On | Syncs `.pdf` files |
| Audio | Off | Syncs `.mp3`, `.wav`, `.m4a`, `.ogg` and `.flac` files |
| Video | Off | Syncs `.mp4`, `.webm`, `.mov` and `.mkv` files |
| Vault settings | Off | Syncs the vault's bookmarks, property types and saved layouts. See [Vault Settings](#vault-settings) |
| Folders to leave out | Empty | Leaves the folders you list out of sync. See [Folders to Leave Out](#folders-to-leave-out) |

Things to know:

- The choice is saved in Noteriv's settings on this device, not in the vault. There is one choice. It is used for folder sync or WebDAV sync, whichever you have picked, and for every vault you open on this device.
- The choice is not synced. Set it on each device. Your devices do not have to make the same choice.
- A change is used from the next sync on.

## What Always Syncs

These file types sync whatever you choose:

- Notes and text: `.md`, `.markdown`, `.txt`
- Vault files: `.canvas`, `.drawing`, `.base`, `.json`, `.csv`, `.css`, `.yaml`, `.yml`

`.base` files (see [Bases](../views/bases.md)) are synced after 2.4.13. Versions up to 2.4.13 leave them on the device.

Upper and lower case in a file ending make no difference: `Photo.PNG` is an image.

## What Never Syncs

No option adds these:

- File types that are not listed on this page, such as `.zip` archives.
- Files with no ending in their name.
- Folders named `.git`, `.obsidian`, `.trash` or `node_modules`, wherever they are in the vault, and everything in them.
- The `.noteriv` folder, apart from the three files that [Vault settings](#vault-settings) adds.
- Empty folders.

## How Leaving Something Out Works

The choice is applied in the same way to both sides of a sync: the vault on this device, and the target folder or the server. A file that is left out is not looked at on either side. It is not copied, not compared and not deleted, and it is never taken for a file that you deleted.

When you turn a kind of file off, or add a folder to the list:

- The files stay where they are, on this device and on the other side. Nothing is removed.
- From then on, changes to them are not carried across, and new files of that kind are not copied.
- Deleting one of them on this device does not delete it on the other side.

Your other devices keep their own choice. A device that still syncs those files carries on as before.

Once a sync has run without the files, Noteriv keeps no record of them. When you turn the kind back on, or take the folder off the list, they are picked up as on a first sync:

- A file that is on one side only is copied to the other, where the sync direction allows it.
- A file that is on both sides and differs is kept in both versions, as described under Conflicts for [folder sync](./folder-sync.md#conflicts) and [WebDAV sync](./webdav-sync.md#conflicts).
- Nothing is deleted. A file you deleted on one side while it was left out comes back from the other.

## Audio and Video

**Audio** and **Video** are off until you turn them on, because these files are large. When you turn one on, the next sync picks up every file of that kind, on both sides, as described above.

Recordings made with the Audio Recorder are saved as `.webm` files. `.webm` counts as video here, so recordings sync when **Video** is on, not when **Audio** is on.

## Folders to Leave Out

**Folders to leave out** is a list of folders that are not synced. Write one folder per line, as its path from the top of the vault:

```text
Archive
Work/Private
```

| Line | Leaves out |
|---|---|
| `Archive` | The folder `Archive` at the top of the vault and everything in it, subfolders included |
| `Work/Private` | The folder `Private` inside `Work`. The rest of `Work` still syncs |

How the list is read:

- A line is the whole path of a folder, from the top of the vault. `Archive` does not match `Notes/Archive`, and it does not match a folder called `Archive2` or a note called `Archive.md`.
- Upper and lower case have to match the folder's name exactly. `archive` does not leave out `Archive`.
- There are no wildcards. `*` has no special meaning.
- Spaces around a line, and slashes at its start or end, are ignored. A backslash is read as a slash.
- Blank lines are ignored. So is a line that has `..` as one of its parts.

A folder on the list is not synced from this device, and it is left alone on the other side. If the other side already has that folder, from an earlier sync or from another device, it stays there as it is: nothing in it is brought into the vault, and nothing in it is deleted.

This list is separate from [Excluded files](../features/file-settings.md#excluded-files) in Settings > General, and it is read differently: case matters here, and a line that starts with `#` is not a comment. Excluded files has no effect on sync, and this list has no effect on search.

## Vault Settings

**Vault settings** adds three files from the vault's `.noteriv` folder to the sync:

| File | Holds |
|---|---|
| `.noteriv/bookmarks.json` | The vault's [bookmarks](../features/bookmarks.md) and their groups |
| `.noteriv/types.json` | The types given to the vault's [properties](../features/properties.md) |
| `.noteriv/workspaces.json` | The vault's [saved layouts](../features/workspaces.md) |

Bookmarks and layouts point to files and folders by their path from the top of the vault, so they work on a device that keeps the vault in a different place.

Nothing else in `.noteriv` leaves the device. `workspace.json`, which holds the tabs open on this device, is not synced. Neither are the trash, plugins, themes, CSS snippets, flashcard review data, or file recovery snapshots.

With the option on, Noteriv reads the three files again after any sync that brought a file into the vault, so bookmarks, property types and layouts from another device show up without a restart.

### When Two Devices Changed the Same File

These three files are not treated like notes. When one of them changed on both sides since the last sync, no conflict copy is kept and nothing is merged. One file replaces the other whole:

| Sync | The file that is kept |
|---|---|
| WebDAV | The one with the newer modification time. If the times are equal, the one on this device |
| Folder sync, two-way | The one with the newer modification time. If the times are equal, the one in the vault |
| Folder sync, push only | The one in the vault |
| Folder sync, pull only | The one in the target folder |

Whatever was only in the other file is gone: a bookmark you added on the other device, for example. No notice is shown.

The same rule applies the first time a device syncs with the option on. If the device already has one of these files and it differs from the copy on the other side, one replaces the other in the same way. If a device has bookmarks or layouts you want to keep, copy the three files somewhere safe before you turn the option on for another device.

### With Encryption

With [WebDAV encryption](./webdav-sync.md#encryption) on, the contents of these files are encrypted like those of any other file. Their names, and the name of the `.noteriv` folder, are readable on the server.
