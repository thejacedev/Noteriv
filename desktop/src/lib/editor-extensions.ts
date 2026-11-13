/**
 * Editing behaviour shared by the live editor, the source editor and the
 * reading view, so the three stay alike.
 */

import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  crosshairCursor,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import {
  codeFolding,
  foldEffect,
  foldGutter,
  foldKeymap,
  foldService,
  foldable,
  foldedRanges,
  unfoldEffect,
} from "@codemirror/language";
import { isOutlineLine, listFoldEndBy } from "./fold-utils";

/**
 * Several cursors at once. Alt+click adds a cursor; Shift+Alt and a drag
 * selects a rectangle, one cursor per line. Ctrl+D (from the search keymap)
 * then selects the next occurrence of the selected word.
 */
export function multipleCursors(): Extension {
  return [
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey && !event.shiftKey),
    rectangularSelection({ eventFilter: (event) => event.altKey && event.shiftKey }),
    crosshairCursor(),
  ];
}

/** Folds a list item together with everything nested under it. */
const listFolding = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const end = listFoldEndBy(
    (offset) => (line.number + offset <= state.doc.lines ? state.doc.line(line.number + offset).text : undefined),
    0
  );
  if (end === null) return null;
  return { from: line.to, to: state.doc.line(line.number + end).to };
});

/** Whether exactly this range is folded. */
function isFolded(state: EditorState, from: number, to: number): boolean {
  let folded = false;
  foldedRanges(state).between(from, to, (a, b) => {
    if (a === from && b === to) folded = true;
  });
  return folded;
}

/** The arrow beside a heading or list item that can be folded. */
class FoldArrow extends WidgetType {
  constructor(readonly folded: boolean) {
    super();
  }

  eq(other: FoldArrow): boolean {
    return other.folded === this.folded;
  }

  toDOM(view: EditorView): HTMLElement {
    const arrow = document.createElement("span");
    arrow.className = `cm-fold-arrow ${this.folded ? "cm-fold-closed" : "cm-fold-open"}`;
    arrow.textContent = this.folded ? "▸" : "▾";
    arrow.title = this.folded ? "Unfold" : "Fold";
    arrow.setAttribute("role", "button");
    arrow.setAttribute("aria-label", arrow.title);
    arrow.addEventListener("mousedown", (event) => {
      // Keep the cursor where it is: this is a control, not text.
      event.preventDefault();
      event.stopPropagation();
      const line = view.state.doc.lineAt(view.posAtDOM(arrow));
      const range = foldable(view.state, line.from, line.to);
      if (!range) return;
      const effect = isFolded(view.state, range.from, range.to) ? unfoldEffect : foldEffect;
      view.dispatch({ effects: effect.of(range) });
    });
    return arrow;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildFoldArrows(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      const range = isOutlineLine(line.text) ? foldable(state, line.from, line.to) : null;
      if (range) {
        const widget = new FoldArrow(isFolded(state, range.from, range.to));
        builder.add(line.from, line.from, Decoration.widget({ widget, side: -1 }));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * Arrows drawn in the text column, just left of the line, for the editors
 * that have no margin column to put them in.
 */
const inlineFoldArrows = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFoldArrows(view);
    }

    update(update: ViewUpdate) {
      const foldChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
      );
      if (update.docChanged || update.viewportChanged || foldChanged) {
        this.decorations = buildFoldArrows(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/**
 * Fold every heading and list in the note. Only the outermost ones need
 * folding: what is inside them is hidden with them.
 */
export function foldAllHeadingsAndLists(view: EditorView): void {
  const { state } = view;
  const effects = [];
  let hiddenUpTo = -1;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (line.from <= hiddenUpTo || !isOutlineLine(line.text)) continue;
    const range = foldable(state, line.from, line.to);
    if (!range) continue;
    if (!isFolded(state, range.from, range.to)) effects.push(foldEffect.of(range));
    hiddenUpTo = range.to;
  }
  if (effects.length > 0) view.dispatch({ effects });
}

function gutterMarker(open: boolean): HTMLElement {
  const marker = document.createElement("span");
  marker.className = `cm-fold-marker ${open ? "cm-fold-open" : "cm-fold-closed"}`;
  marker.textContent = open ? "▾" : "▸";
  marker.title = open ? "Fold" : "Unfold";
  return marker;
}

const foldTheme = EditorView.baseTheme({
  // Takes no room, so the line's text stays where it was; the arrow hangs
  // in the space to the left of it.
  ".cm-fold-arrow": {
    display: "inline-block",
    width: "0",
    position: "relative",
    left: "-20px",
    fontSize: "13px",
    lineHeight: "1",
    verticalAlign: "middle",
    color: "var(--text-muted)",
    cursor: "pointer",
    userSelect: "none",
    transition: "opacity 0.12s",
  },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 2px", cursor: "pointer" },
  ".cm-fold-marker": { color: "var(--text-muted)", fontSize: "11px" },
  // An arrow for something that can be folded only shows while the pointer
  // is on its line; one for something already folded always shows.
  ".cm-fold-open": { opacity: "0" },
  ".cm-line:hover .cm-fold-open, .cm-gutters:hover .cm-fold-open": { opacity: "0.75" },
  ".cm-fold-arrow:hover, .cm-fold-marker:hover": { color: "var(--accent)" },
  ".cm-foldPlaceholder": {
    margin: "0 4px",
    padding: "0 6px",
    borderRadius: "4px",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
});

/**
 * Folding for headings (from the markdown language) and list items.
 * `arrows` says where the fold arrows go: beside the text, or in the margin
 * column of an editor that has one.
 */
export function folding(arrows: "inline" | "gutter" = "inline"): Extension {
  return [
    codeFolding({ placeholderText: "…" }),
    listFolding,
    arrows === "gutter" ? foldGutter({ markerDOM: gutterMarker }) : inlineFoldArrows,
    keymap.of(foldKeymap),
    foldTheme,
  ];
}
