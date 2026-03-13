/**
 * File recovery system — local snapshots for recovering previous versions of notes.
 * Snapshots are stored in `.noteriv/snapshots/` within the vault directory.
 */

const SNAPSHOT_DIR = ".noteriv/snapshots";
const MAX_SNAPSHOTS_PER_FILE = 50;

/**
 * Sanitize a file path into a safe snapshot prefix.
 */
function snapshotPrefix(filePath: string, vaultPath: string): string {
  const relative = filePath.startsWith(vaultPath)
    ? filePath.slice(vaultPath.length + 1)
    : filePath;
  return relative
    .replace(/[/\\]/g, "__")
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_");
}

/**
 * Save a snapshot of the current content before saving.
 * Stores the content as a timestamped markdown file in the snapshots directory.
 * Enforces a maximum of MAX_SNAPSHOTS_PER_FILE snapshots per file.
 */
export async function saveSnapshot(
  vaultPath: string,
  filePath: string,
  content: string
): Promise<void> {
  if (!window.electronAPI) return;
  if (!content.trim()) return;

  const snapshotDir = `${vaultPath}/${SNAPSHOT_DIR}`;
  await window.electronAPI.createDir(snapshotDir);

  const prefix = snapshotPrefix(filePath, vaultPath);
  const timestamp = Date.now();
  const snapshotPath = `${snapshotDir}/${prefix}-${timestamp}.md`;

  await window.electronAPI.writeFile(snapshotPath, content);

  // Enforce max snapshots per file
  const snapshots = await getSnapshots(vaultPath, filePath);
  if (snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
    const toDelete = snapshots.slice(MAX_SNAPSHOTS_PER_FILE);
    for (const snap of toDelete) {
      await window.electronAPI.deleteFile(snap.path);
    }
  }
}

/**
 * List all snapshots for a given file, newest first.
 */
export async function getSnapshots(
  vaultPath: string,
  filePath: string
): Promise<{ timestamp: number; path: string; size: number }[]> {
  if (!window.electronAPI) return [];

  const snapshotDir = `${vaultPath}/${SNAPSHOT_DIR}`;
  const prefix = snapshotPrefix(filePath, vaultPath);

  let entries: { name: string; path: string; isDirectory: boolean }[];
  try {
    entries = await window.electronAPI.readDir(snapshotDir);
  } catch {
    return [];
  }

  const snapshots: { timestamp: number; path: string; size: number }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.startsWith(prefix + "-")) continue;
    if (!entry.name.endsWith(".md")) continue;

    // Extract timestamp from filename: prefix-{timestamp}.md
    const tsStr = entry.name.slice(prefix.length + 1, -3);
    const timestamp = parseInt(tsStr, 10);
    if (isNaN(timestamp)) continue;

    // Read file to get size
    const content = await window.electronAPI.readFile(entry.path);
    const size = content ? new Blob([content]).size : 0;

    snapshots.push({
      timestamp,
      path: entry.path,
      size,
    });
  }

  // Sort newest first
  snapshots.sort((a, b) => b.timestamp - a.timestamp);
  return snapshots;
}

/**
 * Load a snapshot's content by its path.
 */
export async function loadSnapshot(snapshotPath: string): Promise<string | null> {
  if (!window.electronAPI) return null;
  return window.electronAPI.readFile(snapshotPath);
}

/**
 * Delete snapshots older than maxAge days.
 * @param maxAge - Maximum age in days (default 30)
 */
export async function cleanOldSnapshots(
  vaultPath: string,
  maxAge: number = 30
): Promise<void> {
  if (!window.electronAPI) return;

  const snapshotDir = `${vaultPath}/${SNAPSHOT_DIR}`;
  let entries: { name: string; path: string; isDirectory: boolean }[];
  try {
    entries = await window.electronAPI.readDir(snapshotDir);
  } catch {
    return;
  }

  const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.endsWith(".md")) continue;

    // Extract timestamp from the end of the filename
    const match = entry.name.match(/-(\d+)\.md$/);
    if (!match) continue;

    const timestamp = parseInt(match[1], 10);
    if (isNaN(timestamp)) continue;

    if (timestamp < cutoff) {
      await window.electronAPI.deleteFile(entry.path);
    }
  }
}
