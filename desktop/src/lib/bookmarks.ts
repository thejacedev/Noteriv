/**
 * Bookmarks: notes, folders, searches and headings kept close at hand, and
 * the groups they are sorted into. Stored per vault in
 * `.noteriv/bookmarks.json`.
 */

import { fromVaultRelative, isAbsolutePath, toVaultRelative } from "./vault-paths";

export type BookmarkKind = "file" | "folder" | "search" | "heading";

export interface Bookmark {
  kind: BookmarkKind;
  /**
   * What it points at: a full path for a file or folder, the query for a
   * search, and `path#Heading text` for a heading.
   */
  target: string;
  /** The group it is filed under, or none for the top of the list. */
  group?: string;
}

export interface BookmarkStore {
  items: Bookmark[];
  /** Group names in the order they are shown. A group can be empty. */
  groups: string[];
}

export const EMPTY_BOOKMARKS: BookmarkStore = { items: [], groups: [] };

const KINDS: BookmarkKind[] = ["file", "folder", "search", "heading"];

/** Read a store from its file's text. Anything unreadable gives an empty store. */
/** Where a bookmark's path ends: a heading bookmark is `path#Heading text`. */
function splitTarget(bookmark: Bookmark): { path: string; rest: string } {
  if (bookmark.kind !== "heading") return { path: bookmark.target, rest: "" };
  const hash = bookmark.target.indexOf("#");
  return hash === -1
    ? { path: bookmark.target, rest: "" }
    : { path: bookmark.target.slice(0, hash), rest: bookmark.target.slice(hash) };
}

/**
 * Read the vault's bookmarks file. Paths in it are from the top of the
 * vault; `vaultPath` turns them into full paths. A full path, from a file
 * written before paths were stored that way, is kept as it is.
 */
export function parseBookmarks(text: string | null | undefined, vaultPath?: string): BookmarkStore {
  if (!text) return { items: [], groups: [] };
  try {
    const raw = JSON.parse(text);
    const groups: string[] = Array.isArray(raw?.groups)
      ? raw.groups.filter((g: unknown): g is string => typeof g === "string" && g.trim() !== "")
      : [];
    const items: Bookmark[] = [];
    for (const item of Array.isArray(raw?.items) ? raw.items : []) {
      if (!item || typeof item.target !== "string" || !KINDS.includes(item.kind)) continue;
      const bookmark: Bookmark = { kind: item.kind, target: item.target };
      if (vaultPath && bookmark.kind !== "search") {
        const { path, rest } = splitTarget(bookmark);
        if (!isAbsolutePath(path)) {
          const full = fromVaultRelative(path, vaultPath);
          // A path that points out of the vault is not a bookmark in it.
          if (!full) continue;
          bookmark.target = full + rest;
        }
      }
      if (typeof item.group === "string" && item.group) {
        bookmark.group = item.group;
        if (!groups.includes(item.group)) groups.push(item.group);
      }
      if (!items.some((b) => sameBookmark(b, bookmark))) items.push(bookmark);
    }
    return { items, groups: [...new Set(groups)] };
  } catch {
    return { items: [], groups: [] };
  }
}

/** The bookmarks file's text. With `vaultPath`, paths inside the vault are written from its top. */
export function serializeBookmarks(store: BookmarkStore, vaultPath?: string): string {
  if (!vaultPath) return JSON.stringify(store, null, 2);
  const items = store.items.map((bookmark) => {
    if (bookmark.kind === "search") return bookmark;
    const { path, rest } = splitTarget(bookmark);
    const relative = toVaultRelative(path, vaultPath);
    return relative === null ? bookmark : { ...bookmark, target: relative + rest };
  });
  return JSON.stringify({ items, groups: store.groups }, null, 2);
}

function sameBookmark(a: Bookmark, b: Bookmark): boolean {
  return a.kind === b.kind && a.target === b.target;
}

export function hasBookmark(store: BookmarkStore, kind: BookmarkKind, target: string): boolean {
  return store.items.some((b) => b.kind === kind && b.target === target);
}

/** Add a bookmark, or remove it if it is already there. */
export function toggleBookmarkItem(store: BookmarkStore, kind: BookmarkKind, target: string): BookmarkStore {
  if (!target) return store;
  return hasBookmark(store, kind, target)
    ? { ...store, items: store.items.filter((b) => !(b.kind === kind && b.target === target)) }
    : { ...store, items: [...store.items, { kind, target }] };
}

export function removeBookmark(store: BookmarkStore, bookmark: Bookmark): BookmarkStore {
  return { ...store, items: store.items.filter((b) => !sameBookmark(b, bookmark)) };
}

/** File a bookmark under a group, or back at the top with no group. */
export function moveBookmark(store: BookmarkStore, bookmark: Bookmark, group: string | null): BookmarkStore {
  const name = group?.trim() || null;
  return {
    groups: name && !store.groups.includes(name) ? [...store.groups, name] : store.groups,
    items: store.items.map((b) => {
      if (!sameBookmark(b, bookmark)) return b;
      const moved: Bookmark = { kind: b.kind, target: b.target };
      if (name) moved.group = name;
      return moved;
    }),
  };
}

export function addGroup(store: BookmarkStore, name: string): BookmarkStore {
  const group = name.trim();
  if (!group || store.groups.includes(group)) return store;
  return { ...store, groups: [...store.groups, group] };
}

/** Remove a group. Its bookmarks are kept and go back to the top of the list. */
export function removeGroup(store: BookmarkStore, name: string): BookmarkStore {
  return {
    groups: store.groups.filter((g) => g !== name),
    items: store.items.map((b) => (b.group === name ? { kind: b.kind, target: b.target } : b)),
  };
}

/** Keep bookmarks pointing at a file or folder that was renamed or moved. */
export function renameBookmarkPaths(store: BookmarkStore, oldPath: string, newPath: string): BookmarkStore {
  const moved = (path: string): string => {
    if (path === oldPath) return newPath;
    if (path.startsWith(oldPath + "/") || path.startsWith(oldPath + "\\")) return newPath + path.slice(oldPath.length);
    return path;
  };
  let changed = false;
  const items = store.items.map((b) => {
    if (b.kind === "search") return b;
    const hash = b.kind === "heading" ? b.target.indexOf("#") : -1;
    const path = hash >= 0 ? b.target.slice(0, hash) : b.target;
    const rest = hash >= 0 ? b.target.slice(hash) : "";
    const next = moved(path);
    if (next === path) return b;
    changed = true;
    return { ...b, target: next + rest };
  });
  return changed ? { ...store, items } : store;
}

/** The bookmarks left after a file or folder is deleted: the ones on it, or on anything inside it, go. */
export function removeBookmarkPaths(store: BookmarkStore, deletedPath: string): BookmarkStore {
  const gone = (path: string) =>
    path === deletedPath || path.startsWith(deletedPath + "/") || path.startsWith(deletedPath + "\\");
  const items = store.items.filter((b) => {
    if (b.kind === "search") return true;
    const hash = b.kind === "heading" ? b.target.indexOf("#") : -1;
    return !gone(hash >= 0 ? b.target.slice(0, hash) : b.target);
  });
  return items.length === store.items.length ? store : { ...store, items };
}

/** The bookmarks as the panel shows them: ungrouped first, then each group in order. */
export function groupedBookmarks(store: BookmarkStore): { group: string | null; items: Bookmark[] }[] {
  const sections: { group: string | null; items: Bookmark[] }[] = [
    { group: null, items: store.items.filter((b) => !b.group || !store.groups.includes(b.group)) },
  ];
  for (const group of store.groups) {
    sections.push({ group, items: store.items.filter((b) => b.group === group) });
  }
  return sections;
}

/** What a bookmark is called in the list, and the smaller line under it. */
export function bookmarkLabel(bookmark: Bookmark, vaultPath: string): { name: string; detail: string } {
  if (bookmark.kind === "search") return { name: bookmark.target, detail: "Search" };
  const hash = bookmark.kind === "heading" ? bookmark.target.indexOf("#") : -1;
  const path = hash >= 0 ? bookmark.target.slice(0, hash) : bookmark.target;
  const relative = path.startsWith(vaultPath) ? path.slice(vaultPath.length).replace(/^[\\/]/, "") : path;
  const fileName = (relative.replace(/\\/g, "/").split("/").pop() || relative).replace(/\.(md|markdown)$/i, "");
  if (bookmark.kind === "heading") {
    return { name: bookmark.target.slice(hash + 1), detail: fileName };
  }
  const folder = relative.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
  return { name: fileName, detail: bookmark.kind === "folder" ? "Folder" : folder };
}
