import type { InlineRenderer, InlineReplacement } from "../types";

export const linkRenderer: InlineRenderer = {
  name: "links",
  priority: 20, // After images (which use similar syntax)

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<a href="${match[2]}" class="md-link">${match[1]}</a>`,
        className: "md-link-wrapper",
      });
    }

    return results;
  },
};
