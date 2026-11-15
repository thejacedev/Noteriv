/**
 * Folding for callouts.
 *
 * `> [!tip]- Title` is a callout that starts folded, and `> [!tip]+ Title`
 * one that starts open and can be folded. The mark is read from the note and
 * nothing is ever written back: which callouts the reader has opened or
 * closed is kept here, for as long as the note is open in this editor.
 *
 * A folded callout's lines are hidden with one replacing decoration from the
 * end of its header line to the end of its last line. That decoration covers
 * line breaks, so it has to come from a state field: the renderer in
 * `plugin.ts` is a view plugin and may not hide whole lines.
 *
 * A cursor or a search hit inside a folded callout opens it for as long as
 * it is there, so nothing is ever edited or found out of sight.
 */

import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** `> [!type]`, a `+` or `-` straight after it, then the title. */
export const CALLOUT_HEADER = /^>\s*\[!(\w+)\]([+-])?\s*(.*)$/;

export interface FoldableCallout {
  /** Where the header line starts. A fold is remembered by this. */
  header: number;
  /** What a fold hides: from the end of the header line to the end of the last line. */
  from: number;
  to: number;
  /** Folded until it is opened (`-`), or open until it is folded (`+`). */
  startsFolded: boolean;
}

/**
 * Every callout in the text that is marked as foldable and has lines to
 * fold. A callout runs from its header through the quoted lines that follow
 * it, up to the next callout's header. Fenced code is skipped: a callout
 * written there is an example, not a callout.
 */
export function findFoldableCallouts(doc: Text): FoldableCallout[] {
  const found: FoldableCallout[] = [];
  let fence: string | null = null;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const fenceMatch = text.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null || text.charCodeAt(0) !== 62 /* > */) continue;

    const header = text.match(CALLOUT_HEADER);
    if (!header || !header[2]) continue;
    let last = i;
    while (last < doc.lines) {
      const next = doc.line(last + 1).text;
      if (next.charCodeAt(0) !== 62 || CALLOUT_HEADER.test(next)) break;
      last++;
    }
    if (last > i) {
      found.push({ header: line.from, from: line.to, to: doc.line(last).to, startsFolded: header[2] === "-" });
    }
    i = last;
  }
  return found;
}

/**
 * Fold or open the callout whose header line starts at `header`. It says
 * which of the two, not "the other one": a callout can be standing open only
 * because the cursor is in it, and a click on its arrow then means "fold".
 */
export const setCalloutFold = StateEffect.define<{ header: number; folded: boolean }>({
  map: (value, change) => ({ header: change.mapPos(value.header, 1), folded: value.folded }),
});

interface FoldState {
  callouts: FoldableCallout[];
  /** The headers of the callouts that were changed from how they start. */
  toggled: readonly number[];
  /** The headers of the callouts that are folded right now. */
  folded: ReadonlySet<number>;
  decorations: DecorationSet;
}

const hidden = Decoration.replace({});

function settle(state: EditorState, callouts: FoldableCallout[], toggled: readonly number[]): FoldState {
  const folded = new Set<number>();
  const builder = new RangeSetBuilder<Decoration>();
  for (const callout of callouts) {
    if (callout.startsFolded === toggled.includes(callout.header)) continue;
    // The end counts as inside: text typed there would land in the last hidden line.
    const inside = (pos: number) => pos > callout.from && pos <= callout.to;
    if (state.selection.ranges.some((range) => inside(range.anchor) || inside(range.head))) continue;
    folded.add(callout.header);
    builder.add(callout.from, callout.to, hidden);
  }
  return { callouts, toggled, folded, decorations: builder.finish() };
}

export const calloutFolds = StateField.define<FoldState>({
  create(state) {
    return settle(state, findFoldableCallouts(state.doc), []);
  },
  update(value, tr) {
    let { callouts, toggled } = value;
    if (tr.docChanged) {
      // The whole text replaced: another note, or the file as it now is on disk.
      const before = tr.startState.doc.length;
      const replaced = before > 0 && tr.changes.touchesRange(0, before) === "cover";
      callouts = findFoldableCallouts(tr.state.doc);
      const headers = new Set(callouts.map((callout) => callout.header));
      toggled = replaced ? [] : toggled.map((pos) => tr.changes.mapPos(pos, 1)).filter((pos) => headers.has(pos));
    }
    for (const effect of tr.effects) {
      if (!effect.is(setCalloutFold)) continue;
      const { header, folded } = effect.value;
      const callout = callouts.find((c) => c.header === header);
      if (!callout) continue;
      // Remembered only when it differs from how the callout starts.
      const differs = callout.startsFolded !== folded;
      if (differs === toggled.includes(header)) continue;
      toggled = differs ? [...toggled, header] : toggled.filter((pos) => pos !== header);
    }
    if (!tr.docChanged && !tr.selection && toggled === value.toggled) return value;
    return settle(tr.state, callouts, toggled);
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    // The cursor steps over a folded callout instead of into it.
    EditorView.atomicRanges.of((view) => view.state.field(field, false)?.decorations ?? Decoration.none),
  ],
});

/**
 * How the callout whose header line starts at `header` stands: folded, open,
 * or null when it cannot be folded (no mark, or no lines under it).
 */
export function calloutFoldAt(state: EditorState, header: number): "folded" | "open" | null {
  const value = state.field(calloutFolds, false);
  if (!value || !value.callouts.some((callout) => callout.header === header)) return null;
  return value.folded.has(header) ? "folded" : "open";
}

/**
 * What a click on a callout's arrow does: fold it when it is open and open
 * it when it is folded. A cursor inside a callout that is being folded is
 * put on the line after it, or it would hold the callout open. Null when
 * there is no foldable callout at `header`.
 */
export function calloutFoldClick(
  state: EditorState,
  header: number
): { effects: StateEffect<unknown>; selection?: { anchor: number } } | null {
  const value = state.field(calloutFolds, false);
  const callout = value?.callouts.find((c) => c.header === header);
  if (!value || !callout) return null;
  const fold = !value.folded.has(header);
  const effects = setCalloutFold.of({ header, folded: fold });
  const inside = (pos: number) => pos > callout.from && pos <= callout.to;
  if (!fold || !state.selection.ranges.some((range) => inside(range.anchor) || inside(range.head))) {
    return { effects };
  }
  // The start of the next line. A callout that ends the note has none: the
  // end of its header is the nearest place that is not inside it.
  const after = callout.to < state.doc.length ? callout.to + 1 : callout.from;
  return { effects, selection: { anchor: after } };
}

/** The hidden stretches of the text, in order. */
export function foldedCalloutRanges(state: EditorState): { from: number; to: number }[] {
  const value = state.field(calloutFolds, false);
  if (!value) return [];
  return value.callouts.filter((callout) => value.folded.has(callout.header)).map(({ from, to }) => ({ from, to }));
}
