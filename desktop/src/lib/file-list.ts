/**
 * How the file list is ordered, which files are left out of searches and
 * suggestions, and where a new note goes.
 */

export type FileSort =
  | "manual"
  | "nameAsc"
  | "nameDesc"
  | "modifiedNew"
  | "modifiedOld"
  | "createdNew"
  | "createdOld";

export const FILE_SORTS: { value: FileSort; label: string }[] = [
  { value: "manual", label: "My own order" },
  { value: "nameAsc", label: "File name (A to Z)" },
  { value: "nameDesc", label: "File name (Z to A)" },
  { value: "modifiedNew", label: "Modified (new to old)" },
  { value: "modifiedOld", label: "Modified (old to new)" },
  { value: "createdNew", label: "Created (new to old)" },
  { value: "createdOld", label: "Created (old to new)" },
];

export interface ListedEntry {
  name: string;
  isDirectory: boolean;
  /** Milliseconds; absent from older backends. */
  mtime?: number;
  ctime?: number;
}

/**
 * A comparison of names the way a person sorts them: capitals and accents
 * aside, numbers by value ("Note 2" before "Note 10"), in the system's
 * language. A system set to the "C" locale would sort by character code,
 * every capital before every small letter, so there English rules are used.
 */
export function nameComparer(locale?: string): (a: string, b: string) => number {
  const options = { numeric: true, sensitivity: "base" } as const;
  const own = new Intl.Collator(locale, options);
  const usable = !/posix/i.test(own.resolvedOptions().locale);
  return (usable ? own : new Intl.Collator("en", options)).compare;
}

export const compareNames = nameComparer();

/**
 * Order one folder's entries. Folders always come before files. "manual"
 * keeps the order the user dragged things into (`order` lists names), with
 * anything not in that list after it, by name.
 */
export function sortFileEntries<T extends ListedEntry>(entries: T[], sort: FileSort, order?: string[]): T[] {
  const byName = (a: T, b: T) => compareNames(a.name, b.name);
  const foldersFirst = (a: T, b: T) => Number(b.isDirectory) - Number(a.isDirectory);
  const sorted = [...entries];

  if (sort === "manual") {
    if (!order || order.length === 0) return entries;
    const position = new Map(order.map((name, i) => [name, i]));
    return sorted.sort((a, b) => {
      const ai = position.get(a.name);
      const bi = position.get(b.name);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  }

  const compare: Record<Exclude<FileSort, "manual">, (a: T, b: T) => number> = {
    nameAsc: byName,
    nameDesc: (a, b) => byName(b, a),
    modifiedNew: (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || byName(a, b),
    modifiedOld: (a, b) => (a.mtime ?? 0) - (b.mtime ?? 0) || byName(a, b),
    createdNew: (a, b) => (b.ctime ?? 0) - (a.ctime ?? 0) || byName(a, b),
    createdOld: (a, b) => (a.ctime ?? 0) - (b.ctime ?? 0) || byName(a, b),
  };
  return sorted.sort((a, b) => foldersFirst(a, b) || compare[sort](a, b));
}

/** The patterns in the "Excluded files" setting: one per line, blank lines and # comments ignored. */
export function parseExcludedPatterns(setting: string | null | undefined): string[] {
  return (setting ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/**
 * Whether a path inside the vault is excluded. A pattern is a folder or file
 * path from the top of the vault ("Archive", "Templates/Old.md"), or
 * "*.ext" for every file with that ending. The backend's search uses the
 * same rule (`search.rs`).
 */
export function isExcludedPath(relativePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const path = relativePath.replace(/\\/g, "/").toLowerCase();
  return patterns.some((raw) => {
    const pattern = raw.toLowerCase();
    if (pattern.startsWith("*")) return pattern.length > 1 && path.endsWith(pattern.slice(1));
    const folder = pattern.replace(/\/+$/, "");
    return path === folder || path.startsWith(folder + "/");
  });
}

export type NewNoteLocation = "root" | "current" | "folder";

/**
 * The folder a new note is created in: the top of the vault, the folder of
 * the note that is open, or a folder named in the settings.
 */
export function newNoteFolder(
  vaultPath: string,
  location: NewNoteLocation,
  folder: string,
  activeFile: string | null
): string {
  if (location === "current" && activeFile && activeFile.startsWith(vaultPath)) {
    const cut = Math.max(activeFile.lastIndexOf("/"), activeFile.lastIndexOf("\\"));
    if (cut >= vaultPath.length) return activeFile.slice(0, cut);
  }
  if (location === "folder") {
    const clean = folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    // A folder setting cannot point outside the vault.
    if (clean && !clean.split("/").includes("..")) return `${vaultPath}/${clean}`;
  }
  return vaultPath;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A note name made from the time, to the minute: 202611131045. */
export function timestampName(date: Date): string {
  return (
    pad(date.getFullYear(), 4) + pad(date.getMonth() + 1) + pad(date.getDate()) + pad(date.getHours()) + pad(date.getMinutes())
  );
}

/**
 * A timestamp name that is not taken: if a note already has this minute,
 * the next free minute is used, as Zettelkasten tools do.
 */
export function nextTimestampName(date: Date, taken: (name: string) => boolean): string {
  const candidate = new Date(date.getTime());
  for (let i = 0; i < 10000; i++) {
    const name = timestampName(candidate);
    if (!taken(name)) return name;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return `${timestampName(date)}-${date.getTime()}`;
}
