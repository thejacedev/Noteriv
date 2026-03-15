import { Decoration } from "@codemirror/view";
import type { BlockRenderer, BlockContext } from "../types";

const blockquoteRegex = /^(>\s*)(.*)$/;

export const blockquoteRenderer: BlockRenderer = {
  name: "blockquotes",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(blockquoteRegex);
    if (!match) return false;

    // Apply blockquote class
    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-blockquote" }));

    // Hide the > prefix
    ctx.builder.add(
      ctx.line.from,
      ctx.line.from + match[1].length,
      Decoration.replace({})
    );

    // Return false so inline renderers still process the content
    // But we mark the line — inline processing happens in the plugin
    return true;
  },

  /** The content portion after the `>` prefix, for inline processing. */
  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(blockquoteRegex);
    if (!match) return null;
    return { offset: match[1].length, content: match[2] };
  },
};
