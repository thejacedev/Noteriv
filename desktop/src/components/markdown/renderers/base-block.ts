import { registerCodeBlockProcessor } from "@/lib/markdown-code-block-registry";
import { mountBase, type MountedBase } from "@/components/bases/mount-base";
import { toVaultRelative } from "@/lib/vault-paths";
import "@/styles/bases.css";

function vaultPathOf(node: Element | null): string | null {
  return (
    node?.closest("[data-vault-path]")?.getAttribute("data-vault-path") ||
    document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path") ||
    null
  );
}

/** The note on show, as a path inside the vault: what `this` means to a base written in it. */
function openNote(vaultPath: string): string | undefined {
  const full = document.querySelector("[data-open-file]")?.getAttribute("data-open-file");
  return (full && toVaultRelative(full, vaultPath)) || undefined;
}

/**
 * ```base
 * views:
 *   - type: table
 *     order: [file.name, status]
 * ```
 * shows a base written in the note itself, with the note as `this`.
 */
export function registerBaseBlock(): void {
  registerCodeBlockProcessor("core", "base", (source, container) => {
    const vaultPath = vaultPathOf(container);
    if (!vaultPath) {
      container.textContent = "A base needs an open vault.";
      return;
    }
    const mounted = mountBase(container, source, { vaultPath, thisFile: openNote(vaultPath), embedded: true });
    return () => mounted.destroy();
  });
}

// ── Embedded base files: ![[Projects.base]] and ![[Projects.base#View]] ──

const mountedEmbeds = new WeakMap<Element, MountedBase>();

/** The placeholder an embed of a base file is drawn as; `mountPendingBases` fills it in. */
export function baseEmbedTag(absPath: string, view: string | null, label: string): string {
  const esc = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<div class="md-base-embed" data-base-file="${esc(absPath)}"${view ? ` data-base-view="${esc(view)}"` : ""}>` +
    `<div class="base-empty">${esc(label)}</div></div>`
  );
}

function mountPendingBases(): void {
  const pending = document.querySelectorAll<HTMLElement>(".md-base-embed:not([data-armed])");
  pending.forEach((holder) => {
    const file = holder.getAttribute("data-base-file");
    const vaultPath = vaultPathOf(holder);
    if (!file || !vaultPath || !window.electronAPI) return;
    holder.setAttribute("data-armed", "true");
    void window.electronAPI.readFile(file).then((text) => {
      if (!holder.isConnected) return;
      holder.textContent = "";
      if (text === null) {
        holder.textContent = "This base could not be read.";
        return;
      }
      mountedEmbeds.set(
        holder,
        mountBase(holder, text, {
          vaultPath,
          thisFile: openNote(vaultPath),
          view: holder.getAttribute("data-base-view") || undefined,
          embedded: true,
        })
      );
    });
  });
}

let timers: ReturnType<typeof setTimeout>[] = [];

/**
 * Called when an embed of a base has been handed to the editor. The editor
 * puts it on the page a moment later, so the placeholder is looked for a
 * few times rather than once.
 */
export function scheduleBaseEmbeds(): void {
  timers.forEach(clearTimeout);
  timers = [30, 150, 500, 1500].map((delay) => setTimeout(mountPendingBases, delay));
}
