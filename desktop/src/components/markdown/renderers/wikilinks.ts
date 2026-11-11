import type { InlineRenderer, InlineReplacement } from "../types";

// Obsidian-style wikilinks: [[page]] or [[page|display text]]
export const wikilinkRenderer: InlineRenderer = {
  name: "wikilinks",
  priority: 8, // Before other inline but after footnotes

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const target = match[1];
      const display = match[2] || match[1];

      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<span class="md-wikilink" data-target="${target}">${display}</span>`,
        className: "md-wikilink-wrapper",
      });
    }

    return results;
  },
};
