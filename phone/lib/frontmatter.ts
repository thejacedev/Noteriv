export interface FrontmatterResult {
  data: Record<string, string | string[] | boolean | number>;
  body: string;
  raw: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Check whether content starts with a YAML frontmatter block.
 */
export function hasFrontmatter(content: string): boolean {
  return FRONTMATTER_REGEX.test(content);
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns the parsed data, the body (content after frontmatter), and the raw
 * frontmatter string (including delimiters).
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { data: {}, body: content, raw: '' };
  }

  const raw = match[0];
  const yamlBlock = match[1];
  const body = content.slice(raw.length);
  const data = parseSimpleYaml(yamlBlock);

  return { data, body, raw };
}

/**
 * Serialize a data object and body back into a frontmatter markdown string.
 */
export function serializeFrontmatter(
  data: Record<string, any>,
  body: string
): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return body;

  const lines: string[] = ['---'];

  for (const key of keys) {
    const value = data[key];
    lines.push(serializeYamlValue(key, value));
  }

  lines.push('---');

  const frontmatter = lines.join('\n');
  const separator = body.startsWith('\n') ? '' : '\n';
  return `${frontmatter}${separator}${body}`;
}

/**
 * Update or add a single key in the frontmatter of a markdown document.
 * If no frontmatter exists, one is created.
 */
export function updateFrontmatter(
  content: string,
  key: string,
  value: any
): string {
  const { data, body } = parseFrontmatter(content);
  data[key] = value;
  return serializeFrontmatter(data, body);
}

/**
 * Remove a key from the frontmatter. If the frontmatter becomes empty, it is
 * removed entirely.
 */
export function removeFrontmatterKey(content: string, key: string): string {
  const { data, body } = parseFrontmatter(content);
  delete data[key];

  if (Object.keys(data).length === 0) {
    return body;
  }

  return serializeFrontmatter(data, body);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseSimpleYaml(
  yaml: string
): Record<string, string | string[] | boolean | number> {
  const result: Record<string, string | string[] | boolean | number> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    if (!key) continue;

    result[key] = parseYamlValue(rawValue);
  }

  return result;
}

function parseYamlValue(raw: string): string | string[] | boolean | number {
  if (!raw || raw === '""' || raw === "''") return '';

  // Inline array: [a, b, c]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(',').map((item) => unquote(item.trim()));
  }

  // Boolean
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  // Quoted string
  return unquote(raw);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function serializeYamlValue(key: string, value: any): string {
  if (Array.isArray(value)) {
    const items = value.map((v: any) => String(v)).join(', ');
    return `${key}: [${items}]`;
  }

  if (typeof value === 'boolean') {
    return `${key}: ${value}`;
  }

  if (typeof value === 'number') {
    return `${key}: ${value}`;
  }

  const str = String(value);
  // Quote strings that contain characters that could confuse a YAML parser
  if (/[:#\[\]{}&*!|>'"%@`]/.test(str) || str.includes('\n')) {
    const escaped = str.replace(/"/g, '\\"');
    return `${key}: "${escaped}"`;
  }

  return `${key}: ${str}`;
}
