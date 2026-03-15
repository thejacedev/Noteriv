const fs = require("fs");
const path = require("path");
const { walkFiles, ensureParentDir, SYNC_EXTS } = require("./helpers");

async function sync(vaultPath, config) {
  const { createClient } = require("webdav");
  const { url, username, password, remotePath } = config;

  const client = createClient(url, { username, password });
  const basePath = remotePath || "/";

  // Ensure remote directory exists
  try {
    const exists = await client.exists(basePath);
    if (!exists) await client.createDirectory(basePath, { recursive: true });
  } catch {}

  const localFiles = walkFiles(vaultPath);
  let pushed = 0;
  let pulled = 0;

  // Get remote file listing
  const remoteEntries = new Map();
  async function listRemote(dir) {
    try {
      const items = await client.getDirectoryContents(dir);
      for (const item of items) {
        if (item.type === "directory") {
          await listRemote(item.filename);
        } else {
          const rel = path.posix.relative(basePath, item.filename);
          if (SYNC_EXTS.has(path.extname(rel).toLowerCase())) {
            remoteEntries.set(rel, {
              rel,
              filename: item.filename,
              mtime: new Date(item.lastmod).getTime(),
            });
          }
        }
      }
    } catch {}
  }
  await listRemote(basePath);

  const localMap = new Map(localFiles.map((f) => [f.rel, f]));

  // Push: local → WebDAV
  for (const [rel, local] of localMap) {
    const remote = remoteEntries.get(rel);
    if (!remote || local.mtime > remote.mtime) {
      const remoteDest = path.posix.join(basePath, rel);
      const parentDir = path.posix.dirname(remoteDest);
      try {
        const exists = await client.exists(parentDir);
        if (!exists) await client.createDirectory(parentDir, { recursive: true });
      } catch {}
      const content = fs.readFileSync(local.full);
      await client.putFileContents(remoteDest, content, { overwrite: true });
      pushed++;
    }
  }

  // Pull: WebDAV → local
  for (const [rel, remote] of remoteEntries) {
    const local = localMap.get(rel);
    if (!local || remote.mtime > local.mtime) {
      const dest = path.join(vaultPath, rel);
      ensureParentDir(dest);
      const content = await client.getFileContents(remote.filename);
      fs.writeFileSync(dest, Buffer.from(content));
      pulled++;
    }
  }

  return { pushed, pulled };
}

async function testConnection(config) {
  try {
    const { createClient } = require("webdav");
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    await client.exists(config.remotePath || "/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sync, testConnection };
