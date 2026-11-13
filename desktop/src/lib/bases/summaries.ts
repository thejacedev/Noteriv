/**
 * Column summaries: the built-in ones, and custom formulas that run over
 * the list of a column's values.
 */

import { numericValue, valueKey } from "./compare";
import { dateDifference } from "./dates";
import type { EvalEnv } from "./environment";
import { evaluateSource } from "./evaluate";
import {
  dateValue,
  errorValue,
  isEmptyValue,
  isError,
  isKind,
  type BaseValue,
  type DateValue,
} from "./values";

/** The built-in summaries, as a view's `summaries` names them. */
export const BUILT_IN_SUMMARIES = [
  "Average",
  "Min",
  "Max",
  "Sum",
  "Range",
  "Median",
  "Stddev",
  "Earliest",
  "Latest",
  "Checked",
  "Unchecked",
  "Empty",
  "Filled",
  "Unique",
] as const;

export type BuiltInSummary = (typeof BUILT_IN_SUMMARIES)[number];

/**
 * The numbers in a column. Text that holds a number counts: a formula such
 * as `price.toFixed(2)` gives text, and Obsidian's own example averages one.
 */
export function numbersOf(values: BaseValue[]): number[] {
  const numbers: number[] = [];
  for (const value of values) {
    const n = numericValue(value);
    if (n !== null && Number.isFinite(n)) numbers.push(n);
  }
  return numbers;
}

const datesOf = (values: BaseValue[]) => values.filter((value): value is DateValue => isKind(value, "date"));

function mean(numbers: number[]): number {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Reduced rather than spread into Math.min: a vault can have more rows than a call takes arguments.
const smallest = (numbers: number[]) => numbers.reduce((a, b) => (b < a ? b : a));
const largest = (numbers: number[]) => numbers.reduce((a, b) => (b > a ? b : a));

function earliest(dates: DateValue[]): DateValue {
  return dates.reduce((a, b) => (b.ms < a.ms ? b : a));
}

function latest(dates: DateValue[]): DateValue {
  return dates.reduce((a, b) => (b.ms > a.ms ? b : a));
}

/**
 * Compute a built-in summary. Values of the wrong type are skipped, so a
 * number summary over a column with a few stray words still gives the
 * answer for the numbers; with nothing to work on the result is empty.
 */
export function builtInSummary(name: BuiltInSummary, values: BaseValue[], env: EvalEnv | null = null): BaseValue {
  const numbers = numbersOf(values);
  const dates = datesOf(values);

  switch (name) {
    case "Average":
      return numbers.length > 0 ? mean(numbers) : null;
    case "Min":
      return numbers.length > 0 ? smallest(numbers) : null;
    case "Max":
      return numbers.length > 0 ? largest(numbers) : null;
    case "Sum":
      return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) : null;
    case "Range":
      // The one name covers both types; whichever the column holds decides.
      if (numbers.length > 0) return largest(numbers) - smallest(numbers);
      if (dates.length > 0) return dateDifference(latest(dates), earliest(dates));
      return null;
    case "Median": {
      if (numbers.length === 0) return null;
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    case "Stddev": {
      if (numbers.length === 0) return null;
      // Over the whole set, not a sample of it: the rows in view are all there is.
      const average = mean(numbers);
      return Math.sqrt(mean(numbers.map((n) => (n - average) ** 2)));
    }
    case "Earliest": {
      if (dates.length === 0) return null;
      const first = earliest(dates);
      return dateValue(first.ms, first.hasTime);
    }
    case "Latest": {
      if (dates.length === 0) return null;
      const last = latest(dates);
      return dateValue(last.ms, last.hasTime);
    }
    case "Checked":
      return values.filter((value) => value === true).length;
    case "Unchecked":
      return values.filter((value) => value === false).length;
    case "Empty":
      return values.filter(isEmptyValue).length;
    case "Filled":
      return values.filter((value) => !isEmptyValue(value)).length;
    case "Unique":
      // Empty cells are not a value, so they are not counted as one.
      return new Set(
        values.filter((value) => !isEmptyValue(value)).map((value) => valueKey(value, env?.links ?? null)),
      ).size;
  }
}

function builtInName(name: string): BuiltInSummary | null {
  const wanted = name.trim().toLowerCase();
  return BUILT_IN_SUMMARIES.find((known) => known.toLowerCase() === wanted) ?? null;
}

/**
 * Compute the summary a view asks for by name. A custom formula from the
 * file's `summaries` wins over a built-in of the same name; it sees the
 * column as `values`. An unknown name gives an error value.
 *
 * A cell that failed counts as an empty one. Its error is already shown in
 * the cell, and passed on it would turn the summary of the whole column
 * into that same error.
 */
export function summarize(
  name: string,
  cells: BaseValue[],
  custom: Record<string, string>,
  env: EvalEnv,
): BaseValue {
  const values = cells.map((cell) => (isError(cell) ? null : cell));
  if (Object.hasOwn(custom, name)) {
    return evaluateSource(custom[name], { env, row: null, locals: { values } });
  }
  const builtIn = builtInName(name);
  if (builtIn) return builtInSummary(builtIn, values, env);
  return errorValue(`There is no summary called "${name}"`);
}
