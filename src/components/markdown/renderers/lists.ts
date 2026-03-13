import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

const ulRegex = /^(\s*)([-*+])\s+(.*)$/;
const olRegex = /^(\s*)(\d+)\.\s+(.*)$/;

export const unorderedListRenderer: BlockRenderer = {
  name: "unordered-list",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(ulRegex);
    if (!match) return false;

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-list-item" }));

    // Replace the bullet marker with a rendered bullet
    const bulletEnd = ctx.line.from + match[1].length + match[2].length + 1;
    ctx.builder.add(
      ctx.line.from + match[1].length,
      bulletEnd,
      Decoration.replace({
        widget: new RenderedMarkdownWidget("&#8226; ", "md-bullet"),
      })
    );

    return true;
  },

  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(ulRegex);
    if (!match) return null;
    return { offset: match[1].length + match[2].length + 1, content: match[3] };
  },
};

export const orderedListRenderer: BlockRenderer = {
  name: "ordered-list",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(olRegex);
    if (!match) return false;

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-list-item" }));

    return true;
  },

  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(olRegex);
    if (!match) return null;
    return { offset: match[1].length + match[2].length + 2, content: match[3] };
  },
};
