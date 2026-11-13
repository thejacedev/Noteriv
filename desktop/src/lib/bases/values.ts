/**
 * The rows a base is run over and the values its formulas and filters
 * produce. Text, numbers and booleans are plain JavaScript values, a list is
 * an array, and every other type is an object tagged with `kind`, so a UI
 * can switch on `typeOf(value)` alone.
 */

/** What the engine knows about one file. It never reads the file itself. */
export interface NoteFile {
  /** File name with its extension, e.g. "Plan.md". */
  name: string;
  /** File name without the extension. */
  basename: string;
  /** Path relative to the vault, with "/" between folders. */
  path: string;
  /** Folder relative to the vault, "" for the vault root. */
  folder: string;
  /** Extension without the dot, e.g. "md". */
  ext: string;
  /** Size in bytes. */
  size: number;
  /** Created time, in milliseconds since the Unix epoch. */
  ctime: number;
  /** Modified time, in milliseconds since the Unix epoch. */
  mtime: number;
  /** Tags from the content and the frontmatter, with or without the "#". */
  tags: string[];
  /** Targets of the internal links, as written or as vault paths. */
  links: string[];
  /** Targets of the embeds. Optional: `file.embeds` is empty without it. */
  embeds?: string[];
}

/** One file of the vault: the file itself and its parsed frontmatter. */
export interface NoteRow {
  file: NoteFile;
  note: Record<string, unknown>;
}

/** A date, or a date with a time when `hasTime` is set. Always local time. */
export interface DateValue {
  kind: "date";
  ms: number;
  hasTime: boolean;
}

/**
 * A length of time. Months and days are kept apart from the milliseconds
 * because they are calendar units: a month added to 1 December lands on
 * 1 January however many days that takes.
 */
export interface DurationValue {
  kind: "duration";
  months: number;
  days: number;
  ms: number;
}

/** An internal link, as in [[path#subpath|display]]. */
export interface LinkValue {
  kind: "link";
  path: string;
  /** The heading or block part, with its "#", or null. */
  subpath: string | null;
  /** Display text, or an icon from `icon()`; null shows the path. */
  display: BaseValue;
  embed: boolean;
}

/** An external link. */
export interface UrlValue {
  kind: "url";
  href: string;
  display: BaseValue;
}

/** A file of the vault, as `file` and `this` evaluate to. */
export interface FileValue {
  kind: "file";
  row: NoteRow;
}

/** A tag from `file.tags`. The name is kept without the "#". */
export interface TagValue {
  kind: "tag";
  name: string;
}

/** Key and value pairs: a nested frontmatter property or `file.properties`. */
export interface ObjectValue {
  kind: "object";
  fields: Record<string, BaseValue>;
}

export interface RegExpValue {
  kind: "regexp";
  source: string;
  flags: string;
}

/** What `html()` returns: markup for the view to render after sanitising it. */
export interface HtmlValue {
  kind: "html";
  html: string;
}

/** What `image()` returns: a URL, or a vault path when the image is a file. */
export interface ImageValue {
  kind: "image";
  src: string;
}

/** What `icon()` returns: the name of a Lucide icon. */
export interface IconValue {
  kind: "icon";
  name: string;
}

/** A failed cell or filter. It takes the place of the value it could not compute. */
export interface ErrorValue {
  kind: "error";
  message: string;
}

export type TaggedValue =
  | DateValue
  | DurationValue
  | LinkValue
  | UrlValue
  | FileValue
  | TagValue
  | ObjectValue
  | RegExpValue
  | HtmlValue
  | ImageValue
  | IconValue
  | ErrorValue;

export type BaseValue = null | string | number | boolean | BaseValue[] | TaggedValue;

export type BaseValueType = "null" | "string" | "number" | "boolean" | "list" | TaggedValue["kind"];

export function typeOf(value: BaseValue): BaseValueType {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  return value.kind;
}

/** Narrow a value to one of the tagged kinds. */
export function isKind<K extends TaggedValue["kind"]>(
  value: BaseValue,
  kind: K,
): value is Extract<TaggedValue, { kind: K }> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.kind === kind;
}

export function isError(value: BaseValue): value is ErrorValue {
  return isKind(value, "error");
}

export function errorValue(message: string): ErrorValue {
  return { kind: "error", message };
}

export function dateValue(ms: number, hasTime: boolean): DateValue {
  return { kind: "date", ms, hasTime };
}

export function durationValue(months: number, days: number, ms: number): DurationValue {
  return { kind: "duration", months, days, ms };
}

export function fileValue(row: NoteRow): FileValue {
  return { kind: "file", row };
}

/**
 * Build an object value. Fields are set as own properties one by one so a
 * frontmatter key such as "__proto__" stays data and cannot change the
 * object's prototype.
 */
export function objectValue(entries: Iterable<[string, BaseValue]>): ObjectValue {
  const fields: Record<string, BaseValue> = {};
  for (const [key, value] of entries) {
    Object.defineProperty(fields, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return { kind: "object", fields };
}

/** Read a field without finding inherited ones such as "constructor". */
export function getField(object: ObjectValue, key: string): BaseValue {
  return Object.hasOwn(object.fields, key) ? object.fields[key] : null;
}

/** What "Empty" counts and `isEmpty()` reports: nothing there to show. */
export function isEmptyValue(value: BaseValue): boolean {
  if (value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isKind(value, "object")) return Object.keys(value.fields).length === 0;
  return false;
}

/**
 * How a value reads as a condition. As in JavaScript, except that an empty
 * list is false: "has no tags" should not need a different test for a note
 * with `tags: []` than for one with no `tags` at all.
 */
export function isTruthy(value: BaseValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value.kind !== "error";
}

/** A type's name as it reads in an error message. */
export function typeLabel(value: BaseValue): string {
  const type = typeOf(value);
  switch (type) {
    case "null":
      return "an empty value";
    case "string":
      return "text";
    case "number":
      return "a number";
    case "boolean":
      return "a boolean";
    case "list":
      return "a list";
    case "object":
      return "an object";
    case "regexp":
      return "a regular expression";
    case "url":
      return "a URL";
    case "html":
      return "HTML";
    case "image":
      return "an image";
    case "icon":
      return "an icon";
    case "error":
      return "an error";
    default:
      return `a ${type}`;
  }
}
