import { describe, expect, it } from "vitest";
import { Compartment, EditorState, type TransactionSpec } from "@codemirror/state";
import { history, undo, undoDepth } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { replaceDocument } from "../replace-document";

/** Just enough of an EditorView for state-only commands: a state and a dispatch. */
function fakeView(doc: string, historyConfig: Compartment) {
  const view = {
    state: EditorState.create({ doc, extensions: [historyConfig.of(history())] }),
    dispatch(...specs: TransactionSpec[]) {
      view.state = view.state.update(...specs).state;
    },
  };
  return view as unknown as EditorView;
}

describe("replaceDocument", () => {
  it("swaps the text in without making the swap undoable", () => {
    const historyConfig = new Compartment();
    const view = fakeView("# Note A\n\nText of note A.", historyConfig);

    // The user switches to another note: its text replaces the editor's.
    replaceDocument(view, historyConfig, "# Note B\n\nText of note B.");
    expect(view.state.doc.toString()).toBe("# Note B\n\nText of note B.");
    expect(undoDepth(view.state)).toBe(0);

    // Undo must leave note B alone rather than bring note A's text back.
    undo(view);
    expect(view.state.doc.toString()).toBe("# Note B\n\nText of note B.");
  });

  it("drops undo steps that belong to the previous text", () => {
    const historyConfig = new Compartment();
    const view = fakeView("first", historyConfig);
    view.dispatch({ changes: { from: 5, insert: " edit" }, userEvent: "input.type" });
    expect(undoDepth(view.state)).toBe(1);

    replaceDocument(view, historyConfig, "second");
    expect(undoDepth(view.state)).toBe(0);
    undo(view);
    expect(view.state.doc.toString()).toBe("second");
  });

  it("still lets edits made afterwards be undone", () => {
    const historyConfig = new Compartment();
    const view = fakeView("first", historyConfig);
    replaceDocument(view, historyConfig, "second");

    view.dispatch({ changes: { from: 6, insert: " edit" }, userEvent: "input.type" });
    expect(view.state.doc.toString()).toBe("second edit");
    undo(view);
    expect(view.state.doc.toString()).toBe("second");
  });
});
