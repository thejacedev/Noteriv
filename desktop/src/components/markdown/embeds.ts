/**
 * CodeMirror ViewPlugin for note embeds (![[filename]]).
 *
 * Detects ![[filename]] patterns and replaces them with a widget decoration
 * that shows a read-only preview of the embedded note content, with the
 * file name as a header above the embed.
 */

import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, Facet } from "@codemirror/state";
import { parseWikiLink, resolveWikiLink } from "@/lib/wiki-link-utils";
import type { FileInfo } from "@/lib/wiki-link-utils";

// ── Facets for configuration ──

/** The list of all files in the vault, used for resolving embeds. */
export const embedFiles = Facet.define<FileInfo[], FileInfo[]>({
  combine: (values) => values[values.length - 1] ?? [],
});

/** Async function to read file content for embeds. */
export const embedReadFile = Facet.define<
  (path: string) => Promise<string | null>,
  (path: string) => Promise<string | null>
>({
  combine: (values) => values[values.length - 1] ?? (() => Promise.resolve(null)),
});

/** Callback invoked when the embed header is clicked. Opens the embedded file. */
export const embedClickHandler = Facet.define<
  (filePath: string) => void,
  (filePath: string) => void
>({
  combine: (values) => values[values.length - 1] ?? (() => {}),
});

// ── Cache for embedded content ──

const embedCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

async function getCachedContent(
  filePath: string,
  readFile: (path: string) => Promise<string | null>
): Promise<string | null> {
  const cached = embedCache.get(filePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  const content = await readFile(filePath);
  if (content !== null) {
    embedCache.set(filePath, { content, timestamp: Date.now() });
  }
  return content;
}

// ── Embed Widget ──

class EmbedWidget extends WidgetType {
  private loadedContent: string | null = null;
  private domElement: HTMLElement | null = null;

  constructor(
    readonly filename: string,
    readonly resolvedPath: string | null,
    readonly readFileFn: (path: string) => Promise<string | null>,
    readonly onClick: (filePath: string) => void
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "embed-container";

    // Header with filename
    const header = document.createElement("div");
    header.className = "embed-header";

    const icon = document.createElement("span");
    icon.className = "embed-icon";
    icon.textContent = "\u{1F4C4}";

    const title = document.createElement("span");
    title.className = "embed-title";
    title.textContent = this.filename;

    header.appendChild(icon);
    header.appendChild(title);

    if (this.resolvedPath) {
      header.classList.add("embed-header-clickable");
      header.title = `Open ${this.filename}`;
      header.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onClick(this.resolvedPath!);
      });
    }

    container.appendChild(header);

    // Content area
    const contentEl = document.createElement("div");
    contentEl.className = "embed-content";

    if (this.resolvedPath) {
      contentEl.textContent = "Loading...";
      contentEl.classList.add("embed-loading");

      // Load the file content asynchronously
      getCachedContent(this.resolvedPath, this.readFileFn).then((content) => {
        if (content !== null) {
          contentEl.classList.remove("embed-loading");
          contentEl.textContent = "";

          // Render as plain text preview (first ~30 lines)
          const lines = content.split("\n").slice(0, 30);
          const preview = lines.join("\n");
          const truncated = content.split("\n").length > 30;

          const pre = document.createElement("pre");
          pre.className = "embed-text";
          pre.textContent = preview;
          contentEl.appendChild(pre);

          if (truncated) {
            const more = document.createElement("div");
            more.className = "embed-truncated";
            more.textContent = `... ${content.split("\n").length - 30} more lines`;
            contentEl.appendChild(more);
          }
        } else {
          contentEl.classList.remove("embed-loading");
          contentEl.textContent = "Failed to load content";
          contentEl.classList.add("embed-error");
        }
      });
    } else {
      contentEl.textContent = `Note "${this.filename}" not found`;
      contentEl.classList.add("embed-not-found");
    }

    container.appendChild(contentEl);

    this.domElement = container;
    return container;
  }

  eq(other: EmbedWidget): boolean {
    return (
      this.filename === other.filename &&
      this.resolvedPath === other.resolvedPath
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── Build Decorations ──

function buildEmbedDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const allFiles = view.state.facet(embedFiles);
  const readFileFn = view.state.facet(embedReadFile);
  const onClick = view.state.facet(embedClickHandler);

  // Get cursor positions to avoid decorating lines being edited
  const cursorLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      cursorLines.add(i);
    }
  }

  const regex = /!\[\[([^\]]+)\]\]/g;

  for (let i = 1; i <= doc.lines; i++) {
    if (cursorLines.has(i)) continue;

    const line = doc.line(i);
    const text = line.text;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const innerText = match[1];
      const parsed = parseWikiLink(innerText);
      const resolved = resolveWikiLink(parsed.filename, allFiles);

      const from = line.from + match.index;
      const to = from + match[0].length;

      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new EmbedWidget(
            parsed.filename,
            resolved,
            readFileFn,
            onClick
          ),
          block: true,
        })
      );
    }
    regex.lastIndex = 0;
  }

  return builder.finish();
}

// ── View Plugin ──

export const embedPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildEmbedDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildEmbedDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/**
 * Create the full embed extension array.
 * Usage:
 *   embedExtension({
 *     files: allFiles,
 *     readFile: (path) => window.electronAPI.readFile(path),
 *     onEmbedClick: (filePath) => openFile(filePath),
 *   })
 */
export function embedExtension(config: {
  files: FileInfo[];
  readFile: (path: string) => Promise<string | null>;
  onEmbedClick: (filePath: string) => void;
}) {
  return [
    embedFiles.of(config.files),
    embedReadFile.of(config.readFile),
    embedClickHandler.of(config.onEmbedClick),
    embedPlugin,
  ];
}
