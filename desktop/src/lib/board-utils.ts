/**
 * Board utilities for parsing/serializing board markdown.
 *
 * Format:
 *   ## Column Name
 *   - [ ] Task text #tag @estimate(90) @due(2024-03-15)
 *   - [x] Completed task
 *
 * The board rewrites the whole file on every change, so whatever it reads it
 * must be able to write back. Lines it does not show (a title, a note or
 * sub-items under a card) are kept and written back where they were.
 */

/** An annotation on a card other than the due date: @key(value). */
export interface BoardMeta {
  key: string;
  value: string;
}

export interface BoardCard {
  id: string;
  text: string;
  completed: boolean;
  tags: string[];
  dueDate: string | null;
  /** Every @key(value) on the card except the due date, in the order written. */
  meta?: BoardMeta[];
  /** Lines under the card that the board does not show: sub-items, notes. */
  extra?: string[];
}

export interface BoardColumn {
  id: string;
  title: string;
  cards: BoardCard[];
  /** Lines between the heading and the first card. */
  extra?: string[];
}

export interface BoardData {
  columns: BoardColumn[];
  frontmatter: string;
  /** Lines between the front matter and the first column. */
  preamble?: string[];
  /** The line ending the file came with. "\n" when it is not set. */
  eol?: string;
}

// What the board takes out of a card's text: tags, the due date and other
// annotations.
//
// A tag opens the text or follows a space, so the # in a web address or in
// [[Note#Heading]] is not one. It takes letters of any language with their
// marks and joiners, digits, "_", "-" and "/", so #réunion, #हिंदी and
// #work/urgent are each one tag.
//
// A due date is @due(YYYY-MM-DD) and nothing else. Anything else, such as
// @due(friday), is left in the card text.
//
// Any other @key(value) is an annotation: a key that starts with a letter,
// then a value in brackets that holds no bracket of its own. Like a tag it
// opens the text or follows a space, so "me@work(home)" is not one.
//
// One pattern for all three, so that what is taken out of the text is
// exactly what was read: a second pass over text the first pass had changed
// could remove something that was never read.
const CARD_TOKEN =
  /(?<=^|\s)#([\p{L}\p{M}\p{N}_\/\u200c\u200d-]+)|@due\((\d{4}-\d{2}-\d{2})\)|(?<=^|\s)@(\p{L}[\p{L}\p{M}\p{N}_-]*)\(([^()]*)\)/gu;

interface CardParts {
  text: string;
  tags: string[];
  dueDate: string | null;
  meta: BoardMeta[];
}

/**
 * Split what follows the checkbox into the text, the tags, the due date and
 * the other annotations. The first date counts and a later one is dropped.
 */
function readCardText(rawText: string): CardParts {
  const tags: string[] = [];
  const dates: string[] = [];
  const meta: BoardMeta[] = [];
  const text = rawText
    .replace(
      CARD_TOKEN,
      (
        match: string,
        tag: string | undefined,
        due: string | undefined,
        key: string | undefined,
        value: string | undefined
      ) => {
        if (tag !== undefined) tags.push(tag);
        else if (due !== undefined) dates.push(due);
        // A due date that is not a date is not an annotation either. It
        // stays in the text, where it shows that it was not understood.
        else if (key !== undefined && key.toLowerCase() === "due") return match;
        else if (key !== undefined) meta.push({ key, value: (value ?? "").trim() });
        return "";
      }
    )
    .trim();
  return { text, tags, dueDate: dates[0] ?? null, meta };
}

/**
 * The annotations of a card after its text was edited. An annotation typed
 * into the text takes the place of the ones the card had under that key, where
 * the first of them stood; a new key goes to the end.
 */
function mergeMeta(existing: BoardMeta[], typed: BoardMeta[]): BoardMeta[] {
  if (typed.length === 0) return existing;
  const typedFor = (key: string) => typed.filter((m) => m.key === key);
  const placed = new Set<string>();
  const merged: BoardMeta[] = [];
  for (const m of existing) {
    if (typedFor(m.key).length === 0) {
      merged.push(m);
    } else if (!placed.has(m.key)) {
      merged.push(...typedFor(m.key));
      placed.add(m.key);
    }
  }
  for (const m of typed) {
    if (!placed.has(m.key)) {
      merged.push(...typedFor(m.key));
      placed.add(m.key);
    }
  }
  return merged;
}

/** How an annotation is written in the file. */
export function metaSource(meta: BoardMeta): string {
  return `@${meta.key}(${meta.value})`;
}

// The line that opens or closes a fenced code block.
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Take the empty lines off the end of a run of lines, and off the start too
 * unless `keepLeading`. The writer puts the empty lines around a block back.
 */
function trimBlankLines(lines: string[], keepLeading = false): string[] {
  let start = 0;
  let end = lines.length;
  while (end > start && lines[end - 1].trim() === "") end--;
  if (!keepLeading) {
    while (start < end && lines[start].trim() === "") start++;
  }
  return lines.slice(start, end);
}

let nextId = 1;
function genId(): string {
  return `card-${Date.now()}-${nextId++}`;
}

/** Check if content represents a board */
export function isBoardContent(content: string): boolean {
  // Check frontmatter for board: true
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    if (/^board:\s*true/m.test(fmMatch[1])) return true;
  }
  return false;
}

/** Check if a file path is a kanban file */
export function isBoardFile(path: string): boolean {
  return path.endsWith(".board.md");
}

/** Parse markdown into board structure */
export function parseBoard(content: string): BoardData {
  const columns: BoardColumn[] = [];
  let frontmatter = "";

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  let i = 0;

  // Extract frontmatter
  if (lines[0] === "---") {
    i = 1;
    const fmLines: string[] = ["---"];
    while (i < lines.length && lines[i] !== "---") {
      fmLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) {
      fmLines.push("---");
      i++;
    }
    frontmatter = fmLines.join("\n");
  }

  let currentColumn: BoardColumn | null = null;
  // Lines that are neither a column nor a card. They belong to the card
  // above them, or to the column when it has no card yet, or to the top of
  // the file when there is no column yet.
  let preamble: string[] = [];
  let pending: string[] = preamble;
  // The marker of the code block the loop is inside. A "## " or "- [ ]" line
  // in a code block is code.
  let fence: string | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(FENCE);
    if (fence) {
      pending.push(line);
      const closes =
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        line.trim() === fenceMatch[1];
      if (closes) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      pending.push(line);
      continue;
    }

    // Column header (## Heading)
    const colMatch = line.match(/^##\s+(.+)/);
    if (colMatch) {
      currentColumn = {
        id: `col-${Date.now()}-${columns.length}`,
        title: colMatch[1].trim(),
        cards: [],
        extra: [],
      };
      columns.push(currentColumn);
      pending = currentColumn.extra!;
      continue;
    }

    // Card (- [ ] or - [x])
    const cardMatch = currentColumn ? line.match(/^-\s*\[([ xX])\]\s*(.*)/) : null;
    if (currentColumn && cardMatch) {
      const completed = cardMatch[1].toLowerCase() === "x";
      const rawText = cardMatch[2];

      const { text, tags, dueDate, meta } = readCardText(rawText);

      const card: BoardCard = { id: genId(), text, completed, tags, dueDate, meta, extra: [] };
      currentColumn.cards.push(card);
      pending = card.extra!;
      continue;
    }

    pending.push(line);
  }

  preamble = trimBlankLines(preamble);
  for (const col of columns) {
    col.extra = trimBlankLines(col.extra ?? []);
    // An empty line between a card and a paragraph under it stays, or the
    // paragraph would read as part of the card.
    for (const card of col.cards) card.extra = trimBlankLines(card.extra ?? [], true);
  }

  return { columns, frontmatter, preamble, eol };
}

/** Serialize board back to markdown */
export function serializeBoard(board: BoardData): string {
  const parts: string[] = [];

  if (board.frontmatter) {
    parts.push(board.frontmatter);
    parts.push("");
  }

  if (board.preamble && board.preamble.length > 0) {
    parts.push(...board.preamble);
    parts.push("");
  }

  for (const col of board.columns) {
    parts.push(`## ${col.title}`);
    parts.push("");
    if (col.extra && col.extra.length > 0) {
      parts.push(...col.extra);
      if (col.cards.length > 0) parts.push("");
    }
    for (const card of col.cards) {
      const check = card.completed ? "x" : " ";
      let line = `- [${check}] ${card.text}`;
      if (card.tags.length > 0) {
        line += " " + card.tags.map((t) => `#${t}`).join(" ");
      }
      if (card.meta && card.meta.length > 0) {
        line += " " + card.meta.map(metaSource).join(" ");
      }
      if (card.dueDate) {
        line += ` @due(${card.dueDate})`;
      }
      parts.push(line);
      if (card.extra && card.extra.length > 0) parts.push(...card.extra);
    }
    parts.push("");
  }

  const text = parts.join("\n");
  return board.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

/**
 * How many lines of text a card holds that the board does not show, or a
 * column with its cards. Deleting the card or the column deletes them.
 */
export function hiddenLineCount(item: BoardCard | BoardColumn): number {
  const own = (item.extra ?? []).filter((line) => line.trim() !== "").length;
  if ("cards" in item) return own + item.cards.reduce((n, card) => n + hiddenLineCount(card), 0);
  return own;
}

/** Move a card from one column to another */
export function moveCard(
  board: BoardData,
  cardId: string,
  fromColId: string,
  toColId: string,
  toIndex: number
): BoardData {
  const newColumns = board.columns.map((col) => ({ ...col, cards: [...col.cards] }));

  const fromCol = newColumns.find((c) => c.id === fromColId);
  const toCol = newColumns.find((c) => c.id === toColId);
  if (!fromCol || !toCol) return board;

  const cardIdx = fromCol.cards.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return board;

  const [card] = fromCol.cards.splice(cardIdx, 1);
  toCol.cards.splice(toIndex, 0, card);

  return { ...board, columns: newColumns };
}

/** Reorder a card within a column */
export function reorderCard(
  board: BoardData,
  colId: string,
  fromIndex: number,
  toIndex: number
): BoardData {
  const newColumns = board.columns.map((col) => ({ ...col, cards: [...col.cards] }));
  const col = newColumns.find((c) => c.id === colId);
  if (!col) return board;

  const [card] = col.cards.splice(fromIndex, 1);
  col.cards.splice(toIndex, 0, card);

  return { ...board, columns: newColumns };
}

/** Add a new card to a column */
export function addCard(board: BoardData, colId: string, text: string): BoardData {
  // Tags, a due date and annotations typed with the text are the card's from
  // the start.
  const typed = readCardText(text);
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return {
      ...col,
      cards: [...col.cards, { id: genId(), ...typed, completed: false }],
    };
  });
  return { ...board, columns: newColumns };
}

/** Remove a card */
export function removeCard(board: BoardData, colId: string, cardId: string): BoardData {
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
  });
  return { ...board, columns: newColumns };
}

/** Add a new column */
export function addColumn(board: BoardData, title: string): BoardData {
  return {
    ...board,
    columns: [...board.columns, { id: `col-${Date.now()}`, title, cards: [] }],
  };
}

/** Remove a column */
export function removeColumn(board: BoardData, colId: string): BoardData {
  return { ...board, columns: board.columns.filter((c) => c.id !== colId) };
}

/** Update a card's text */
export function updateCard(board: BoardData, colId: string, cardId: string, text: string): BoardData {
  // The text box holds the card's text without its tags, date and
  // annotations. A tag typed into it is added to the card's tags, and a date
  // or an annotation typed into it takes the place of the one the card had.
  // Without this the file would hold both until the next change to the board.
  const typed = readCardText(text);
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return {
      ...col,
      cards: col.cards.map((c) =>
        c.id === cardId
          ? {
              ...c,
              text: typed.text,
              tags: [...typed.tags, ...c.tags.filter((t) => !typed.tags.includes(t))],
              dueDate: typed.dueDate ?? c.dueDate,
              meta: mergeMeta(c.meta ?? [], typed.meta),
            }
          : c
      ),
    };
  });
  return { ...board, columns: newColumns };
}

/** Toggle a card's completed state */
export function toggleCard(board: BoardData, colId: string, cardId: string): BoardData {
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return {
      ...col,
      cards: col.cards.map((c) => (c.id === cardId ? { ...c, completed: !c.completed } : c)),
    };
  });
  return { ...board, columns: newColumns };
}

/** Create new board markdown content */
export function createBoardContent(): string {
  return `---
board: true
---

## To Do

- [ ] New task

## In Progress

## Done

`;
}
