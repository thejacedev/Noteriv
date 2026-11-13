/**
 * What one run of a view shares between its rows: the clock, the link
 * index, the compiled formulas, and what has already been computed for
 * each row.
 */

import { fromRaw } from "./convert";
import { compileExpression, type ParseResult } from "./expression";
import { buildLinkIndex, linkFromText, linkToFile, type LinkIndex } from "./links";
import {
  dateValue,
  errorValue,
  fileValue,
  objectValue,
  type BaseValue,
  type NoteRow,
  type ObjectValue,
} from "./values";

export interface EnvOptions {
  /**
   * The file `this` refers to: the note a base is embedded in, the active
   * note for a base in the sidebar, or the base file itself. Without it
   * `this` is empty.
   */
  thisFile?: NoteRow | null;
  /** The moment `now()` and `today()` report. Defaults to the current time. */
  now?: number | Date;
  /** The source of `random()`. Defaults to Math.random. */
  random?: () => number;
}

/** What has been worked out for one row during a run. */
export interface RowState {
  row: NoteRow;
  note: Map<string, BaseValue>;
  formulas: Map<string, BaseValue>;
  /** The formulas being computed right now, to catch one that refers to itself. */
  computing: Set<string>;
  properties: ObjectValue | null;
}

export interface EvalEnv {
  now: number;
  random: () => number;
  links: LinkIndex;
  thisRow: NoteRow | null;
  formulas: Map<string, ParseResult>;
  states: WeakMap<NoteRow, RowState>;
}

/**
 * Set up a run over `rows`. Links are looked up among all of them, so pass
 * every file of the vault even when a filter will hide most of them.
 */
export function createEnv(
  rows: NoteRow[],
  formulas: Record<string, string> = {},
  options: EnvOptions = {},
): EvalEnv {
  const thisRow = options.thisFile ?? null;
  // `this` may be a file that is not a row, such as the base file itself.
  const known = thisRow && !rows.includes(thisRow) ? [...rows, thisRow] : rows;
  const now = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now());

  return {
    now,
    random: options.random ?? Math.random,
    links: buildLinkIndex(known),
    thisRow,
    formulas: new Map(Object.entries(formulas).map(([name, source]) => [name, compileExpression(source)])),
    states: new WeakMap(),
  };
}

export function rowState(env: EvalEnv, row: NoteRow): RowState {
  let state = env.states.get(row);
  if (!state) {
    state = { row, note: new Map(), formulas: new Map(), computing: new Set(), properties: null };
    env.states.set(row, state);
  }
  return state;
}

/** One frontmatter property of a row, or null when the note does not have it. */
export function noteProperty(env: EvalEnv, row: NoteRow, name: string): BaseValue {
  const state = rowState(env, row);
  const held = state.note.get(name);
  if (held !== undefined) return held;
  // Own keys only, so a property called "constructor" is not found on every note.
  const value = row.note && Object.hasOwn(row.note, name) ? fromRaw(row.note[name]) : null;
  state.note.set(name, value);
  return value;
}

/** All frontmatter properties of a row as one object, as `file.properties` gives it. */
export function noteProperties(env: EvalEnv, row: NoteRow): ObjectValue {
  const state = rowState(env, row);
  if (!state.properties) {
    const names = Object.keys(row.note ?? {});
    state.properties = objectValue(names.map((name) => [name, noteProperty(env, row, name)]));
  }
  return state.properties;
}

/** The `file.` properties, in the order a property picker would list them. */
export const FILE_FIELDS = [
  "name",
  "basename",
  "path",
  "folder",
  "ext",
  "size",
  "ctime",
  "mtime",
  "tags",
  "links",
  "embeds",
  "backlinks",
  "properties",
  "file",
] as const;

/** One `file.` property of a row. An unknown name is an error value. */
export function fileField(env: EvalEnv, row: NoteRow, name: string): BaseValue {
  const file = row.file;
  switch (name) {
    case "name":
      return file.name;
    case "basename":
      return file.basename;
    case "path":
      return file.path;
    case "folder":
      return file.folder;
    case "ext":
      return file.ext;
    case "size":
      return file.size;
    case "ctime":
      return dateValue(file.ctime, true);
    case "mtime":
      return dateValue(file.mtime, true);
    case "tags":
      return (file.tags ?? []).map((tag) => ({ kind: "tag" as const, name: tag.replace(/^#/, "") }));
    case "links":
      return (file.links ?? []).map((target) => linkFromText(target));
    case "embeds":
      return (file.embeds ?? []).map((target) => ({ ...linkFromText(target), embed: true }));
    case "backlinks":
      return env.links.backlinks(row).map((source) => linkToFile(source));
    case "properties":
      return noteProperties(env, row);
    case "file":
      return fileValue(row);
    default:
      return errorValue(`There is no file property called "${name}"`);
  }
}
