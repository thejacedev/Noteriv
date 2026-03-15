import type { BlockRenderer, InlineRenderer } from "./types";

// Default renderer lists — populated by renderers/index.ts
const blockRenderers: BlockRenderer[] = [];
const inlineRenderers: InlineRenderer[] = [];

/** Register a block-level renderer. Appended to the end (lowest priority). */
export function registerBlockRenderer(renderer: BlockRenderer) {
  // Prevent duplicates by name
  const idx = blockRenderers.findIndex((r) => r.name === renderer.name);
  if (idx >= 0) blockRenderers[idx] = renderer;
  else blockRenderers.push(renderer);
}

/** Register an inline renderer. Sorted by priority (lower = earlier). */
export function registerInlineRenderer(renderer: InlineRenderer) {
  const idx = inlineRenderers.findIndex((r) => r.name === renderer.name);
  if (idx >= 0) inlineRenderers[idx] = renderer;
  else inlineRenderers.push(renderer);
  inlineRenderers.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/** Remove a renderer by name. */
export function unregisterRenderer(name: string) {
  const bi = blockRenderers.findIndex((r) => r.name === name);
  if (bi >= 0) blockRenderers.splice(bi, 1);
  const ii = inlineRenderers.findIndex((r) => r.name === name);
  if (ii >= 0) inlineRenderers.splice(ii, 1);
}

/** Get all registered block renderers (in registration order). */
export function getBlockRenderers(): readonly BlockRenderer[] {
  return blockRenderers;
}

/** Get all registered inline renderers (sorted by priority). */
export function getInlineRenderers(): readonly InlineRenderer[] {
  return inlineRenderers;
}
