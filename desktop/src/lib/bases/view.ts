/**
 * Runs one view of a base over the vault's rows and returns what a UI
 * needs to draw it: the columns, the rows that pass the filters in their
 * sorted order with every cell computed, the groups, and the summaries.
 */

import {
  parsePropertyId,
  type BaseFile,
  type BaseView,
  type FilterNode,
  type PropertySource,
  type SortDirection,
} from "./base-file";
import { compareForSort, looseEquals, valueKey } from "./compare";
import { fromRaw } from "./convert";
import { createEnv, fileField, noteProperty, type EnvOptions, type EvalEnv } from "./environment";
import { evaluateFormula } from "./evaluate";
import { testFilter } from "./filters";
import { formatValue } from "./format";
import { summarize } from "./summaries";
import { isEmptyValue, isError, type BaseValue, type NoteRow } from "./values";

/** The view types Obsidian ships. Any other type is passed through as it is. */
export const VIEW_TYPES = ["table", "cards", "list", "kanban", "map"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

/** The view a base with no `views` is shown in. */
export const DEFAULT_VIEW: BaseView = {
  type: "table",
  name: "Table",
  filters: null,
  order: ["file.name"],
  sort: [],
  groupBy: null,
  groupOrder: null,
  limit: null,
  summaries: {},
  settings: {},
};

export interface RunViewOptions extends EnvOptions {
  /**
   * Text from the view's search box. Rows are kept when one of their
   * columns shows it, in any letter case. Applied before the limit.
   */
  search?: string;
  /**
   * Properties to compute for every row besides the columns, such as a
   * map view's coordinates. They appear in each row's `cells`.
   */
  extraProperties?: string[];
}

export interface ViewColumn {
  /** The property id in full, e.g. "note.status". Also the key into a row's `cells`. */
  id: string;
  source: PropertySource;
  name: string;
  /** The header: the display name from the file's `properties`, or a default. */
  displayName: string;
}

export interface ViewRow {
  row: NoteRow;
  /** The file's vault path, for use as a key. */
  path: string;
  /** Computed values by property id: every column, and the properties the view uses besides. */
  cells: Record<string, BaseValue>;
}

export interface ViewSummary {
  /** The summary's name as the view gives it, e.g. "Average". */
  name: string;
  value: BaseValue;
}

export interface ViewGroup {
  /** The value the rows share. Null for rows with no value. */
  key: BaseValue;
  /** The key as text; "None" for the rows with no value. */
  label: string;
  rows: ViewRow[];
  summaries: Record<string, ViewSummary>;
}

/** Something that went wrong without stopping the view. */
export interface ViewProblem {
  kind: "view" | "filter" | "formula";
  message: string;
  /** The filter statement, or the name of the formula. */
  source?: string;
  /** For a filter: how many rows the statement failed on. */
  count?: number;
  /** For a filter: the first file it failed on. */
  path?: string;
}

export interface ViewResult {
  name: string;
  /** The view's type as written. Check it against VIEW_TYPES before drawing. */
  type: string;
  /** The position of the view in the file. */
  index: number;
  /** The view as it was parsed. */
  view: BaseView;
  /** The view's own settings, untouched: row height, image fit, map options and so on. */
  settings: Record<string, unknown>;
  columns: ViewColumn[];
  /** The rows to show, in order. When grouped, in the order of the groups. */
  rows: ViewRow[];
  /** The groups in order, or null when the view is not grouped. */
  groups: ViewGroup[] | null;
  /** The property the rows are grouped by, as a column, or null. */
  groupBy: (ViewColumn & { direction: SortDirection }) | null;
  /** The property id of the cover image of a cards or kanban view, or null. */
  imageProperty: string | null;
  /** The limit that was applied, or null. */
  limit: number | null;
  /** How many rows passed the filters and the search, before the limit. */
  matchedCount: number;
  /** Summaries over all the rows shown, by property id. */
  summaries: Record<string, ViewSummary>;
  problems: ViewProblem[];
}

const FILE_LABELS: Record<string, string> = {
  name: "file name",
  basename: "file base name",
  path: "file path",
  folder: "folder",
  ext: "file extension",
  size: "file size",
  ctime: "created time",
  mtime: "modified time",
  tags: "file tags",
  links: "links",
  embeds: "embeds",
  backlinks: "backlinks",
  properties: "properties",
  file: "file",
};

function column(base: BaseFile, id: string): ViewColumn {
  const ref = parsePropertyId(id);
  // Own entries only: a column called file.constructor must not be labelled with Object's.
  const label = Object.hasOwn(FILE_LABELS, ref.name) ? FILE_LABELS[ref.name] : `file ${ref.name}`;
  const fallback = ref.source === "file" ? label : ref.name;
  const config = Object.hasOwn(base.properties, ref.id) ? base.properties[ref.id] : undefined;
  return { id: ref.id, source: ref.source, name: ref.name, displayName: config?.displayName || fallback };
}

function pickView(
  base: BaseFile,
  which: string | number | undefined,
  problems: ViewProblem[],
): { view: BaseView; index: number } {
  if (base.views.length === 0) return { view: DEFAULT_VIEW, index: 0 };
  if (which === undefined) return { view: base.views[0], index: 0 };

  let index: number;
  if (typeof which === "number") {
    index = Number.isInteger(which) && which >= 0 && which < base.views.length ? which : -1;
  } else {
    index = base.views.findIndex((view) => view.name === which);
    if (index < 0) index = base.views.findIndex((view) => view.name.toLowerCase() === which.toLowerCase());
  }
  if (index >= 0) return { view: base.views[index], index };

  // An embed can name a view that has since been renamed; the first view is shown, as for no name.
  const wanted = typeof which === "number" ? `number ${which + 1}` : `called "${which}"`;
  problems.push({ kind: "view", message: `There is no view ${wanted}. Showing "${base.views[0].name}".` });
  return { view: base.views[0], index: 0 };
}

/** The value of one property of one row, by property id. */
export function propertyValue(env: EvalEnv, row: NoteRow, id: string): BaseValue {
  const ref = parsePropertyId(id);
  if (ref.source === "file") return fileField(env, row, ref.name);
  if (ref.source === "formula") return evaluateFormula(env, row, ref.name);
  return noteProperty(env, row, ref.name);
}

/** Cells with nothing to sort or group by: empty ones, and failed ones. */
const isBlank = (value: BaseValue) => isEmptyValue(value) || isError(value);

/** Blank cells go last whichever way the rest is sorted. */
function compareCells(a: BaseValue, b: BaseValue, direction: SortDirection): number {
  const blank = Number(isBlank(a)) - Number(isBlank(b));
  if (blank !== 0 || isBlank(a)) return blank;
  const order = compareForSort(a, b);
  return direction === "DESC" ? -order : order;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function groupLabel(key: BaseValue): string {
  return key === null ? "None" : formatValue(key);
}

/**
 * Apply a view's `groupOrder`: only the listed groups, in the listed
 * order. A listed value no row has still gets its (empty) group, which is
 * how a kanban shows a column before any card is in it.
 */
function orderGroups(
  groups: { key: BaseValue; rows: ViewRow[] }[],
  groupOrder: unknown[],
  env: EvalEnv,
): { key: BaseValue; rows: ViewRow[] }[] {
  const ordered: { key: BaseValue; rows: ViewRow[] }[] = [];
  const seen = new Set<string>();

  for (const entry of groupOrder) {
    const converted = fromRaw(entry);
    const wanted = isEmptyValue(converted) ? null : converted;
    const found = groups.find((group) => {
      if (wanted === null || group.key === null) return wanted === group.key;
      // By meaning first, then by what is shown: the list holds what the user saw in the group's heading.
      return looseEquals(group.key, wanted, env.links) || formatValue(group.key) === formatValue(wanted);
    });
    const key = valueKey(found ? found.key : wanted, env.links);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(found ?? { key: wanted, rows: [] });
  }
  return ordered;
}

/**
 * Run a view. `view` is the view's name or its position in the file; the
 * first view is used when it is left out. `rows` should be every file in
 * the vault: the base's filters choose among them, and links are looked up
 * among them.
 *
 * The steps, in order: the file's filters and the view's (both must pass),
 * the search text, the sort, the limit, then grouping. A mistake in a
 * filter or formula never throws; it is reported in `problems` or shown as
 * an error value in the cell.
 */
export function runView(
  base: BaseFile,
  view: string | number | undefined,
  rows: NoteRow[],
  options: RunViewOptions = {},
): ViewResult {
  const problems: ViewProblem[] = [];
  const picked = pickView(base, view, problems);
  const spec = picked.view;

  const columns = unique(spec.order.length > 0 ? spec.order : DEFAULT_VIEW.order).map((id) => column(base, id));
  const groupBy = spec.groupBy ? { ...column(base, spec.groupBy.property), direction: spec.groupBy.direction } : null;
  const image = spec.settings.image;
  const imageProperty = typeof image === "string" && image.trim() ? parsePropertyId(image).id : null;
  const frame = {
    name: spec.name,
    type: spec.type,
    index: picked.index,
    view: spec,
    settings: spec.settings,
    columns,
    groupBy,
    imageProperty,
    limit: spec.limit,
  };

  try {
    return { ...frame, ...compute(base, frame, rows, options, problems), problems };
  } catch (problem) {
    // Every expression is already guarded; this is for what nobody foresaw,
    // so that even then the UI gets a view to draw and a reason to show.
    const detail = problem instanceof Error ? problem.message : String(problem);
    problems.push({ kind: "view", message: `This view could not be run: ${detail}` });
    return { ...frame, rows: [], groups: groupBy ? [] : null, matchedCount: 0, summaries: {}, problems };
  }
}

type ViewFrame = Pick<ViewResult, "view" | "columns" | "groupBy" | "imageProperty">;
type ViewData = Pick<ViewResult, "rows" | "groups" | "matchedCount" | "summaries">;

/** The rows, groups and summaries of a view. Problems found on the way are added to `problems`. */
function compute(
  base: BaseFile,
  { view: spec, columns, groupBy, imageProperty }: ViewFrame,
  rows: NoteRow[],
  options: RunViewOptions,
  problems: ViewProblem[],
): ViewData {
  const env = createEnv(rows, base.formulas, options);

  for (const [name, compiled] of env.formulas) {
    if (!compiled.ok) problems.push({ kind: "formula", source: name, message: compiled.error });
  }

  // Filters. Both sets must pass, so they are tested as one "and".
  const filter: FilterNode = {
    and: [base.filters, spec.filters].filter((f): f is FilterNode => f !== null),
  };
  const failures = new Map<string, ViewProblem>();
  let matched: NoteRow[] = [];
  for (const row of rows) {
    const result = testFilter(filter, { env, row, locals: null }, (failure) => {
      const key = `${failure.statement}\n${failure.message}`;
      const held = failures.get(key);
      if (held) held.count = (held.count ?? 0) + 1;
      else {
        failures.set(key, {
          kind: "filter",
          source: failure.statement,
          message: failure.message,
          count: 1,
          path: row.file.path,
        });
      }
    });
    if (result === true) matched.push(row);
  }
  problems.push(...failures.values());

  const needle = options.search?.trim().toLowerCase();
  if (needle) {
    matched = matched.filter((row) =>
      columns.some((col) => formatValue(propertyValue(env, row, col.id)).toLowerCase().includes(needle)),
    );
  }

  // Sort. The keys are read once per row, not once per comparison. Without
  // a sort the rows keep the order they were given in, and rows that sort
  // the same keep it between them.
  let sorted = matched;
  if (spec.sort.length > 0) {
    const keyed = matched.map((row) => ({
      row,
      keys: spec.sort.map((sort) => propertyValue(env, row, sort.property)),
    }));
    keyed.sort((a, b) => {
      for (let i = 0; i < spec.sort.length; i++) {
        const order = compareCells(a.keys[i], b.keys[i], spec.sort[i].direction);
        if (order !== 0) return order;
      }
      return 0;
    });
    sorted = keyed.map((entry) => entry.row);
  }

  const limited = spec.limit !== null ? sorted.slice(0, spec.limit) : sorted;

  const cellIds = unique([
    ...columns.map((col) => col.id),
    ...(groupBy ? [groupBy.id] : []),
    ...(imageProperty ? [imageProperty] : []),
    ...Object.keys(spec.summaries),
    ...(options.extraProperties ?? []).map((id) => parsePropertyId(id).id),
  ]);
  const toViewRow = (row: NoteRow): ViewRow => {
    const cells: Record<string, BaseValue> = {};
    for (const id of cellIds) cells[id] = propertyValue(env, row, id);
    return { row, path: row.file.path, cells };
  };
  let viewRows = limited.map(toViewRow);

  const summariesOf = (shown: ViewRow[]): Record<string, ViewSummary> => {
    const result: Record<string, ViewSummary> = {};
    for (const [id, name] of Object.entries(spec.summaries)) {
      const values = shown.map((viewRow) => viewRow.cells[id]);
      result[id] = { name, value: summarize(name, values, base.summaries, env) };
    }
    return result;
  };

  let groups: ViewGroup[] | null = null;
  if (groupBy) {
    const byKey = new Map<string, { key: BaseValue; rows: ViewRow[] }>();
    for (const viewRow of viewRows) {
      const value = viewRow.cells[groupBy.id];
      const key = isBlank(value) ? null : value;
      const id = valueKey(key, env.links);
      const group = byKey.get(id);
      if (group) group.rows.push(viewRow);
      else byKey.set(id, { key, rows: [viewRow] });
    }

    let ordered = [...byKey.values()].sort((a, b) => compareCells(a.key, b.key, groupBy.direction));
    if (spec.groupOrder) ordered = orderGroups(ordered, spec.groupOrder, env);

    groups = ordered.map((group) => ({
      key: group.key,
      label: groupLabel(group.key),
      rows: group.rows,
      summaries: summariesOf(group.rows),
    }));
    // Rows of hidden groups are not shown, so they are not in the flat list either.
    viewRows = groups.flatMap((group) => group.rows);
  }

  return {
    rows: viewRows,
    groups,
    matchedCount: matched.length,
    summaries: summariesOf(viewRows),
  };
}
