import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

// Definition: line starting with ": " (preceded by a term line)
const definitionRegex = /^:\s+(.*)$/;

export const definitionListRenderer: BlockRenderer = {
  name: "definition-list",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(definitionRegex);
    if (!match) return false;

    ctx.builder.add(
      ctx.line.from,
      ctx.line.from,
      Decoration.line({ class: "md-definition" })
    );

    // Replace ": " prefix with a styled marker
    ctx.builder.add(
      ctx.line.from,
      ctx.line.from + 2, // ": "
      Decoration.replace({
        widget: new RenderedMarkdownWidget(
          '<span class="md-def-marker"></span>',
          "md-def-marker-wrap"
        ),
      })
    );

    return true;
  },

  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(definitionRegex);
    if (!match) return null;
    return { offset: 2, content: match[1] };
  },
};
