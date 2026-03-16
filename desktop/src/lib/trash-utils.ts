/**
 * Trash / Soft Delete utilities
 * Moves files to .noteriv/trash/ instead of permanently deleting them.
 */

export interface TrashItem {
  id: string;           // unique ID (timestamp-based filename in trash dir)
  fileName: string;     // original file name
  originalPath: string; // full original path
  deletedAt: string;    // ISO date string
  contentFile: string;  // path to the content file in trash
  metaFile: string;     // path to the metadata JSON sidecar
}

/**
 * Move a file to .noteriv/trash/ with metadata sidecar.
 */
export async function trashFile(vaultPath: string, filePath: string): Promise<boolean> {
  if (!window.electronAPI) return false;

  const trashDir = `${vaultPath}/.noteriv/trash`;
  await window.electronAPI.createDir(trashDir);

  const fileName = filePath.split("/").pop() || "unknown";
  const id = `${Date.now()}-${fileName}`;
  const contentDest = `${trashDir}/${id}`;
  const metaDest = `${trashDir}/${id}.meta.json`;

  // Read original content
  const content = await window.electronAPI.readFile(filePath);
  if (content === null) return false;

  // Write content to trash
  const wrote = await window.electronAPI.writeFile(contentDest, content);
  if (!wrote) return false;

  // Write metadata sidecar
  const meta = {
    originalPath: filePath,
    deletedAt: new Date().toISOString(),
    fileName,
  };
  const wroteMeta = await window.electronAPI.writeFile(metaDest, JSON.stringify(meta, null, 2));
  if (!wroteMeta) return false;

  // Delete original file
  const deleted = await window.electronAPI.deleteFile(filePath);
  return deleted;
}

/**
 * List all trashed files with metadata.
 */
export async function listTrash(vaultPath: string): Promise<TrashItem[]> {
  if (!window.electronAPI) return [];

  const trashDir = `${vaultPath}/.noteriv/trash`;
  await window.electronAPI.createDir(trashDir);

  // readDir filters out dot files, but our trash files don't start with dot
  // We need to read the trash dir — but .noteriv starts with dot, so readDir
  // won't list it from the vault root. We call readDir directly on the trash path.
  let entries: { name: string; path: string; isDirectory: boolean }[];
  try {
    entries = await window.electronAPI.readDir(trashDir);
  } catch {
    return [];
  }

  const metaFiles = entries.filter((e) => e.name.endsWith(".meta.json"));
  const items: TrashItem[] = [];

  for (const metaEntry of metaFiles) {
    const metaContent = await window.electronAPI.readFile(metaEntry.path);
    if (!metaContent) continue;

    try {
      const meta = JSON.parse(metaContent);
      const id = metaEntry.name.replace(".meta.json", "");
      items.push({
        id,
        fileName: meta.fileName || id,
        originalPath: meta.originalPath || "",
        deletedAt: meta.deletedAt || "",
        contentFile: `${trashDir}/${id}`,
        metaFile: metaEntry.path,
      });
    } catch {
      continue;
    }
  }

  // Sort by deleted date, newest first
  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  return items;
}

/**
 * Restore a trashed file to its original location.
 */
export async function restoreFile(vaultPath: string, trashId: string): Promise<boolean> {
  if (!window.electronAPI) return false;

  const trashDir = `${vaultPath}/.noteriv/trash`;
  const metaPath = `${trashDir}/${trashId}.meta.json`;
  const contentPath = `${trashDir}/${trashId}`;

  const metaContent = await window.electronAPI.readFile(metaPath);
  if (!metaContent) return false;

  let meta: { originalPath: string };
  try {
    meta = JSON.parse(metaContent);
  } catch {
    return false;
  }

  const content = await window.electronAPI.readFile(contentPath);
  if (content === null) return false;

  // Ensure parent directory exists
  const parentDir = meta.originalPath.substring(0, meta.originalPath.lastIndexOf("/"));
  if (parentDir) {
    await window.electronAPI.createDir(parentDir);
  }

  // Write content back to original location
  const wrote = await window.electronAPI.writeFile(meta.originalPath, content);
  if (!wrote) return false;

  // Remove trash files
  await window.electronAPI.deleteFile(contentPath);
  await window.electronAPI.deleteFile(metaPath);

  return true;
}

/**
 * Permanently delete a file from trash.
 */
export async function permanentDelete(vaultPath: string, trashId: string): Promise<boolean> {
  if (!window.electronAPI) return false;

  const trashDir = `${vaultPath}/.noteriv/trash`;
  const contentPath = `${trashDir}/${trashId}`;
  const metaPath = `${trashDir}/${trashId}.meta.json`;

  await window.electronAPI.deleteFile(contentPath);
  await window.electronAPI.deleteFile(metaPath);

  return true;
}

/**
 * Empty the entire trash.
 */
export async function emptyTrash(vaultPath: string): Promise<boolean> {
  if (!window.electronAPI) return false;

  const items = await listTrash(vaultPath);
  for (const item of items) {
    await permanentDelete(vaultPath, item.id);
  }

  return true;
}

/**
 * Remove files older than N days from trash.
 */
export async function cleanupOldTrash(vaultPath: string, days: number = 30): Promise<number> {
  if (!window.electronAPI) return 0;

  const items = await listTrash(vaultPath);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const item of items) {
    const deletedTime = new Date(item.deletedAt).getTime();
    if (deletedTime < cutoff) {
      await permanentDelete(vaultPath, item.id);
      removed++;
    }
  }

  return removed;
}
