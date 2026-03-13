import type { InlineRenderer, InlineReplacement } from "../types";

// Highlight: ==text==
export const highlightRenderer: InlineRenderer = {
  name: "inline-highlight",
  priority: 45,

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /==([^=]+)==/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<mark class="md-highlight">${match[1]}</mark>`,
        className: "md-highlight-wrapper",
      });
    }

    return results;
  },
};

// Superscript: ^text^
export const superscriptRenderer: InlineRenderer = {
  name: "inline-superscript",
  priority: 46,

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match ^text^ but not ^^
    const regex = /(?<!\^)\^([^\^\s][^\^]*?)\^(?!\^)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<sup>${match[1]}</sup>`,
        className: "md-superscript",
      });
    }

    return results;
  },
};

// Subscript: ~text~  (single tilde, not ~~strikethrough~~)
export const subscriptRenderer: InlineRenderer = {
  name: "inline-subscript",
  priority: 47,

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match ~text~ but not ~~text~~
    const regex = /(?<!~)~([^~\s][^~]*?)~(?!~)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `<sub>${match[1]}</sub>`,
        className: "md-subscript",
      });
    }

    return results;
  },
};
