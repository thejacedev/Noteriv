/**
 * Pure helpers for `![[...]]` embeds: working out what an embed points at and
 * which part of a note it shows. No DOM or file access here, so it can be tested.
 */

import { extractHeadings } from "./toc-utils";
import {
  findAnchorLine,
  frontmatterLineCount,
  splitWikiTarget,
  type WikiAnchor,
} from "./wiki-link-utils";

export type EmbedKind = "note" | "image" | "audio" | "video" | "pdf" | "base" | "other";

export interface ParsedEmbed {
  /** The target as written, without any `|size` or `|alias` part. */
  target: string;
  /** The file part of the target: a note name, or a file name with extension. */
  file: string;
  anchor: WikiAnchor | null;
  kind: EmbedKind;
  /** Display size for an image, from `![[image.png|160]]` or `|160x90`. */
  width?: number;
  height?: number;
  /** The page of a PDF, from `![[paper.pdf#page=3]]`. */
  page?: number;
}

// ".ico" and ".tiff" are here because the attachment list counts them as
// pictures and inserts them as embeds.
export const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/i;
const NOTE_EXTENSION = /\.(md|markdown)$/i;
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|ogg|flac|3gp)$/i;
const VIDEO_EXTENSION = /\.(mp4|webm|mov|mkv|ogv)$/i;
const PDF_EXTENSION = /\.pdf$/i;

/**
 * Whether an embed of this file shows the file itself in the note: a
 * picture, or a player for a recording or a video. Anything else is better
 * written as a plain link.
 */
export function embedsInPlace(fileName: string): boolean {
  return IMAGE_EXTENSION.test(fileName) || AUDIO_EXTENSION.test(fileName) || VIDEO_EXTENSION.test(fileName);
}

/** The page a link to a PDF names: "paper.pdf#page=3" gives 3. */
export function pdfPage(target: string): number | undefined {
  const match = target.match(/#(?:.*&)?page=(\d+)/i);
  const page = match ? Number(match[1]) : NaN;
  return Number.isFinite(page) && page >= 1 ? page : undefined;
}
// Files that open in their own view; an embed of one stays a link.
const OTHER_EXTENSION = /\.(drawing|canvas|board|pdf|mp3|wav|m4a|ogg|flac|mp4|webm|mov|mkv|zip|csv|json|txt)$/i;

/** Parse the text between `![[` and `]]`. */
export function parseEmbed(inner: string): ParsedEmbed {
  const pipe = inner.indexOf("|");
  const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  const option = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
  const { file, anchor } = splitWikiTarget(target);

  let kind: EmbedKind = "note";
  if (IMAGE_EXTENSION.test(file)) kind = "image";
  else if (AUDIO_EXTENSION.test(file)) kind = "audio";
  else if (VIDEO_EXTENSION.test(file)) kind = "video";
  else if (PDF_EXTENSION.test(file)) kind = "pdf";
  // A base shows its views in place; "Projects.base#Open" names one of them.
  else if (/\.base$/i.test(file)) kind = "base";
  else if (!NOTE_EXTENSION.test(file) && OTHER_EXTENSION.test(file)) kind = "other";

  const parsed: ParsedEmbed = { target, file, anchor, kind };
  if (kind === "pdf") parsed.page = pdfPage(target);
  const size = option.match(/^(\d+)(?:x(\d+))?$/);
  if (kind === "image" && size) {
    parsed.width = Number(size[1]);
    if (size[2]) parsed.height = Number(size[2]);
  }
  return parsed;
}

/** "Note" or "Note > Heading", for the embed's title bar. */
export function embedTitle(embed: ParsedEmbed): string {
  const name = embed.file.replace(NOTE_EXTENSION, "").split("/").pop() || embed.file;
  if (!embed.anchor) return name;
  return embed.anchor.type === "heading"
    ? `${name} › ${embed.anchor.text}`
    : `${name} › ^${embed.anchor.id}`;
}

/**
 * The markdown an embed shows: the whole note without its frontmatter, the
 * section under a heading, or the block carrying a block id. Returns null when
 * the heading or block does not exist.
 */
export function extractEmbedSection(content: string, anchor: WikiAnchor | null): string | null {
  const lines = content.split("\n");

  if (!anchor) {
    return lines.slice(frontmatterLineCount(lines)).join("\n").trim();
  }

  const lineNumber = findAnchorLine(content, anchor);
  if (lineNumber === null) return null;
  const start = lineNumber - 1;

  if (anchor.type === "heading") {
    const headings = extractHeadings(content);
    const heading = headings.find((h) => h.line === lineNumber);
    const next = headings.find((h) => h.line > lineNumber && (!heading || h.level <= heading.level));
    const end = next ? next.line - 1 : lines.length;
    return lines.slice(start, end).join("\n").trim();
  }

  // A block: the run of non-blank lines around the line that carries the id.
  let from = start;
  while (from > 0 && lines[from - 1].trim()) from--;
  let to = start;
  while (to < lines.length - 1 && lines[to + 1].trim()) to++;
  return lines
    .slice(from, to + 1)
    .map((line) => line.replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, ""))
    .filter((line, index, all) => line.trim() || (index > 0 && index < all.length - 1))
    .join("\n")
    .trim();
}

/**
 * Cut very long embedded content down so one embed cannot dominate a note.
 * Returns the text to render and how many lines were left out.
 */
export function truncateEmbed(markdown: string, maxLines = 150): { text: string; hiddenLines: number } {
  const lines = markdown.split("\n");
  if (lines.length <= maxLines) return { text: markdown, hiddenLines: 0 };

  // Do not cut inside a fenced code block: close it at the cut.
  const kept = lines.slice(0, maxLines);
  const fences = kept.filter((line) => /^(```|~~~)/.test(line)).length;
  if (fences % 2 === 1) kept.push("```");
  return { text: kept.join("\n"), hiddenLines: lines.length - maxLines };
}
