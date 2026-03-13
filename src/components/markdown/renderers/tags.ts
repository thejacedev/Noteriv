import type { InlineRenderer, InlineReplacement } from "../types";

// Obsidian-style tags: #tag or #nested/tag
export const tagRenderer: InlineRenderer = {
  name: "tags",
  priority: 90, // Late — don't interfere with headings

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match #tag but not at line start (those are headings)
    // Must be preceded by whitespace or start of string (after offset adjustment)
    const regex = /(?<=\s|^)#([a-zA-Z][\w/\-]*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<span class="md-tag">#${match[1]}</span>`,
        className: "md-tag-wrapper",
      });
    }

    return results;
  },
};
