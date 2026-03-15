import { Decoration } from "@codemirror/view";
import type { BlockRenderer, BlockContext } from "../types";

const headingRegex = /^(#{1,6})\s+(.*?)[\s]*$/;

export const headingRenderer: BlockRenderer = {
  name: "headings",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(headingRegex);
    if (!match) return false;

    const level = match[1].length;

    // Apply heading class to the line
    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: `md-h${level}` }));

    // Hide the ### prefix
    ctx.builder.add(
      ctx.line.from,
      ctx.line.from + match[1].length + 1,
      Decoration.replace({})
    );

    return true;
  },
};
