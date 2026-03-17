/**
 * Board utilities for parsing/serializing board markdown.
 *
 * Format:
 *   ## Column Name
 *   - [ ] Task text #tag @due(2024-03-15)
 *   - [x] Completed task
 */

export interface BoardCard {
  id: string;
  text: string;
  completed: boolean;
  tags: string[];
  dueDate: string | null;
}

export interface BoardColumn {
  id: string;
  title: string;
  cards: BoardCard[];
}

export interface BoardData {
  columns: BoardColumn[];
  frontmatter: string;
}

let nextId = 1;
function genId(): string {
  return `card-${Date.now()}-${nextId++}`;
}

/** Check if content represents a board */
export function isBoardContent(content: string): boolean {
  // Check frontmatter for board: true
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
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

  const lines = content.split("\n");
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

  for (; i < lines.length; i++) {
    const line = lines[i];

    // Column header (## Heading)
    const colMatch = line.match(/^##\s+(.+)/);
    if (colMatch) {
      currentColumn = {
        id: `col-${Date.now()}-${columns.length}`,
        title: colMatch[1].trim(),
        cards: [],
      };
      columns.push(currentColumn);
      continue;
    }

    // Card (- [ ] or - [x])
    if (currentColumn) {
      const cardMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)/);
      if (cardMatch) {
        const completed = cardMatch[1].toLowerCase() === "x";
        const rawText = cardMatch[2];

        // Extract tags
        const tags: string[] = [];
        const tagMatches = rawText.matchAll(/#([\w-]+)/g);
        for (const m of tagMatches) tags.push(m[1]);

        // Extract due date
        const dueMatch = rawText.match(/@due\((\d{4}-\d{2}-\d{2})\)/);
        const dueDate = dueMatch ? dueMatch[1] : null;

        const text = rawText
          .replace(/@due\([^)]+\)/g, "")
          .replace(/#[\w-]+/g, "")
          .trim();

        currentColumn.cards.push({
          id: genId(),
          text,
          completed,
          tags,
          dueDate,
        });
      }
    }
  }

  return { columns, frontmatter };
}

/** Serialize board back to markdown */
export function serializeBoard(board: BoardData): string {
  const parts: string[] = [];

  if (board.frontmatter) {
    parts.push(board.frontmatter);
    parts.push("");
  }

  for (const col of board.columns) {
    parts.push(`## ${col.title}`);
    parts.push("");
    for (const card of col.cards) {
      const check = card.completed ? "x" : " ";
      let line = `- [${check}] ${card.text}`;
      if (card.tags.length > 0) {
        line += " " + card.tags.map((t) => `#${t}`).join(" ");
      }
      if (card.dueDate) {
        line += ` @due(${card.dueDate})`;
      }
      parts.push(line);
    }
    parts.push("");
  }

  return parts.join("\n");
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
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return {
      ...col,
      cards: [...col.cards, { id: genId(), text, completed: false, tags: [], dueDate: null }],
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
  const newColumns = board.columns.map((col) => {
    if (col.id !== colId) return col;
    return {
      ...col,
      cards: col.cards.map((c) => (c.id === cardId ? { ...c, text } : c)),
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
