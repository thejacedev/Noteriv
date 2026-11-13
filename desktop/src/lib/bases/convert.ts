/**
 * Turns parsed frontmatter into base values. Frontmatter has no types of
 * its own beyond YAML's, so text is read for what it holds: a [[wiki link]]
 * becomes a link, a URL becomes a URL and an ISO date becomes a date.
 */

import { parseDateText } from "./dates";
import { isUrlText, isWikiLinkText, linkFromText } from "./links";
import { dateValue, objectValue, type BaseValue } from "./values";

/** Deeper than any real frontmatter; stops a self-referencing object. */
const MAX_DEPTH = 32;

function textValue(text: string): BaseValue {
  if (isWikiLinkText(text)) return linkFromText(text);
  if (isUrlText(text)) return { kind: "url", href: text.trim(), display: null };
  return parseDateText(text) ?? text;
}

/**
 * A YAML parser that knows timestamps hands over a Date, and reads a bare
 * "2025-01-31" as midnight UTC. That is a calendar day, not a moment, so
 * it becomes the same day in local time.
 */
function fromDate(date: Date): BaseValue {
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  const midnightUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (!midnightUtc) return dateValue(ms, true);
  const local = new Date(0);
  local.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  local.setHours(0, 0, 0, 0);
  return dateValue(local.getTime(), false);
}

/** Convert one parsed frontmatter value, or any plain JavaScript value. */
export function fromRaw(raw: unknown, depth = 0): BaseValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return textValue(raw);
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (raw instanceof Date) return fromDate(raw);
  if (typeof raw !== "object") return null;
  if (depth >= MAX_DEPTH) return null;

  if (Array.isArray(raw)) return raw.map((item) => fromRaw(item, depth + 1));

  const entries: [string, BaseValue][] = [];
  const source = raw instanceof Map ? raw.entries() : Object.entries(raw);
  for (const [key, value] of source) {
    entries.push([String(key), fromRaw(value, depth + 1)]);
  }
  return objectValue(entries);
}
