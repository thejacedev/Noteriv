/**
 * Table of Contents utilities for auto-generating and updating TOC in markdown.
 */

export interface TocEntry {
  level: number;
  text: string;
  slug: string;
  line: number;
}

/** Extract headings from markdown content */
export function extractHeadings(content: string, minLevel: number = 1, maxLevel: number = 6): TocEntry[] {
  const lines = content.split("\n");
  const headings: TocEntry[] = [];
  const slugCounts = new Map<string, number>();
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Toggle code block state
    if (line.match(/^```/) || line.match(/^~~~/)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (!match) continue;

    const level = match[1].length;
    if (level < minLevel || level > maxLevel) continue;

    const text = match[2].trim();
    let slug = slugify(text);

    // Handle duplicate slugs
    const count = slugCounts.get(slug) || 0;
    if (count > 0) slug = `${slug}-${count}`;
    slugCounts.set(slug.replace(/-\d+$/, ""), count + 1);

    headings.push({ level, text, slug, line: i + 1 });
  }

  return headings;
}

/** Generate a slug from heading text */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Generate a table of contents as markdown */
export function generateTocMarkdown(headings: TocEntry[], ordered: boolean = false): string {
  if (headings.length === 0) return "";

  const minLevel = Math.min(...headings.map((h) => h.level));
  const lines: string[] = [];

  for (const h of headings) {
    const indent = "  ".repeat(h.level - minLevel);
    const bullet = ordered ? "1." : "-";
    lines.push(`${indent}${bullet} [${h.text}](#${h.slug})`);
  }

  return lines.join("\n");
}

/** Generate a full TOC block with markers for auto-updating */
export function generateTocBlock(content: string, minLevel: number = 1, maxLevel: number = 6): string {
  const headings = extractHeadings(content, minLevel, maxLevel);
  const toc = generateTocMarkdown(headings);
  return `<!-- toc -->\n${toc}\n<!-- /toc -->`;
}

/** Insert [TOC] placeholder at a position */
export function insertTocPlaceholder(): string {
  return "[TOC]";
}

/**
 * Update existing <!-- toc --> blocks in content.
 * Returns the updated content string.
 */
export function updateTocBlocks(content: string, minLevel: number = 1, maxLevel: number = 6): string {
  const tocRegex = /<!-- toc -->\n[\s\S]*?\n<!-- \/toc -->/g;

  if (!tocRegex.test(content)) return content;

  const headings = extractHeadings(content, minLevel, maxLevel);
  const toc = generateTocMarkdown(headings);
  const replacement = `<!-- toc -->\n${toc}\n<!-- /toc -->`;

  return content.replace(/<!-- toc -->\n[\s\S]*?\n<!-- \/toc -->/g, replacement);
}

/** Check if content has a TOC block that needs updating */
export function hasTocBlock(content: string): boolean {
  return /<!-- toc -->/.test(content);
}

/**
 * Render [TOC] placeholder into HTML for the preview.
 * Returns HTML string for the table of contents.
 */
export function renderTocHTML(content: string, minLevel: number = 1, maxLevel: number = 6): string {
  const headings = extractHeadings(content, minLevel, maxLevel);
  if (headings.length === 0) return "";

  const minH = Math.min(...headings.map((h) => h.level));
  const items = headings.map((h) => {
    const indent = (h.level - minH) * 16;
    return `<li style="margin-left:${indent}px"><a href="#${h.slug}" style="color:#89b4fa;text-decoration:none">${escapeHtml(h.text)}</a></li>`;
  }).join("\n");

  return `<nav class="toc-block" style="background:#313244;border:1px solid #45475a;border-radius:8px;padding:12px 16px;margin:8px 0">
<div style="font-size:11px;font-weight:600;color:#a6adc8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Table of Contents</div>
<ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.8">
${items}
</ul>
</nav>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
