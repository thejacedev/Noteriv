/**
 * Shared utilities for wiki link parsing, resolution, and backlink scanning.
 */

import { extractHeadings } from "./toc-utils";
import { folderOf, joinPath } from "./link-resolve";

/** The place inside a note that a wiki link points at. */
export type WikiAnchor =
  | { type: "heading"; text: string }
  | { type: "block"; id: string };

export interface WikiTarget {
  /** The note part. Empty for a link within the same note, e.g. [[#Heading]]. */
  file: string;
  anchor: WikiAnchor | null;
}

/**
 * Split a wiki link target (the part before any "|") into the note and the
 * heading or block it points at:
 *   "Note"            -> note only
 *   "Note#Heading"    -> heading
 *   "Note#^block-id"  -> block
 *   "#Heading"        -> heading in the current note
 */
export function splitWikiTarget(target: string): WikiTarget {
  const hash = target.indexOf("#");
  if (hash < 0) return { file: target.trim(), anchor: null };

  const file = target.slice(0, hash).trim();
  // "Note#H1#H2" narrows down through nested headings; the last one is the target.
  const fragment = (target.slice(hash + 1).split("#").pop() ?? "").trim();
  if (!fragment) return { file, anchor: null };

  if (fragment.startsWith("^")) {
    const id = fragment.slice(1).trim();
    return { file, anchor: id ? { type: "block", id } : null };
  }
  return { file, anchor: { type: "heading", text: fragment } };
}

/** Compare heading text the way a link refers to it: case, spacing and inline markup ignored. */
function normalizeHeading(text: string): string {
  return text
    .replace(/\s+#+\s*$/, "") // closing hashes: "## Title ##"
    .replace(/[*_`~=]/g, "") // inline markup
    .replace(/[#^|[\]]/g, " ") // characters a link target cannot contain
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Number of lines taken by YAML frontmatter at the top of a note, or 0. */
export function frontmatterLineCount(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

/**
 * Find the 1-based line a wiki link anchor points at, or null when the note
 * has no such heading or block.
 */
export function findAnchorLine(content: string, anchor: WikiAnchor): number | null {
  const lines = content.split("\n");
  const skip = frontmatterLineCount(lines);

  if (anchor.type === "heading") {
    const want = normalizeHeading(anchor.text);
    if (!want) return null;
    const hit = extractHeadings(content).find(
      (h) => h.line > skip && normalizeHeading(h.text) === want
    );
    return hit ? hit.line : null;
  }

  const id = anchor.id.toLowerCase();
  let inCodeBlock = false;
  for (let i = skip; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/(?:^|\s)\^([A-Za-z0-9-]+)\s*$/);
    if (!match || match[1].toLowerCase() !== id) continue;

    // An id on a line of its own labels the block above it.
    if (line.trim() === `^${match[1]}`) {
      for (let j = i - 1; j >= skip; j--) {
        if (lines[j].trim()) return j + 1;
      }
    }
    return i + 1;
  }
  return null;
}

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

/** How a link's note part is compared: `\\` read as `/`, extension dropped, lower case. */
export function linkKey(text: string): string {
  return text.replace(/\\/g, "/").replace(/\.(md|markdown)$/i, "").toLowerCase();
}

/**
 * The note a wiki link's note part points at: the first note, in listing
 * order, whose name or whole path inside the vault matches. This is where a
 * click on the link goes.
 *
 * The backend has a second copy of this rule (`src-tauri/src/links.rs`),
 * which it uses to rewrite links when a note is renamed. Both are tested
 * against `__fixtures__/link-resolution.json`; change them together.
 */
export function findLinkedNote<T extends { filePath: string; relativePath?: string }>(
  files: T[],
  target: string
): T | null {
  const wanted = linkKey(target.trim());
  if (!wanted) return null;
  return (
    files.find((f) => {
      const name = linkKey(f.filePath.replace(/\\/g, "/").split("/").pop() || "");
      return name === wanted || linkKey(f.relativePath ?? "") === wanted;
    }) ?? null
  );
}

/**
 * As `findLinkedNote`, for a link written in the note at `from` (its path
 * inside the vault). A target that starts with "./" or "../" is a path from
 * that note's folder; when no note is there, and for every other target,
 * the note is found by name or by its whole path, as above.
 */
export function findLinkedNoteFrom<T extends { filePath: string; relativePath?: string }>(
  files: T[],
  from: string,
  target: string
): T | null {
  const path = target.trim().replace(/\\/g, "/");
  if (path.startsWith("./") || path.startsWith("../")) {
    const place = joinPath(folderOf(from.replace(/\\/g, "/")), path);
    const wanted = place ? linkKey(place) : "";
    const beside = wanted ? files.find((f) => linkKey(f.relativePath ?? "") === wanted) : undefined;
    if (beside) return beside;
  }
  return findLinkedNote(files, target);
}

/**
 * The file a link to something other than a note points at, such as
 * `[[paper.pdf]]`: by its path inside the vault, or failing that by its
 * name, with the shallowest file winning a shared name. `files` are paths
 * inside the vault with "/". The backend's `links.rs` resolves these the
 * same way when a file is renamed.
 */
export function findLinkedFile(files: string[], target: string): string | null {
  const wanted = target.trim().replace(/\\/g, "/").toLowerCase();
  if (!wanted) return null;
  const exact = files.find((f) => f.toLowerCase() === wanted);
  if (exact) return exact;
  const name = wanted.split("/").pop() || wanted;
  let best: string | null = null;
  for (const file of files) {
    if ((file.split("/").pop() || file).toLowerCase() !== name) continue;
    const depth = file.split("/").length;
    if (best === null || depth < best.split("/").length || (depth === best.split("/").length && file < best)) {
      best = file;
    }
  }
  return best;
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
  // Match [[targetBase]], [[targetBase#heading]], [[targetBase|...]] and the
  // ![[...]] embed forms of each.
  const regex = new RegExp(
    `!?\\[\\[${escapeRegex(targetBase)}(?:#[^\\]|]*)?(?:\\|[^\\]]*)?\\]\\]`,
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
