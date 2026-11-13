/**
 * Internal links for bases: reading [[wiki link]] text, and finding the file
 * a link points at among the rows the engine was given.
 */

import type { LinkValue, NoteRow } from "./values";

export interface ParsedLinkText {
  path: string;
  /** The heading or block part with its "#", or null. */
  subpath: string | null;
  display: string | null;
  embed: boolean;
}

const WIKI_LINK = /^!?\[\[([^\]]+)\]\]$/;
const URL_TEXT = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:)\S+$/i;

/** True when the whole text is one [[wiki link]] or ![[embed]]. */
export function isWikiLinkText(text: string): boolean {
  return WIKI_LINK.test(text.trim());
}

/** True when the whole text is one URL. */
export function isUrlText(text: string): boolean {
  return URL_TEXT.test(text.trim());
}

/**
 * Split link text into its parts. The brackets are optional, so this reads
 * "[[Note#Heading|shown]]" and "Note#Heading|shown" the same way.
 */
export function parseLinkText(text: string): ParsedLinkText {
  let inner = text.trim();
  const wiki = WIKI_LINK.exec(inner);
  const embed = wiki !== null && inner.startsWith("!");
  if (wiki) inner = wiki[1];

  let display: string | null = null;
  const pipe = inner.indexOf("|");
  if (pipe >= 0) {
    display = inner.slice(pipe + 1).trim() || null;
    inner = inner.slice(0, pipe);
  }

  let subpath: string | null = null;
  const hash = inner.indexOf("#");
  if (hash >= 0) {
    subpath = inner.slice(hash).trim() || null;
    inner = inner.slice(0, hash);
  }

  return { path: inner.trim(), subpath, display, embed };
}

export function linkFromText(text: string, display: LinkValue["display"] = null): LinkValue {
  const parsed = parseLinkText(text);
  return {
    kind: "link",
    path: parsed.path,
    subpath: parsed.subpath,
    display: display ?? parsed.display,
    embed: parsed.embed,
  };
}

/**
 * A link to a known file. A note is named without its ".md", the way a
 * wiki link to it would be written; the index finds it either way.
 */
export function linkToFile(row: NoteRow, display: LinkValue["display"] = null): LinkValue {
  const path = row.file.path.replace(/\.(md|markdown)$/i, "");
  return { kind: "link", path, subpath: null, display, embed: false };
}

/**
 * The form two link targets are compared in when neither names a known
 * file: no brackets, heading or alias, no ".md", and case ignored.
 */
export function linkKey(target: string): string {
  return parseLinkText(target)
    .path.replace(/^\/+/, "")
    .replace(/\.(md|markdown)$/i, "")
    .toLowerCase();
}

export interface OutgoingLinks {
  /** The files this file links to. */
  rows: Set<NoteRow>;
  /** Link keys of the links that point at no known file. */
  unresolved: Set<string>;
}

/** Finds the file a link points at, and the links between files. */
export interface LinkIndex {
  /** The file a link target names, or null. Brackets, headings and aliases are ignored. */
  resolve(target: string): NoteRow | null;
  outgoing(row: NoteRow): OutgoingLinks;
  /** The files that link to this one, in the order the rows were given. */
  backlinks(row: NoteRow): NoteRow[];
}

const isNote = (row: NoteRow) => /^(md|markdown)$/i.test(row.file.ext);

const depth = (row: NoteRow) => row.file.path.split("/").length;

/** Of two files a link could mean: the one in fewer folders, then the first by path. */
function nearer(a: NoteRow, b: NoteRow): NoteRow {
  if (depth(a) !== depth(b)) return depth(a) < depth(b) ? a : b;
  return a.file.path <= b.file.path ? a : b;
}

/**
 * Index the rows for link lookups. A link names a file by its full path, by
 * the end of its path ("Folder/Note"), or by its name alone; the ".md" is
 * optional and case is ignored. When several files fit, the one nearest the
 * vault root wins, so the answer does not depend on the order of the rows.
 */
export function buildLinkIndex(rows: NoteRow[]): LinkIndex {
  // Every way of naming each file, so a lookup never has to scan the vault.
  const byEnding = new Map<string, NoteRow>();
  const outgoingCache = new Map<NoteRow, OutgoingLinks>();
  let backlinkMap: Map<NoteRow, NoteRow[]> | null = null;

  const add = (ending: string, row: NoteRow) => {
    const held = byEnding.get(ending);
    byEnding.set(ending, held ? nearer(held, row) : row);
  };

  for (const row of rows) {
    const path = row.file.path.replace(/^\/+/, "").toLowerCase();
    // Only notes can be linked without their extension: [[photo]] is not photo.png.
    const bare = isNote(row) ? path.replace(/\.(md|markdown)$/, "") : null;
    // The path from each folder down: "a/b/note.md", "b/note.md", "note.md".
    let start = 0;
    while (start >= 0) {
      add(path.slice(start), row);
      if (bare !== null) add(bare.slice(start), row);
      const slash = path.indexOf("/", start);
      start = slash < 0 ? -1 : slash + 1;
    }
  }

  const resolve = (target: string): NoteRow | null => {
    // The extension stays on: "photo.png" needs it, and a note is indexed with and without.
    const key = parseLinkText(target).path.replace(/^\/+/, "").toLowerCase();
    return (key && byEnding.get(key)) || null;
  };

  const outgoing = (row: NoteRow): OutgoingLinks => {
    const cached = outgoingCache.get(row);
    if (cached) return cached;
    const result: OutgoingLinks = { rows: new Set(), unresolved: new Set() };
    for (const target of row.file.links ?? []) {
      const found = resolve(target);
      if (found) result.rows.add(found);
      else result.unresolved.add(linkKey(target));
    }
    outgoingCache.set(row, result);
    return result;
  };

  const backlinks = (row: NoteRow): NoteRow[] => {
    if (!backlinkMap) {
      backlinkMap = new Map();
      for (const source of rows) {
        for (const target of outgoing(source).rows) {
          const list = backlinkMap.get(target);
          if (list) list.push(source);
          else backlinkMap.set(target, [source]);
        }
      }
    }
    return backlinkMap.get(row) ?? [];
  };

  return { resolve, outgoing, backlinks };
}
