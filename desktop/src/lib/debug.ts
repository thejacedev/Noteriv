/**
 * Debug logger that writes to a file via Electron IPC.
 * Logs go to {vaultPath}/.noteriv/debug.log
 *
 * Usage:
 *   import { dbg } from "@/lib/debug";
 *   dbg("my message", { someData: 123 });
 */

const buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getTimestamp(): string {
  const d = new Date();
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

/** Log a debug message. Buffered and flushed to disk every 500ms. */
export function dbg(...args: unknown[]): void {
  const msg = args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");

  const line = `[${getTimestamp()}] ${msg}`;
  buffer.push(line);

  // Also log to console as fallback
  console.log("[DBG]", ...args);

  if (!flushTimer) {
    flushTimer = setTimeout(flush, 500);
  }
}

async function flush() {
  flushTimer = null;
  if (buffer.length === 0) return;

  const lines = buffer.splice(0, buffer.length);
  const text = lines.join("\n") + "\n";

  try {
    if (window.electronAPI) {
      // Find vault path from DOM
      const vaultPath = document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path");
      if (vaultPath) {
        const dir = `${vaultPath}/.noteriv`;
        await window.electronAPI.createDir(dir);
        const logPath = `${dir}/debug.log`;
        // Read existing, append, write back
        const existing = await window.electronAPI.readFile(logPath) || "";
        // Keep last 500 lines max
        const allLines = (existing + text).split("\n");
        const trimmed = allLines.slice(-500).join("\n");
        await window.electronAPI.writeFile(logPath, trimmed);
      }
    }
  } catch {}
}

/** Clear the debug log file */
export async function clearDebugLog(): Promise<void> {
  try {
    if (window.electronAPI) {
      const vaultPath = document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path");
      if (vaultPath) {
        await window.electronAPI.writeFile(`${vaultPath}/.noteriv/debug.log`, "");
      }
    }
  } catch {}
}
