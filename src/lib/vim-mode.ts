/**
 * Vim Mode extension for CodeMirror.
 *
 * Wraps @replit/codemirror-vim to provide a simple on/off toggle.
 *
 * NOTE: This module requires the @replit/codemirror-vim package.
 * If not installed, run:
 *   npm install @replit/codemirror-vim
 */

import type { Extension } from "@codemirror/state";

let vimModule: { vim: () => Extension } | null = null;
let loadAttempted = false;

/**
 * Try to load the vim module dynamically.
 * This handles the case where the package may not be installed.
 */
async function loadVimModule(): Promise<boolean> {
  if (loadAttempted) return vimModule !== null;
  loadAttempted = true;

  try {
    vimModule = await import("@replit/codemirror-vim");
    return true;
  } catch {
    console.warn(
      "[Noteriv] @replit/codemirror-vim is not installed. " +
        "Vim mode will be unavailable. Install it with:\n" +
        "  npm install @replit/codemirror-vim"
    );
    return false;
  }
}

// Eagerly attempt to load on module init
loadVimModule();

/**
 * Check whether the vim extension package is available.
 */
export function isVimAvailable(): boolean {
  return vimModule !== null;
}

/**
 * Return a CodeMirror extension array for vim mode.
 *
 * @param enabled - When true, returns the vim key bindings extension.
 *                  When false (or if the package is unavailable), returns an empty array.
 */
export function vimExtension(enabled: boolean): Extension[] {
  if (!enabled || !vimModule) {
    return [];
  }
  return [vimModule.vim()];
}
