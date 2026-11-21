import { File, Directory, Paths } from 'expo-file-system';
import { FileEntry, SearchResult } from '@/types';

const VAULTS_DIR_NAME = 'vaults';

function getVaultsDir(): Directory {
  return new Directory(Paths.document, VAULTS_DIR_NAME);
}

export function ensureVaultsDir(): void {
  const dir = getVaultsDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

export function getVaultPath(vaultName: string): string {
  const dir = new Directory(getVaultsDir(), vaultName);
  return dir.uri;
}

export async function readFile(filePath: string): Promise<string | null> {
  try {
    const file = new File(filePath);
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export function writeFile(filePath: string, content: string): boolean {
  try {
    const file = new File(filePath);
    // Ensure parent directory exists
    const parentDir = file.parentDirectory;
    if (!parentDir.exists) {
      parentDir.create({ intermediates: true });
    }
    file.writeSync(content);
    return true;
  } catch {
    return false;
  }
}

export function createFile(filePath: string): boolean {
  return writeFile(filePath, '');
}

export function deleteFile(filePath: string): boolean {
  try {
    const file = new File(filePath);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

export function deleteDir(dirPath: string): boolean {
  try {
    const dir = new Directory(dirPath);
    if (!dir.exists) return true;
    // Recursively delete contents first
    const items = dir.list();
    for (const item of items) {
      if (item instanceof Directory) {
        deleteDir(item.uri);
      } else {
        try { (item as File).delete(); } catch {}
      }
    }
    // Now delete the empty directory
    dir.delete();
    return true;
  } catch {
    return false;
  }
}

export function rename(oldPath: string, newName: string): boolean {
  try {
    const pathInfo = Paths.info(oldPath);
    if (pathInfo.isDirectory) {
      const dir = new Directory(oldPath);
      dir.rename(newName);
    } else {
      const file = new File(oldPath);
      file.rename(newName);
    }
    return true;
  } catch {
    return false;
  }
}

export function movePath(oldPath: string, newPath: string): boolean {
  try {
    const pathInfo = Paths.info(oldPath);
    if (pathInfo.isDirectory) {
      const dir = new Directory(oldPath);
      dir.moveSync(new Directory(newPath));
    } else {
      const file = new File(oldPath);
      file.moveSync(new File(newPath));
    }
    return true;
  } catch {
    return false;
  }
}

export function createDir(dirPath: string): boolean {
  try {
    const dir = new Directory(dirPath);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
    return true;
  } catch {
    return false;
  }
}

export function readDir(dirPath: string): FileEntry[] {
  try {
    const dir = new Directory(dirPath);
    if (!dir.exists) return [];
    const items = dir.list();
    const entries: FileEntry[] = [];

    for (const item of items) {
      const name = item instanceof Directory
        ? item.uri.split('/').filter(Boolean).pop() ?? ''
        : (item as File).name;
      if (name.startsWith('.')) continue;
      const isDirectory = item instanceof Directory;
      entries.push({
        name,
        path: item.uri,
        isDirectory,
      });
    }

    return entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function listAllMarkdownFiles(
  dir: string
): Promise<{ filePath: string; fileName: string; relativePath: string }[]> {
  const files: { filePath: string; fileName: string; relativePath: string }[] = [];

  function walk(currentDir: string) {
    const entries = readDir(currentDir);
    for (const entry of entries) {
      if (entry.isDirectory) {
        walk(entry.path);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
        files.push({
          filePath: entry.path,
          fileName: entry.name.replace(/\.(md|markdown)$/i, ''),
          relativePath: entry.path.replace(dir, ''),
        });
      }
    }
  }

  walk(dir);
  return files;
}

export async function searchInFiles(dir: string, query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  if (!query || !dir) return results;

  const lowerQuery = query.toLowerCase();
  const allFiles = await listAllMarkdownFiles(dir);

  for (const file of allFiles) {
    if (results.length >= 200) break;
    const content = await readFile(file.filePath);
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        results.push({
          filePath: file.filePath,
          fileName: file.fileName,
          line: i + 1,
          text: lines[i].trim(),
        });
        if (results.length >= 200) break;
      }
    }
  }

  return results;
}

// ============================================================
// What WebDAV sync needs. Unlike the helpers above, these never hide a
// failure: sync has to know when a folder could not be read or a file could
// not be written, or a note that is merely unreadable would look deleted.
// ============================================================

export interface DirItem {
  /** The item's own name, decoded. */
  name: string;
  uri: string;
  isDirectory: boolean;
}

/**
 * Everything in a folder, hidden names included. Throws when the system says
 * the folder cannot be read. Android does not always say so: a folder it
 * fails to read can come back empty. Sync therefore never takes a vault
 * that lists as entirely empty for one whose notes were deleted.
 */
export function listDir(dirUri: string): DirItem[] {
  return new Directory(dirUri).list().map((item) => {
    const last = item.uri.replace(/\/+$/, '').split('/').pop() ?? '';
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch {}
    return { name, uri: item.uri, isDirectory: item instanceof Directory };
  });
}

export function dirExists(dirUri: string): boolean {
  try {
    return new Directory(dirUri).exists;
  } catch {
    return false;
  }
}

/** A file's modification time and size, or null when there is no file there. */
export function statFile(fileUri: string): { mtimeMs: number; size: number } | null {
  const info = new File(fileUri).info();
  if (!info.exists) return null;
  return { mtimeMs: Math.round(info.modificationTime ?? 0), size: info.size ?? 0 };
}

export async function readBytes(fileUri: string): Promise<Uint8Array> {
  return new File(fileUri).bytes();
}

/** Write a file, creating the folders above it. Throws when it cannot be written. */
export function writeBytes(fileUri: string, bytes: Uint8Array): void {
  const file = new File(fileUri);
  const parent = file.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
  file.writeSync(bytes);
}

/** Put one file in the place of another, in one step. Throws when it cannot. */
export function replaceFile(fromUri: string, toUri: string): void {
  new File(fromUri).moveSync(new File(toUri), { overwrite: true });
}

/** A fingerprint of a file's content (SHA-256, as hex). */
export async function fileDigest(fileUri: string): Promise<string> {
  return (await new File(fileUri).digest('SHA-256')).toLowerCase();
}

/** Where the app keeps its record of a vault's last WebDAV sync: outside every vault, so it is never synced itself. */
export function syncRecordUri(vaultId: string): string {
  return new File(Paths.document, 'sync-records', `webdav-${vaultId}.json`).uri;
}

export function fileExists(path: string): boolean {
  try {
    const info = Paths.info(path);
    return info.exists;
  } catch {
    return false;
  }
}

export function trashFile(filePath: string, vaultPath: string): boolean {
  try {
    const trashDir = new Directory(vaultPath.replace(/\/$/, ''), '.trash');
    if (!trashDir.exists) trashDir.create({ intermediates: true });
    const file = new File(filePath);
    if (!file.exists) return false;
    // Avoid name collisions by prefixing timestamp
    const base = vaultPath.replace(/\/$/, '') + '/.trash/';
    const destName = Date.now() + '_' + file.name;
    file.moveSync(new File(base + destName));
    return true;
  } catch {
    return false;
  }
}

export function restoreFromTrash(trashedPath: string, vaultPath: string): boolean {
  try {
    const file = new File(trashedPath);
    if (!file.exists) return false;
    // Strip timestamp prefix (e.g. 1234567890_note.md -> note.md)
    const originalName = file.name.replace(/^\d+_/, '');
    file.moveSync(new File(vaultPath.replace(/\/$/, '') + '/' + originalName));
    return true;
  } catch {
    return false;
  }
}

export function listTrash(vaultPath: string): FileEntry[] {
  try {
    const trashDir = new Directory(vaultPath.replace(/\/$/, ''), '.trash');
    if (!trashDir.exists) return [];
    const items = trashDir.list();
    return items
      .filter((item) => item instanceof File)
      .map((item) => {
        const f = item as File;
        return { name: f.name.replace(/^\d+_/, ''), path: f.uri, isDirectory: false };
      })
      .sort((a, b) => b.path.localeCompare(a.path)); // newest first
  } catch {
    return [];
  }
}
