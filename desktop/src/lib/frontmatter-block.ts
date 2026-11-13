/**
 * Where a note's properties block (its YAML frontmatter) begins and ends.
 * Kept apart from the code that reads the YAML, so the many places that only
 * need to step over the block do not pull a YAML parser in with them.
 */

/**
 * The frontmatter's YAML and the rest of the note, or null when there is
 * none. The block opens with a first line of `---` and closes at the next
 * line that is `---` or `...` and nothing else, so a value that ends in
 * three dots does not close it. `vault_index.rs` splits the same way.
 */
export function splitFrontmatter(content: string): { yaml: string; body: string; eol: string } | null {
  if (!content.startsWith("---")) return null;
  let pos: number;
  let eol = "\n";
  if (content.startsWith("\r\n", 3)) {
    pos = 5;
    eol = "\r\n";
  } else if (content[3] === "\n") {
    pos = 4;
  } else {
    return null;
  }
  const start = pos;
  while (pos < content.length) {
    const newline = content.indexOf("\n", pos);
    const lineEnd = newline === -1 ? content.length : newline;
    const line = content.slice(pos, lineEnd).replace(/\r$/, "");
    if (line === "---" || line === "...") {
      return {
        yaml: content.slice(start, pos).replace(/[\r\n]+$/, ""),
        body: newline === -1 ? "" : content.slice(newline + 1),
        eol,
      };
    }
    if (newline === -1) break;
    pos = newline + 1;
  }
  return null;
}

/** Whether the note opens with a frontmatter block, readable or not. */
export function hasProperties(content: string): boolean {
  return splitFrontmatter(content) !== null;
}

/** How many lines the frontmatter block takes, fences included. 0 when there is none. */
export function frontmatterLineCount(content: string): number {
  const parts = splitFrontmatter(content);
  if (!parts) return 0;
  const block = content.slice(0, content.length - parts.body.length);
  return block.replace(/\r?\n$/, "").split("\n").length;
}
