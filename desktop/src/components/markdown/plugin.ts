import {
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder, Facet } from "@codemirror/state";
import { RenderedMarkdownWidget } from "./widget";
import { getBlockRenderers, getInlineRenderers } from "./registry";
import { CodeBlockTracker } from "./renderers/code-blocks";
import { MathBlockTracker } from "./renderers/math";
import { HtmlBlockTracker } from "./renderers/html";
import { processTocLine } from "./renderers/toc";
import { extractHeadings } from "@/lib/toc-utils";
import type { BlockContext, InlineReplacement } from "./types";

/** When true, all lines render as non-cursor (pure view mode). */
export const renderAllLines = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

// Detect which lines the cursor is on
function getCursorLines(state: EditorState): Set<number> {
  if (state.facet(renderAllLines)) return new Set();
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i);
    }
  }
  return lines;
}

/**
 * Collect inline replacements from all registered inline renderers,
 * resolve overlaps, and add decorations to the builder.
 */
function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  lineStart: number,
  text: string
) {
  const renderers = getInlineRenderers();
  const replacements: InlineReplacement[] = [];

  for (const renderer of renderers) {
    const found = renderer.find(text, lineStart);
    for (const r of found) {
      // Skip if overlapping with an existing replacement
      const overlaps = replacements.some(
        (existing) =>
          (r.from >= existing.from && r.from < existing.to) ||
          (r.to > existing.from && r.to <= existing.to)
      );
      if (!overlaps) {
        replacements.push(r);
      }
    }
  }

  // Sort by position (required by RangeSetBuilder)
  replacements.sort((a, b) => a.from - b.from);

  for (const r of replacements) {
    builder.add(
      r.from,
      r.to,
      Decoration.replace({
        widget: new RenderedMarkdownWidget(r.html, r.className),
      })
    );
  }
}

/**
 * Get the inline-processable content from a block renderer's line.
 * Some block renderers (blockquotes, lists) have a prefix that should
 * be skipped when processing inline content.
 */
function getInlineContent(
  text: string,
  rendererName: string
): { offset: number; content: string } | null {
  // Import renderer modules that expose getContent
  // We check the renderer name and delegate
  const blockRenderers = getBlockRenderers();
  for (const r of blockRenderers) {
    if (r.name === rendererName && "getContent" in r) {
      return (r as any).getContent(text);
    }
  }
  return null;
}

/** Get the visible line range with a buffer for smooth scrolling. */
function getVisibleRange(view: EditorView, buffer: number = 50): { from: number; to: number } {
  const { from, to } = view.viewport;
  const doc = view.state.doc;
  const firstLine = doc.lineAt(from).number;
  const lastLine = doc.lineAt(to).number;
  return {
    from: Math.max(1, firstLine - buffer),
    to: Math.min(doc.lines, lastLine + buffer),
  };
}

function buildDecorations(
  view: EditorView,
  codeTracker: CodeBlockTracker,
  htmlTracker: HtmlBlockTracker,
  cachedHeadings: { level: number; text: string; line: number }[] | null
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLines = getCursorLines(view.state);
  const doc = view.state.doc;
  const blockRenderers = getBlockRenderers();
  const mathTracker = new MathBlockTracker();
  const visible = getVisibleRange(view);

  // Math tracker needs to know state up to the visible range
  // Pre-run math tracker from line 1 to visible.from to get correct state
  for (let i = 1; i < visible.from; i++) {
    const line = doc.line(i);
    mathTracker.process(
      { builder: new RangeSetBuilder<Decoration>(), line, text: line.text, lineNumber: i },
      false
    );
  }

  for (let i = visible.from; i <= visible.to; i++) {
    const line = doc.line(i);
    const text = line.text;

    // Code blocks are special — they span multiple lines
    const codeResult = codeTracker.process(
      { builder, line, text, lineNumber: i },
      cursorLines.has(i),
      cursorLines
    );
    if (codeResult) continue;

    // Math blocks ($$...$$) — also span multiple lines
    const mathResult = mathTracker.process(
      { builder, line, text, lineNumber: i },
      cursorLines.has(i)
    );
    if (mathResult) continue;

    // HTML blocks (<div>...</div>, <details>...</details>, etc.)
    const htmlResult = htmlTracker.process(
      { builder, line, text, lineNumber: i },
      cursorLines.has(i)
    );
    if (htmlResult) continue;

    // [TOC] block — use cached headings
    if (text.trim() === "[TOC]") {
      if (processTocLine(builder, line, text, cursorLines.has(i), cachedHeadings)) continue;
    }

    // Skip cursor lines — show raw markdown
    if (cursorLines.has(i)) continue;

    // Skip empty lines
    if (text.trim() === "") continue;

    // Try block renderers
    const ctx: BlockContext = { builder, line, text, lineNumber: i };
    let handled = false;
    let handlerName = "";

    for (const renderer of blockRenderers) {
      if (renderer.process(ctx)) {
        handled = true;
        handlerName = renderer.name;
        break;
      }
    }

    if (handled) {
      // Some block renderers have content that needs inline processing
      // (e.g. blockquotes, lists have text after their prefix)
      const inlineContent = getInlineContent(text, handlerName);
      if (inlineContent) {
        addInlineDecorations(
          builder,
          line.from + inlineContent.offset,
          inlineContent.content
        );
      }
      continue;
    }

    // Regular paragraph — apply inline formatting to full line
    addInlineDecorations(builder, line.from, text);
  }

  return builder.finish();
}

/** CodeMirror ViewPlugin that applies live markdown rendering. */
export const liveMarkdownPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private codeTracker: CodeBlockTracker;
    private htmlTracker: HtmlBlockTracker;
    private cachedHeadings: { level: number; text: string; line: number }[] | null = null;
    private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
      this.codeTracker = new CodeBlockTracker();
      this.htmlTracker = new HtmlBlockTracker();
      this.runPreScans(view);
      this.decorations = buildDecorations(view, this.codeTracker, this.htmlTracker, this.cachedHeadings);
    }

    private runPreScans(view: EditorView) {
      const doc = view.state.doc;
      const cursorLines = getCursorLines(view.state);
      this.codeTracker = new CodeBlockTracker();
      this.codeTracker.preScan(doc);
      this.htmlTracker = new HtmlBlockTracker();
      this.htmlTracker.preScan(doc, cursorLines);
      // Extract headings once per doc change so any [TOC] widgets have them.
      this.cachedHeadings = extractHeadings(doc.toString()).map((h) => ({
        level: h.level,
        text: h.text,
        line: h.line,
      }));
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        // Document changed — re-scan block structure and rebuild
        this.runPreScans(update.view);
        this.decorations = buildDecorations(update.view, this.codeTracker, this.htmlTracker, this.cachedHeadings);
      } else if (update.selectionSet || update.viewportChanged) {
        // Cursor moved or scrolled — rebuild viewport decorations only (cheap, no pre-scan)
        this.decorations = buildDecorations(update.view, this.codeTracker, this.htmlTracker, this.cachedHeadings);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
