/**
 * Turns a base value into the text a view shows for it. The same text is
 * what `toString()`, `join()` and joining text with "+" use, so a formula
 * sees what the reader sees.
 */

import { dateToText, formatDate, formatDuration } from "./dates";
import { isKind, type BaseValue } from "./values";

export interface FormatOptions {
  /** Moment format for a date without a time. Default "YYYY-MM-DD". */
  dateFormat?: string;
  /** Moment format for a date with a time. Default "YYYY-MM-DD HH:mm:ss". */
  dateTimeFormat?: string;
  /** Put between the items of a list. Default ", ". */
  listSeparator?: string;
  /** Shown for an empty value. Default "". */
  emptyText?: string;
}

/**
 * Lists inside lists are followed this far. A formula can nest them
 * without end (a reduce that wraps its result each time), and the text of
 * a cell must not be what brings the view down.
 */
const MAX_DEPTH = 50;

/**
 * Arithmetic leaves noise in the last digits (0.1 + 0.2). Fifteen
 * significant digits is as many as a double can be trusted with, so
 * rounding to that removes the noise and nothing else.
 */
function numberText(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}

function toPlain(value: BaseValue, depth: number): unknown {
  if (depth > MAX_DEPTH) return "…";
  if (Array.isArray(value)) return value.map((item) => toPlain(item, depth + 1));
  if (isKind(value, "object")) {
    const plain: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value.fields)) {
      // Defined rather than assigned: "__proto__" must stay an ordinary key.
      Object.defineProperty(plain, key, { value: toPlain(field, depth + 1), enumerable: true });
    }
    return plain;
  }
  if (value === null || typeof value !== "object") return value;
  return format(value, {}, depth + 1);
}

function format(value: BaseValue, options: FormatOptions, depth: number): string {
  if (depth > MAX_DEPTH) return "…";
  if (value === null) return options.emptyText ?? "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value.map((item) => format(item, options, depth + 1)).join(options.listSeparator ?? ", ");
  }

  switch (value.kind) {
    case "date":
      if (value.hasTime) {
        return options.dateTimeFormat ? formatDate(value.ms, options.dateTimeFormat) : dateToText(value);
      }
      return options.dateFormat ? formatDate(value.ms, options.dateFormat) : dateToText(value);
    case "duration":
      return formatDuration(value);
    case "link":
      if (value.display !== null) return format(value.display, options, depth + 1);
      return value.path + (value.subpath ?? "");
    case "url":
      return value.display !== null ? format(value.display, options, depth + 1) : value.href;
    case "file":
      return value.row.file.name;
    case "tag":
      return `#${value.name}`;
    case "object":
      return JSON.stringify(toPlain(value, depth));
    case "regexp":
      return `/${value.source}/${value.flags}`;
    case "html":
      return value.html;
    case "image":
      return value.src;
    case "icon":
      return value.name;
    case "error":
      return value.message;
  }
}

/**
 * The display text of a value: what a cell shows and what a CSV export
 * writes. An error gives its message; check `isError()` to style it.
 */
export function formatValue(value: BaseValue, options: FormatOptions = {}): string {
  return format(value, options, 0);
}
