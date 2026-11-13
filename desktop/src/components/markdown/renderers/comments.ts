import type { InlineRenderer, InlineReplacement } from "../types";
import { findInlineComments } from "@/lib/comments";

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Comment: %%text%%. Shown dimmed while editing; the reading view hides
// `.md-comment` altogether. Runs before every other inline renderer, so
// markup inside a comment is not drawn.
export const commentRenderer: InlineRenderer = {
  name: "inline-comment",
  priority: 1,

  find(text: string, offset: number): InlineReplacement[] {
    return findInlineComments(text).map((range) => ({
      from: offset + range.from,
      to: offset + range.to,
      html: `<span class="md-comment">${escapeText(text.slice(range.from, range.to))}</span>`,
      className: "md-comment-wrapper",
    }));
  },
};

// Inline footnote: ^[text written in place]. The note is shown where it is
// written, small and raised, so it reads without a list at the bottom.
export const inlineFootnoteRenderer: InlineRenderer = {
  name: "inline-footnote",
  priority: 4, // Before [^1] references and links

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /\^\[([^\]\n]+)\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<sup class="md-footnote-inline">${escapeText(match[1])}</sup>`,
        className: "md-footnote",
      });
    }
    return results;
  },
};
