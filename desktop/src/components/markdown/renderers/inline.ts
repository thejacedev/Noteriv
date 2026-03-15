import type { InlineRenderer, InlineReplacement } from "../types";

interface InlinePattern {
  name: string;
  regex: RegExp;
  className: string;
  render: (captured: string) => string;
}

const patterns: InlinePattern[] = [
  {
    name: "bold-italic",
    regex: /(?<!\*)\*\*\*(.+?)\*\*\*(?!\*)/g,
    className: "md-bold-italic",
    render: (m) => `<strong><em>${m}</em></strong>`,
  },
  {
    name: "bold",
    regex: /(?<!\*)\*\*(.+?)\*\*(?!\*)/g,
    className: "md-bold",
    render: (m) => `<strong>${m}</strong>`,
  },
  {
    name: "italic",
    regex: /(?<!\*)\*(.+?)\*(?!\*)/g,
    className: "md-italic",
    render: (m) => `<em>${m}</em>`,
  },
  {
    name: "strikethrough",
    regex: /~~(.+?)~~/g,
    className: "md-strikethrough",
    render: (m) => `<del>${m}</del>`,
  },
  {
    name: "inline-code",
    regex: /(?<!`)`([^`]+)`(?!`)/g,
    className: "md-inline-code",
    render: (m) => `<code>${m}</code>`,
  },
];

/** Creates an InlineRenderer for a single formatting pattern. */
function makeInlineRenderer(pattern: InlinePattern): InlineRenderer {
  return {
    name: `inline-${pattern.name}`,
    priority: 50,
    find(text: string, offset: number): InlineReplacement[] {
      const results: InlineReplacement[] = [];
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;

      while ((match = re.exec(text)) !== null) {
        results.push({
          from: offset + match.index,
          to: offset + match.index + match[0].length,
          html: pattern.render(match[1]),
          className: pattern.className,
        });
      }

      return results;
    },
  };
}

/** All inline formatting renderers (bold, italic, code, etc.) */
export const inlineRenderers: InlineRenderer[] = patterns.map(makeInlineRenderer);
