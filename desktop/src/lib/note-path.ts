/**
 * Which note an editor is showing.
 *
 * A link can be a path from the folder of the note it is written in, so
 * whatever draws, opens or writes a link has to know that note. The main
 * pane and the split pane show different notes, and an embed shows a third,
 * so "the open note" is not enough. Each editor says which note it shows in
 * two ways: as a value in its own state, for code that runs inside the
 * editor, and as an attribute on its element, for code that starts from a
 * click.
 */

import { Compartment, Facet, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** The full path of the note an editor is showing, or "" when it is not known. */
export const notePathFacet = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? "",
});

/** The attribute an element carries when everything inside it belongs to one note. */
export const NOTE_PATH_ATTRIBUTE = "data-note-path";

/**
 * Lets an editor be told which note it shows, and told again when the tab
 * changes: `extension` goes into the editor's setup and `set` updates it.
 */
export function notePathSetting(initial: string | undefined): {
  extension: Extension;
  set: (view: EditorView, notePath: string | undefined) => void;
} {
  const compartment = new Compartment();
  return {
    extension: compartment.of(notePathFacet.of(initial ?? "")),
    set(view, notePath) {
      const next = notePath ?? "";
      if (view.state.facet(notePathFacet) === next) return;
      view.dispatch({ effects: compartment.reconfigure(notePathFacet.of(next)) });
    },
  };
}

/** The note that the element on screen belongs to: the nearest one, so an embed wins over the note around it. */
export function noteContaining(element: Element): string | null {
  return element.closest(`[${NOTE_PATH_ATTRIBUTE}]`)?.getAttribute(NOTE_PATH_ATTRIBUTE) || null;
}
