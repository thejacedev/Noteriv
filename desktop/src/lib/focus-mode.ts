/**
 * Focus / Typewriter mode for CodeMirror.
 * - Dims all lines except the active one
 * - Keeps the cursor vertically centered (typewriter scroll)
 */

import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, Facet } from "@codemirror/state";

/** Facet to enable/disable focus mode */
export const focusModeEnabled = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

/** Facet to enable/disable typewriter scroll */
export const typewriterEnabled = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

const dimDecoration = Decoration.line({ class: "cm-focus-dim" });

function buildFocusDecorations(view: EditorView): DecorationSet {
  if (!view.state.facet(focusModeEnabled)) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    if (i !== cursorLine) {
      const line = doc.line(i);
      builder.add(line.from, line.from, dimDecoration);
    }
  }

  return builder.finish();
}

const focusPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildFocusDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged) {
        this.decorations = buildFocusDecorations(update.view);

        // Typewriter scroll: center cursor vertically
        if (update.view.state.facet(typewriterEnabled) && update.selectionSet) {
          const head = update.state.selection.main.head;
          const coords = update.view.coordsAtPos(head);
          if (coords) {
            const editorRect = update.view.dom.getBoundingClientRect();
            const centerY = editorRect.top + editorRect.height / 2;
            const offset = coords.top - centerY;
            if (Math.abs(offset) > 10) {
              update.view.scrollDOM.scrollBy({ top: offset, behavior: "smooth" });
            }
          }
        }
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const focusTheme = EditorView.theme({
  ".cm-focus-dim": {
    opacity: "0.3",
    transition: "opacity 0.15s ease",
  },
  ".cm-focus-dim .cm-line": {
    opacity: "0.3",
  },
});

/** CodeMirror extension for focus/typewriter mode */
export function focusModeExtension() {
  return [focusPlugin, focusTheme];
}
