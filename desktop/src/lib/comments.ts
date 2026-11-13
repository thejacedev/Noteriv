/**
 * Obsidian-style comments: `%%like this%%` inside a line, or a block between
 * two lines that hold only `%%`. They are for the writer: shown dimmed while
 * editing, and left out of the reading view, a published page and a PDF.
 */

export interface TextRange {
  from: number;
  to: number;
}

/** Inline code on a line, so a `%%` inside backticks is not read as a comment. */
function codeSpans(line: string): TextRange[] {
  const spans: TextRange[] = [];
  const regex = /(`+)[^`]*?\1/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    spans.push({ from: match.index, to: match.index + match[0].length });
  }
  return spans;
}

/** The `%%...%%` comments on one line, delimiters included. */
export function findInlineComments(line: string): TextRange[] {
  const code = codeSpans(line);
  const inCode = (pos: number) => code.some((s) => pos >= s.from && pos < s.to);
  const found: TextRange[] = [];
  let from = 0;
  while (from < line.length) {
    const open = line.indexOf("%%", from);
    if (open < 0) break;
    if (inCode(open)) {
      from = open + 2;
      continue;
    }
    const close = line.indexOf("%%", open + 2);
    if (close < 0) break;
    found.push({ from: open, to: close + 2 });
    from = close + 2;
  }
  return found;
}

/** Whether a line opens or closes a block comment. */
export function isCommentFence(line: string): boolean {
  return line.trim() === "%%";
}

/**
 * A note's text with its comments removed, for output that readers see.
 * Fenced code blocks are left exactly as they are.
 */
export function stripComments(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let inComment = false;
  for (const line of markdown.split("\n")) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!inComment && fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }
    if (isCommentFence(line)) {
      inComment = !inComment;
      continue;
    }
    if (inComment) continue;

    const comments = findInlineComments(line);
    if (comments.length === 0) {
      out.push(line);
      continue;
    }
    let kept = "";
    let pos = 0;
    for (const c of comments) {
      kept += line.slice(pos, c.from);
      pos = c.to;
    }
    kept += line.slice(pos);
    // A line that held nothing but a comment disappears with it.
    if (kept.trim() === "") continue;
    out.push(kept.replace(/[ \t]+$/, ""));
  }
  return out.join("\n");
}
