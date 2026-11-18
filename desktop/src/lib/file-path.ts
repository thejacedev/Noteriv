/**
 * Full paths of files and folders, as the system hands them over.
 *
 * On Windows they arrive with backslashes (`C:\Notes\Plan.md`), and a path
 * the app builds itself may mix both (`C:\Notes/Plan.md`). Everything that
 * takes a full path apart or puts one together goes through here, so that
 * the name of a note is its name on every system.
 *
 * A backslash only counts as a separator in a path that is written the
 * Windows way. On Linux and macOS it is an ordinary character in a file
 * name, and those paths are read exactly as they were before.
 *
 * Paths inside the vault (`Projects/Plan.md`) always use forward slashes
 * and are not for this file: see `link-resolve.ts` and `vault-paths.ts`.
 */

const NOTE_EXT = /\.(md|markdown)$/i;

/** Whether a path is written the Windows way: `C:\Notes`, `C:/Notes`, `C:` or `\\server\share`. */
export function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:([\\/]|$)/.test(path) || path.startsWith("\\\\");
}

/** Where the last separator of a path is, or -1. */
function lastSeparator(path: string): number {
  const slash = path.lastIndexOf("/");
  return isWindowsPath(path) ? Math.max(slash, path.lastIndexOf("\\")) : slash;
}

/** The last part of a path: `Plan.md` for `C:\Notes\Plan.md` and for `/home/me/Plan.md`. */
export function fileNameOf(path: string): string {
  return path.slice(lastSeparator(path) + 1);
}

/** The name a note is shown under: its file name without `.md` or `.markdown`. */
export function noteTitleOf(path: string): string {
  return fileNameOf(path).replace(NOTE_EXT, "");
}

/**
 * The folder a file or folder is in, without a separator at the end.
 * "" when the path has no folder in it, and for a file at the very top
 * (`/Plan.md`).
 */
export function parentFolderOf(path: string): string {
  const cut = lastSeparator(path);
  return cut < 0 ? "" : path.slice(0, cut);
}

/** Every folder a path is inside, from the nearest one up to the top. */
export function ancestorFoldersOf(path: string): string[] {
  const folders: string[] = [];
  for (let folder = parentFolderOf(path); folder !== ""; folder = parentFolderOf(folder)) folders.push(folder);
  return folders;
}

/** The separator to put after a folder: its own, so the result reads like the paths the system lists. */
function separatorAfter(folder: string): string {
  if (!isWindowsPath(folder)) return "/";
  return folder.includes("\\") || !folder.includes("/") ? "\\" : "/";
}

/**
 * The full path of `name` inside `folder`. On Windows the two are joined
 * with a backslash, so the path is the same text the file list gives for
 * that file, and a tab opened from one is found again from the other.
 */
export function childPath(folder: string, name: string): string {
  const separator = separatorAfter(folder);
  const trimmed = folder.replace(isWindowsPath(folder) ? /[\\/]+$/ : /\/+$/, "");
  return `${trimmed}${separator}${name}`;
}

/** The path of a file with another name, in the same folder. */
export function siblingPath(path: string, name: string): string {
  return childPath(parentFolderOf(path), name);
}

/**
 * Whether `path` is somewhere inside `folder`. A neighbour whose name only
 * starts the same way (`Plans` beside `Plan`) is not inside it.
 */
export function isInsideFolder(path: string, folder: string): boolean {
  if (folder === "" || !path.startsWith(folder)) return false;
  const next = path[folder.length];
  return next === "/" || (next === "\\" && isWindowsPath(path));
}

/**
 * Where a path ends up when `oldPath` is renamed or moved to `newPath`:
 * the new path for the thing itself, the matching path for anything inside
 * it when it is a folder, and the path unchanged for everything else.
 */
export function pathAfterRename(path: string, oldPath: string, newPath: string): string {
  if (path === oldPath) return newPath;
  return isInsideFolder(path, oldPath) ? newPath + path.slice(oldPath.length) : path;
}
