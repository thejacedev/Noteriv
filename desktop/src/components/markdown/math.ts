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

// ─── Widgets ───────────────────────────────────────────────────────────

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
  const blockRegions = findBlockMathRegions(view.state);

  for (const region of blockRegions) {
    let cursorInRegion = false;
    for (let lineNumber = region.startLine; lineNumber <= region.endLine; lineNumber++) {
      if (cursorLines.has(lineNumber)) {
        cursorInRegion = true;
        break;
      }
    }

    if (!cursorInRegion && region.content.trim().length > 0) {
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

  return builder.finish();
}

// ─── Extension ─────────────────────────────────────────────────────────

const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
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
