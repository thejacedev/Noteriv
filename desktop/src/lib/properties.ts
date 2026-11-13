/**
 * A note's properties (its YAML frontmatter) as typed values, and the edits
 * the properties editor makes to them.
 *
 * Edits go through the YAML document rather than rewriting the block from
 * scratch, so what the editor does not touch (comments, the order of keys,
 * a list written over several lines) stays as it was written.
 */

import { Document, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { splitFrontmatter as split } from "./frontmatter-block";

export { frontmatterLineCount, hasProperties } from "./frontmatter-block";

export type PropertyType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "list", label: "List" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date and time" },
];

/** Properties whose type is fixed by what the app uses them for. */
const BUILT_IN_TYPES: Record<string, PropertyType> = {
  tags: "list",
  aliases: "list",
  cssclasses: "list",
};

/** Whether a property's type is fixed by its name. */
export function isBuiltInProperty(key: string): boolean {
  return key.toLowerCase() in BUILT_IN_TYPES;
}

export interface Property {
  key: string;
  value: unknown;
}

function openDocument(yaml: string): Document | null {
  const doc = parseDocument(yaml, { keepSourceTokens: true });
  if (doc.errors.length > 0) return null;
  if (doc.contents === null) return doc;
  return isMap(doc.contents) ? doc : null;
}

/** The note's properties in the order they are written. Empty when there are none or the YAML is invalid. */
export function readProperties(content: string): Property[] {
  const parts = split(content);
  if (!parts) return [];
  const doc = openDocument(parts.yaml);
  if (!doc || !isMap(doc.contents)) return [];
  return doc.contents.items.map((pair) => ({
    key: String(isScalar(pair.key) ? pair.key.value : pair.key),
    value: pair.value === null ? null : (pair.value as { toJSON(): unknown }).toJSON(),
  }));
}

/** Whether the note has frontmatter that cannot be read, so it must not be rewritten. */
export function hasInvalidProperties(content: string): boolean {
  const parts = split(content);
  return parts !== null && openDocument(parts.yaml) === null;
}

/** Apply a change to the note's properties and return the note's new text. */
function edit(content: string, change: (doc: Document) => void): string {
  const parts = split(content);
  const doc = parts ? openDocument(parts.yaml) : new Document({});
  // Frontmatter that cannot be read is left exactly as it is.
  if (!doc) return content;
  if (doc.contents === null) doc.contents = doc.createNode({});
  change(doc);
  const body = parts ? parts.body : content;
  // The note keeps the line endings it has.
  const eol = parts ? parts.eol : content.includes("\r\n") ? "\r\n" : "\n";
  const map = doc.contents;
  if (isMap(map) && map.items.length === 0) {
    // No properties left: no frontmatter block either.
    return body.replace(/^\r?\n/, "");
  }
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, "").replace(/\r?\n/g, eol);
  return `---${eol}${yaml}${eol}---${eol}${body}`;
}

export function setProperty(content: string, key: string, value: unknown): string {
  const name = key.trim();
  if (!name) return content;
  return edit(content, (doc) => {
    if (Array.isArray(value)) {
      // A list keeps the form it was written in. A new one goes on one
      // line, which reads best for a few short values: tags: [a, b]
      const existing = doc.get(name, true);
      const node = doc.createNode(value);
      if (isSeq(node)) node.flow = value.length === 0 || !isSeq(existing) || existing.flow === true;
      doc.set(name, node);
    } else {
      doc.set(name, value);
    }
  });
}

export function deleteProperty(content: string, key: string): string {
  return edit(content, (doc) => {
    doc.delete(key);
  });
}

/** Rename a property, keeping its value and its place in the list. */
export function renameProperty(content: string, oldKey: string, newKey: string): string {
  const name = newKey.trim();
  if (!name || name === oldKey) return content;
  return edit(content, (doc) => {
    if (!isMap(doc.contents) || doc.has(name)) return;
    const pair = doc.contents.items.find((p) => String(isScalar(p.key) ? p.key.value : p.key) === oldKey);
    if (pair) pair.key = doc.createNode(name);
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/;

/** The type a value looks like, when nothing has said what it is. */
export function inferType(value: unknown): PropertyType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "string") {
    if (DATE.test(value)) return "date";
    if (DATETIME.test(value)) return "datetime";
  }
  return "text";
}

/** A property's type: fixed for a few names, then what the vault has recorded, then what the value looks like. */
export function typeOf(key: string, value: unknown, known: Record<string, PropertyType>): PropertyType {
  return BUILT_IN_TYPES[key.toLowerCase()] ?? known[key] ?? inferType(value);
}

/** A value changed to fit a type, losing as little as it can. */
export function coerce(value: unknown, type: PropertyType): unknown {
  const text = (v: unknown): string =>
    v === null || v === undefined ? "" : Array.isArray(v) ? v.map(String).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  switch (type) {
    case "list":
      if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map((v) => (typeof v === "object" ? JSON.stringify(v) : v));
      return text(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    case "number": {
      const n = typeof value === "number" ? value : Number(text(value).trim());
      return Number.isFinite(n) && text(value).trim() !== "" ? n : null;
    }
    case "checkbox":
      if (typeof value === "boolean") return value;
      return ["true", "yes", "1", "on"].includes(text(value).trim().toLowerCase());
    case "date": {
      const match = text(value).match(/\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : null;
    }
    case "datetime": {
      const match = text(value).match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/);
      if (match) return `${match[1]}T${match[2]}${match[3] ?? ""}`;
      const day = text(value).match(/\d{4}-\d{2}-\d{2}/);
      return day ? `${day[0]}T00:00` : null;
    }
    default:
      return text(value);
  }
}

/** The types the vault has recorded for its properties, from `.noteriv/types.json`. */
export function parsePropertyTypes(text: string | null | undefined): Record<string, PropertyType> {
  if (!text) return {};
  try {
    const raw = JSON.parse(text)?.types;
    if (!raw || typeof raw !== "object") return {};
    const valid = new Set(PROPERTY_TYPES.map((t) => t.value));
    const out: Record<string, PropertyType> = {};
    for (const [key, type] of Object.entries(raw)) {
      if (typeof type === "string" && valid.has(type as PropertyType)) out[key] = type as PropertyType;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializePropertyTypes(types: Record<string, PropertyType>): string {
  const sorted = Object.fromEntries(Object.entries(types).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ types: sorted }, null, 2);
}

export interface PropertySummary {
  name: string;
  type: PropertyType;
  /** How many notes have it. */
  count: number;
}

/** Every property used in the vault, with its type and how many notes use it. */
export function summarizeProperties(
  notes: { properties: Record<string, unknown> }[],
  known: Record<string, PropertyType>
): PropertySummary[] {
  const found = new Map<string, { count: number; sample: unknown }>();
  for (const note of notes) {
    for (const [key, value] of Object.entries(note.properties)) {
      const entry = found.get(key);
      if (entry) entry.count++;
      else found.set(key, { count: 1, sample: value });
    }
  }
  return [...found.entries()]
    .map(([name, { count, sample }]) => ({ name, count, type: typeOf(name, sample, known) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
