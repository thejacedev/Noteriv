/**
 * Utilities for parsing, serializing, and updating YAML frontmatter
 * in Markdown content.
 */

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

export interface FrontmatterResult {
  properties: Record<string, string>;
  body: string;
  raw: string;
}

/**
 * Check whether the content string starts with a YAML frontmatter block.
 */
export function hasFrontmatter(content: string): boolean {
  return FRONTMATTER_REGEX.test(content.trimStart());
}

/**
 * Parse YAML frontmatter from a Markdown content string.
 * Returns null if no frontmatter block is found.
 */
export function parseFrontmatter(content: string): FrontmatterResult | null {
  const trimmed = content.trimStart();
  const match = trimmed.match(FRONTMATTER_REGEX);
  if (!match) return null;

  const raw = match[0];
  const yamlBlock = match[1];
  const body = trimmed.slice(raw.length).replace(/^\r?\n/, "");

  const properties: Record<string, string> = {};
  const lines = yamlBlock.split(/\r?\n/);

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Handle YAML list values on single line: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).trim();
    }

    properties[key] = value;
  }

  return { properties, body, raw };
}

/**
 * Serialize a properties object back into a YAML frontmatter string
 * (including the --- delimiters).
 */
export function serializeFrontmatter(properties: Record<string, string>): string {
  const entries = Object.entries(properties);
  if (entries.length === 0) return "---\n---";

  const lines = entries.map(([key, value]) => {
    // If the value looks like a list (comma-separated), format as YAML list
    if (key === "tags" || key === "aliases") {
      const items = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (items.length > 0) {
        return `${key}: [${items.join(", ")}]`;
      }
    }
    return `${key}: ${value}`;
  });

  return `---\n${lines.join("\n")}\n---`;
}

/**
 * Update the frontmatter section of a content string with new properties.
 * If no frontmatter exists, it is prepended to the content.
 */
export function updateFrontmatter(
  content: string,
  properties: Record<string, string>
): string {
  const frontmatter = serializeFrontmatter(properties);
  const existing = parseFrontmatter(content);

  if (existing) {
    // Replace existing frontmatter, preserve the body
    return `${frontmatter}\n${existing.body}`;
  }

  // No existing frontmatter — prepend it
  const trimmedContent = content.trimStart();
  if (trimmedContent.length === 0) {
    return `${frontmatter}\n`;
  }
  return `${frontmatter}\n${trimmedContent}`;
}
