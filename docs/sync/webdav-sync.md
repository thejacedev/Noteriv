---
title: WebDAV Sync
order: 4
---

# WebDAV Sync

WebDAV sync connects your Noteriv vault to any server that supports the WebDAV protocol. This includes self-hosted solutions like Nextcloud and ownCloud, as well as any standards-compliant WebDAV server. Files are transferred over HTTP/HTTPS, making WebDAV sync a good choice for users who want full control over where their data is stored without relying on GitHub or a specific cloud provider.

Tested against Nextcloud 34 and WsgiDAV 4.4.

## What Is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is an extension of HTTP that allows clients to create, read, update, and delete files on a remote server. It is supported by a wide range of server software:

- **Nextcloud**: Self-hosted cloud platform. WebDAV endpoint is typically `https://your-server.com/remote.php/dav/files/username/`.
- **ownCloud**: The predecessor to Nextcloud, with a similar WebDAV endpoint.
- **Apache mod_dav**: The Apache web server's built-in WebDAV module.
- **Nginx**: Can be configured as a WebDAV server with the `dav_ext_module`.
- **Synology NAS**: Most Synology NAS devices support WebDAV out of the box.
- **Box.com**: Enterprise cloud storage with WebDAV support.

## Configuration

WebDAV sync is configured in Settings > Sync > Additional Sync Provider > WebDAV.

### Server URL

The full URL of your WebDAV server. Include the protocol and path:

```
https://cloud.example.com/remote.php/dav/files/username/
```

For Nextcloud, the URL follows the pattern:
```
https://your-nextcloud-server/remote.php/dav/files/YOUR_USERNAME/
```

For a generic WebDAV server:
```
https://your-server.com/webdav/
```

Always use HTTPS to encrypt credentials and file content in transit. HTTP is supported but strongly discouraged for anything outside a trusted local network.

### Username

Your WebDAV account username. For Nextcloud, this is your Nextcloud login username.

### Password

Your WebDAV account password. For Nextcloud, you can generate an app-specific password in Settings > Security > Devices & sessions, which is recommended over using your main account password.

### Remote Path

The folder on the WebDAV server where your vault files are stored. Default: `/Noteriv`. This path is relative to the server URL. If the folder does not exist, Noteriv creates it, along with any folders above it that the path names. Spaces and accented letters in the path are fine.

For example, if your server URL is `https://cloud.example.com/remote.php/dav/files/alice/` and the remote path is `/Noteriv`, files are stored at `https://cloud.example.com/remote.php/dav/files/alice/Noteriv/`.

### Encryption Password

Leave this empty for no encryption. With a password, the contents of every file are encrypted on this device before they are uploaded. File and folder names are not encrypted. Read [Encryption](#encryption) before you set one. This setting was added after 2.4.13.

### What to Sync

Below the WebDAV settings are the switches for images, PDFs, audio and video, the **Vault settings** option and the list of folders to leave out. They are described in [What Syncs](./what-syncs.md).

## How It Works

Each device keeps a small record of what every file looked like, on the device and on the server, the last time the two matched. On every sync Noteriv lists the vault and the remote folder, compares both with that record, and then:

| What happened since the last sync | What Noteriv does |
|---|---|
| Changed on this device only | Uploads it |
| Changed on the server only | Downloads it |
| New on one side | Copies it to the other |
| Deleted on one side | Deletes it on the other (see [Deletions](#deletions)) |
| Changed on both sides | Keeps both versions (see [Conflicts](#conflicts)) |
| Nothing | Nothing. A sync with no changes transfers no files |

Because changes are found by comparing with the record, the server's clock and your device's clock do not have to agree. A file that was only touched (a new modification time but the same content) is not uploaded again.

The record is kept in Noteriv's own data folder on each device, not in the vault:

- Linux: `~/.config/Noteriv/sync/`
- macOS: `~/Library/Application Support/Noteriv/sync/`
- Windows: `%APPDATA%\Noteriv\sync\`

If both sides cannot be listed completely, for example because the server is unreachable, the sync stops before changing anything. After that each file stands on its own: if one file fails, the others still sync, the status bar reports the problem, and the failed file is tried again on the next sync.

### File Types

WebDAV sync carries these file types, in every folder of the vault that you have not left out:

- Always: notes and text (`.md`, `.markdown`, `.txt`) and vault files (`.canvas`, `.drawing`, `.base`, `.json`, `.csv`, `.css`, `.yaml`, `.yml`)
- Unless you turn them off: images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.avif`) and PDFs (`.pdf`)
- Only if you turn them on: audio (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`) and video (`.mp4`, `.mov`, `.mkv`). A `.webm` file syncs with either one

Other file types stay on the device. The folders `.git`, `.obsidian`, `.trash` and `node_modules` are never synced. Neither is `.noteriv`, apart from three settings files that you can choose to add.

The switches for images, PDFs, audio and video, the list of folders to leave out and the **Vault settings** option are described in [What Syncs](./what-syncs.md). Versions up to 2.4.13 have none of these options and do not sync `.base` files.

## Testing the Connection

Before the first sync, click "Test Connection" in the WebDAV settings. This checks that:

1. The URL is reachable.
2. The username and password are accepted.
3. The remote path exists. If it does not, Noteriv creates it.
4. The encryption password fits the remote folder, if the folder was already there (after 2.4.13). See [When a Sync Stops](#when-a-sync-stops).

If the test fails, the message says whether the server could not be reached, rejected the username or password, or refused the folder, or why the encryption password does not fit.

The test never turns encryption on. The key file is only written by a sync.

## Conflicts

If the same file was changed on this device and on the server since the last sync, Noteriv keeps both versions. The newer one stays under the note's name. The other is saved next to it as a conflict copy:

```
Meeting notes.md
Meeting notes (conflict 2026-11-12 14-30-05).md
```

The conflict copy is an ordinary note. It syncs to your other devices, and you can merge the two by hand and delete the one you no longer need. Nothing is merged automatically; for line-by-line merging and version history, use Git sync.

When a sync on this device keeps both versions, Noteriv shows a notice above the status bar that lists the notes, with a button to open each conflict copy. The notice stays until you dismiss it, so you see it even if the sync ran on the timer while you were away. Versions up to 2.4.13 show no notice.

The notice only covers conflicts this device resolved, and it is not kept if you quit Noteriv before dismissing it. On your other devices the conflict copy arrives as an ordinary new file with no notice.

The vault's settings files, if you sync them, are the exception. When one of them changed on both sides, the newer file replaces the older one and no conflict copy is kept. See [Vault Settings](./what-syncs.md#vault-settings).

## Deletions

Deleting a file on one device deletes it from the server on the next sync. Your other devices then move their copy to the vault's trash (`.noteriv/trash`), and a note can be restored from the Trash view.

A few rules keep a deletion from removing more than you meant:

- If a note is deleted on one device and edited on another before they sync, the edit wins and the note comes back.
- If the vault folder looks empty, for example because its drive is not mounted, nothing is deleted from the server. The notes are downloaded again instead.
- If the remote folder is empty, for example because the server was reset, nothing is moved to the trash. The notes are uploaded again instead.
- Nothing is ever deleted on the first sync, before a record exists.

Renaming or moving a note is seen as deleting the old file and adding a new one.

## When Sync Runs

WebDAV sync runs:

- On the auto-sync timer. The default is every 5 minutes; change it in Settings > Sync > Auto sync interval.
- After a manual save, if "Sync on save" is on.
- When you click the sync indicator in the status bar.

All three work whether or not the vault also has a Git remote.

## Encryption

WebDAV sync can encrypt the contents of your files on this device before they are uploaded, so that the server stores the contents in encrypted form. Encryption is off unless you set an **Encryption password** in Settings > Sync. It is in the desktop app and was added after 2.4.13.

Read this whole section before you turn it on. File and folder names are not encrypted, and a forgotten password cannot be recovered.

### What Is Encrypted and What Is Not

| What | With an encryption password set |
|---|---|
| The contents of every file Noteriv uploads from the vault | Encrypted on this device before upload. That covers notes, attachments, conflict copies and the [vault settings](./what-syncs.md#vault-settings) files |
| File and folder names | Not encrypted. They are readable on the server, and with them the folder layout of the vault |
| File sizes | Not hidden. An encrypted file is 45 bytes larger than the original |
| The vault on this device | Not encrypted. Files are decrypted when they are downloaded, and are stored in the vault as ordinary files |
| [Folder sync](./folder-sync.md) | Not encrypted. Encryption is a WebDAV option only |

Two more limits:

- Someone who controls the server cannot read a file, and cannot change what is inside one without Noteriv refusing it. They can still put one of your encrypted files in the place of another, or put back an older version of a file. Noteriv accepts such a file, because your key opens it.
- Encryption does not replace HTTPS. Your WebDAV username and password, and the file names, are sent to the server as before.

Each file is encrypted with XChaCha20-Poly1305. The key is worked out from your password with Argon2id.

Encryption does not change how sync decides what to do. A sync with no changes still transfers no files.

### The Password

- **Every device needs the same password.** A device with no password, or with a different one, syncs nothing with the folder: see [When a Sync Stops](#when-a-sync-stops).
- **It is used exactly as typed.** Upper and lower case count, and so do spaces at the start or the end.
- **It cannot be recovered.** There is no reset and no second key. Without the password, the copies on the server cannot be read by anyone, you included. The notes in the vault on each device are not encrypted, so they are not lost. What is lost is the copy on the server.
- **It is stored on this device.** Noteriv saves it in its settings file as plain text, next to the WebDAV password: see [Credential Storage](#credential-storage). That file, on a device where the password is set, is the only place Noteriv keeps it. It is not sent to the server.
- **Choose a long one.** Anyone who can read the remote folder can copy the key file and test passwords against it on their own computer. Each test is made slow on purpose, but a short or common password can still be found.

### The Key File

The first encrypted sync writes a small file named `noteriv-encryption.key` at the top of the remote folder. The file marks the folder as encrypted. It holds what another device needs to turn the same password into the same key: a random value made for this folder, the Argon2id settings, and a check value that tells the right password from a wrong one. It does not hold the password or the key.

Do not delete, rename or edit this file. The key is worked out from the password and the random value in the file together, and Noteriv keeps no copy of the file on your devices. Without it, the password does not open the files on the server.

The key file is never downloaded into a vault and is never treated as a note.

### Turning Encryption On

Encryption can only be started on an empty remote folder.

1. Update Noteriv on every device that syncs with this server. A version up to 2.4.13 does not look for the key file. It treats an encrypted folder as an ordinary one: it does not decrypt what it downloads, and it does not encrypt what it uploads.
2. In Settings > Sync, set the remote path to a folder that is empty or does not exist yet.
3. Type a password into **Encryption password**.
4. Sync, for example by clicking the sync indicator in the status bar. This sync writes the key file and uploads every synced file in the vault, encrypted.
5. On each other device, enter the same remote path and the same password, then sync.

Empty means that the folder holds no files at all, including file types that Noteriv does not sync. Empty folders inside it do not matter.

An encrypted folder is treated as a new one, even at an address this device has synced with before. On a device that already has notes in its vault, the first sync with it compares every file that exists on both sides, downloading each once. Files that are identical are noted as in step. Files that differ are kept in both versions. Nothing is deleted.

### A Remote Folder That Already Has Notes

Noteriv does not encrypt a folder in place. If a password is set and the remote folder holds files but no key file, the sync stops and nothing is changed.

To encrypt a vault that already syncs, do one of these:

- Set the remote path to a new, empty folder and follow the steps above. The old folder stays on the server, readable, until you delete it there yourself.
- Empty the old folder on the server yourself, then follow the steps above. Make sure no other device syncs before your first encrypted sync. A device with no password set takes the emptied folder for one that lost its files, and uploads its notes again, readable.

### Changing or Removing the Password

The password of an encrypted folder cannot be changed, and encryption cannot be turned off for it.

- If you change the password in the settings, the next sync stops, because it is not the folder's password.
- If you clear the password, the next sync stops, because the folder is encrypted.

In both cases nothing is changed on either side. Sync carries on once the folder's password is back in the settings.

To use a different password, or to stop encrypting, start again with another folder. Set the remote path to a new, empty folder, type the new password or leave the box empty, and sync. Do the same on every device. The old folder and its key file stay on the server until you delete them there.

### When a Sync Stops

The key file is read before any note is read or written. If the settings on this device do not fit the folder, the whole sync stops there. Nothing is changed in the vault, and no note is uploaded, changed or deleted on the server.

The sync indicator in the status bar then reads `sync failed`, and its tooltip shows the message. **Test Connection** makes the same check and shows the same message.

| Situation | Message |
|---|---|
| The folder has a key file, and no password is set on this device | `This remote folder is encrypted. Turn on encryption in the sync settings and enter its password. Nothing was synced.` |
| The password is not the folder's | `The encryption password is not the one this remote folder was set up with. Nothing was synced.` |
| A password is set, and the folder holds files but no key file | `The remote folder already holds files that are not encrypted. Encryption can only be started on an empty remote folder: choose a new one, or empty this one first. Nothing was synced.` |
| The key file is damaged, or was written by a newer version of Noteriv | `The encryption key file on the server could not be used.` Then the reason, then `Nothing was synced.` |
| The file named `noteriv-encryption.key` is larger than 64 KiB or is not text | `The encryption key file on the server is not one this app wrote, so nothing was synced.` |
| The key file appeared or disappeared on the server during the check | `The encryption key file on the server changed while it was being read. Nothing was synced; try again.` |
| The key could not be made on the first encrypted sync | `Encryption could not be set up.` Then the reason |

The reason given for a key file that cannot be used is one of:

- `This was encrypted by a newer version of Noteriv. Update Noteriv to read it.`
- `The encryption key file is damaged, or its settings are outside what Noteriv accepts.`
- `Could not prepare the encryption key. The computer may be low on memory.`

The third message in the table also appears when the key file has been deleted from an encrypted folder. Noteriv then finds files and no key file, and cannot tell that the files are encrypted.

### Files That Are Refused

In an encrypted folder, Noteriv only takes a file from the server if its key opens it. A file that is not encrypted, was encrypted with a different password, or is damaged is not written into the vault. It is left on the server as it is, and the rest of the sync carries on. The sync indicator then reads `sync failed`, and its tooltip says how many files could not be synced, with the name of the first one and the reason:

```text
1 file could not be synced. Planted.md: The copy on the server is not encrypted, so it was left alone.
```

| The file on the server | Reason shown after its name |
|---|---|
| Is not encrypted | `The copy on the server is not encrypted, so it was left alone.` |
| Was encrypted with a different password, or is damaged | `The copy on the server could not be decrypted. This file could not be decrypted. It was encrypted with a different password, or it is damaged.` |
| Is cut short | `The copy on the server could not be decrypted. This encrypted file is damaged or incomplete.` |
| Was encrypted by a newer version of Noteriv | `The copy on the server could not be decrypted. This was encrypted by a newer version of Noteriv. Update Noteriv to read it.` |

A refused file is tried again on every sync, so the message comes back until you delete or replace the file on the server.

The reverse is refused as well. If no password is set and the folder has no key file, a file on the server that Noteriv encrypted is not written into the vault. This is the case when the key file of an encrypted folder has gone missing. A note that only happens to begin with the same letters as an encrypted file is an ordinary note and syncs as usual.

```text
1 file could not be synced. Note.md: The copy on the server is encrypted, and this vault is not set up to read it, so it was left alone.
```

### Other Apps

- The mobile app does not sync over WebDAV, so it cannot use an encrypted folder.
- Anything else that reads the remote folder, such as the server's own web interface, shows the file names but cannot show the contents.

## Server-Specific Setup

### Nextcloud

1. Log into your Nextcloud web interface.
2. Go to Settings > Security > Devices & sessions.
3. Create a new app password for Noteriv.
4. In Noteriv, set the server URL to:
   ```
   https://your-nextcloud-server/remote.php/dav/files/YOUR_USERNAME/
   ```
5. Enter your Nextcloud username and the app password.
6. Set the remote path to `/Noteriv` (or any folder name you prefer).
7. Click Test Connection to verify.

### ownCloud

The setup is identical to Nextcloud. The WebDAV URL for ownCloud is typically:
```
https://your-owncloud-server/remote.php/dav/files/YOUR_USERNAME/
```

### Generic WebDAV Server

If you are running your own WebDAV server (Apache mod_dav, Nginx, etc.):

1. Set the server URL to the WebDAV root (e.g., `https://your-server.com/webdav/`).
2. Enter the username and password configured on the server.
3. Set the remote path to the directory where you want vault files stored.
4. Ensure the server supports the `PROPFIND`, `GET`, `PUT`, `MKCOL`, and `DELETE` WebDAV methods.

### Synology NAS

1. Enable WebDAV Server in Synology Package Center.
2. Set the server URL to:
   ```
   https://your-synology-ip:5006/
   ```
   (Port 5006 is the default HTTPS WebDAV port on Synology.)
3. Use your Synology DSM username and password.
4. Set the remote path to your desired shared folder, e.g., `/Noteriv`.

## Security

### HTTPS

Always use HTTPS URLs for your WebDAV server. HTTP transmits credentials and file content in plain text, making them visible to anyone on the network path.

### App Passwords

For Nextcloud and ownCloud, use app-specific passwords rather than your main account password. App passwords can be revoked individually without affecting your main login, and they do not bypass two-factor authentication.

### Credential Storage

The WebDAV username and password, and the encryption password if you have set one, are stored in Noteriv's settings file on this device (`settings.json` in the data folder listed above), as plain text. Anyone who can read that file can read them. They are not stored in the vault, so they are not synced or committed by Git. If you are concerned about local credential security, ensure your disk is encrypted.

## Combining with Other Providers

WebDAV sync can be used alongside Git sync:

1. **Git sync** for version history and GitHub-based collaboration.
2. **WebDAV sync** for backup to a self-hosted server.

On each sync Git runs first, then WebDAV.

## Bandwidth and Performance

WebDAV sync transfers a whole file whenever it changes (no delta sync), and each sync lists the remote folder, one request per folder. For text-heavy vaults (Markdown files averaging a few KB), bandwidth usage is minimal. For vaults with large images or PDFs, bandwidth usage scales with the size and frequency of changes to those files.

To optimize:

- Use a longer sync interval on slow or metered connections.
- Leave out what you do not need on other devices: turn off a kind of file, or leave a folder out, as described in [What Syncs](./what-syncs.md).
- Use a local Nextcloud/ownCloud server on your LAN for maximum throughput.

## Upgrading from 2.4.11 or Earlier

WebDAV sync was rewritten after 2.4.11. Earlier versions re-sent files on every sync, never downloaded anything inside a folder, did not sync attachments, and brought deleted notes back.

The first sync after updating has no record yet, so it compares every file that exists on both sides, downloading each once. Files that are identical are simply noted. Files that differ are treated as a conflict and both versions are kept. Nothing is deleted on this first sync.

Earlier versions could also leave stray files on the server, which the new version does not remove:

- A note with `#` or `?` in its name was uploaded under a cut-off name without an extension, such as `C` for `C# basics.md`.
- A remote path containing a space could create a copy of the folder inside itself.

Both are safe to delete on the server by hand. They are not downloaded.

Update Noteriv on every device that syncs with the same server. A device still on 2.4.11 or earlier uploads any file missing from the server again, so a note deleted on an updated device comes back until every device is updated.

## Limitations

- Conflicts are resolved by keeping both versions. Nothing is merged.
- No delta sync: a changed file is transferred whole.
- File types that [What Syncs](./what-syncs.md) does not list are never synced, and neither are empty folders.
- A rename or move is synced as a deletion and a new file.
- Encryption covers the contents of files only. File and folder names and file sizes stay readable on the server, and a forgotten encryption password cannot be recovered. See [Encryption](#encryption).
- WebDAV sync is desktop-only. The mobile app does not support WebDAV.
- Some WebDAV servers have file size limits. Check your server configuration for `upload_max_filesize` or equivalent settings.
- WebDAV sync does not use server-side versioning. Even if your WebDAV server (like Nextcloud) has file versioning, Noteriv does not interact with it. Use Git sync for version history.
