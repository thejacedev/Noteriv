/**
 * The vault's files, loaded for working out where a link leads and for
 * writing one. The rules themselves are in `link-resolve.ts` and
 * `link-format.ts`, which know nothing of the app; this is the part that
 * asks the backend for the files and reads the settings.
 */

import { formatLink } from "./link-format";
import { LinkIndex, isNotePath } from "./link-resolve";
import { linkPrefs } from "./vault-prefs";

/** A full path as a path inside the vault with "/", or null when it is not in the vault. */
export function vaultRelative(vaultPath: string, filePath: string): string | null {
  const root = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = filePath.replace(/\\/g, "/");
  return full.startsWith(`${root}/`) ? full.slice(root.length + 1) : null;
}

/**
 * The index for a vault, from the app's two listings: the notes, in the
 * order the app lists them (the first note in that order wins a shared
 * name), and every file.
 */
export function buildLinkIndex(notes: { relativePath: string }[], allFiles: string[]): LinkIndex {
  return new LinkIndex([
    ...notes.map((note) => note.relativePath.replace(/\\/g, "/")),
    ...allFiles.filter((file) => !isNotePath(file)),
  ]);
}

interface Loaded {
  vaultPath: string;
  index: LinkIndex;
  loadedAt: number;
}

let loaded: Loaded | null = null;
let loading: { vaultPath: string; request: Promise<LinkIndex> } | null = null;
const listeners = new Set<() => void>();

/** Hear when a load finds that the vault's files have changed. Returns the unsubscribe function. */
export function onLinkIndexChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameFiles(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((file, i) => file === b[i]);
}

/** The vault's files, read again unless they were read within `maxAgeMs`. */
export async function loadLinkIndex(vaultPath: string, maxAgeMs = 5000): Promise<LinkIndex> {
  if (loaded && loaded.vaultPath === vaultPath && Date.now() - loaded.loadedAt <= maxAgeMs) {
    return loaded.index;
  }
  if (loading && loading.vaultPath === vaultPath) return loading.request;

  const request = (async () => {
    const [notes, all] = await Promise.all([
      window.electronAPI.listAllFiles(vaultPath),
      window.electronAPI.listVaultFiles(vaultPath),
    ]);
    const fresh = buildLinkIndex(notes, all);
    const before = loaded && loaded.vaultPath === vaultPath ? loaded.index : null;
    // An unchanged vault keeps its index, and nobody is told.
    const index = before && sameFiles(before.files, fresh.files) ? before : fresh;
    loaded = { vaultPath, index, loadedAt: Date.now() };
    if (index !== before) listeners.forEach((listener) => listener());
    return index;
  })();
  loading = { vaultPath, request };
  try {
    return await request;
  } finally {
    if (loading?.request === request) loading = null;
  }
}

/**
 * What is loaded already, for code that draws and cannot wait. Null until
 * the first load is done. A load is started when there is nothing yet or it
 * is getting old, and `onLinkIndexChange` listeners hear if it brings
 * something new.
 */
export function peekLinkIndex(vaultPath: string, maxAgeMs = 10_000): LinkIndex | null {
  const have = loaded && loaded.vaultPath === vaultPath ? loaded : null;
  if (!have || Date.now() - have.loadedAt > maxAgeMs) {
    loadLinkIndex(vaultPath, 0).catch(() => {});
  }
  return have ? have.index : null;
}

/**
 * A link to the file `target` (a path inside the vault), written the way
 * "New link format" and "Use [[Wikilinks]]" say, for the note at `notePath`.
 * Without a note the link is written as if from the top of the vault.
 */
export function writeLink(
  index: LinkIndex,
  vaultPath: string,
  notePath: string | null | undefined,
  target: string,
  options: { alias?: string; fragment?: string; embed?: boolean } = {}
): string {
  const { format, wikilinks } = linkPrefs();
  const from = (notePath ? vaultRelative(vaultPath, notePath) : null) ?? "";
  return formatLink({ target, from, files: index, format, wikilinks, ...options });
}
