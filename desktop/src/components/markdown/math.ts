import {
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import katex from "katex";
import { renderAllLines } from "./plugin";

// ─── KaTeX CSS injection ───────────────────────────────────────────────

let katexCssInjected = false;

function injectKatexCss() {
  if (katexCssInjected) return;
  katexCssInjected = true;

  // KaTeX requires its CSS for proper rendering.
  // We inject it dynamically so consumers don't need to configure loaders.
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  } catch {
    // SSR or headless — ignore
  }
}

// ─── Widgets ───────────────────────────────────────────────────────────

/** Widget that renders inline math ($...$) via KaTeX. */
class InlineMathWidget extends WidgetType {
  constructor(readonly latex: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "math-inline-widget";
    try {
      span.innerHTML = katex.renderToString(this.latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      span.innerHTML = `<span class="math-error"><span class="math-error-indicator">!</span>${escapeHtml(this.latex)}</span>`;
    }
    return span;
  }

  eq(other: InlineMathWidget) {
    return this.latex === other.latex;
  }

  ignoreEvent() {
    return false;
  }
}

/** Widget that renders block math ($$...$$) via KaTeX. */
class BlockMathWidget extends WidgetType {
  constructor(readonly latex: string) {
    super();
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "math-block-widget";
    try {
      div.innerHTML = katex.renderToString(this.latex, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      div.innerHTML = `<span class="math-error"><span class="math-error-indicator">!</span>${escapeHtml(this.latex)}</span>`;
    }
    return div;
  }

  eq(other: BlockMathWidget) {
    return this.latex === other.latex;
  }

  ignoreEvent() {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Detect which lines the cursor occupies. */
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

// ─── Decoration builder ────────────────────────────────────────────────

interface BlockMathRegion {
  startLine: number;
  endLine: number;
  content: string;
  from: number; // doc offset of $$
  to: number;   // doc offset of closing $$ end
}

/**
 * Pre-scan to find all $$ ... $$ block math regions,
 * similar to how CodeBlockTracker.preScan works.
 */
function findBlockMathRegions(state: EditorState): BlockMathRegion[] {
  const regions: BlockMathRegion[] = [];
  const doc = state.doc;
  let inBlock = false;
  let startLine = 0;
  let startFrom = 0;
  const contentLines: string[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const trimmed = line.text.trim();

    if (trimmed === "$$") {
      if (!inBlock) {
        inBlock = true;
        startLine = i;
        startFrom = line.from;
        contentLines.length = 0;
      } else {
        inBlock = false;
        regions.push({
          startLine,
          endLine: i,
          content: contentLines.join("\n"),
          from: startFrom,
          to: line.to,
        });
      }
      continue;
    }

    if (inBlock) {
      contentLines.push(line.text);
    }
  }

  return regions;
}

function buildMathDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLines = getCursorLines(view.state);
  const doc = view.state.doc;
  const blockRegions = findBlockMathRegions(view.state);

  // Build a set of line numbers that belong to block math regions
  const blockMathLines = new Set<number>();
  for (const region of blockRegions) {
    for (let i = region.startLine; i <= region.endLine; i++) {
      blockMathLines.add(i);
    }
  }

  // Process block math regions
  for (const region of blockRegions) {
    // Check if any cursor line intersects this region
    let cursorInRegion = false;
    for (let i = region.startLine; i <= region.endLine; i++) {
      if (cursorLines.has(i)) {
        cursorInRegion = true;
        break;
      }
    }

    if (!cursorInRegion && region.content.trim().length > 0) {
      // Replace the entire block ($$ ... $$) with rendered math
      builder.add(
        region.from,
        region.to,
        Decoration.replace({
          widget: new BlockMathWidget(region.content),
          block: true,
        })
      );
    }
  }

  // Process inline math on non-block-math lines
  for (let i = 1; i <= doc.lines; i++) {
    // Skip lines that are part of block math regions
    if (blockMathLines.has(i)) continue;

    // Skip cursor lines
    if (cursorLines.has(i)) continue;

    const line = doc.line(i);
    const text = line.text;

    // Skip empty lines
    if (text.trim() === "") continue;

    // Find inline math: $...$ (not $$)
    const regex = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = line.from + match.index + match[0].length;
      const latex = match[1];

      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new InlineMathWidget(latex),
        })
      );
    }
  }

  return builder.finish();
}

// ─── Extension ─────────────────────────────────────────────────────────

const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      injectKatexCss();
      this.decorations = buildMathDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildMathDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/** CodeMirror extension for LaTeX math rendering. */
export function mathExtension() {
  return [mathPlugin];
}
