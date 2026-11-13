/**
 * Where a list item can be folded: from the item to the last line of
 * everything nested under it. Headings are folded by CodeMirror's markdown
 * support; lists are not, so this fills that in.
 */

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s/;

/**
 * Whether a line is one a reader folds: a heading or a list item. The
 * markdown language can also fold any paragraph that runs over several
 * lines, which is not something to offer an arrow for.
 */
export function isOutlineLine(line: string): boolean {
  return /^#{1,6}\s/.test(line) || LIST_ITEM.test(line);
}

/** Width of a line's indentation, with a tab counted as four columns. */
export function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/**
 * The index of the last line that folds away under the list item at
 * `index`, or null when the line is not a list item or has nothing nested
 * under it. Blank lines inside the nested part are included; trailing ones
 * are not.
 */
export function listFoldEnd(lines: string[], index: number): number | null {
  return listFoldEndBy((i) => lines[i], index);
}

/**
 * The same, reading lines through `lineAt` only as far as the nested part
 * runs. The editor asks about every line on screen, so it must not copy the
 * rest of the note to answer.
 */
export function listFoldEndBy(
  lineAt: (index: number) => string | undefined,
  index: number
): number | null {
  const line = lineAt(index);
  if (line === undefined || !LIST_ITEM.test(line)) return null;
  const indent = indentWidth(line);
  let last: number | null = null;
  for (let i = index + 1; ; i++) {
    const next = lineAt(i);
    if (next === undefined) break;
    if (next.trim() === "") continue;
    if (indentWidth(next) <= indent) break;
    last = i;
  }
  return last;
}
