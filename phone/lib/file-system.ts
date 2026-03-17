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
    file.write(content);
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
    if (dir.exists) dir.delete();
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
      dir.move(new Directory(newPath));
    } else {
      const file = new File(oldPath);
      file.move(new File(newPath));
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
    file.move(new File(base + destName));
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
    file.move(new File(vaultPath.replace(/\/$/, '') + '/' + originalName));
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
