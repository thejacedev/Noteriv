/**
 * CodeMirror ViewPlugin that highlights #tags in the editor.
 *
 * Tags are styled with the accent color and are clickable.
 * On click, the `onTagClick` callback is invoked via a Facet.
 * Uses Decoration.mark for styling (non-replacing — the text stays visible).
 */

import {
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder, Facet } from "@codemirror/state";

/**
 * Facet to provide a tag-click callback.
 * Consumers configure it via `tagClickCallback.of((tag) => { ... })`.
 */
export const tagClickCallback = Facet.define<
  ((tag: string) => void) | null,
  ((tag: string) => void) | null
>({
  combine: (values) => values.find((v) => v != null) ?? null,
});

// Tag regex: matches #tag, #nested/tag, #CamelCase but not # alone or #123
const TAG_REGEX = /(?<=\s|^)#([a-zA-Z][\w/\-]*)/g;

// Fenced code block detection
const CODE_FENCE_REGEX = /^(`{3,}|~{3,})/;

// Inline code detection
const INLINE_CODE_REGEX = /`[^`]*`/g;

// Heading detection
const HEADING_REGEX = /^#{1,6}\s/;

// The CSS class applied via Decoration.mark
const tagMark = Decoration.mark({ class: "cm-tag-highlight" });

function buildTagDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  let inCodeBlock = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // Toggle fenced code block state
    if (CODE_FENCE_REGEX.test(text.trimStart())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip heading lines
    if (HEADING_REGEX.test(text.trimStart())) continue;

    // Build a mask for inline code spans so we skip tags inside them
    const codeMask = new Set<number>();
    INLINE_CODE_REGEX.lastIndex = 0;
    let codeMatch;
    while ((codeMatch = INLINE_CODE_REGEX.exec(text)) !== null) {
      for (let j = codeMatch.index; j < codeMatch.index + codeMatch[0].length; j++) {
        codeMask.add(j);
      }
    }

    TAG_REGEX.lastIndex = 0;
    let match;
    while ((match = TAG_REGEX.exec(text)) !== null) {
      // Skip if the match overlaps with inline code
      const start = match.index;
      const end = start + match[0].length;
      let insideCode = false;
      for (let j = start; j < end; j++) {
        if (codeMask.has(j)) {
          insideCode = true;
          break;
        }
      }
      if (insideCode) continue;

      builder.add(
        line.from + start,
        line.from + end,
        tagMark
      );
    }
  }

  return builder.finish();
}

/** ViewPlugin that decorates tags with Decoration.mark. */
export const tagHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTagDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildTagDecorations(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event: MouseEvent, view: EditorView) {
        const target = event.target as HTMLElement;

        // Check if we clicked on or inside a tag highlight
        const tagEl = target.closest(".cm-tag-highlight");
        if (!tagEl) return false;

        const callback = view.state.facet(tagClickCallback);
        if (!callback) return false;

        const tagText = tagEl.textContent;
        if (tagText && tagText.startsWith("#")) {
          callback(tagText);
          return true;
        }

        return false;
      },
    },
  }
);

/**
 * Editor theme extension for tag highlights.
 * Uses Decoration.mark styling (the tag text remains in the document).
 */
export const tagHighlightTheme = EditorView.baseTheme({
  ".cm-tag-highlight": {
    color: "var(--accent)",
    backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
    padding: "0.1em 0.3em",
    borderRadius: "3px",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  ".cm-tag-highlight:hover": {
    backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
  },
});
