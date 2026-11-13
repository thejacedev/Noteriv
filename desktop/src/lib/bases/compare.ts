/**
 * Equality and ordering between base values: what "==" and "<" mean in a
 * formula, how rows are sorted, and which values count as the same group.
 */

import { durationMs, parseDateText, parseDuration } from "./dates";
import { formatValue } from "./format";
import { linkKey, type LinkIndex } from "./links";
import { isEmptyValue, isKind, typeOf, type BaseValue, type NoteRow } from "./values";

/** A number, or text that is nothing but a number. */
export function numericValue(value: BaseValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const tagKey = (name: string) => name.replace(/^#/, "").toLowerCase();

/** What a link, a file or link text points at: a known file, or the text itself. */
function linkTarget(value: BaseValue, links: LinkIndex | null): { row: NoteRow | null; key: string } | null {
  if (isKind(value, "file")) return { row: value.row, key: linkKey(value.row.file.path) };
  if (isKind(value, "link")) return { row: links?.resolve(value.path) ?? null, key: linkKey(value.path) };
  if (typeof value === "string") return { row: links?.resolve(value) ?? null, key: linkKey(value) };
  return null;
}

/**
 * What "==" means. Values of the same type compare by content. Across
 * types it follows what the text would mean: a number equals text that
 * holds the same number, a date equals text that reads as the same date, a
 * tag equals its name with or without the "#", and a link equals a file
 * when it points at that file.
 */
export function looseEquals(a: BaseValue, b: BaseValue, links: LinkIndex | null): boolean {
  if (a === null || b === null) return a === b;
  const ta = typeOf(a);
  const tb = typeOf(b);

  if (ta === "link" || ta === "file" || tb === "link" || tb === "file") {
    const left = linkTarget(a, links);
    const right = linkTarget(b, links);
    if (!left || !right) return false;
    // A file is a known file even without an index, so two files compare by path.
    if (left.row || right.row) return left.row === right.row || (!links && left.key === right.key);
    return left.key === right.key;
  }

  if (isKind(a, "tag") || isKind(b, "tag")) {
    const left = isKind(a, "tag") ? a.name : typeof a === "string" ? a : null;
    const right = isKind(b, "tag") ? b.name : typeof b === "string" ? b : null;
    return left !== null && right !== null && tagKey(left) === tagKey(right);
  }

  if (isKind(a, "url") || isKind(b, "url")) {
    const left = isKind(a, "url") ? a.href : typeof a === "string" ? a : null;
    const right = isKind(b, "url") ? b.href : typeof b === "string" ? b : null;
    return left !== null && left === right;
  }

  if (isKind(a, "date") || isKind(b, "date")) {
    const left = isKind(a, "date") ? a : typeof a === "string" ? parseDateText(a) : null;
    const right = isKind(b, "date") ? b : typeof b === "string" ? parseDateText(b) : null;
    return left !== null && right !== null && left.ms === right.ms;
  }

  if (isKind(a, "duration") || isKind(b, "duration")) {
    const left = isKind(a, "duration") ? a : typeof a === "string" ? parseDuration(a) : null;
    const right = isKind(b, "duration") ? b : typeof b === "string" ? parseDuration(b) : null;
    return left !== null && right !== null && durationMs(left) === durationMs(right);
  }

  if (ta !== tb) {
    if ((ta === "number" && tb === "string") || (ta === "string" && tb === "number")) {
      const left = numericValue(a);
      return left !== null && left === numericValue(b);
    }
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => looseEquals(item, b[i], links));
  }
  if (isKind(a, "object") && isKind(b, "object")) {
    const keys = Object.keys(a.fields);
    return (
      keys.length === Object.keys(b.fields).length &&
      keys.every((key) => Object.hasOwn(b.fields, key) && looseEquals(a.fields[key], b.fields[key], links))
    );
  }
  if (isKind(a, "regexp") && isKind(b, "regexp")) return a.source === b.source && a.flags === b.flags;
  if (isKind(a, "html") && isKind(b, "html")) return a.html === b.html;
  if (isKind(a, "image") && isKind(b, "image")) return a.src === b.src;
  if (isKind(a, "icon") && isKind(b, "icon")) return a.name === b.name;
  if (isKind(a, "error") || isKind(b, "error")) return false;
  return a === b;
}

const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0);

/**
 * What "<" and ">" compare. Returns null when the two values have no
 * order, which the evaluator reports as a type error.
 */
export function compareOrdered(a: BaseValue, b: BaseValue): number | null {
  if (isKind(a, "date") || isKind(b, "date")) {
    const left = isKind(a, "date") ? a : typeof a === "string" ? parseDateText(a) : null;
    const right = isKind(b, "date") ? b : typeof b === "string" ? parseDateText(b) : null;
    return left && right ? sign(left.ms - right.ms) : null;
  }
  if (isKind(a, "duration") || isKind(b, "duration")) {
    const left = isKind(a, "duration") ? a : typeof a === "string" ? parseDuration(a) : null;
    const right = isKind(b, "duration") ? b : typeof b === "string" ? parseDuration(b) : null;
    return left && right ? sign(durationMs(left) - durationMs(right)) : null;
  }
  if (typeof a === "number" || typeof b === "number") {
    const left = numericValue(a);
    const right = numericValue(b);
    return left !== null && right !== null ? sign(left - right) : null;
  }
  if (typeof a === "boolean" && typeof b === "boolean") return sign(Number(a) - Number(b));

  const left = orderedText(a);
  const right = orderedText(b);
  if (left === null || right === null) return null;
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedText(value: BaseValue): string | null {
  if (typeof value === "string") return value;
  if (isKind(value, "url")) return value.href;
  if (isKind(value, "tag")) return value.name;
  return null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Text the way a reader sorts it: case ignored and "Note 2" before "Note 10". */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

function sortRank(value: BaseValue): number {
  switch (typeOf(value)) {
    case "number":
      return 0;
    case "date":
      return 1;
    case "duration":
      return 2;
    case "boolean":
      return 3;
    default:
      return 4;
  }
}

/**
 * The order rows and groups are sorted in. Unlike "<" this never fails:
 * numbers, dates, durations and booleans each sort among themselves, and
 * everything else sorts by its display text. The caller places empty values.
 */
export function compareForSort(a: BaseValue, b: BaseValue): number {
  const rank = sortRank(a) - sortRank(b);
  if (rank !== 0) return rank;
  if (typeof a === "number" && typeof b === "number") return sign(a - b);
  if (isKind(a, "date") && isKind(b, "date")) return sign(a.ms - b.ms);
  if (isKind(a, "duration") && isKind(b, "duration")) return sign(durationMs(a) - durationMs(b));
  if (typeof a === "boolean" && typeof b === "boolean") return sign(Number(a) - Number(b));
  return compareText(formatValue(a), formatValue(b));
}

/**
 * A string that is the same for values that belong together: the key for
 * grouping rows and for counting unique values. Empty values share one key,
 * and links to the same file share one even when written differently.
 */
export function valueKey(value: BaseValue, links: LinkIndex | null): string {
  if (isEmptyValue(value)) return "empty";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "number") return `n:${value}`;
  if (typeof value === "boolean") return `b:${value}`;
  if (Array.isArray(value)) return `l:${JSON.stringify(value.map((item) => valueKey(item, links)))}`;
  if (value === null) return "empty";

  switch (value.kind) {
    case "date":
      return `d:${value.ms}`;
    case "duration":
      return `u:${durationMs(value)}`;
    case "link":
    case "file": {
      const target = linkTarget(value, links);
      return `k:${target?.row ? linkKey(target.row.file.path) : (target?.key ?? "")}`;
    }
    case "tag":
      return `t:${tagKey(value.name)}`;
    case "url":
      return `r:${value.href}`;
    default:
      return `${value.kind}:${formatValue(value)}`;
  }
}
