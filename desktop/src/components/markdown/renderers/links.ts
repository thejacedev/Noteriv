import type { InlineRenderer, InlineReplacement } from "../types";
import { isExternalPath, parseDestination } from "@/lib/link-resolve";

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The attribute that marks a link to a file in the vault, holding its destination as written. */
export const VAULT_LINK_ATTRIBUTE = "data-vault-link";

/**
 * The opening tag for a markdown link with this destination (the text
 * between `](` and `)`).
 *
 * A web or mail address keeps its `href`, which the app opens in the
 * browser. Anything else is a link to a file in the vault, or to a heading
 * in this note: it carries its destination in `data-vault-link` and has no
 * `href`, so a click can only do what the app's own handler does with it
 * and never sends the window somewhere.
 */
export function linkOpenTag(destination: string): string {
  const { path, fragment } = parseDestination(destination);
  if (isExternalPath(path)) {
    return `<a href="${escapeAttr(path + fragment)}" class="md-link">`;
  }
  return `<a class="md-link" ${VAULT_LINK_ATTRIBUTE}="${escapeAttr(destination)}">`;
}

export const linkRenderer: InlineRenderer = {
  name: "links",
  priority: 20, // After images (which use similar syntax)

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // A URL can include a parenthesized segment, such as `/article-(mcp)`.
    // Match one balanced level instead of stopping at the first closing paren.
    const regex = /(?<!!)\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+?)\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: offset + match.index,
        to: offset + match.index + match[0].length,
        html: `${linkOpenTag(match[2])}${match[1]}</a>`,
        className: "md-link-wrapper",
      });
    }

    return results;
  },
};
