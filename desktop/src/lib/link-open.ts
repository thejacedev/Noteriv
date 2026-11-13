/**
 * Where a click on a link leads, for the links whose answer depends on the
 * note they are written in:
 *
 * - a markdown link, `[text](path.md)`, to a note or a file in the vault,
 *   or to a heading in the same note, `[text](#Heading)`
 * - a wiki link written as a path from its own note, `[[./Note]]` or
 *   `[[../img/photo.png]]`
 *
 * Every other wiki link is found by name or by its path inside the vault,
 * wherever it is written; the app's click handler does that itself.
 */

import { pdfPage } from "./embed-utils";
import { LinkIndex, folderOf, isNotePath, joinPath, parseDestination, percentDecode } from "./link-resolve";
import { buildLinkIndex, vaultRelative } from "./vault-links";
import { splitWikiTarget, type WikiAnchor } from "./wiki-link-utils";

/** What to open, and where in it to go. */
export interface LinkPlace {
  /** The file's full path. */
  filePath: string;
  /** A heading or block to scroll to, in a note. */
  anchor: WikiAnchor | null;
  /** A page to show, in a PDF. */
  page?: number;
}

/** A note as the app lists it. */
interface ListedNote {
  filePath: string;
  relativePath: string;
}

/**
 * The file a wiki link names by a path from the note it is in, with the
 * heading split off. The whole target is tried first, then the part before
 * each "#". Null when the target is not such a path, or nothing is there.
 */
function besideNote(index: LinkIndex, from: string, target: string): { file: string; fragment: string } | null {
  const path = target.trim().replace(/\\/g, "/");
  if (!path.startsWith("./") && !path.startsWith("../")) return null;
  const cuts = [path.length];
  for (let i = path.indexOf("#"); i >= 0; i = path.indexOf("#", i + 1)) cuts.push(i);
  for (const cut of cuts) {
    const file = index.fileAt(joinPath(folderOf(from), path.slice(0, cut).trim()));
    if (file) return { file, fragment: path.slice(cut) };
  }
  return null;
}

/** A heading link's "#Heading" or "#^block" as the place it names. */
function anchorOf(fragment: string): WikiAnchor | null {
  return fragment ? splitWikiTarget(fragment).anchor : null;
}

/** Whether a wiki link target is written as a path from its own note. */
function startsAtNote(wikiTarget: string): boolean {
  const path = wikiTarget.trim().replace(/\\/g, "/");
  return path.startsWith("./") || path.startsWith("../");
}

/**
 * The place a link leads to, or null when this is not a link whose place
 * depends on its note, or when it leads nowhere.
 *
 * `markdownDest` is the destination of a markdown link as written (the text
 * between `](` and `)`), or null for a wiki link, whose target is
 * `wikiTarget`. `fromNote` is the full path of the note the link is in, and
 * `notes` the app's listing of the vault's notes.
 */
export async function linkPlace(
  vaultPath: string,
  notes: ListedNote[],
  fromNote: string | null,
  markdownDest: string | null,
  wikiTarget: string
): Promise<LinkPlace | null> {
  // Any other wiki link is not ours, and costs nothing to turn away.
  if (markdownDest === null && !startsAtNote(wikiTarget)) return null;
  const allFiles = await window.electronAPI.listVaultFiles(vaultPath);
  return findLinkPlace(vaultPath, notes, allFiles, fromNote, markdownDest, wikiTarget);
}

/** `linkPlace` with the vault's files given: `allFiles` is every file, as a path inside the vault. */
export function findLinkPlace(
  vaultPath: string,
  notes: ListedNote[],
  allFiles: string[],
  fromNote: string | null,
  markdownDest: string | null,
  wikiTarget: string
): LinkPlace | null {
  const from = (fromNote ? vaultRelative(vaultPath, fromNote) : null) ?? "";
  const index = buildLinkIndex(notes, allFiles);

  let file: string | null;
  let fragment: string;
  if (markdownDest !== null) {
    const dest = parseDestination(markdownDest);
    fragment = percentDecode(dest.fragment) ?? dest.fragment;
    // "[text](#Heading)" stays in the note the link is in.
    if (!dest.path) {
      const anchor = anchorOf(fragment);
      return fromNote && anchor ? { filePath: fromNote, anchor } : null;
    }
    file = index.markdown(from, dest.path);
  } else {
    const found = besideNote(index, from, wikiTarget);
    file = found?.file ?? null;
    fragment = found?.fragment ?? "";
  }
  if (!file) return null;

  if (!isNotePath(file)) {
    return { filePath: `${vaultPath}/${file}`, anchor: null, page: pdfPage(`${file}${fragment}`) };
  }
  // A note is opened under the path the app lists it by, so that a tab
  // already open on it is found.
  const listed = notes.find((note) => note.relativePath.replace(/\\/g, "/") === file);
  return { filePath: listed?.filePath ?? `${vaultPath}/${file}`, anchor: anchorOf(fragment) };
}
