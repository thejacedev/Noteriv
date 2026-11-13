/**
 * The vault search panel's data: what the backend returns (`search.rs`) and
 * the small pieces of logic the panel needs around it.
 */

export type SearchSort =
  | "nameAsc"
  | "nameDesc"
  | "modifiedNew"
  | "modifiedOld"
  | "createdNew"
  | "createdOld";

export const SEARCH_SORTS: { value: SearchSort; label: string }[] = [
  { value: "nameAsc", label: "File name (A to Z)" },
  { value: "nameDesc", label: "File name (Z to A)" },
  { value: "modifiedNew", label: "Modified (new to old)" },
  { value: "modifiedOld", label: "Modified (old to new)" },
  { value: "createdNew", label: "Created (new to old)" },
  { value: "createdOld", label: "Created (old to new)" },
];

export interface SearchLine {
  /** 1-based. */
  line: number;
  text: string;
  /** Start and end of each match in `text`. */
  ranges: [number, number][];
}

export interface SearchFile {
  filePath: string;
  relativePath: string;
  name: string;
  mtime: number;
  ctime: number;
  lines: SearchLine[];
  /** Matching lines beyond the ones returned. */
  moreLines: number;
}

export interface VaultSearchResult {
  files: SearchFile[];
  /** Notes that matched, including any beyond the ones returned. */
  totalFiles: number;
  /** Set when the query could not be read. */
  error: string | null;
}

/** One row of the result list: a note, or one matching line of it. */
export type SearchRow =
  | { kind: "file"; file: SearchFile }
  | { kind: "line"; file: SearchFile; line: SearchLine };

/** The result as the rows the panel moves through with the arrow keys. */
export function searchRows(result: VaultSearchResult): SearchRow[] {
  const rows: SearchRow[] = [];
  for (const file of result.files) {
    rows.push({ kind: "file", file });
    for (const line of file.lines) rows.push({ kind: "line", file, line });
  }
  return rows;
}

/** A line cut into plain and matched pieces, for drawing the highlights. */
export function highlightPieces(text: string, ranges: [number, number][]): { text: string; match: boolean }[] {
  const pieces: { text: string; match: boolean }[] = [];
  let pos = 0;
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    // Overlapping matches are drawn once.
    const start = Math.max(from, pos);
    if (to <= start || start > text.length) continue;
    if (start > pos) pieces.push({ text: text.slice(pos, start), match: false });
    pieces.push({ text: text.slice(start, Math.min(to, text.length)), match: true });
    pos = Math.min(to, text.length);
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos), match: false });
  return pieces;
}

/** The result as text, for "Copy results". */
export function resultsAsText(result: VaultSearchResult): string {
  const out: string[] = [];
  for (const file of result.files) {
    out.push(file.relativePath.replace(/\.(md|markdown)$/i, ""));
    for (const line of file.lines) out.push(`  ${line.line}: ${line.text.trim()}`);
    if (file.moreLines > 0) out.push(`  ... and ${file.moreLines} more`);
  }
  return out.join("\n");
}

/** What can be typed in the search box, shown as a hint under it. */
export const SEARCH_OPERATORS: { example: string; meaning: string }[] = [
  { example: "meeting notes", meaning: "both words" },
  { example: '"exact phrase"', meaning: "the words together" },
  { example: "work OR home", meaning: "either" },
  { example: "-draft", meaning: "without it" },
  { example: "/reg(ex|ular)/", meaning: "a regular expression" },
  { example: "file:plan", meaning: "in the file name" },
  { example: "path:Projects/", meaning: "in the path" },
  { example: "tag:#work", meaning: "with the tag" },
  { example: "line:(mix flour)", meaning: "both on one line" },
  { example: "section:(dog cat)", meaning: "both under one heading" },
  { example: "task-todo:call", meaning: "in an open task" },
  { example: "task-done:call", meaning: "in a finished task" },
  { example: "[status:done]", meaning: "a property with a value" },
  { example: "match-case:Cat", meaning: "exactly as typed" },
];
