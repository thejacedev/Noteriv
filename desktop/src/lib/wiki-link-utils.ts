/**
 * Shared utilities for wiki link parsing, resolution, and backlink scanning.
 */

export interface ParsedWikiLink {
  filename: string;
  display: string | null;
}

export interface Backlink {
  filePath: string;
  fileName: string;
  relativePath: string;
  /** Line number (1-based) where the backlink was found */
  line: number;
  /** Surrounding text snippet */
  snippet: string;
}

export interface FileInfo {
  filePath: string;
  fileName: string;
  relativePath?: string;
}

/**
 * Parse a wiki link's inner text (without the surrounding [[ ]]).
 * Handles [[filename]] and [[filename|display text]].
 */
export function parseWikiLink(text: string): ParsedWikiLink {
  const pipeIndex = text.indexOf("|");
  if (pipeIndex >= 0) {
    return {
      filename: text.slice(0, pipeIndex).trim(),
      display: text.slice(pipeIndex + 1).trim(),
    };
  }
  return {
    filename: text.trim(),
    display: null,
  };
}

/**
 * Resolve a wiki link filename to a full file path.
 * Searches for `filename.md` (case-insensitive basename match) in the list of all files.
 * Returns the full file path, or null if not found.
 */
export function resolveWikiLink(
  filename: string,
  allFiles: FileInfo[]
): string | null {
  // Normalize: strip .md extension if the user included it
  const normalizedName = filename.replace(/\.md$/i, "");
  const targetLower = normalizedName.toLowerCase();

  // First pass: exact basename match (without extension)
  for (const file of allFiles) {
    const baseName = file.fileName.replace(/\.md$/i, "");
    if (baseName.toLowerCase() === targetLower) {
      return file.filePath;
    }
  }

  // Second pass: check if filename includes path segments (e.g. "folder/note")
  if (normalizedName.includes("/")) {
    const targetPathLower = normalizedName.toLowerCase() + ".md";
    for (const file of allFiles) {
      const rel = file.relativePath ?? file.filePath;
      if (rel.toLowerCase().endsWith(targetPathLower)) {
        return file.filePath;
      }
    }
  }

  return null;
}

/**
 * Find all files that contain backlinks to the target file.
 * Scans all .md files for [[targetFileName]] references.
 */
export async function findBacklinks(
  targetFileName: string,
  vaultPath: string,
  allFiles: FileInfo[],
  readFile: (path: string) => Promise<string | null>
): Promise<Backlink[]> {
  const backlinks: Backlink[] = [];
  // Strip .md for matching
  const targetBase = targetFileName.replace(/\.md$/i, "");
  // Match [[targetBase]], [[targetBase|...]], ![[targetBase]], ![[targetBase|...]]
  const regex = new RegExp(
    `!?\\[\\[${escapeRegex(targetBase)}(?:\\|[^\\]]*)?\\]\\]`,
    "gi"
  );

  const promises = allFiles.map(async (file) => {
    // Don't look for self-references
    const fileBase = file.fileName.replace(/\.md$/i, "");
    if (fileBase.toLowerCase() === targetBase.toLowerCase()) return;

    const content = await readFile(file.filePath);
    if (!content) return;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line)) {
        // Extract a snippet: up to 120 chars centered around the match
        const snippet = line.trim().slice(0, 120);
        backlinks.push({
          filePath: file.filePath,
          fileName: file.fileName,
          relativePath: file.relativePath ?? file.fileName,
          line: i + 1,
          snippet,
        });
      }
      // Reset regex lastIndex since we reuse it
      regex.lastIndex = 0;
    }
  });

  await Promise.all(promises);

  // Sort by file name, then line number
  backlinks.sort((a, b) => {
    const nameCompare = a.fileName.localeCompare(b.fileName);
    if (nameCompare !== 0) return nameCompare;
    return a.line - b.line;
  });

  return backlinks;
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
