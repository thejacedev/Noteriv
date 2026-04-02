import {
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { renderAllLines } from "./plugin";

// ─── Mermaid lazy initialization ───────────────────────────────────────

let mermaidApi: typeof import("mermaid").default | null = null;
let mermaidInitialized = false;
let mermaidLoadPromise: Promise<void> | null = null;

async function ensureMermaid(): Promise<typeof import("mermaid").default> {
  if (mermaidApi && mermaidInitialized) return mermaidApi;

  if (!mermaidLoadPromise) {
    mermaidLoadPromise = (async () => {
      const mod = await import("mermaid");
      mermaidApi = mod.default;
      mermaidApi.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          darkMode: true,
          primaryColor: "#313244",
          primaryTextColor: "#cdd6f4",
          primaryBorderColor: "#89b4fa",
          lineColor: "#6c7086",
          secondaryColor: "#45475a",
          tertiaryColor: "#1e1e2e",
          background: "#1e1e2e",
          mainBkg: "#313244",
          nodeBorder: "#89b4fa",
          clusterBkg: "#181825",
          clusterBorder: "#45475a",
          titleColor: "#cdd6f4",
          edgeLabelBackground: "#181825",
          nodeTextColor: "#cdd6f4",
        },
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        securityLevel: "loose",
      });
      mermaidInitialized = true;
    })();
  }

  await mermaidLoadPromise;
  return mermaidApi!;
}

// ─── SVG cache ─────────────────────────────────────────────────────────

const svgCache = new Map<string, string>();
const pendingRenders = new Map<string, Promise<string>>();
let renderIdCounter = 0;

async function renderMermaidSvg(source: string): Promise<string> {
  const cached = svgCache.get(source);
  if (cached) return cached;

  // Deduplicate concurrent renders of the same source
  const pending = pendingRenders.get(source);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const mermaid = await ensureMermaid();
      const id = `mermaid-graph-${renderIdCounter++}`;
      const { svg } = await mermaid.render(id, source);
      svgCache.set(source, svg);
      return svg;
    } catch (e: any) {
      const errorMsg = e?.message || e?.toString() || "Unknown error";
      throw new Error(errorMsg);
    } finally {
      pendingRenders.delete(source);
    }
  })();

  pendingRenders.set(source, promise);
  return promise;
}

// ─── Widgets ───────────────────────────────────────────────────────────

/**
 * Widget for a rendered mermaid diagram.
 * Handles async rendering with loading/error states.
 */
class MermaidWidget extends WidgetType {
  private view: EditorView | null = null;

  constructor(readonly source: string) {
    super();
  }

  toDOM(view: EditorView) {
    this.view = view;
    const container = document.createElement("div");
    container.className = "mermaid-widget";

    // Header
    const header = document.createElement("div");
    header.className = "mermaid-header";
    header.innerHTML = `<span class="mermaid-label"><span class="mermaid-label-icon">&#9670;</span> Mermaid</span>`;
    container.appendChild(header);

    // Content area
    const inner = document.createElement("div");
    inner.className = "mermaid-widget-inner";
    container.appendChild(inner);

    // Check cache first for synchronous render
    const cached = svgCache.get(this.source);
    if (cached) {
      inner.innerHTML = cached;
    } else {
      // Show loading state
      inner.innerHTML =
        '<div class="mermaid-loading"><div class="mermaid-loading-spinner"></div>Rendering diagram...</div>';

      // Render asynchronously
      renderMermaidSvg(this.source)
        .then((svg) => {
          // Only update if the widget is still in the DOM
          if (container.isConnected) {
            inner.innerHTML = svg;
          }
        })
        .catch((err) => {
          if (container.isConnected) {
            inner.innerHTML = `
              <div class="mermaid-error">
                <div class="mermaid-error-title">&#9888; Diagram Error</div>
                <div class="mermaid-error-message">${escapeHtml(err.message)}</div>
              </div>`;
          }
        })
        .finally(() => {
          // Trigger a re-measure so CodeMirror adjusts for the new height
          if (this.view && container.isConnected) {
            this.view.requestMeasure();
          }
        });
    }

    return container;
  }

  eq(other: MermaidWidget) {
    return this.source === other.source;
  }

  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return 200;
  }

  destroy() {
    this.view = null;
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

// ─── Mermaid block detection ───────────────────────────────────────────

interface MermaidBlock {
  startLine: number;
  endLine: number;
  source: string;
  from: number; // doc offset of ```mermaid
  to: number;   // doc offset of closing ```
}

/**
 * Pre-scan document to find all ```mermaid ... ``` blocks.
 */
function findMermaidBlocks(state: EditorState): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const doc = state.doc;
  let inMermaid = false;
  let inOtherCode = false;
  let startLine = 0;
  let startFrom = 0;
  const contentLines: string[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const trimmed = line.text.trimStart();

    if (trimmed.startsWith("```")) {
      if (!inMermaid && !inOtherCode) {
        const lang = trimmed.slice(3).trim().toLowerCase();
        if (lang === "mermaid") {
          inMermaid = true;
          startLine = i;
          startFrom = line.from;
          contentLines.length = 0;
        } else {
          inOtherCode = true;
        }
      } else if (inMermaid) {
        inMermaid = false;
        blocks.push({
          startLine,
          endLine: i,
          source: contentLines.join("\n"),
          from: startFrom,
          to: line.to,
        });
      } else if (inOtherCode) {
        inOtherCode = false;
      }
      continue;
    }

    if (inMermaid) {
      contentLines.push(line.text);
    }
  }

  return blocks;
}

// ─── Decoration builder ────────────────────────────────────────────────

function buildMermaidDecorations(view: EditorView, blocks: MermaidBlock[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLines = getCursorLines(view.state);

  for (const block of blocks) {
    // Check if any cursor line intersects this block
    let cursorInBlock = false;
    for (let i = block.startLine; i <= block.endLine; i++) {
      if (cursorLines.has(i)) {
        cursorInBlock = true;
        break;
      }
    }

    if (!cursorInBlock && block.source.trim().length > 0) {
      // Bounds check — ensure positions are valid in the current document
      const docLen = view.state.doc.length;
      if (block.from >= 0 && block.to <= docLen && block.from < block.to) {
        builder.add(
          block.from,
          block.to,
          Decoration.replace({
            widget: new MermaidWidget(block.source),
            block: true,
          })
        );
      }
    }
  }

  return builder.finish();
}

// ─── Extension ─────────────────────────────────────────────────────────

const mermaidPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private cachedBlocks: MermaidBlock[] = [];
    constructor(view: EditorView) {
      this.cachedBlocks = findMermaidBlocks(view.state);
      this.decorations = buildMermaidDecorations(view, this.cachedBlocks);
      // Pre-load mermaid in background
      ensureMermaid();
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.cachedBlocks = findMermaidBlocks(update.view.state);
      }
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildMermaidDecorations(update.view, this.cachedBlocks);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/** CodeMirror extension for Mermaid diagram rendering. */
export function mermaidExtension() {
  return [mermaidPlugin];
}
