import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import type { BlockRenderer, BlockContext } from "../types";

const checkboxRegex = /^(\s*[-*+]\s+)\[([xX ])\]\s+(.*)$/;

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,        // position of [ in the document
  ) {
    super();
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "md-checkbox-wrapper";

    const box = document.createElement("span");
    box.className = `md-checkbox ${this.checked ? "checked" : ""}`;

    const inner = document.createElement("span");
    inner.className = "md-cb-box";
    inner.textContent = this.checked ? "\u2713" : "";
    box.appendChild(inner);

    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Toggle [x] <-> [ ] in the document
      const newChar = this.checked ? " " : "x";
      // pos points to [, so pos+1 is the x or space
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: newChar },
      });
    });

    span.appendChild(box);
    return span;
  }

  ignoreEvent() { return true; }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos;
  }
}

export const checkboxRenderer: BlockRenderer = {
  name: "checkboxes",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(checkboxRegex);
    if (!match) return false;

    const checked = match[2] === "x" || match[2] === "X";

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-list-item" }));

    // Position of [ in the document
    const bracketPos = ctx.line.from + match[1].length;
    const prefixEnd = bracketPos + 4; // [x] + trailing space

    ctx.builder.add(
      ctx.line.from,
      prefixEnd,
      Decoration.replace({
        widget: new CheckboxWidget(checked, bracketPos),
      })
    );

    return true;
  },

  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(checkboxRegex);
    if (!match) return null;
    return { offset: match[1].length + 4, content: match[3] };
  },
};
