/**
 * Paths as they are written into the vault's own files (bookmarks, saved
 * layouts): from the top of the vault, with forward slashes. A vault is
 * synced between machines and sits in a different folder on each, so a full
 * path written on one would point nowhere on another.
 */

function slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function trimEnd(path: string): string {
  return slashes(path).replace(/\/+$/, "");
}

/** Whether a path starts at a drive or the root, rather than inside the vault. */
export function isAbsolutePath(path: string): boolean {
  return /^([A-Za-z]:[\\/]|[\\/])/.test(path);
}

/** A path inside the vault, from the vault's top. null for the vault itself or a path outside it. */
export function toVaultRelative(path: string, vaultPath: string): string | null {
  const root = trimEnd(vaultPath);
  const full = slashes(path);
  if (!root || !full.startsWith(`${root}/`)) return null;
  const rel = full.slice(root.length + 1).replace(/\/+$/, "");
  return rel === "" ? null : rel;
}

/**
 * The full path of something inside the vault, written the way the vault's
 * path is (backslashes on Windows). null when the relative path tries to
 * leave the vault.
 */
export function fromVaultRelative(relative: string, vaultPath: string): string | null {
  const parts = slashes(relative).split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.includes("..") || isAbsolutePath(relative)) return null;
  const root = vaultPath.replace(/[\\/]+$/, "");
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root, ...parts].join(separator);
}
