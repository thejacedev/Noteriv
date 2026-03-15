// Initialize built-in renderers on import
import { registerBuiltinRenderers } from "./renderers";
registerBuiltinRenderers();

// Re-export everything consumers need
export { liveMarkdownPlugin, renderAllLines } from "./plugin";
export { markdownRenderTheme, mdHighlightStyle, editorTheme } from "./theme";
export { RenderedMarkdownWidget } from "./widget";
export {
  registerBlockRenderer,
  registerInlineRenderer,
  unregisterRenderer,
} from "./registry";
export type {
  BlockRenderer,
  BlockContext,
  InlineRenderer,
  InlineReplacement,
} from "./types";
