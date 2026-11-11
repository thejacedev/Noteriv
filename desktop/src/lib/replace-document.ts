import { Compartment, Transaction } from "@codemirror/state";
import { history } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

/**
 * Replace the editor's whole text with text that came from outside it: another
 * tab was selected, or the file changed on disk.
 *
 * This must not be undoable. It used to be an ordinary edit, so pressing undo
 * right after switching notes put the previous note's text into the current
 * one, and autosave then wrote that over the file. The undo history is reset
 * as well, because it belongs to the text that was replaced.
 */
export function replaceDocument(view: EditorView, historyConfig: Compartment, text: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: Transaction.addToHistory.of(false),
  });
  view.dispatch({ effects: historyConfig.reconfigure([]) });
  view.dispatch({ effects: historyConfig.reconfigure(history()) });
}
