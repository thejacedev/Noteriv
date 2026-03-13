import type { EditorView } from "@codemirror/view";

/** Toggle wrap around selection (e.g. **bold**, *italic*). Unwraps if already wrapped. */
export function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  // Check if already wrapped — unwrap if so
  const bLen = before.length;
  const aLen = after.length;
  const beforeText = view.state.sliceDoc(Math.max(0, from - bLen), from);
  const afterText = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + aLen));

  if (beforeText === before && afterText === after) {
    view.dispatch({
      changes: [
        { from: from - bLen, to: from, insert: "" },
        { from: to, to: to + aLen, insert: "" },
      ],
      selection: { anchor: from - bLen, head: to - bLen },
    });
    view.focus();
    return;
  }

  // Wrap
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + bLen, head: to + bLen },
  });
  view.focus();
}

/** Insert a markdown link. If text is selected, uses it as the link text. */
export function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    const insert = `[${selected}](url)`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
    });
  } else {
    view.dispatch({
      changes: { from, insert: "[text](url)" },
      selection: { anchor: from + 1, head: from + 5 },
    });
  }
  view.focus();
}

/** Insert a markdown image. If text is selected, uses it as alt text. */
export function insertImage(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    const insert = `![${selected}](url)`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + selected.length + 4, head: from + selected.length + 7 },
    });
  } else {
    view.dispatch({
      changes: { from, insert: "![alt](url)" },
      selection: { anchor: from + 2, head: from + 5 },
    });
  }
  view.focus();
}

/** Insert text at cursor position. */
export function insertAtCursor(view: EditorView, text: string) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

/** Insert a horizontal rule on its own line. */
export function insertHorizontalRule(view: EditorView) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.length > 0 ? "\n" : "";
  const insert = `${prefix}---\n`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  view.focus();
}

/** Insert a code block. If text is selected, wraps it. */
export function insertCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    const insert = `\`\`\`\n${selected}\n\`\`\``;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 3, head: from + 3 },
    });
  } else {
    const insert = "```\n\n```";
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 4 },
    });
  }
  view.focus();
}

/** Insert a blockquote. Wraps selection if present, otherwise inserts > prefix. */
export function insertBlockquote(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    const quoted = selected.split("\n").map((l) => `> ${l}`).join("\n");
    view.dispatch({
      changes: { from, to, insert: quoted },
    });
  } else {
    view.dispatch({
      changes: { from, insert: "> " },
      selection: { anchor: from + 2 },
    });
  }
  view.focus();
}

/** Insert a task list item. */
export function insertTaskList(view: EditorView) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.length > 0 ? "\n" : "";
  const insert = `${prefix}- [ ] `;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  view.focus();
}

/** Insert a table template. */
export function insertTable(view: EditorView) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.length > 0 ? "\n" : "";
  const table = `${prefix}| Header 1 | Header 2 | Header 3 |
| --- | --- | --- |
| Cell 1 | Cell 2 | Cell 3 |
`;
  view.dispatch({
    changes: { from: line.to, insert: table },
  });
  view.focus();
}
