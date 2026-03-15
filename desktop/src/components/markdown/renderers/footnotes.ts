import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext, InlineRenderer, InlineReplacement } from "../types";

// Footnote definition: [^1]: text
const footnoteDefRegex = /^\[\^(\w+)\]:\s+(.*)$/;

export const footnoteDefRenderer: BlockRenderer = {
  name: "footnote-def",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(footnoteDefRegex);
    if (!match) return false;

    const id = match[1];
    const content = match[2];

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-footnote-def" }));
    ctx.builder.add(
      ctx.line.from,
      ctx.line.from + match[0].indexOf(content),
      Decoration.replace({
        widget: new RenderedMarkdownWidget(
          `<span class="md-footnote-label">${id}.</span> `,
          "md-footnote-ref-label"
        ),
      })
    );

    return true;
  },

  getContent(text: string): { offset: number; content: string } | null {
    const match = text.match(footnoteDefRegex);
    if (!match) return null;
    return { offset: text.indexOf(match[2]), content: match[2] };
  },
};

// Inline footnote reference: [^1]
export const footnoteRefRenderer: InlineRenderer = {
  name: "footnote-ref",
  priority: 5, // Very early

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match [^id] but not [^id]: (which is a definition)
    const regex = /\[\^(\w+)\](?!:)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<sup class="md-footnote-ref">${match[1]}</sup>`,
        className: "md-footnote",
      });
    }

    return results;
  },
};
