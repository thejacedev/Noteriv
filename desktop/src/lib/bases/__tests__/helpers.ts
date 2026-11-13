import {
  evaluateExpression,
  formatValue,
  isError,
  makeNoteRow,
  type BaseValue,
  type EvaluateOptions,
  type NoteRow,
  type NoteRowInput,
} from "..";

/**
 * The moment the tests run at: 27 May 2025, 23:59:59 local time. Built
 * from local fields, and read back through format(), so no test depends on
 * the machine's time zone.
 */
export const NOW = new Date(2025, 4, 27, 23, 59, 59).getTime();

export function note(
  path: string,
  frontmatter: Record<string, unknown> = {},
  more: Omit<NoteRowInput, "path" | "note"> = {},
): NoteRow {
  return makeNoteRow({ path, note: frontmatter, ...more });
}

/** Evaluate an expression at the fixed moment. */
export function run(source: string, row: NoteRow | null = null, options: EvaluateOptions = {}): BaseValue {
  return evaluateExpression(source, row, { now: NOW, ...options });
}

/** Evaluate an expression and give its display text. */
export function shown(source: string, row: NoteRow | null = null, options: EvaluateOptions = {}): string {
  return formatValue(run(source, row, options));
}

/** The message of an expression that is expected to fail. */
export function failure(source: string, row: NoteRow | null = null, options: EvaluateOptions = {}): string {
  const value = run(source, row, options);
  if (!isError(value)) throw new Error(`Expected an error from ${source}, got ${formatValue(value)}`);
  return value.message;
}

/** The example at the top of Obsidian's "Bases syntax" page, as it is written there. */
export const SYNTAX_EXAMPLE = `
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
formulas:
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  ppu: "(price / age).toFixed(2)"
properties:
  status:
    displayName: Status
  formula.formatted_price:
    displayName: "Price"
  file.ext:
    displayName: Extension
summaries:
  customAverage: 'values.mean().round(3)'
views:
  - type: table
    name: "My table"
    limit: 10
    groupBy:
      property: note.age
      direction: DESC
    filters:
      and:
        - 'status != "done"'
        - or:
            - "formula.ppu > 5"
            - "price > 2.1"
    order:
      - file.name
      - file.ext
      - note.age
      - formula.ppu
      - formula.formatted_price
    summaries:
      formula.ppu: Average
`;
