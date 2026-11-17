/**
 * The rows of the phone's properties screen, and what Save does with them.
 *
 * The screen shows each property as a key and one line of text. Save changes
 * only what was changed on the screen, and it does so through the YAML
 * document (lib/properties.ts, the desktop's code). So a list written over
 * several lines, a comment, the order of the keys, or a value that one line
 * of text cannot hold stays in the note as it was written.
 */

import {
  coerce,
  deleteProperty,
  isBuiltInProperty,
  readProperties,
  renameProperty,
  setProperty,
  typeOf,
  type PropertyType,
} from '@/lib/properties';

export interface PropertyRow {
  key: string;
  /** The value as one line of text. */
  value: string;
  /** False when one line of text cannot hold the value; Save then leaves the value alone. */
  editable: boolean;
  /** What the note held when the screen opened. Absent for a row added on the screen. */
  original?: { key: string; value: unknown; text: string };
}

const isPlain = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** A value as one line of text, or null when one line cannot hold it. */
function oneLine(value: unknown): string | null {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.includes('\n') ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // The items are shown with commas between them, so an item with a comma
    // of its own could not be told from two items.
    const fits = value.every((item) => isPlain(item) && !/[,\n]/.test(String(item)));
    return fits ? value.join(', ') : null;
  }
  return null;
}

/** What to show for a value that cannot be edited on one line. */
function preview(value: unknown): string {
  if (typeof value === 'string') return `${value.split('\n')[0]} …`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The note's properties as rows for the screen. Empty when there are none or they cannot be read. */
export function toRows(content: string): PropertyRow[] {
  return readProperties(content).map(({ key, value }) => {
    const text = oneLine(value);
    const shown = text ?? preview(value);
    return { key, value: shown, editable: text !== null, original: { key, value, text: shown } };
  });
}

/** A row added on the screen. */
export function newRow(key = ''): PropertyRow {
  return { key, value: '', editable: true };
}

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const TRUTHS = ['true', 'yes', 'on'];
const FALSEHOODS = ['false', 'no', 'off'];

/**
 * The value a line of text stands for.
 *
 * A property keeps the kind of value it had: a list stays a list, a number a
 * number, and text that only looks like a number ("0123") stays text. A new
 * property takes the type the vault has recorded for its name, or else what
 * the text looks like. Text that does not fit the type is kept as text rather
 * than thrown away.
 */
function toValue(key: string, text: string, original: unknown, known: Record<string, PropertyType>): unknown {
  const typed = text.trim();
  const had = original !== undefined && original !== null;

  if (isBuiltInProperty(key) || known[key] === 'list' || Array.isArray(original)) return coerce(typed, 'list');

  if (had || known[key]) {
    const type = typeOf(key, original, known);
    if (type === 'checkbox') {
      if (TRUTHS.includes(typed.toLowerCase())) return true;
      if (FALSEHOODS.includes(typed.toLowerCase())) return false;
      return typed;
    }
    if (type === 'number') return NUMBER.test(typed) ? Number(typed) : typed;
    if (type === 'date' || type === 'datetime') return coerce(typed, type) ?? typed;
    return typed;
  }

  // Nothing says what it is: go by what was typed.
  if (typed === 'true') return true;
  if (typed === 'false') return false;
  if (NUMBER.test(typed)) return Number(typed);
  if (typed.includes(',')) {
    const items = coerce(typed, 'list') as string[];
    if (items.length > 1) return items;
  }
  return typed;
}

export interface PropertyEdits {
  /** The keys of the properties whose rows were deleted on the screen. */
  removed?: string[];
  /** The types the vault has recorded for its properties (`.noteriv/types.json`). */
  known?: Record<string, PropertyType>;
}

/**
 * The note's text after Save, given the rows as the screen now has them.
 * Properties whose rows were deleted are removed, renamed keys are renamed
 * in place, changed values are set, and new rows are added at the end. A
 * property the screen never showed is not touched, and a note whose
 * properties cannot be read is returned unchanged.
 */
export function applyRows(content: string, rows: PropertyRow[], { removed = [], known = {} }: PropertyEdits = {}): string {
  let next = content;

  for (const key of removed) next = deleteProperty(next, key);

  for (const row of rows) {
    const key = row.key.trim();
    if (row.original) {
      let name = row.original.key;
      // A key that was emptied, or one another property already has, is not
      // a new name: the property stays under the one it had.
      if (key && key !== name) {
        const renamed = renameProperty(next, name, key);
        if (renamed !== next) {
          next = renamed;
          name = key;
        }
      }
      if (row.editable && row.value !== row.original.text) {
        next = setProperty(next, name, toValue(name, row.value, row.original.value, known));
      }
    } else if (key) {
      next = setProperty(next, key, toValue(key, row.value, undefined, known));
    }
  }

  return next;
}
