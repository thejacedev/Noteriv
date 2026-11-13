/**
 * The footnotes in a note, for the footnotes panel: numbered definitions
 * (`[^1]: text`), with how often each is referred to, and footnotes written
 * in place (`^[text]`).
 */

export interface Footnote {
  /** The label of a numbered footnote, or null for one written in place. */
  id: string | null;
  text: string;
  /** 1-based line of the definition, or of the inline footnote. */
  line: number;
  /** How many `[^id]` references point at it. Always 1 for an inline one. */
  references: number;
  /** A reference with no definition has no text to show. */
  missing: boolean;
}

export function extractFootnotes(content: string): Footnote[] {
  const lines = content.split("\n");
  const definitions = new Map<string, Footnote>();
  const referenceCounts = new Map<string, number>();
  const firstReference = new Map<string, number>();
  const inline: Footnote[] = [];
  let fence: string | null = null;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    if (fence !== null) return;

    const definition = line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
    if (definition) {
      if (!definitions.has(definition[1])) {
        definitions.set(definition[1], { id: definition[1], text: definition[2].trim(), line: index + 1, references: 0, missing: false });
      }
      return;
    }
    // Inline code is not searched: `[^1]` in backticks is an example.
    const text = line.replace(/(`+)[^`]*?\1/g, (code) => " ".repeat(code.length));
    for (const match of text.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) {
      referenceCounts.set(match[1], (referenceCounts.get(match[1]) ?? 0) + 1);
      if (!firstReference.has(match[1])) firstReference.set(match[1], index + 1);
    }
    for (const match of text.matchAll(/\^\[([^\]]+)\]/g)) {
      inline.push({ id: null, text: match[1].trim(), line: index + 1, references: 1, missing: false });
    }
  });

  const numbered: Footnote[] = [];
  for (const [id, footnote] of definitions) {
    numbered.push({ ...footnote, references: referenceCounts.get(id) ?? 0 });
  }
  for (const [id, count] of referenceCounts) {
    if (!definitions.has(id)) {
      numbered.push({ id, text: "", line: firstReference.get(id) ?? 1, references: count, missing: true });
    }
  }
  return [...numbered, ...inline].sort((a, b) => a.line - b.line);
}
