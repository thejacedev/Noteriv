export { headingRenderer } from "./headings";
export { horizontalRuleRenderer } from "./horizontal-rule";
export { blockquoteRenderer } from "./blockquotes";
export { calloutRenderer } from "./callouts";
export { checkboxRenderer } from "./checkboxes";
export { unorderedListRenderer, orderedListRenderer } from "./lists";
export { tableRenderer } from "./tables";
export { footnoteDefRenderer, footnoteRefRenderer } from "./footnotes";
export { definitionListRenderer } from "./definition-lists";
export { imageRenderer } from "./images";
export { linkRenderer } from "./links";
export { wikilinkRenderer, embedRenderer } from "./wikilinks";
export { highlightRenderer, superscriptRenderer, subscriptRenderer } from "./highlight";
export { inlineMathRenderer, MathBlockTracker } from "./math";
export { tagRenderer } from "./tags";
export { inlineRenderers } from "./inline";
export { HtmlBlockTracker, inlineHtmlRenderer } from "./html";
export { CodeBlockTracker } from "./code-blocks";

import { registerBlockRenderer, registerInlineRenderer } from "../registry";
import { horizontalRuleRenderer } from "./horizontal-rule";
import { headingRenderer } from "./headings";
import { blockquoteRenderer } from "./blockquotes";
import { calloutRenderer } from "./callouts";
import { checkboxRenderer } from "./checkboxes";
import { unorderedListRenderer, orderedListRenderer } from "./lists";
import { tableRenderer } from "./tables";
import { footnoteDefRenderer, footnoteRefRenderer } from "./footnotes";
import { definitionListRenderer } from "./definition-lists";
import { imageRenderer } from "./images";
import { linkRenderer } from "./links";
import { wikilinkRenderer, embedRenderer } from "./wikilinks";
import { highlightRenderer, superscriptRenderer, subscriptRenderer } from "./highlight";
import { inlineMathRenderer } from "./math";
import { tagRenderer } from "./tags";
import { inlineHtmlRenderer } from "./html";
import { inlineRenderers } from "./inline";

/**
 * Register all built-in renderers.
 * Call this once at startup. Plugins can register additional
 * renderers after this.
 */
export function registerBuiltinRenderers() {
  // Block renderers — order matters (first match wins)
  registerBlockRenderer(horizontalRuleRenderer);
  registerBlockRenderer(headingRenderer);
  registerBlockRenderer(calloutRenderer); // Before blockquotes (callouts start with >)
  registerBlockRenderer(blockquoteRenderer);
  registerBlockRenderer(checkboxRenderer); // Before lists (checkboxes are list items)
  registerBlockRenderer(unorderedListRenderer);
  registerBlockRenderer(orderedListRenderer);
  registerBlockRenderer(tableRenderer);
  registerBlockRenderer(footnoteDefRenderer);
  registerBlockRenderer(definitionListRenderer);

  // Inline renderers — sorted by priority
  registerInlineRenderer(inlineHtmlRenderer);     // 3
  registerInlineRenderer(footnoteRefRenderer);    // 5
  registerInlineRenderer(embedRenderer);          // 7
  registerInlineRenderer(wikilinkRenderer);       // 8
  registerInlineRenderer(imageRenderer);          // 10
  registerInlineRenderer(inlineMathRenderer);     // 15
  registerInlineRenderer(linkRenderer);           // 20
  registerInlineRenderer(highlightRenderer);      // 45
  registerInlineRenderer(superscriptRenderer);    // 46
  registerInlineRenderer(subscriptRenderer);      // 47
  for (const r of inlineRenderers) {              // 50
    registerInlineRenderer(r);
  }
  registerInlineRenderer(tagRenderer);            // 90
}
