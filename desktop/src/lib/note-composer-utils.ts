/**
 * Utility functions for the Note Composer feature.
 * Handles merging multiple notes and splitting notes by headings.
 */

/**
 * Sanitize a heading string into a safe file name.
 * Removes special characters, replaces spaces with hyphens, and trims.
 */
export function sanitizeFileName(heading: string): string {
  return heading
    .replace(/[<>:"/\\|?*#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) || "Untitled";
}

/**
 * Merge multiple notes' contents together.
 * @param contents - Array of { name, content } objects representing notes to merge
 * @param addHeadings - If true, adds an h2 heading (the filename) before each merged note
 * @returns The merged content string
 */
export function mergeNotes(
  contents: { name: string; content: string }[],
  addHeadings: boolean
): string {
  const parts: string[] = [];

  for (const { name, content } of contents) {
    if (addHeadings) {
      const displayName = name.replace(/\.(md|markdown)$/i, "");
      parts.push(`## ${displayName}`);
      parts.push("");
    }
    parts.push(content.trim());
    parts.push("");
  }

  return parts.join("\n").trimEnd() + "\n";
}

/**
 * Split markdown content by heading boundaries.
 * @param content - The markdown content to split
 * @param level - The heading level to split on (1 for h1, 2 for h2)
 * @returns Array of { title, content } objects representing the split sections
 */
export function splitByHeadings(
  content: string,
  level: number
): { title: string; content: string }[] {
  const lines = content.split("\n");
  const prefix = "#".repeat(level) + " ";
  const sections: { title: string; content: string }[] = [];

  let currentTitle = "";
  let currentLines: string[] = [];
  let foundFirst = false;

  for (const line of lines) {
    if (line.startsWith(prefix) && !line.startsWith(prefix + "#")) {
      // This line is a heading at the target level
      if (foundFirst) {
        // Save the previous section
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      } else if (currentLines.some((l) => l.trim() !== "")) {
        // Content before the first heading goes into a "preamble" section
        sections.push({
          title: "Preamble",
          content: currentLines.join("\n").trim(),
        });
      }

      currentTitle = line.slice(prefix.length).trim();
      currentLines = [line];
      foundFirst = true;
    } else {
      currentLines.push(line);
    }
  }

  // Push the last section
  if (foundFirst) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  } else if (currentLines.some((l) => l.trim() !== "")) {
    // No headings found at this level; return entire content as one section
    sections.push({
      title: "Untitled",
      content: currentLines.join("\n").trim(),
    });
  }

  return sections;
}
