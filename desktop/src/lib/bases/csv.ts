/**
 * Exports the result of a view as CSV, as RFC 4180 describes it.
 */

import { formatValue, type FormatOptions } from "./format";
import type { ViewResult } from "./view";

export interface CsvOptions {
  /** Leave out the header row of column names. */
  noHeader?: boolean;
  /** Put between rows. Default "\r\n", which is what the RFC asks for. */
  lineEnding?: string;
  /** How dates, lists and empty cells are written. */
  format?: FormatOptions;
}

/**
 * Quote a field when it would not survive as it is: when it holds a comma,
 * a quote or a line break, or starts or ends with a space that a reader
 * might trim. A quote inside is written twice.
 */
export function csvField(text: string): string {
  if (!/[",\r\n]|^\s|\s$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * The view as CSV text: a header of the columns' display names, then the
 * rows in the order shown. Cells hold their display text.
 */
export function toCsv(result: ViewResult, options: CsvOptions = {}): string {
  const lines: string[] = [];
  if (!options.noHeader) {
    lines.push(result.columns.map((column) => csvField(column.displayName)).join(","));
  }
  for (const row of result.rows) {
    lines.push(
      result.columns.map((column) => csvField(formatValue(row.cells[column.id] ?? null, options.format))).join(","),
    );
  }
  return lines.join(options.lineEnding ?? "\r\n");
}
