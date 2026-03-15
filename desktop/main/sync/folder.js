const fs = require("fs");
const path = require("path");
const { walkFiles, ensureParentDir } = require("./helpers");

async function sync(vaultPath, config) {
  const { targetPath, direction } = config;
  if (!targetPath || !fs.existsSync(vaultPath)) {
    throw new Error("Invalid vault or target path");
  }

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  const localFiles = walkFiles(vaultPath);
  const remoteFiles = walkFiles(targetPath);

  const localMap = new Map(localFiles.map((f) => [f.rel, f]));
  const remoteMap = new Map(remoteFiles.map((f) => [f.rel, f]));

  let pushed = 0;
  let pulled = 0;

  // Push: local → target
  if (direction === "push" || direction === "both") {
    for (const [rel, local] of localMap) {
      const remote = remoteMap.get(rel);
      if (!remote || local.mtime > remote.mtime) {
        const dest = path.join(targetPath, rel);
        ensureParentDir(dest);
        fs.copyFileSync(local.full, dest);
        pushed++;
      }
    }
  }

  // Pull: target → local
  if (direction === "pull" || direction === "both") {
    for (const [rel, remote] of remoteMap) {
      const local = localMap.get(rel);
      if (!local || remote.mtime > local.mtime) {
        const dest = path.join(vaultPath, rel);
        ensureParentDir(dest);
        fs.copyFileSync(remote.full, dest);
        pulled++;
      }
    }
  }

  return { pushed, pulled };
}

async function testConnection(config) {
  try {
    if (!config.targetPath) return { ok: false, error: "No target path" };
    if (!fs.existsSync(config.targetPath)) {
      fs.mkdirSync(config.targetPath, { recursive: true });
    }
    const testFile = path.join(config.targetPath, ".noteriv-test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sync, testConnection };
