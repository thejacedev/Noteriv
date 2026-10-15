// ─── Markdown code-block processor registry ───
// Lets plugins register a custom renderer for a fenced code-block language
// (e.g. ```chessboard), without the core markdown renderer knowing about
// any specific plugin. Kept as a standalone module (rather than inside
// plugin-api.ts) so both `lib/plugin-api.ts` and
// `components/markdown/renderers/code-blocks.ts` can import it without
// creating a circular dependency between `lib/` and `components/markdown/`.

export interface CodeBlockProcessorContext {
  /** Same as the `source` parameter; kept for symmetry with Obsidian's API. */
  source: string;
  /** The fence language exactly as registered (lowercased). */
  language: string;
  /** Vault-relative path of the note being rendered, if known. Best-effort, may be null. */
  sourcePath: string | null;
}

export type CodeBlockProcessor = (
  source: string,
  el: HTMLElement,
  ctx: CodeBlockProcessorContext
) => void | (() => void);

interface RegistryEntry {
  pluginId: string;
  processor: CodeBlockProcessor;
}

// Languages the core app already renders natively — plugins cannot override these.
const RESERVED_LANGUAGES = new Set(["dataview", "mermaid"]);

const registry = new Map<string, RegistryEntry>();
const listeners = new Set<() => void>();

function notifyChange(): void {
  for (const listener of listeners) listener();
}

/**
 * Subscribe to processor registrations and removals, so open editors can
 * re-render blocks whose renderer changed. Returns an unsubscribe function.
 */
export function onCodeBlockProcessorsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerCodeBlockProcessor(
  pluginId: string,
  language: string,
  processor: CodeBlockProcessor
): void {
  const key = language.trim().toLowerCase();
  if (!key) return;
  if (RESERVED_LANGUAGES.has(key)) {
    console.warn(`[plugin:${pluginId}] cannot register processor for reserved language "${key}"`);
    return;
  }
  const existing = registry.get(key);
  if (existing && existing.pluginId !== pluginId) {
    console.warn(
      `[plugin:${pluginId}] overriding code block processor for "${key}" previously registered by "${existing.pluginId}"`
    );
  }
  registry.set(key, { pluginId, processor });
  notifyChange();
}

export function unregisterCodeBlockProcessor(pluginId: string, language: string): void {
  const key = language.trim().toLowerCase();
  const existing = registry.get(key);
  if (existing && existing.pluginId === pluginId) {
    registry.delete(key);
    notifyChange();
  }
}

/** Called from PluginManager.unloadPlugin — removes every processor owned by this plugin. */
export function unregisterAllCodeBlockProcessorsForPlugin(pluginId: string): void {
  let removed = false;
  for (const [key, entry] of registry) {
    if (entry.pluginId === pluginId) {
      registry.delete(key);
      removed = true;
    }
  }
  if (removed) notifyChange();
}

export function getCodeBlockProcessor(language: string): RegistryEntry | undefined {
  const key = language.trim().toLowerCase();
  return registry.get(key);
}
