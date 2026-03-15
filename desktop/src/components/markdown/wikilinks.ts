/**
 * CodeMirror ViewPlugin for wiki link detection and rendering.
 *
 * Detects [[filename]] and [[filename|display text]] patterns in the editor
 * and renders them as styled clickable spans. On click, invokes a callback
 * to open the linked file.
 *
 * This is a standalone ViewPlugin (separate from the inline renderer in
 * renderers/wikilinks.ts which handles basic styling). This plugin adds
 * interactive click handling and file resolution.
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

/** Callback invoked when a wiki link is clicked. Receives the resolved file path. */
export const wikiLinkClickHandler = Facet.define<
  (filePath: string) => void,
  (filePath: string) => void
>({
  combine: (values) => values[values.length - 1] ?? (() => {}),
});

/** The list of all files in the vault, used for resolving wiki links. */
export const wikiLinkFiles = Facet.define<FileInfo[], FileInfo[]>({
  combine: (values) => values[values.length - 1] ?? [],
});

/** The vault base path. */
export const wikiLinkVaultPath = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? "",
});

// ── Wiki Link Widget ──

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly displayText: string,
    readonly targetFilename: string,
    readonly resolvedPath: string | null,
    readonly onClick: (filePath: string) => void
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "wl-link";
    span.textContent = this.displayText;
    span.setAttribute("data-target", this.targetFilename);

    if (this.resolvedPath) {
      span.classList.add("wl-resolved");
      span.title = this.targetFilename;
      span.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onClick(this.resolvedPath!);
      });
    } else {
      span.classList.add("wl-unresolved");
      span.title = `${this.targetFilename} (not found)`;
    }

    return span;
  }

  eq(other: WikiLinkWidget): boolean {
    return (
      this.displayText === other.displayText &&
      this.targetFilename === other.targetFilename &&
      this.resolvedPath === other.resolvedPath
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── Build Decorations ──

function buildWikiLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const allFiles = view.state.facet(wikiLinkFiles);
  const onClick = view.state.facet(wikiLinkClickHandler);

  // Get cursor positions to avoid decorating lines being edited
  const cursorLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      cursorLines.add(i);
    }
  }

  const regex = /(?<!!)\[\[([^\]]+)\]\]/g;

  for (let i = 1; i <= doc.lines; i++) {
    if (cursorLines.has(i)) continue;

    const line = doc.line(i);
    const text = line.text;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const innerText = match[1];
      const parsed = parseWikiLink(innerText);
      const display = parsed.display ?? parsed.filename;
      const resolved = resolveWikiLink(parsed.filename, allFiles);

      const from = line.from + match.index;
      const to = from + match[0].length;

      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new WikiLinkWidget(display, parsed.filename, resolved, onClick),
        })
      );
    }
    regex.lastIndex = 0;
  }

  return builder.finish();
}

// ── View Plugin ──

export const wikiLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildWikiLinkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildWikiLinkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/**
 * Create the full wiki link extension array.
 * Usage in the editor setup:
 *   wikiLinkExtension({
 *     files: allFiles,
 *     vaultPath: "/path/to/vault",
 *     onLinkClick: (filePath) => openFile(filePath),
 *   })
 */
export function wikiLinkExtension(config: {
  files: FileInfo[];
  vaultPath: string;
  onLinkClick: (filePath: string) => void;
}) {
  return [
    wikiLinkFiles.of(config.files),
    wikiLinkVaultPath.of(config.vaultPath),
    wikiLinkClickHandler.of(config.onLinkClick),
    wikiLinkPlugin,
  ];
}
