import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, Text } from "@codemirror/state";
import {
  CALLOUT_HEADER,
  calloutFoldAt,
  calloutFolds,
  calloutFoldClick,
  findFoldableCallouts,
  foldedCalloutRanges,
  setCalloutFold,
} from "../../components/markdown/callout-folds";

const NOTE = [
  "# Title", // 1
  "", // 2
  "> [!tip]- Folded at first", // 3
  "> hidden one", // 4
  "> hidden two", // 5
  "", // 6
  "> [!note]+ Open at first", // 7
  "> shown", // 8
  "", // 9
  "> [!info] Not foldable", // 10
  "> always shown", // 11
  "", // 12
  "after", // 13
].join("\n");

function start(text = NOTE, cursor = 0): EditorState {
  return EditorState.create({ doc: text, selection: { anchor: cursor }, extensions: [calloutFolds] });
}
const lineStart = (state: EditorState, n: number) => state.doc.line(n).from;
/** A click on the arrow of the callout whose header is on line `n`. */
function click(state: EditorState, n: number): EditorState {
  const spec = calloutFoldClick(state, lineStart(state, n));
  return spec ? state.update(spec).state : state;
}
/** The line numbers a fold hides. */
function hiddenLines(state: EditorState): number[] {
  const lines: number[] = [];
  for (const range of foldedCalloutRanges(state)) {
    for (let n = state.doc.lineAt(range.from).number + 1; n <= state.doc.lineAt(range.to).number; n++) lines.push(n);
  }
  return lines;
}

describe("the callout header", () => {
  it("reads the type, the fold mark and the title", () => {
    expect("> [!tip]- Title here".match(CALLOUT_HEADER)?.slice(1)).toEqual(["tip", "-", "Title here"]);
    expect("> [!note]+".match(CALLOUT_HEADER)?.slice(1)).toEqual(["note", "+", ""]);
    expect("> [!info] Plain".match(CALLOUT_HEADER)?.slice(1)).toEqual(["info", undefined, "Plain"]);
    // A dash after a space is the start of the title, not a fold mark.
    expect("> [!info] - dash".match(CALLOUT_HEADER)?.slice(1)).toEqual(["info", undefined, "- dash"]);
    expect(CALLOUT_HEADER.test("> just a quote")).toBe(false);
  });
});

describe("findFoldableCallouts", () => {
  it("finds the callouts with a mark and lines under them", () => {
    const doc = Text.of(NOTE.split("\n"));
    const found = findFoldableCallouts(doc);
    expect(found.map((c) => [doc.lineAt(c.header).number, doc.lineAt(c.to).number, c.startsFolded])).toEqual([
      [3, 5, true],
      [7, 8, false],
    ]);
    // What is hidden starts at the end of the header line.
    expect(found[0].from).toBe(doc.line(3).to);
    expect(found[0].to).toBe(doc.line(5).to);
  });

  it("leaves out a marked callout with nothing under it, and one in fenced code", () => {
    const text = ["> [!tip]- Alone", "", "```", "> [!tip]- In code", "> body", "```", "~~~", "> [!tip]- In code", "> body", "~~~"].join("\n");
    expect(findFoldableCallouts(Text.of(text.split("\n")))).toEqual([]);
  });

  it("ends a callout where the next one starts", () => {
    const doc = Text.of(["> [!tip]- One", "> a", "> [!note]- Two", "> b", "> c"]);
    const found = findFoldableCallouts(doc);
    expect(found.map((c) => [doc.lineAt(c.header).number, doc.lineAt(c.to).number])).toEqual([
      [1, 2],
      [3, 5],
    ]);
  });
});

describe("the fold state", () => {
  it("starts with `-` folded, `+` open, and a plain callout not foldable", () => {
    const state = start();
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("folded");
    expect(calloutFoldAt(state, lineStart(state, 7))).toBe("open");
    expect(calloutFoldAt(state, lineStart(state, 10))).toBe(null);
    expect(calloutFoldAt(state, lineStart(state, 1))).toBe(null);
    expect(hiddenLines(state)).toEqual([4, 5]);
  });

  it("opens and folds on a toggle, and never changes the text", () => {
    let state = start();
    state = click(state, 3);
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("open");
    expect(hiddenLines(state)).toEqual([]);

    state = click(state, 7);
    expect(calloutFoldAt(state, lineStart(state, 7))).toBe("folded");
    expect(hiddenLines(state)).toEqual([8]);

    state = click(state, 3);
    expect(hiddenLines(state)).toEqual([4, 5, 8]);
    expect(state.doc.toString()).toBe(NOTE);

    // A click that names no foldable callout does nothing.
    expect(calloutFoldClick(state, lineStart(state, 10))).toBe(null);
    const same = state.update({ effects: setCalloutFold.of({ header: lineStart(state, 10), folded: true }) }).state;
    expect(hiddenLines(same)).toEqual([4, 5, 8]);
    // Asking for what a callout already is changes nothing.
    const again = state.update({ effects: setCalloutFold.of({ header: lineStart(state, 3), folded: true }) }).state;
    expect(hiddenLines(again)).toEqual([4, 5, 8]);
  });

  it("folds from the arrow with the cursor inside, and puts the cursor after the callout", () => {
    // The open callout, with the cursor in its line.
    let state = start(NOTE, 0);
    state = state.update({ selection: { anchor: lineStart(state, 8) + 4 } }).state;
    expect(calloutFoldAt(state, lineStart(state, 7))).toBe("open");
    state = click(state, 7);
    expect(calloutFoldAt(state, lineStart(state, 7))).toBe("folded");
    expect(hiddenLines(state)).toEqual([4, 5, 8]);
    expect(state.selection.main.head).toBe(lineStart(state, 9));

    // The folded callout, standing open only because the cursor went into it.
    state = state.update({ selection: { anchor: lineStart(state, 4) + 2 } }).state;
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("open");
    state = click(state, 3);
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("folded");
    expect(state.selection.main.head).toBe(lineStart(state, 6));
    // It was not turned into "open for good": moving in and out again leaves it folded.
    state = state.update({ selection: { anchor: lineStart(state, 5) } }).state;
    state = state.update({ selection: { anchor: 0 } }).state;
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("folded");

    // A cursor that is somewhere else is left where it is.
    state = click(state, 3);
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("open");
    expect(state.selection.main.head).toBe(0);
  });

  it("puts the cursor at the end of the header when the folded callout ends the note", () => {
    const text = "intro\n\n> [!tip]+ Last\n> the last line";
    let state = start(text, text.length);
    expect(calloutFoldAt(state, 7)).toBe("open");
    state = click(state, 3);
    expect(calloutFoldAt(state, 7)).toBe("folded");
    expect(state.selection.main.head).toBe(state.doc.line(3).to);
  });

  it("keeps a fold on its callout when text is typed above it", () => {
    let state = start();
    state = click(state, 7);
    state = state.update({ changes: { from: 0, insert: "A new first line\n\n" } }).state;
    // Everything moved down two lines.
    expect(calloutFoldAt(state, lineStart(state, 9))).toBe("folded");
    expect(hiddenLines(state)).toEqual([6, 7, 10]);
  });

  it("opens a folded callout while the cursor or a found word is inside it", () => {
    let state = start();
    const inside = lineStart(state, 4) + 3;
    state = state.update({ selection: { anchor: inside } }).state;
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe("open");
    expect(hiddenLines(state)).toEqual([]);
    // A search hit is a selection that starts and ends inside.
    state = state.update({ selection: EditorSelection.range(lineStart(state, 5) + 2, lineStart(state, 5) + 8) }).state;
    expect(hiddenLines(state)).toEqual([]);
    // Moving away folds it again: it was only opened to be looked at.
    state = state.update({ selection: { anchor: lineStart(state, 13) } }).state;
    expect(hiddenLines(state)).toEqual([4, 5]);
  });

  it("stays folded with the cursor on the header, or with a selection that only passes over it", () => {
    let state = start();
    state = state.update({ selection: { anchor: state.doc.line(3).to } }).state;
    expect(hiddenLines(state)).toEqual([4, 5]);
    state = state.update({ selection: EditorSelection.range(0, lineStart(state, 13)) }).state;
    expect(hiddenLines(state)).toEqual([4, 5]);
    // At the very end of the hidden lines, typed text would go into them.
    state = state.update({ selection: { anchor: state.doc.line(5).to } }).state;
    expect(hiddenLines(state)).toEqual([]);
  });

  it("forgets the folds when the whole text is replaced by another note", () => {
    let state = start();
    state = click(state, 3);
    expect(hiddenLines(state)).toEqual([]);
    const other = "> [!tip]- Another note\n> its own lines\n";
    state = state.update({ changes: { from: 0, to: state.doc.length, insert: other }, selection: { anchor: 0 } }).state;
    expect(calloutFoldAt(state, 0)).toBe("folded");
    expect(hiddenLines(state)).toEqual([2]);
  });

  it("follows the mark when it is edited", () => {
    let state = start();
    // Take the "-" off the first callout: it is no longer foldable.
    const dash = lineStart(state, 3) + "> [!tip]".length;
    state = state.update({ changes: { from: dash, to: dash + 1 } }).state;
    expect(calloutFoldAt(state, lineStart(state, 3))).toBe(null);
    expect(hiddenLines(state)).toEqual([]);
    // Put a "-" on the plain one.
    const at = lineStart(state, 10) + "> [!info]".length;
    state = state.update({ changes: { from: at, insert: "-" }, selection: { anchor: 0 } }).state;
    expect(calloutFoldAt(state, lineStart(state, 10))).toBe("folded");
    expect(hiddenLines(state)).toEqual([11]);
  });

  it("answers nothing when the editor has no fold state", () => {
    const bare = EditorState.create({ doc: NOTE });
    expect(calloutFoldAt(bare, 0)).toBe(null);
    expect(foldedCalloutRanges(bare)).toEqual([]);
  });
});
