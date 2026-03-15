import { File, Directory } from 'expo-file-system';
import { readFile, writeFile, createDir, readDir } from '@/lib/file-system';

export interface SnapshotInfo {
  id: string;
  filePath: string;
  snapshotPath: string;
  timestamp: number;
  displayDate: string;
}

const SNAPSHOTS_DIR = '.noteriv/snapshots';
const MAX_SNAPSHOTS_PER_FILE = 50;

/**
 * Save a snapshot of a file's content before writing changes.
 * Call this before every save operation.
 */
export function saveSnapshot(
  vaultPath: string,
  filePath: string,
  content: string
): void {
  const snapshotsDir = getSnapshotsDir(vaultPath);
  createDir(snapshotsDir);

  const timestamp = Date.now();
  const sanitized = sanitizeForSnapshot(filePath, vaultPath);
  const snapshotName = `${timestamp}_${sanitized}.md`;
  const snapshotPath = joinPath(snapshotsDir, snapshotName);

  writeFile(snapshotPath, content);
}

/**
 * Get all snapshots for a given file, sorted newest first.
 */
export function getSnapshots(
  vaultPath: string,
  filePath: string
): SnapshotInfo[] {
  const snapshotsDir = getSnapshotsDir(vaultPath);
  const dir = new Directory(snapshotsDir);
  if (!dir.exists) return [];

  const sanitized = sanitizeForSnapshot(filePath, vaultPath);
  const entries = readDir(snapshotsDir);
  const snapshots: SnapshotInfo[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.endsWith('.md')) continue;

    // Match pattern: {timestamp}_{sanitized-filename}.md
    const match = entry.name.match(/^(\d+)_(.+)\.md$/);
    if (!match) continue;

    const [, tsStr, name] = match;
    if (name !== sanitized) continue;

    const timestamp = parseInt(tsStr, 10);
    snapshots.push({
      id: tsStr,
      filePath,
      snapshotPath: entry.path,
      timestamp,
      displayDate: formatSnapshotDate(timestamp),
    });
  }

  return snapshots.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Load the content of a snapshot file.
 */
export async function loadSnapshot(
  snapshotPath: string
): Promise<string | null> {
  return readFile(snapshotPath);
}

/**
 * Delete a specific snapshot file.
 */
export function deleteSnapshot(snapshotPath: string): void {
  const file = new File(snapshotPath);
  if (file.exists) {
    file.delete();
  }
}

/**
 * Clean old snapshots for a file, keeping only the most recent MAX_SNAPSHOTS_PER_FILE.
 */
export function cleanOldSnapshots(
  vaultPath: string,
  filePath: string
): void {
  const snapshots = getSnapshots(vaultPath, filePath);

  if (snapshots.length <= MAX_SNAPSHOTS_PER_FILE) return;

  const toDelete = snapshots.slice(MAX_SNAPSHOTS_PER_FILE);
  for (const snapshot of toDelete) {
    deleteSnapshot(snapshot.snapshotPath);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSnapshotsDir(vaultPath: string): string {
  return joinPath(vaultPath, SNAPSHOTS_DIR);
}

function joinPath(base: string, segment: string): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanSegment = segment.startsWith('/') ? segment.slice(1) : segment;
  return `${cleanBase}/${cleanSegment}`;
}

/**
 * Create a filesystem-safe identifier from a file path, relative to the vault.
 */
function sanitizeForSnapshot(filePath: string, vaultPath: string): string {
  let relative = filePath;
  if (filePath.startsWith(vaultPath)) {
    relative = filePath.slice(vaultPath.length);
  }
  // Remove leading slash
  if (relative.startsWith('/')) {
    relative = relative.slice(1);
  }
  // Remove .md extension
  relative = relative.replace(/\.md$/, '');
  // Replace path separators and unsafe characters with underscores
  return relative.replace(/[/\\:*?"<>|]/g, '_');
}

function formatSnapshotDate(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${min}:${sec}`;
}
