import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

const checkboxRegex = /^(\s*[-*+]\s+)\[([xX ])\]\s+(.*)$/;

export const checkboxRenderer: BlockRenderer = {
  name: "checkboxes",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(checkboxRegex);
    if (!match) return false;

    const checked = match[2] === "x" || match[2] === "X";

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-list-item" }));

    // Replace "- [x] " prefix with a rendered checkbox
    const prefixEnd = ctx.line.from + match[1].length + 3 + 1; // [x] + trailing space
    ctx.builder.add(
      ctx.line.from,
      prefixEnd,
      Decoration.replace({
        widget: new RenderedMarkdownWidget(
          `<span class="md-checkbox ${checked ? "checked" : ""}"><span class="md-cb-box">${checked ? "&#10003;" : ""}</span></span>`,
          "md-checkbox-wrapper"
        ),
      })
    );

    return true;
  },

  /** Get the text content after the checkbox prefix, for inline processing. */
  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(checkboxRegex);
    if (!match) return null;
    return { offset: match[1].length + 4, content: match[3] };
  },
};
