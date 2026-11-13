/**
 * Writing a link to a file in the vault, in the format chosen in Settings.
 *
 * Whatever is written here is checked against the rule that reads links
 * (`link-resolve.ts`): a form is only used when it leads back to the file it
 * was written for, from the note it is written in. Two notes can share a
 * name, a folder at the top of the vault can shadow one beside the note, and
 * so the shortest form that works differs from note to note.
 */

import { IMAGE_EXTENSION } from "./embed-utils";
import {
  LinkIndex,
  encodePath,
  folderOf,
  isNotePath,
  percentEncode,
  relativePath,
  stripNoteExt,
} from "./link-resolve";

/**
 * How the path in a new link is written:
 * - "shortest": the file's name alone when that is enough to find it,
 *   otherwise its path from the top of the vault
 * - "relative": the path from the folder of the note the link is in
 * - "absolute": the path from the top of the vault
 */
export type LinkFormat = "shortest" | "relative" | "absolute";

export interface LinkRequest {
  /** The file to link to, as a path inside the vault with "/" between folders. */
  target: string;
  /** The note the link is written in, as a path inside the vault. */
  from: string;
  /**
   * Every file in the vault, with the notes in the order the app lists
   * them, or an index already built from that list.
   */
  files: string[] | LinkIndex;
  format: LinkFormat;
  /** Write `[[Note]]`. When false, `[Note](Note.md)`. */
  wikilinks: boolean;
  /** Text to show in place of the file's name. */
  alias?: string;
  /** A heading or block inside the note: "Heading", "#Heading" or "#^block-id". */
  fragment?: string;
  /** Show the file in place: `![[photo.png]]` or `![photo.png](photo.png)`. */
  embed?: boolean;
}

function fileName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

/**
 * The ways to write a path in the chosen format, most wanted first, then
 * the ones that are tried when none of those leads to the file.
 *
 * A relative path is written bare ("Deep/Spec") when that is read as
 * relative, and with "./" when the bare path would be found somewhere else
 * first: at the top of the vault, or by name.
 */
function pathForms(format: LinkFormat, top: string, from: string, lastResort: string[]): string[] {
  const relative = relativePath(folderOf(from), top);
  const fromNote = relative.startsWith("../") ? [relative] : [relative, `./${relative}`];
  const wanted =
    format === "shortest" ? [fileName(top), top] : format === "relative" ? fromNote : [top];
  return [...wanted, top, ...lastResort];
}

/**
 * The file part of a wiki link to the target, or null when no wiki link can
 * name it: `]` and `|` end a wiki link wherever they appear.
 */
function wikiPath(index: LinkIndex, request: LinkRequest, fragment: string): string | null {
  const { target, from, format } = request;
  // A note is written without its ".md", and with it when the name without
  // it is some other file: "photo.png.md" beside a "photo.png".
  const shown = isNotePath(target) ? [stripNoteExt(target), target] : [target];
  const forms = shown.map((top) => {
    const relative = relativePath(folderOf(from), top);
    // A path from the note's own folder is always read as written.
    return pathForms(format, top, from, [relative.startsWith("../") ? relative : `./${relative}`]);
  });
  for (let i = 0; i < forms[0].length; i++) {
    for (const paths of forms) {
      const path = paths[i];
      if (/[[\]|]/.test(path) || path !== path.trim()) continue;
      // The app opens a link by trying the whole target as a name first and
      // then cutting it at the first "#". A name with "#" in it cannot be
      // followed by a heading and still be read back.
      if (fragment && path.includes("#")) continue;
      const read = index.wikiLink(from, path + fragment);
      if (read && read.file === target && read.written === path) return path;
    }
  }
  return null;
}

/** The path of a markdown link to the target, percent-encoded. */
function markdownPath(index: LinkIndex, request: LinkRequest): string {
  const { target, from, format } = request;
  // "/path" is always read from the top of the vault, so it cannot fail.
  const forms = pathForms(format, target, from, [`/${target}`]);
  for (const path of forms) {
    const written = encodePath(path);
    if (index.markdown(from, written) === target) return written;
  }
  return encodePath(forms[forms.length - 1]);
}

/** "#Heading" with what a link's path cannot hold encoded; `^`, `=` and `&` are kept readable. */
function encodeFragment(fragment: string): string {
  if (!fragment) return "";
  const encoded = percentEncode(fragment.slice(1))
    .replace(/%5E/g, "^")
    .replace(/%3D/g, "=")
    .replace(/%26/g, "&");
  return `#${encoded}`;
}

/**
 * A link to a file in the vault, written in the chosen format. It resolves
 * back to `target` from the note `from`.
 *
 * With wikilinks off the link is `[text](path.md)`. One thing is written as
 * a wiki link all the same: an embed of anything but an image, because
 * `![[...]]` is the only form the editor shows in place for a note, a
 * recording or a PDF. The other way round, a wiki link falls back to the
 * markdown form when the file's name holds a character a wiki link cannot
 * (`[`, `]`, `|`).
 */
export function formatLink(request: LinkRequest): string {
  const { target, embed = false } = request;
  const index = (request.files instanceof LinkIndex ? request.files : new LinkIndex(request.files)).with(target);
  const body = (request.fragment ?? "").trim().replace(/^#/, "");
  const fragment = body ? `#${body}` : "";
  const alias = request.alias?.trim() ?? "";
  const bang = embed ? "!" : "";

  const asWiki = request.wikilinks || (embed && !IMAGE_EXTENSION.test(target));
  if (asWiki && !/[[\]|\n]/.test(alias) && !/[[\]|\n]/.test(fragment)) {
    const path = wikiPath(index, request, fragment);
    if (path !== null) return `${bang}[[${path}${fragment}${alias ? `|${alias}` : ""}]]`;
  }

  const name = fileName(target);
  // Square brackets would end the link text early.
  const text = (alias || (isNotePath(name) ? stripNoteExt(name) : name)).replace(/[[\]\n]/g, "").trim();
  return `${bang}[${text || "link"}](${markdownPath(index, request)}${encodeFragment(fragment)})`;
}
