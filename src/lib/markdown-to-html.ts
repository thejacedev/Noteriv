/**
 * Simple markdown-to-HTML converter.
 * Supports: headings, bold, italic, code (inline + blocks), links, images,
 * lists (ordered + unordered), blockquotes, horizontal rules, tables, task lists.
 */

/**
 * Convert a markdown string to HTML.
 */
export function markdownToHTML(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks (``` or ~~~)
    if (line.match(/^```/) || line.match(/^~~~/)) {
      const fence = line.match(/^(`{3,}|~{3,})/)?.[1] || "```";
      const lang = line.slice(fence.length).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing fence
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre><code${langAttr}>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^(\*{3,}|-{3,}|_{3,})\s*$/)) {
      html.push("<hr>");
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      html.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.match(/^>\s?/)) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^>\s?/)) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote><p>${inlineFormat(quoteLines.join("\n"))}</p></blockquote>`);
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].match(/^\|?\s*[-:]+[-|:\s]*$/)) {
      const tableHtml = parseTable(lines, i);
      if (tableHtml) {
        html.push(tableHtml.html);
        i = tableHtml.endIndex;
        continue;
      }
    }

    // Unordered list (-, *, +) including task lists
    if (line.match(/^(\s*)([-*+])\s/)) {
      const result = parseUnorderedList(lines, i);
      html.push(result.html);
      i = result.endIndex;
      continue;
    }

    // Ordered list
    if (line.match(/^(\s*)\d+\.\s/)) {
      const result = parseOrderedList(lines, i);
      html.push(result.html);
      i = result.endIndex;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^>\s?/) &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^~~~/) &&
      !lines[i].match(/^(\*{3,}|-{3,}|_{3,})\s*$/) &&
      !lines[i].match(/^(\s*)([-*+])\s/) &&
      !lines[i].match(/^(\s*)\d+\.\s/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html.push(`<p>${inlineFormat(paraLines.join("\n"))}</p>`);
    }
  }

  return html.join("\n");
}

/**
 * Apply inline formatting: bold, italic, strikethrough, code, links, images.
 */
function inlineFormat(text: string): string {
  let result = escapeHtml(text);

  // Inline code (must come first to prevent inner formatting)
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Images: ![alt](url)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1">'
  );

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // Bold + italic: ***text*** or ___text___
  result = result.replace(/\*{3}(.+?)\*{3}/g, "<strong><em>$1</em></strong>");
  result = result.replace(/_{3}(.+?)_{3}/g, "<strong><em>$1</em></strong>");

  // Bold: **text** or __text__
  result = result.replace(/\*{2}(.+?)\*{2}/g, "<strong>$1</strong>");
  result = result.replace(/_{2}(.+?)_{2}/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Line breaks
  result = result.replace(/\n/g, "<br>");

  return result;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse an unordered list (with support for task lists).
 */
function parseUnorderedList(
  lines: string[],
  start: number
): { html: string; endIndex: number } {
  const items: string[] = [];
  let i = start;

  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)([-*+])\s(.+)/);
    if (!match) break;

    const text = match[3];

    // Task list item
    const taskMatch = text.match(/^\[([ xX])\]\s*(.*)/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === "x";
      items.push(
        `<li><input type="checkbox" ${checked ? "checked" : ""} disabled> ${inlineFormat(taskMatch[2])}</li>`
      );
    } else {
      items.push(`<li>${inlineFormat(text)}</li>`);
    }
    i++;
  }

  return {
    html: `<ul>\n${items.join("\n")}\n</ul>`,
    endIndex: i,
  };
}

/**
 * Parse an ordered list.
 */
function parseOrderedList(
  lines: string[],
  start: number
): { html: string; endIndex: number } {
  const items: string[] = [];
  let i = start;

  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)\d+\.\s(.+)/);
    if (!match) break;

    items.push(`<li>${inlineFormat(match[2])}</li>`);
    i++;
  }

  return {
    html: `<ol>\n${items.join("\n")}\n</ol>`,
    endIndex: i,
  };
}

/**
 * Parse a markdown table.
 */
function parseTable(
  lines: string[],
  start: number
): { html: string; endIndex: number } | null {
  // Header row
  const headerLine = lines[start];
  const headers = parseTableRow(headerLine);
  if (headers.length === 0) return null;

  // Separator row
  const sepLine = lines[start + 1];
  if (!sepLine.match(/^\|?\s*[-:]+[-|:\s]*$/)) return null;

  // Parse alignment from separator
  const sepCells = sepLine
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

  const alignments = sepCells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return "left";
  });

  // Build header
  const thCells = headers
    .map((h, idx) => {
      const align = alignments[idx] || "left";
      return `<th style="text-align:${align}">${inlineFormat(h)}</th>`;
    })
    .join("");

  // Body rows
  const bodyRows: string[] = [];
  let i = start + 2;
  while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
    const cells = parseTableRow(lines[i]);
    const tdCells = cells
      .map((c, idx) => {
        const align = alignments[idx] || "left";
        return `<td style="text-align:${align}">${inlineFormat(c)}</td>`;
      })
      .join("");
    bodyRows.push(`<tr>${tdCells}</tr>`);
    i++;
  }

  const html = `<table>\n<thead><tr>${thCells}</tr></thead>\n<tbody>\n${bodyRows.join("\n")}\n</tbody>\n</table>`;
  return { html, endIndex: i };
}

/**
 * Parse a single table row into cell contents.
 */
function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
