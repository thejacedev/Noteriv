/**
 * Every note's properties, tags and links, loaded in one call.
 *
 * The backend reads the notes (`vault_index.rs`) and returns the frontmatter
 * as written; the YAML is parsed here, so there is one place that decides
 * what a property's value is. The result is cached briefly, since several
 * panels ask for it at once.
 */

import { parse as parseYaml } from "yaml";

/** One note as the backend returns it. */
export interface RawNoteMeta {
  filePath: string;
  /** Path inside the vault, with "/" between folders. */
  relativePath: string;
  /** File name without its extension. */
  name: string;
  size: number;
  mtime: number;
  ctime: number;
  /** The YAML between the --- lines, or null. */
  frontmatter: string | null;
  /** #tags in the body, without the #. */
  tags: string[];
  /** The file part of each [[link]] and ![[embed]]. */
  links: string[];
  tasksOpen: number;
  tasksDone: number;
}

export interface NoteMeta extends RawNoteMeta {
  /** The frontmatter, parsed. Empty when there is none or it is not valid. */
  properties: Record<string, unknown>;
  /** Other names for the note, from `aliases` or `alias`. */
  aliases: string[];
  /** Tags from the frontmatter and the body together, each once. */
  allTags: string[];
}

/** Parse frontmatter YAML into properties. Anything that is not a mapping gives none. */
export function parseProperties(frontmatter: string | null | undefined): Record<string, unknown> {
  if (!frontmatter || !frontmatter.trim()) return {};
  try {
    const value = parseYaml(frontmatter);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // A note with broken frontmatter is still a note; it just has no properties.
  }
  return {};
}

/**
 * A property that holds a list of names, however it was written: a YAML
 * list, one string, or several separated by commas.
 */
export function toStringList(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : value === null || value === undefined
        ? []
        : [value];
  const out: string[] = [];
  for (const item of items) {
    if (item === null || item === undefined || typeof item === "object") continue;
    const text = String(item).trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** Tags from a `tags` property: a list, or one string split on commas and spaces, with any # removed. */
export function toTagList(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(/[\s,]+/) : toStringList(value);
  const out: string[] = [];
  for (const item of raw) {
    const tag = item.trim().replace(/^#/, "");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function buildNoteMeta(raw: RawNoteMeta): NoteMeta {
  const properties = parseProperties(raw.frontmatter);
  const aliases = toStringList(properties.aliases ?? properties.alias);
  const allTags = [...toTagList(properties.tags ?? properties.tag)];
  for (const tag of raw.tags) {
    if (!allTags.includes(tag)) allTags.push(tag);
  }
  return { ...raw, properties, aliases, allTags };
}

/**
 * The note that has `name` as an alias: the first in listing order, compared
 * without regard to case. A note's own name is not an alias.
 */
export function findNoteByAlias<T extends { aliases: string[] }>(notes: T[], name: string): T | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return notes.find((n) => n.aliases.some((a) => a.toLowerCase() === wanted)) ?? null;
}

const CACHE_TTL = 4000;
let cache: { vaultPath: string; loadedAt: number; notes: NoteMeta[] } | null = null;
let loading: { vaultPath: string; promise: Promise<NoteMeta[]> } | null = null;

/** The vault's index, from the cache when it is fresh. */
export function loadVaultIndex(vaultPath: string, options: { fresh?: boolean } = {}): Promise<NoteMeta[]> {
  if (!vaultPath || typeof window === "undefined" || !window.electronAPI?.vaultIndex) {
    return Promise.resolve([]);
  }
  if (!options.fresh && cache && cache.vaultPath === vaultPath && Date.now() - cache.loadedAt < CACHE_TTL) {
    return Promise.resolve(cache.notes);
  }
  if (loading && loading.vaultPath === vaultPath) return loading.promise;
  const promise = window.electronAPI
    .vaultIndex(vaultPath)
    .then((raw) => {
      const notes = raw.map(buildNoteMeta);
      cache = { vaultPath, loadedAt: Date.now(), notes };
      return notes;
    })
    .catch(() => [] as NoteMeta[])
    .finally(() => {
      if (loading?.promise === promise) loading = null;
    });
  loading = { vaultPath, promise };
  return promise;
}

/** Forget the cached index, after something in the vault changed. */
export function invalidateVaultIndex(): void {
  cache = null;
}
