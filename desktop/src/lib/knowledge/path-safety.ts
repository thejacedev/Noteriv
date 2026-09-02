const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizeRelativePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function validateRelativeFolder(path: string): string {
  const normalized = normalizeRelativePath(path).replace(/\/+$/, "");
  if (!normalized) return "";
  validateSegments(normalized);
  return normalized;
}

export function validateRelativeNotePath(path: string): string {
  const normalized = normalizeRelativePath(path);
  if (!normalized) throw new Error("A note path is required");
  validateSegments(normalized);
  if (!/\.(md|markdown)$/i.test(normalized)) {
    throw new Error("Knowledge changes can only target Markdown notes");
  }
  return normalized;
}

function validateSegments(path: string): void {
  if (path.includes("\0")) throw new Error("Paths cannot contain null bytes");
  if (path.startsWith("/") || path.startsWith("//") || /^[a-z]:/i.test(path)) {
    throw new Error("Paths must be relative to the destination vault");
  }
  if (path.length > 1024) throw new Error("The destination path is too long");

  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Paths cannot contain empty, current, or parent directory segments");
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    throw new Error("Knowledge notes cannot be written to hidden paths");
  }
  if (segments.some((segment) => /[<>:"|?*\u0000-\u001f]/.test(segment) || /[. ]$/.test(segment))) {
    throw new Error("The destination contains characters that are unsafe across supported platforms");
  }
  if (segments.some((segment) => WINDOWS_RESERVED_NAME.test(segment))) {
    throw new Error("The destination uses a reserved file name");
  }
}

export function joinVaultPath(vaultPath: string, relativePath: string): string {
  const safeRelativePath = validateRelativeNotePath(relativePath);
  const rawRoot = vaultPath.trim().replace(/\\/g, "/");
  const root = rawRoot.replace(/\/+$/, "") || (rawRoot.startsWith("/") ? "/" : "");
  if (!root) throw new Error("A destination vault is required");
  return root === "/" ? `/${safeRelativePath}` : `${root}/${safeRelativePath}`;
}

export function sanitizeNoteTitle(title: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);

  if (!sanitized || WINDOWS_RESERVED_NAME.test(sanitized)) return "Untitled Knowledge";
  return sanitized;
}

export function buildRelativeNotePath(folder: string, title: string): string {
  const safeFolder = validateRelativeFolder(folder);
  const filename = `${sanitizeNoteTitle(title)}.md`;
  return validateRelativeNotePath(safeFolder ? `${safeFolder}/${filename}` : filename);
}

export function relativePathFromVault(vaultPath: string, absolutePath: string): string | null {
  const root = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const candidate = absolutePath.replace(/\\/g, "/");
  const isWindowsPath = /^[a-z]:\//i.test(root);
  const comparableRoot = isWindowsPath ? root.toLowerCase() : root;
  const comparableCandidate = isWindowsPath ? candidate.toLowerCase() : candidate;
  const prefix = comparableRoot === "/" ? "/" : `${comparableRoot}/`;
  if (!comparableCandidate.startsWith(prefix)) return null;
  const relative = candidate.slice(root === "/" ? 1 : root.length + 1);
  try {
    return validateRelativeNotePath(relative);
  } catch {
    return null;
  }
}
