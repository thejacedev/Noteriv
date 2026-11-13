/**
 * Builds the rows the engine works on, so the file's name, folder and
 * extension always agree with its path.
 */

import type { NoteRow } from "./values";

export interface NoteRowInput {
  /** Path relative to the vault. Either kind of slash is accepted. */
  path: string;
  /** The note's parsed frontmatter. */
  note?: Record<string, unknown>;
  size?: number;
  /** Created and modified times, in milliseconds. */
  ctime?: number;
  mtime?: number;
  tags?: string[];
  links?: string[];
  embeds?: string[];
}

/** Make a row from a vault path and what is known about the file. */
export function makeNoteRow(input: NoteRowInput): NoteRow {
  const path = input.path.replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  // A leading dot is part of the name, not the start of an extension: ".gitignore".
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0;

  return {
    file: {
      name,
      basename: hasExt ? name.slice(0, dot) : name,
      path,
      folder: slash >= 0 ? path.slice(0, slash) : "",
      ext: hasExt ? name.slice(dot + 1) : "",
      size: input.size ?? 0,
      ctime: input.ctime ?? 0,
      mtime: input.mtime ?? 0,
      tags: input.tags ?? [],
      links: input.links ?? [],
      ...(input.embeds ? { embeds: input.embeds } : {}),
    },
    note: input.note ?? {},
  };
}
