---
title: WebDAV Sync
order: 4
---

# WebDAV Sync

WebDAV sync connects your Noteriv vault to any server that supports the WebDAV protocol. This includes self-hosted solutions like Nextcloud and ownCloud, as well as any standards-compliant WebDAV server. Files are transferred over HTTP/HTTPS, making WebDAV sync a good choice for users who want full control over where their data is stored without relying on GitHub or a specific cloud provider.

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

The directory path on the WebDAV server where your vault files will be stored. Default: `/Noteriv`. This path is relative to the WebDAV root. If the directory does not exist, Noteriv creates it (with intermediate directories) on the first sync.

For example, if your WebDAV server root is `https://cloud.example.com/remote.php/dav/files/alice/` and the remote path is `/Noteriv`, files will be stored at `https://cloud.example.com/remote.php/dav/files/alice/Noteriv/`.

## How It Works

WebDAV sync operates similarly to folder sync, but files are transferred over HTTP instead of being copied on the local file system. The sync runs in two passes.

### Push Pass (Local to Server)

Noteriv walks the vault directory and collects all local files with their relative paths. For each file:

1. Check if the file exists on the server at the corresponding remote path.
2. Compare modification times. If the local file is newer (or does not exist on the server), upload it.
3. Before uploading, ensure the parent directory exists on the server. If not, create it recursively.
4. Upload the file content using the WebDAV `PUT` method with overwrite enabled.

### Pull Pass (Server to Local)

Noteriv lists the remote directory contents recursively. For each remote file:

1. Check if the file exists locally at the corresponding vault path.
2. Compare modification times. If the remote file is newer (or does not exist locally), download it.
3. Ensure the parent directory exists locally. If not, create it.
4. Download the file content and write it to the local path.

### File Type Filtering

WebDAV sync filters files by extension, only syncing files that match the set of recognized vault file types (`.md`, `.markdown`, `.canvas`, `.drawing`, `.json`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.pdf`, and others). This prevents syncing irrelevant files that may exist on the server.

## Testing the Connection

Before the first sync, click "Test Connection" in the WebDAV settings. This sends a request to the server to verify:

1. The URL is reachable.
2. The username and password are accepted.
3. The remote path is accessible (or can be created).

If the test fails, double-check your URL, credentials, and network connectivity.

## Conflict Resolution

WebDAV sync uses the same **last-modified-wins** strategy as folder sync. When a file has been modified both locally and on the server since the last sync, the version with the more recent modification timestamp overwrites the other.

This works well for single-user workflows but can lose data when multiple clients modify the same file between sync intervals. For workflows requiring merge-based conflict resolution, use git sync instead.

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

## Sync Interval

WebDAV sync runs on the same auto-sync timer as other providers (default: every 5 seconds). Since WebDAV operations involve network I/O, each cycle may take longer than folder sync depending on your connection speed and the number of changed files.

For metered or slow connections, consider increasing the sync interval to 30 seconds or more in Settings > Sync > Auto sync interval. This reduces bandwidth usage and prevents sync cycles from overlapping.

## Security

### HTTPS

Always use HTTPS URLs for your WebDAV server. HTTP transmits credentials and file content in plain text, making them visible to anyone on the network path.

### App Passwords

For Nextcloud and ownCloud, use app-specific passwords rather than your main account password. App passwords can be revoked individually without affecting your main login, and they do not bypass two-factor authentication.

### Credential Storage

WebDAV credentials (username and password) are stored in the vault's configuration file within the `.noteriv/` directory. This directory is excluded from git sync, so credentials are not committed to version control. However, they are stored as plain text in the JSON configuration file. If you are concerned about local credential security, ensure your disk is encrypted.

## Combining with Other Providers

WebDAV sync can be used alongside git sync:

1. **Git sync** for version history and GitHub-based collaboration.
2. **WebDAV sync** for backup to a self-hosted server.

Both providers run independently on each sync interval. Files are committed to git and uploaded to WebDAV in parallel.

## Bandwidth and Performance

WebDAV sync transfers full file contents on each modification (no delta/incremental sync). For text-heavy vaults (Markdown files averaging a few KB), bandwidth usage is minimal. For vaults with large images or PDFs, bandwidth usage scales with the size and frequency of changes to those files.

To optimize:

- Increase the sync interval for slow connections.
- Keep large binary files (videos, archives) outside the vault.
- Use a local Nextcloud/ownCloud server on your LAN for maximum throughput.

## Limitations

- No conflict resolution beyond last-modified-wins.
- No delta sync -- full files are transferred on every modification.
- Deletions are not propagated. Deleted local files are not removed from the server, and vice versa.
- WebDAV sync is desktop-only. The mobile app does not support WebDAV.
- Some WebDAV servers have file size limits. Check your server configuration for `upload_max_filesize` or equivalent settings.
- WebDAV sync does not support server-side versioning. Even if your WebDAV server (like Nextcloud) has file versioning, Noteriv does not interact with it. Use git sync for version history.
- Connection timeouts may occur on unreliable networks. The sync will retry on the next interval.
