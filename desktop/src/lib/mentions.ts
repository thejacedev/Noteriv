/**
 * Mentions of a note that are not links yet, and the links a note makes.
 *
 * An unlinked mention is a note's name, or one of its aliases, written as
 * plain text: a whole word or phrase, outside any link and outside code.
 */

import { isExternalPath, parseDestination, percentDecode } from "./link-resolve";

export interface TextRange {
  from: number;
  to: number;
}

/** The parts of a line that are already links or code, where a name is not a mention. */
export function protectedSpans(line: string): TextRange[] {
  const spans: TextRange[] = [];
  const patterns = [
    /!?\[\[[^\]]*\]\]/g, // [[wiki links]] and ![[embeds]]
    /!?\[[^\]]*\]\([^)]*\)/g, // [text](url) and images
    /(`+)[^`]*?\1/g, // inline code
    /\b(?:https?|mailto):[^\s)>\]]+/g, // bare addresses
    /(^|\s)#[\p{L}\p{N}_/-]+/gu, // #tags
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      spans.push({ from: match.index, to: match.index + match[0].length });
    }
  }
  return spans;
}

const WORD = /[\p{L}\p{N}_]/u;

/** Whether `[from, to)` stands as a word or phrase of its own in the line. */
function isWholeWord(line: string, from: number, to: number): boolean {
  const before = from > 0 ? line[from - 1] : "";
  const after = to < line.length ? line[to] : "";
  return !(before && WORD.test(before)) && !(after && WORD.test(after));
}

/**
 * Where `name` is mentioned on a line without being linked. Case is
 * ignored, as it is when a link is resolved.
 */
export function findMentions(line: string, name: string): TextRange[] {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  const lower = line.toLowerCase();
  // Lower-casing can change a string's length in a few scripts; then the
  // positions would not line up, so such a line is left alone.
  if (lower.length !== line.length) return [];
  const spans = protectedSpans(line);
  const found: TextRange[] = [];
  let pos = 0;
  for (;;) {
    const at = lower.indexOf(wanted, pos);
    if (at < 0) break;
    const end = at + wanted.length;
    const linked = spans.some((s) => at < s.to && end > s.from);
    if (!linked && isWholeWord(line, at, end)) found.push({ from: at, to: end });
    pos = end;
  }
  return found;
}

/**
 * The line with the mention at `[from, to)` turned into a link to
 * `noteName`. The text as written is kept as the display text when it
 * differs from the note's name, as with an alias.
 *
 * `write` builds the link, given the text to show when that is not the
 * note's own name. The app passes one that follows the link format chosen
 * in Settings; without it the link is a plain `[[wiki link]]` by name.
 */
export function linkMention(
  line: string,
  range: TextRange,
  noteName: string,
  write: (shown: string | undefined) => string = (shown) =>
    shown === undefined ? `[[${noteName}]]` : `[[${noteName}|${shown}]]`
): string {
  const written = line.slice(range.from, range.to);
  const link = write(written === noteName ? undefined : written);
  return line.slice(0, range.from) + link + line.slice(range.to);
}

/** Whether each line is inside a fenced code block. */
function fencedLines(lines: string[]): boolean[] {
  const inFence: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (match) {
      const marker = match[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      inFence.push(true);
      continue;
    }
    inFence.push(fence !== null);
  }
  return inFence;
}

export interface OutgoingLink {
  /** The note or file part of the link, as written. */
  target: string;
  /** 1-based line of its first appearance. */
  line: number;
  /** How many times the note links to it. */
  count: number;
  /** Written as an ordinary markdown link, `[text](target)`, whose path is read from the note's own folder. */
  markdown?: boolean;
}

/** The notes and files a note links to, each once, in order of first appearance. */
export function outgoingLinks(content: string): OutgoingLink[] {
  const lines = content.split("\n");
  const inFence = fencedLines(lines);
  const found = new Map<string, OutgoingLink>();
  lines.forEach((line, index) => {
    if (inFence[index]) return;
    const code = protectedSpans(line).filter((s) => line[s.from] === "`");
    const regex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const at = match.index;
      if (code.some((s) => at >= s.from && at < s.to)) continue;
      const target = match[1].split("|")[0].replace(/\\$/, "").split("#")[0].trim();
      if (!target) continue;
      const key = target.toLowerCase();
      const existing = found.get(key);
      if (existing) existing.count++;
      else found.set(key, { target, line: index + 1, count: 1 });
    }
    // Ordinary markdown links to files: [text](Other.md), ![](photo.png).
    for (const link of markdownFileLinks(line)) {
      if (code.some((s) => link.at >= s.from && link.at < s.to)) continue;
      const key = `](${link.path.toLowerCase()}`;
      const existing = found.get(key);
      if (existing) existing.count++;
      else found.set(key, { target: link.path, line: index + 1, count: 1, markdown: true });
    }
  });
  return [...found.values()];
}

/**
 * The markdown links on a line that could lead to a file of the vault: not
 * a web or mail address, and not a heading of the same note. `path` is the
 * file part, decoded, the way the resolver reads it.
 */
export function markdownFileLinks(line: string): { path: string; at: number }[] {
  const links: { path: string; at: number }[] = [];
  const regex = /\]\(((?:[^()]|\([^()]*\))+?)\)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const written = parseDestination(match[1]).path;
    if (!written || isExternalPath(written)) continue;
    links.push({ path: percentDecode(written) ?? written, at: match.index });
  }
  return links;
}

export interface PossibleLink {
  /** The note the text could link to, by name. */
  noteName: string;
  /** That note's path inside the vault, when the caller gave one. */
  notePath?: string;
  /** 1-based line and the place on it. */
  line: number;
  range: TextRange;
  text: string;
}

/**
 * Text in a note that matches the name or an alias of another note and is
 * not linked. `names` pairs each name to look for with the note it belongs
 * to, and may give that note's path so a link to it can be written as a
 * path. Names shorter than three characters are skipped: they match
 * everywhere.
 */
export function possibleLinks(
  content: string,
  names: { name: string; noteName: string; notePath?: string }[],
  limit = 100
): PossibleLink[] {
  const lines = content.split("\n");
  const inFence = fencedLines(lines);
  const lower = content.toLowerCase();
  const out: PossibleLink[] = [];
  for (const { name, noteName, notePath } of names) {
    const wanted = name.trim();
    if (wanted.length < 3 || !lower.includes(wanted.toLowerCase())) continue;
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      if (inFence[i]) continue;
      for (const range of findMentions(lines[i], wanted)) {
        out.push({ noteName, ...(notePath === undefined ? {} : { notePath }), line: i + 1, range, text: lines[i] });
        if (out.length >= limit) break;
      }
    }
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.line - b.line || a.range.from - b.range.from);
}
