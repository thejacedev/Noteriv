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

WebDAV sync carries these file types, in every folder of the vault:

- Notes and text: `.md`, `.markdown`, `.txt`
- Vault files: `.canvas`, `.drawing`, `.json`, `.csv`, `.css`, `.yaml`, `.yml`
- Images and documents: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.avif`, `.pdf`

Other file types, such as audio and video, stay on the device. The folders `.git`, `.noteriv`, `.obsidian`, `.trash` and `node_modules` are never synced.

## Testing the Connection

Before the first sync, click "Test Connection" in the WebDAV settings. This checks that:

1. The URL is reachable.
2. The username and password are accepted.
3. The remote path exists. If it does not, Noteriv creates it.

If the test fails, the message says whether the server could not be reached, rejected the username or password, or refused the folder.

## Conflicts

If the same file was changed on this device and on the server since the last sync, Noteriv keeps both versions. The newer one stays under the note's name. The other is saved next to it as a conflict copy:

```
Meeting notes.md
Meeting notes (conflict 2026-11-12 14-30-05).md
```

The conflict copy is an ordinary note. It syncs to your other devices, and you can merge the two by hand and delete the one you no longer need. Nothing is merged automatically; for line-by-line merging and version history, use Git sync.

When a sync on this device keeps both versions, Noteriv shows a notice above the status bar that lists the notes, with a button to open each conflict copy. The notice stays until you dismiss it, so you see it even if the sync ran on the timer while you were away. Versions up to 2.4.13 show no notice.

The notice only covers conflicts this device resolved, and it is not kept if you quit Noteriv before dismissing it. On your other devices the conflict copy arrives as an ordinary new file with no notice.

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

The WebDAV username and password are stored in Noteriv's settings file on this device (`settings.json` in the data folder listed above), as plain text. They are not stored in the vault, so they are not synced or committed by Git. If you are concerned about local credential security, ensure your disk is encrypted.

## Combining with Other Providers

WebDAV sync can be used alongside Git sync:

1. **Git sync** for version history and GitHub-based collaboration.
2. **WebDAV sync** for backup to a self-hosted server.

On each sync Git runs first, then WebDAV.

## Bandwidth and Performance

WebDAV sync transfers a whole file whenever it changes (no delta sync), and each sync lists the remote folder, one request per folder. For text-heavy vaults (Markdown files averaging a few KB), bandwidth usage is minimal. For vaults with large images or PDFs, bandwidth usage scales with the size and frequency of changes to those files.

To optimize:

- Use a longer sync interval on slow or metered connections.
- Keep large files you do not need on other devices outside the vault.
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
- File types outside the list above are not synced, and neither are empty folders.
- A rename or move is synced as a deletion and a new file.
- WebDAV sync is desktop-only. The mobile app does not support WebDAV.
- Some WebDAV servers have file size limits. Check your server configuration for `upload_max_filesize` or equivalent settings.
- WebDAV sync does not use server-side versioning. Even if your WebDAV server (like Nextcloud) has file versioning, Noteriv does not interact with it. Use Git sync for version history.
