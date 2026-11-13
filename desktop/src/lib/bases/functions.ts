/**
 * The functions of the bases formula language: the global ones, and the
 * methods each type of value has. `filter()`, `map()`, `reduce()` and `if()`
 * are not here: they take expressions rather than values, so the evaluator
 * runs them itself.
 */

import { compareForSort, looseEquals, numericValue, valueKey } from "./compare";
import {
  durationMs,
  formatDate,
  parseDateLoose,
  parseDuration,
  relativeTime,
  startOfDay,
} from "./dates";
import type { EvalEnv } from "./environment";
import { formatValue } from "./format";
import { isUrlText, isWikiLinkText, linkFromText, linkKey, linkToFile } from "./links";
import {
  dateValue,
  errorValue,
  fileValue,
  isEmptyValue,
  isKind,
  isTruthy,
  typeLabel,
  typeOf,
  type BaseValue,
  type DateValue,
  type FileValue,
  type LinkValue,
  type NoteRow,
  type ObjectValue,
  type RegExpValue,
} from "./values";

/** A type error inside a function. Caught at the call and turned into an error value. */
class Failure extends Error {}

function fail(message: string): never {
  throw new Failure(message);
}

interface Method<S> {
  min: number;
  /** Infinity for a function that takes any number of arguments. */
  max: number;
  run: (self: S, args: BaseValue[], env: EvalEnv) => BaseValue;
}

type Methods<S> = Record<string, Method<S>>;

function method<S>(min: number, max: number, run: Method<S>["run"]): Method<S> {
  return { min, max, run };
}

/** Longest text a function may build, so `"x".repeat(1e9)` fails instead of freezing the app. */
const MAX_TEXT = 1_000_000;

function needNumber(value: BaseValue, name: string): number {
  const n = numericValue(value);
  if (n === null) fail(`${name}() needs a number, not ${typeLabel(value)}`);
  return n;
}

function needText(value: BaseValue, name: string): string {
  if (typeof value === "string") return value;
  if (isKind(value, "url")) return value.href;
  if (isKind(value, "tag")) return `#${value.name}`;
  if (value === null || typeof value === "object") fail(`${name}() needs text, not ${typeLabel(value)}`);
  return formatValue(value);
}

function toRegExp(value: RegExpValue): RegExp {
  try {
    return new RegExp(value.source, value.flags);
  } catch {
    return fail(`/${value.source}/${value.flags} is not a valid regular expression`);
  }
}

/** The file a value names: a file, a link, or the text of a path or link. */
function resolveFile(value: BaseValue, env: EvalEnv): NoteRow | null {
  if (isKind(value, "file")) return value.row;
  if (isKind(value, "link")) return env.links.resolve(value.path);
  if (typeof value === "string") return env.links.resolve(value);
  return null;
}

/** True when `row` has a link to what `target` names, whether or not that file exists. */
function linksTo(row: NoteRow, target: BaseValue, env: EvalEnv): boolean {
  if (target === null) return false;
  const outgoing = env.links.outgoing(row);
  const found = resolveFile(target, env);
  if (found) return outgoing.rows.has(found);
  if (isKind(target, "link")) return outgoing.unresolved.has(linkKey(target.path));
  if (typeof target === "string") return outgoing.unresolved.has(linkKey(target));
  return false;
}

const tagName = (tag: string) => tag.replace(/^#/, "").toLowerCase();

const folderName = (folder: string) => folder.replace(/^\/+|\/+$/g, "").toLowerCase();

/** Round half up at the given decimal place, without the noise of multiplying by a power of ten. */
function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const shifted = Math.round(Number(`${value}e${digits}`));
  const result = Number(`${shifted}e${-digits}`);
  // Values already in exponent form cannot be shifted this way; they need no rounding either.
  return Number.isNaN(result) ? value : result;
}

function needDigits(value: BaseValue | undefined, name: string): number {
  if (value === undefined || value === null) return 0;
  const digits = needNumber(value, name);
  if (!Number.isInteger(digits) || digits < 0 || digits > 100) {
    fail(`${name}() takes a whole number of decimal places from 0 to 100`);
  }
  return digits;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function flatten(values: BaseValue[]): BaseValue[] {
  return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
}

const GLOBALS: Methods<void> = {
  escapeHTML: method(1, 1, (_, [html]) => formatValue(html).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])),

  date: method(1, 1, (_, [input]) => {
    if (input === null || isKind(input, "date")) return input;
    if (typeof input === "number") return dateValue(input, true);
    if (typeof input !== "string") fail(`date() needs text, not ${typeLabel(input)}`);
    return parseDateLoose(input) ?? fail(`"${input}" is not a date`);
  }),

  duration: method(1, 1, (_, [input]) => {
    if (input === null || isKind(input, "duration")) return input;
    if (typeof input !== "string") fail(`duration() needs text, not ${typeLabel(input)}`);
    return parseDuration(input) ?? fail(`"${input}" is not a duration`);
  }),

  file: method(1, 1, (_, [input], env) => {
    const row = resolveFile(input, env);
    return row ? fileValue(row) : null;
  }),

  html: method(1, 1, (_, [html]) => ({ kind: "html", html: formatValue(html) })),

  image: method(1, 1, (_, [input], env) => {
    if (input === null) return null;
    if (isKind(input, "url")) return { kind: "image", src: input.href };
    if (typeof input === "string" && !isWikiLinkText(input)) return { kind: "image", src: input };
    // A link or a file: the vault path when the file is known, so the view can load it.
    const row = resolveFile(input, env);
    if (row) return { kind: "image", src: row.file.path };
    if (isKind(input, "link")) return { kind: "image", src: input.path };
    if (typeof input === "string") return { kind: "image", src: linkFromText(input).path };
    return fail(`image() needs a path, a link or a file, not ${typeLabel(input)}`);
  }),

  icon: method(1, 1, (_, [name]) => ({ kind: "icon", name: needText(name, "icon") })),

  link: method(1, 2, (_, [target, display = null]) => {
    if (target === null) return null;
    if (isKind(target, "file")) return linkToFile(target.row, display);
    if (isKind(target, "link") || isKind(target, "url")) return { ...target, display: display ?? target.display };
    const text = needText(target, "link");
    if (isUrlText(text)) return { kind: "url", href: text.trim(), display };
    return linkFromText(text, display);
  }),

  list: method(1, 1, (_, [element]) => {
    if (Array.isArray(element)) return element;
    // A missing property is no elements, not one empty element.
    return element === null ? [] : [element];
  }),

  max: method(1, Infinity, (_, args) => extreme(args, "max", (a, b) => (b > a ? b : a))),
  min: method(1, Infinity, (_, args) => extreme(args, "min", (a, b) => (b < a ? b : a))),

  now: method(0, 0, (_, __, env) => dateValue(env.now, true)),
  today: method(0, 0, (_, __, env) => dateValue(startOfDay(env.now), false)),

  number: method(1, 1, (_, [input]) => {
    if (input === null || typeof input === "number") return input;
    if (typeof input === "boolean") return input ? 1 : 0;
    if (isKind(input, "date")) return input.ms;
    if (isKind(input, "duration")) return durationMs(input);
    if (typeof input === "string") return numericValue(input) ?? fail(`"${input}" is not a number`);
    return fail(`number() cannot read ${typeLabel(input)}`);
  }),

  random: method(0, 0, (_, __, env) => env.random()),
};

function extreme(args: BaseValue[], name: string, pick: (a: number, b: number) => number): BaseValue {
  // Lists are opened up so max(scores) works as well as max(a, b).
  const numbers = flatten(args)
    .filter((value) => value !== null)
    .map((value) => needNumber(value, name));
  return numbers.length > 0 ? numbers.reduce(pick) : null;
}

/** The names `isType()` accepts, and the type each one stands for. */
const TYPE_NAMES: Record<string, string> = {
  string: "string",
  text: "string",
  number: "number",
  boolean: "boolean",
  checkbox: "boolean",
  date: "date",
  datetime: "date",
  duration: "duration",
  list: "list",
  array: "list",
  link: "link",
  url: "url",
  file: "file",
  object: "object",
  null: "null",
  regexp: "regexp",
  regex: "regexp",
  tag: "tag",
  html: "html",
  image: "image",
  icon: "icon",
};

const ANY_METHODS: Methods<BaseValue> = {
  isTruthy: method(0, 0, (self) => isTruthy(self)),
  isType: method(1, 1, (self, [type]) => {
    const wanted = TYPE_NAMES[needText(type, "isType").toLowerCase()];
    // A tag reads as text everywhere else, so it answers to "string" as well.
    return wanted === typeOf(self) || (wanted === "string" && isKind(self, "tag"));
  }),
  // The type is spelled out because TypeScript otherwise reads this entry as Object's own toString.
  toString: method<BaseValue>(0, 0, (self) => formatValue(self)),
  isEmpty: method(0, 0, (self) => isEmptyValue(self)),
};

const STRING_METHODS: Methods<string> = {
  contains: method(1, 1, (self, [value]) => value !== null && self.includes(formatValue(value))),
  containsAll: method(1, Infinity, (self, values) =>
    values.every((value) => value !== null && self.includes(formatValue(value))),
  ),
  containsAny: method(1, Infinity, (self, values) =>
    values.some((value) => value !== null && self.includes(formatValue(value))),
  ),
  endsWith: method(1, 1, (self, [query]) => query !== null && self.endsWith(formatValue(query))),
  startsWith: method(1, 1, (self, [query]) => query !== null && self.startsWith(formatValue(query))),
  lower: method(0, 0, (self) => self.toLowerCase()),
  upper: method(0, 0, (self) => self.toUpperCase()),
  replace: method(2, 2, (self, [pattern, replacement]) => {
    const to = formatValue(replacement);
    if (isKind(pattern, "regexp")) return self.replace(toRegExp(pattern), to);
    const from = needText(pattern, "replace");
    // Split and join rather than replaceAll: "$" in the replacement is then just a character.
    return from === "" ? self : self.split(from).join(to);
  }),
  repeat: method(1, 1, (self, [count]) => {
    const times = needNumber(count, "repeat");
    if (!Number.isInteger(times) || times < 0) fail("repeat() needs a whole number that is not negative");
    if (self.length * times > MAX_TEXT) fail("repeat() would make the text too long");
    return self.repeat(times);
  }),
  reverse: method(0, 0, (self) => Array.from(self).reverse().join("")),
  slice: method(1, 2, (self, [start, end]) =>
    self.slice(needNumber(start, "slice"), end === undefined || end === null ? undefined : needNumber(end, "slice")),
  ),
  split: method(1, 2, (self, [separator, n]) => {
    const limit = n === undefined || n === null ? undefined : needNumber(n, "split");
    if (isKind(separator, "regexp")) return self.split(toRegExp(separator), limit);
    return self.split(needText(separator, "split"), limit);
  }),
  title: method(0, 0, (self) =>
    self.replace(/[^\s]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()),
  ),
  trim: method(0, 0, (self) => self.trim()),
};

const NUMBER_METHODS: Methods<number> = {
  abs: method(0, 0, (self) => Math.abs(self)),
  ceil: method(0, 0, (self) => Math.ceil(self)),
  floor: method(0, 0, (self) => Math.floor(self)),
  round: method(0, 1, (self, [digits]) => roundTo(self, needDigits(digits, "round"))),
  toFixed: method(0, 1, (self, [precision]) => self.toFixed(needDigits(precision, "toFixed"))),
};

const DATE_METHODS: Methods<DateValue> = {
  date: method(0, 0, (self) => dateValue(startOfDay(self.ms), false)),
  format: method(1, 1, (self, [format]) => formatDate(self.ms, needText(format, "format"))),
  time: method(0, 0, (self) => formatDate(self.ms, "HH:mm:ss")),
  relative: method(0, 0, (self, _, env) => relativeTime(self.ms, env.now)),
};

function listContains(list: BaseValue[], value: BaseValue, env: EvalEnv): boolean {
  return list.some((item) => looseEquals(item, value, env.links));
}

const LIST_METHODS: Methods<BaseValue[]> = {
  contains: method(1, 1, (self, [value], env) => listContains(self, value, env)),
  containsAll: method(1, Infinity, (self, values, env) => values.every((value) => listContains(self, value, env))),
  containsAny: method(1, Infinity, (self, values, env) => values.some((value) => listContains(self, value, env))),
  // One level, as in JavaScript.
  flat: method(0, 0, (self) => self.flat()),
  join: method(0, 1, (self, [separator]) => {
    const between = separator === undefined || separator === null ? "," : formatValue(separator);
    const text = self.map((item) => formatValue(item)).join(between);
    return text.length > MAX_TEXT ? fail("join() would make the text too long") : text;
  }),
  reverse: method(0, 0, (self) => [...self].reverse()),
  slice: method(1, 2, (self, [start, end]) =>
    self.slice(needNumber(start, "slice"), end === undefined || end === null ? undefined : needNumber(end, "slice")),
  ),
  sort: method(0, 0, (self) =>
    [...self].sort((a, b) => {
      // Empty values go last, as they do when a view sorts its rows.
      const empty = Number(isEmptyValue(a)) - Number(isEmptyValue(b));
      return empty !== 0 ? empty : compareForSort(a, b);
    }),
  ),
  unique: method(0, 0, (self, _, env) => {
    const seen = new Set<string>();
    return self.filter((item) => {
      const key = valueKey(item, env.links);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }),
  // Not in the function reference, but its own summary example uses it: values.mean().
  mean: method(0, 0, (self) => {
    // Text that holds a number counts, as it does in the built-in Average.
    const numbers = self.map(numericValue).filter((n): n is number => n !== null && Number.isFinite(n));
    return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
  }),
};

const LINK_METHODS: Methods<LinkValue> = {
  asFile: method(0, 0, (self, _, env) => {
    const row = env.links.resolve(self.path);
    return row ? fileValue(row) : null;
  }),
  linksTo: method(1, 1, (self, [file], env) => {
    const row = env.links.resolve(self.path);
    return row !== null && linksTo(row, file, env);
  }),
};

const FILE_METHODS: Methods<FileValue> = {
  asLink: method(0, 1, (self, [display = null]) => linkToFile(self.row, display)),
  hasLink: method(1, 1, (self, [other], env) => linksTo(self.row, other, env)),
  hasProperty: method(1, 1, (self, [name]) => {
    const key = needText(name, "hasProperty");
    const note = self.row.note ?? {};
    return Object.hasOwn(note, key) && note[key] !== undefined;
  }),
  hasTag: method(1, Infinity, (self, values) => {
    const tags = (self.row.file.tags ?? []).map(tagName);
    return values.some((value) => {
      if (value === null) return false;
      const wanted = tagName(isKind(value, "tag") ? value.name : needText(value, "hasTag"));
      // A tag also has every tag above it: #book/fiction is a #book.
      return wanted !== "" && tags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`));
    });
  }),
  inFolder: method(1, 1, (self, [folder]) => {
    const wanted = folderName(needText(folder, "inFolder"));
    const actual = folderName(self.row.file.folder ?? "");
    return wanted === "" || actual === wanted || actual.startsWith(`${wanted}/`);
  }),
};

const OBJECT_METHODS: Methods<ObjectValue> = {
  keys: method(0, 0, (self) => Object.keys(self.fields)),
  values: method(0, 0, (self) => Object.values(self.fields)),
};

const REGEXP_METHODS: Methods<RegExpValue> = {
  matches: method(1, 1, (self, [value]) => value !== null && toRegExp(self).test(formatValue(value))),
};

/** The functions that take expressions, which the evaluator runs itself. */
export const LAZY_GLOBALS = ["if"];
export const LAZY_LIST_METHODS = ["filter", "map", "reduce"];

type Bound = { def: Method<never>; run: (args: BaseValue[], env: EvalEnv) => BaseValue };

function bind<S>(table: Methods<S>, name: string, self: S): Bound | null {
  // Own entries only: "constructor" must not find Object's.
  if (!Object.hasOwn(table, name)) return null;
  const def = table[name];
  return { def, run: (args, env) => def.run(self, args, env) };
}

function ownMethod(self: BaseValue, name: string): Bound | null {
  if (typeof self === "string") return bind(STRING_METHODS, name, self);
  if (typeof self === "number") return bind(NUMBER_METHODS, name, self);
  if (Array.isArray(self)) return bind(LIST_METHODS, name, self);
  if (self === null || typeof self === "boolean") return null;
  switch (self.kind) {
    case "url":
      return bind(STRING_METHODS, name, self.href);
    case "tag":
      return bind(STRING_METHODS, name, `#${self.name}`);
    case "date":
      return bind(DATE_METHODS, name, self);
    case "link":
      return bind(LINK_METHODS, name, self);
    case "file":
      return bind(FILE_METHODS, name, self);
    case "object":
      return bind(OBJECT_METHODS, name, self);
    case "regexp":
      return bind(REGEXP_METHODS, name, self);
    default:
      return null;
  }
}

const TYPED_TABLES: Record<string, Methods<never>> = {
  string: STRING_METHODS,
  number: NUMBER_METHODS,
  date: DATE_METHODS,
  list: LIST_METHODS,
  link: LINK_METHODS,
  file: FILE_METHODS,
  object: OBJECT_METHODS,
  regexp: REGEXP_METHODS,
};

const ALL_METHOD_NAMES = new Set<string>([
  ...Object.keys(ANY_METHODS),
  ...Object.values(TYPED_TABLES).flatMap((table) => Object.keys(table)),
  ...LAZY_LIST_METHODS,
]);

/** Methods that answer a yes-or-no question, which an empty value answers with "no". */
const PREDICATES = new Set([
  "contains",
  "containsAll",
  "containsAny",
  "startsWith",
  "endsWith",
  "hasLink",
  "hasProperty",
  "hasTag",
  "inFolder",
  "linksTo",
  "matches",
]);

function checkCount(name: string, def: { min: number; max: number }, count: number): void {
  if (count >= def.min && count <= def.max) return;
  const plural = (n: number) => `${n} argument${n === 1 ? "" : "s"}`;
  let wants: string;
  if (def.max === Infinity) wants = `at least ${plural(def.min)}`;
  else if (def.min === def.max) wants = plural(def.min);
  else wants = `${def.min} to ${plural(def.max)}`;
  fail(`${name}() takes ${wants}, not ${count}`);
}

function guarded(name: string, run: () => BaseValue): BaseValue {
  try {
    return run();
  } catch (problem) {
    if (problem instanceof Failure) return errorValue(problem.message);
    return errorValue(`${name}() failed: ${problem instanceof Error ? problem.message : String(problem)}`);
  }
}

export function isGlobalFunction(name: string): boolean {
  return Object.hasOwn(GLOBALS, name) || LAZY_GLOBALS.includes(name);
}

export function isMethodName(name: string): boolean {
  return ALL_METHOD_NAMES.has(name);
}

/** Call a global function. A wrong argument gives an error value, never an exception. */
export function callGlobal(name: string, args: BaseValue[], env: EvalEnv): BaseValue {
  if (!Object.hasOwn(GLOBALS, name)) return errorValue(`There is no function called ${name}()`);
  const def = GLOBALS[name];
  return guarded(name, () => {
    checkCount(name, def, args.length);
    return def.run(undefined, args, env);
  });
}

/**
 * Call a method on a value. On an empty value nothing fails: a question
 * such as `contains()` is answered "no" and anything else gives an empty
 * value, so a note that lacks a property leaves an empty cell or drops out
 * of a filter instead of raising an error on every such row.
 */
export function callMethod(self: BaseValue, name: string, args: BaseValue[], env: EvalEnv): BaseValue {
  const bound = ownMethod(self, name) ?? bind(ANY_METHODS, name, self);
  if (!bound) {
    if (!isMethodName(name)) return errorValue(`There is no function called ${name}()`);
    if (self === null) return PREDICATES.has(name) ? false : null;
    return errorValue(`${name}() cannot be used on ${typeLabel(self)}`);
  }
  return guarded(name, () => {
    checkCount(name, bound.def, args.length);
    return bound.run(args, env);
  });
}

/** Every function the engine runs, by the type it belongs to. For a formula editor's suggestions. */
export const SUPPORTED_FUNCTIONS: Record<string, string[]> = {
  global: [...Object.keys(GLOBALS), ...LAZY_GLOBALS].sort(),
  any: Object.keys(ANY_METHODS).sort(),
  string: Object.keys(STRING_METHODS).sort(),
  number: Object.keys(NUMBER_METHODS).sort(),
  date: Object.keys(DATE_METHODS).sort(),
  list: [...Object.keys(LIST_METHODS), ...LAZY_LIST_METHODS].sort(),
  link: Object.keys(LINK_METHODS).sort(),
  file: Object.keys(FILE_METHODS).sort(),
  object: Object.keys(OBJECT_METHODS).sort(),
  regexp: Object.keys(REGEXP_METHODS).sort(),
};

/**
 * Functions in Obsidian's reference that this engine does not run, as
 * "type.name". There are none: `html()`, `image()` and `icon()` return
 * values for the view to render, and the rest compute their result here.
 */
export const UNSUPPORTED_FUNCTIONS: readonly string[] = [];
