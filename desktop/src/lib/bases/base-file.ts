/**
 * Reads a `.base` file: YAML that describes filters, formulas, property
 * settings, summaries and views. The result is checked and tidied, with
 * anything this engine does not know kept as it was written.
 */

import { parseDocument } from "yaml";

/**
 * A filter: one statement, or statements combined. `and` needs all of them
 * to be true, `or` any of them, and `not` none of them.
 */
export type FilterNode =
  | string
  | { and: FilterNode[] }
  | { or: FilterNode[] }
  | { not: FilterNode[] };

export type SortDirection = "ASC" | "DESC";

export interface SortSpec {
  /** A property id in full: "note.status", "file.name" or "formula.total". */
  property: string;
  direction: SortDirection;
}

/** Settings of one property. Only `displayName` is defined; other keys are kept. */
export interface PropertyConfig {
  displayName?: string;
  [key: string]: unknown;
}

export interface BaseView {
  /** "table", "cards", "list", "kanban", "map", or a type this engine does not know. */
  type: string;
  name: string;
  filters: FilterNode | null;
  /** The properties shown, in order: the columns of a table. */
  order: string[];
  sort: SortSpec[];
  groupBy: SortSpec | null;
  /** The groups to show, in order. Null shows every group. */
  groupOrder: unknown[] | null;
  limit: number | null;
  /** The summary shown for a property: a built-in name or one from the file's `summaries`. */
  summaries: Record<string, string>;
  /** Every other key of the view, untouched: row height, image property, map settings. */
  settings: Record<string, unknown>;
}

export interface BaseFile {
  filters: FilterNode | null;
  /** Formula source by name. */
  formulas: Record<string, string>;
  /** Property settings by full property id. */
  properties: Record<string, PropertyConfig>;
  /** Custom summary formulas by name. */
  summaries: Record<string, string>;
  views: BaseView[];
  /** Top-level keys this engine does not know, untouched. */
  extra: Record<string, unknown>;
}

export type ParseBaseResult = { ok: true; base: BaseFile } | { ok: false; error: string };

export type PropertySource = "note" | "file" | "formula";

export interface PropertyRef {
  /** The id in full, e.g. "note.status". */
  id: string;
  source: PropertySource;
  /** The name within its source, e.g. "status". */
  name: string;
}

/**
 * Read a property id. A name without a prefix is a note property, so
 * "status" and "note.status" are the same property.
 */
export function parsePropertyId(id: string): PropertyRef {
  const text = id.trim();
  for (const source of ["note", "file", "formula"] as const) {
    if (text.startsWith(`${source}.`) && text.length > source.length + 1) {
      const name = text.slice(source.length + 1);
      return { id: `${source}.${name}`, source, name };
    }
  }
  return { id: `note.${text}`, source: "note", name: text };
}

/** A property id in full, whichever way it was written. */
export function normalizePropertyId(id: string): string {
  return parsePropertyId(id).id;
}

/** Something wrong with the file. Caught in parseBase and returned as its error. */
class Invalid extends Error {}

function invalid(message: string): never {
  throw new Invalid(message);
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return "nothing";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "a mapping";
  if (typeof value === "string") return "text";
  return `a ${typeof value}`;
}

function mapping(value: unknown, where: string): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (!isMapping(value)) invalid(`"${where}" must be a mapping of names to values, not ${describe(value)}.`);
  return value;
}

function list(value: unknown, where: string): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) invalid(`"${where}" must be a list, not ${describe(value)}.`);
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return invalid(`"${where}" must be text, not ${describe(value)}.`);
}

const FILTER_KEYS = ["and", "or", "not"] as const;

function filter(value: unknown, where: string): FilterNode | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  // A bare list is read as "all of these", which is what leaving out the "and" means.
  if (Array.isArray(value)) return { and: filterList(value, where) };

  if (!isMapping(value)) invalid(`"${where}" must be a filter statement or a mapping.`);
  const parts: FilterNode[] = [];
  for (const [key, children] of Object.entries(value)) {
    const known = FILTER_KEYS.find((k) => k === key);
    if (!known) invalid(`"${where}" has the key "${key}". A filter can only hold "and", "or" or "not".`);
    const nodes = filterList(Array.isArray(children) ? children : [children], `${where}.${key}`);
    if (known === "and") parts.push({ and: nodes });
    else if (known === "or") parts.push({ or: nodes });
    else parts.push({ not: nodes });
  }
  if (parts.length === 0) return null;
  // The format allows one key; a mapping with several is read as all of them together.
  return parts.length === 1 ? parts[0] : { and: parts };
}

function filterList(values: unknown[], where: string): FilterNode[] {
  const nodes: FilterNode[] = [];
  values.forEach((value, i) => {
    const node = filter(value, `${where}[${i}]`);
    if (node !== null) nodes.push(node);
  });
  return nodes;
}

function strings(value: unknown, where: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(mapping(value, where))) {
    result[key] = entry === null ? "" : text(entry, `${where}.${key}`);
  }
  return result;
}

function direction(value: unknown, where: string): SortDirection {
  if (value === null || value === undefined) return "ASC";
  const upper = text(value, where).trim().toUpperCase();
  if (upper === "ASC" || upper === "DESC") return upper;
  return invalid(`"${where}" must be ASC or DESC, not "${String(value)}".`);
}

function sortSpec(value: unknown, where: string): SortSpec {
  if (typeof value === "string") return { property: normalizePropertyId(value), direction: "ASC" };
  if (!isMapping(value)) invalid(`"${where}" must name a property, not ${describe(value)}.`);
  // Early versions of the format called the property "column".
  const property = value.property ?? value.column;
  if (typeof property !== "string" || !property.trim()) invalid(`"${where}" is missing its "property".`);
  return {
    property: normalizePropertyId(property),
    direction: direction(value.direction, `${where}.direction`),
  };
}

function limit(value: unknown, where: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) invalid(`"${where}" must be a number, not ${describe(value)}.`);
  // Zero or less cannot be a row count, so it is read as "no limit".
  return n >= 1 ? Math.floor(n) : null;
}

const VIEW_KEYS = new Set([
  "type",
  "name",
  "filters",
  "order",
  "sort",
  "groupBy",
  "groupOrder",
  "limit",
  "summaries",
]);

function view(value: unknown, index: number): BaseView {
  const where = `views[${index}]`;
  if (!isMapping(value)) invalid(`"${where}" must be a mapping, not ${describe(value)}.`);

  const type = value.type === null || value.type === undefined ? "table" : text(value.type, `${where}.type`);
  const fallbackName = type.charAt(0).toUpperCase() + type.slice(1);

  const summaries: Record<string, string> = {};
  for (const [id, name] of Object.entries(strings(value.summaries, `${where}.summaries`))) {
    summaries[normalizePropertyId(id)] = name;
  }

  const settings: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(value)) {
    if (!VIEW_KEYS.has(key)) settings[key] = setting;
  }

  return {
    type,
    name: value.name === null || value.name === undefined ? fallbackName : text(value.name, `${where}.name`),
    filters: filter(value.filters, `${where}.filters`),
    order: list(value.order, `${where}.order`).map((id, i) =>
      normalizePropertyId(text(id, `${where}.order[${i}]`)),
    ),
    sort: list(value.sort, `${where}.sort`).map((spec, i) => sortSpec(spec, `${where}.sort[${i}]`)),
    groupBy:
      value.groupBy === null || value.groupBy === undefined
        ? null
        : sortSpec(value.groupBy, `${where}.groupBy`),
    groupOrder:
      value.groupOrder === null || value.groupOrder === undefined
        ? null
        : list(value.groupOrder, `${where}.groupOrder`),
    limit: limit(value.limit, `${where}.limit`),
    summaries,
    settings,
  };
}

function properties(value: unknown): Record<string, PropertyConfig> {
  const result: Record<string, PropertyConfig> = {};
  for (const [id, config] of Object.entries(mapping(value, "properties"))) {
    const where = `properties.${id}`;
    const settings = mapping(config, where);
    const displayName = settings.displayName;
    result[normalizePropertyId(id)] = {
      ...settings,
      displayName:
        displayName === null || displayName === undefined ? undefined : text(displayName, `${where}.displayName`),
    };
  }
  return result;
}

const TOP_KEYS = new Set(["filters", "formulas", "properties", "summaries", "views"]);

/** The first line of a YAML error, without the excerpt of the file that follows it. */
function yamlMessage(message: string): string {
  return message.split("\n")[0].replace(/:$/, "").trim();
}

/**
 * Parse the text of a `.base` file. Unknown keys are kept, not rejected. A
 * file that cannot be used gives `ok: false` with a message that says
 * where the problem is; nothing is thrown.
 */
export function parseBase(yamlText: string): ParseBaseResult {
  let root: unknown;
  try {
    const yaml = parseDocument(yamlText);
    if (yaml.errors.length > 0) {
      return { ok: false, error: `This base is not valid YAML: ${yamlMessage(yaml.errors[0].message)}.` };
    }
    root = yaml.toJS();
  } catch (problem) {
    const detail = problem instanceof Error ? yamlMessage(problem.message) : String(problem);
    return { ok: false, error: `This base is not valid YAML: ${detail}.` };
  }

  try {
    // An empty file is an empty base: every file, shown in the default view.
    if (root === null || root === undefined) root = {};
    if (!isMapping(root)) {
      invalid(`A base must be a mapping with keys such as "filters" and "views", not ${describe(root)}.`);
    }

    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(root)) {
      if (!TOP_KEYS.has(key)) extra[key] = value;
    }

    const base: BaseFile = {
      filters: filter(root.filters, "filters"),
      formulas: strings(root.formulas, "formulas"),
      properties: properties(root.properties),
      summaries: strings(root.summaries, "summaries"),
      views: list(root.views, "views").map(view),
      extra,
    };
    return { ok: true, base };
  } catch (problem) {
    if (problem instanceof Invalid) return { ok: false, error: problem.message };
    return { ok: false, error: `This base could not be read: ${String(problem)}` };
  }
}
