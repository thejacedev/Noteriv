import { Decoration } from "@codemirror/view";
import { Text } from "@codemirror/state";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext, InlineRenderer, InlineReplacement } from "../types";

/**
 * Block-level HTML tracker.
 * Handles multi-line HTML blocks like <div>...</div> and <details>...</details>.
 *
 * Call preScan() before processing to collect block content,
 * so multi-line blocks can be rendered as actual HTML.
 */
export class HtmlBlockTracker {
  inHtmlBlock = false;
  htmlBuffer = "";
  startLine = 0;
  openTag = "";

  private htmlBlockInfo = new Map<number, { endLine: number; html: string }>();
  private cursorLines: Set<number> = new Set();
  private doc: Text | null = null;
  private skipUntilLine = 0;

  // Block-level HTML tags we track
  private static BLOCK_TAGS = new Set([
    "div", "section", "article", "aside", "nav", "header", "footer",
    "main", "figure", "figcaption", "details", "summary",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "ul", "ol", "li", "dl", "dt", "dd",
    "blockquote", "pre", "p", "form", "fieldset",
    "iframe", "video", "audio", "canvas", "svg",
  ]);

  /** Pre-scan the document to collect multi-line HTML block content */
  preScan(doc: Text, cursorLines: Set<number>) {
    this.htmlBlockInfo.clear();
    this.doc = doc;
    this.cursorLines = cursorLines;

    let inBlock = false;
    let openTag = "";
    let openLine = 0;
    let buffer = "";

    for (let i = 1; i <= doc.lines; i++) {
      const text = doc.line(i).text;
      const trimmed = text.trim();

      if (inBlock) {
        buffer += "\n" + text;
        const closeRegex = new RegExp(`</${openTag}\\s*>`, "i");
        if (closeRegex.test(trimmed)) {
          inBlock = false;
          this.htmlBlockInfo.set(openLine, { endLine: i, html: buffer });
        }
        continue;
      }

      const openMatch = trimmed.match(/^<(\w+)[\s>]/);
      if (openMatch) {
        const tag = openMatch[1].toLowerCase();
        if (HtmlBlockTracker.BLOCK_TAGS.has(tag)) {
          const closeRegex = new RegExp(`</${tag}\\s*>`, "i");
          if (!closeRegex.test(trimmed)) {
            inBlock = true;
            openTag = tag;
            openLine = i;
            buffer = text;
          }
        }
      }
    }
  }

  process(ctx: BlockContext, isCursorLine: boolean): "start" | "inside" | "end" | null {
    const trimmed = ctx.text.trim();

    // Skip zone — block was replaced with a rendered widget on its first line
    if (this.skipUntilLine > 0) {
      if (ctx.lineNumber >= this.skipUntilLine) {
        this.skipUntilLine = 0;
      }
      return "inside";
    }

    // Line-by-line tracking for cursor-present blocks
    if (this.inHtmlBlock) {
      this.htmlBuffer += "\n" + ctx.text;
      const closeRegex = new RegExp(`</${this.openTag}\\s*>`, "i");
      if (closeRegex.test(trimmed)) {
        this.inHtmlBlock = false;
        if (!isCursorLine) {
          ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-html-block" }));
        }
        return "end";
      }
      if (!isCursorLine) {
        ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-html-block" }));
      }
      return "inside";
    }

    // Check for block-level HTML opening tag
    const openMatch = trimmed.match(/^<(\w+)[\s>]/);
    if (openMatch) {
      const tag = openMatch[1].toLowerCase();
      if (HtmlBlockTracker.BLOCK_TAGS.has(tag)) {
        // Single-line block (open + close on same line) — render directly
        const closeRegex = new RegExp(`</${tag}\\s*>`, "i");
        if (closeRegex.test(trimmed)) {
          if (!isCursorLine) {
            ctx.builder.add(
              ctx.line.from,
              ctx.line.to,
              Decoration.replace({
                widget: new RenderedMarkdownWidget(ctx.text, "md-html-inline-block"),
              })
            );
          }
          return "end";
        }

        // Multi-line block — check pre-scan info
        const info = this.htmlBlockInfo.get(ctx.lineNumber);
        if (info && this.doc) {
          // Check if any line in the block has the cursor
          let hasCursor = false;
          for (let l = ctx.lineNumber; l <= info.endLine; l++) {
            if (this.cursorLines.has(l)) { hasCursor = true; break; }
          }

          if (!hasCursor) {
            // Replace entire block with rendered HTML
            const endLineObj = this.doc.line(info.endLine);
            ctx.builder.add(
              ctx.line.from,
              endLineObj.to,
              Decoration.replace({
                widget: new RenderedMarkdownWidget(info.html, "md-html-inline-block"),
              })
            );
            this.skipUntilLine = info.endLine;
            return "start";
          }
        }

        // Cursor present — fall back to line-by-line raw display
        this.inHtmlBlock = true;
        this.openTag = tag;
        this.htmlBuffer = ctx.text;
        this.startLine = ctx.lineNumber;
        if (!isCursorLine) {
          ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-html-block" }));
        }
        return "start";
      }
    }

    return null;
  }
}

// Inline HTML: <kbd>, <mark>, <abbr>, <small>, <sub>, <sup>, <u>, <ins>, etc.
export const inlineHtmlRenderer: InlineRenderer = {
  name: "inline-html",
  priority: 3, // Very early — before most other inline renderers

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match inline HTML tags with content: <tag>...</tag> or <tag attr="val">...</tag>
    const regex = /<(kbd|mark|abbr|small|u|ins|del|cite|dfn|var|samp|q|time|span|b|i|em|strong)(\s[^>]*)?>(.+?)<\/\1>/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: match[0], // Pass through as-is — it's already HTML
        className: "md-inline-html",
      });
    }

    return results;
  },
};
