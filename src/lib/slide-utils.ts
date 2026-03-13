/**
 * Slide presentation utilities.
 * Parses markdown into slides separated by `---` (horizontal rules)
 * and converts slide markdown to presentable HTML.
 */

export interface Slide {
  content: string;   // markdown content
  html: string;      // rendered HTML
  notes: string;     // speaker notes
  index: number;
}

/**
 * Parse a full markdown document into an array of slides.
 * Slides are separated by `---` on its own line.
 * Speaker notes are extracted from text after `Note:` or `???` at the bottom of a slide.
 */
export function parseSlides(content: string): Slide[] {
  // Split by --- that appears on its own line (horizontal rule as slide separator).
  // We need to be careful: `---` inside fenced code blocks should NOT be treated as separators.
  const rawSlides = splitByHorizontalRules(content);

  return rawSlides.map((raw, index) => {
    const { body, notes } = extractNotes(raw.trim());
    return {
      content: body,
      html: slideToHTML(body),
      notes,
      index,
    };
  });
}

/**
 * Split markdown content by `---` horizontal rules, respecting fenced code blocks.
 */
function splitByHorizontalRules(content: string): string[] {
  const lines = content.split("\n");
  const slides: string[] = [];
  let currentSlide: string[] = [];
  let inCodeBlock = false;
  let codeFence = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks
    if (!inCodeBlock) {
      const fenceMatch = line.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        inCodeBlock = true;
        codeFence = fenceMatch[1];
        currentSlide.push(line);
        continue;
      }
    } else {
      if (line.startsWith(codeFence) && line.trim() === codeFence) {
        inCodeBlock = false;
        codeFence = "";
        currentSlide.push(line);
        continue;
      }
      currentSlide.push(line);
      continue;
    }

    // Check for horizontal rule separator (--- on its own line)
    if (line.match(/^-{3,}\s*$/) && !inCodeBlock) {
      slides.push(currentSlide.join("\n"));
      currentSlide = [];
      continue;
    }

    currentSlide.push(line);
  }

  // Push the last slide
  if (currentSlide.length > 0 || slides.length > 0) {
    slides.push(currentSlide.join("\n"));
  }

  // Filter out completely empty slides (but keep slides with whitespace content)
  if (slides.length === 0) {
    return [content];
  }

  return slides;
}

/**
 * Extract speaker notes from the bottom of a slide.
 * Notes begin with `Note:` or `???` on its own line.
 */
function extractNotes(slideContent: string): { body: string; notes: string } {
  const lines = slideContent.split("\n");
  let noteStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "Note:" || trimmed.startsWith("Note:") || trimmed === "???") {
      noteStartIndex = i;
      break;
    }
  }

  if (noteStartIndex === -1) {
    return { body: slideContent, notes: "" };
  }

  const body = lines.slice(0, noteStartIndex).join("\n").trimEnd();
  const notesLines = lines.slice(noteStartIndex);

  // Remove the "Note:" or "???" prefix from the first line
  let firstNoteLine = notesLines[0].trim();
  if (firstNoteLine.startsWith("Note:")) {
    firstNoteLine = firstNoteLine.slice(5).trim();
  } else if (firstNoteLine === "???") {
    firstNoteLine = "";
  }

  const notes = [firstNoteLine, ...notesLines.slice(1)]
    .join("\n")
    .trim();

  return { body, notes };
}

/**
 * Convert a single slide's markdown to HTML.
 * Supports headings, bold, italic, strikethrough, lists, code blocks,
 * inline code, links, images, blockquotes.
 */
export function slideToHTML(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.match(/^(`{3,}|~{3,})/)) {
      const fence = line.match(/^(`{3,}|~{3,})/)?.[1] || "```";
      const lang = line.slice(fence.length).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing fence
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre class="slide-code-block"><code${langClass}>${codeLines.join("\n")}</code></pre>`);
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
      html.push(`<blockquote>${inlineFormat(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (line.match(/^(\s*)([-*+])\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)([-*+])\s(.+)/)) {
        const match = lines[i].match(/^(\s*)([-*+])\s(.+)/);
        if (match) {
          const text = match[3];
          const taskMatch = text.match(/^\[([ xX])\]\s*(.*)/);
          if (taskMatch) {
            const checked = taskMatch[1].toLowerCase() === "x";
            items.push(
              `<li class="task-item"><span class="task-checkbox ${checked ? "checked" : ""}">${checked ? "&#10003;" : ""}</span> ${inlineFormat(taskMatch[2])}</li>`
            );
          } else {
            items.push(`<li>${inlineFormat(text)}</li>`);
          }
        }
        i++;
      }
      html.push(`<ul>${items.join("\n")}</ul>`);
      continue;
    }

    // Ordered list
    if (line.match(/^(\s*)\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)\d+\.\s(.+)/)) {
        const match = lines[i].match(/^(\s*)\d+\.\s(.+)/);
        if (match) {
          items.push(`<li>${inlineFormat(match[2])}</li>`);
        }
        i++;
      }
      html.push(`<ol>${items.join("\n")}</ol>`);
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|?\s*[-:]+[-|:\s]*$/)) {
      const tableResult = parseTable(lines, i);
      if (tableResult) {
        html.push(tableResult.html);
        i = tableResult.endIndex;
        continue;
      }
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^>\s?/) &&
      !lines[i].match(/^(`{3,}|~{3,})/) &&
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
 * Apply inline formatting.
 */
function inlineFormat(text: string): string {
  let result = escapeHtml(text);

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="slide-inline-code">$1</code>');

  // Images
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="slide-image">'
  );

  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="slide-link">$1</a>'
  );

  // Bold + italic
  result = result.replace(/\*{3}(.+?)\*{3}/g, "<strong><em>$1</em></strong>");
  result = result.replace(/_{3}(.+?)_{3}/g, "<strong><em>$1</em></strong>");

  // Bold
  result = result.replace(/\*{2}(.+?)\*{2}/g, "<strong>$1</strong>");
  result = result.replace(/_{2}(.+?)_{2}/g, "<strong>$1</strong>");

  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough
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
 * Parse a markdown table.
 */
function parseTable(
  lines: string[],
  start: number
): { html: string; endIndex: number } | null {
  const headerLine = lines[start];
  const headers = parseTableRow(headerLine);
  if (headers.length === 0) return null;

  const sepLine = lines[start + 1];
  if (!sepLine.match(/^\|?\s*[-:]+[-|:\s]*$/)) return null;

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

  const thCells = headers
    .map((h, idx) => {
      const align = alignments[idx] || "left";
      return `<th style="text-align:${align}">${inlineFormat(h)}</th>`;
    })
    .join("");

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

  return {
    html: `<table class="slide-table"><thead><tr>${thCells}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`,
    endIndex: i,
  };
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
