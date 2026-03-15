import type { InlineRenderer, InlineReplacement } from "../types";

export const imageRenderer: InlineRenderer = {
  name: "images",
  priority: 10, // Run before links

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<img src="${match[2]}" alt="${match[1]}" class="md-inline-img"/>`,
        className: "md-image",
      });
    }

    return results;
  },
};
