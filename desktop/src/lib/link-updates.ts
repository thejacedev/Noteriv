/**
 * What the app does with its open notes after a rename has rewritten links
 * across the vault. The rewriting itself is done by the backend
 * (`src-tauri/src/links.rs`); this keeps the open tabs in step with it.
 */

/** One link as it was written and as it is now, brackets included. */
export interface LinkChange {
  from: string;
  to: string;
}

/** What a rename changed for one open note. */
export interface OpenNoteUpdate {
  /** The note's path as the app sent it, from before the rename. */
  path: string;
  /** The note's text on disk now, when the rename changed it. */
  saved: string | null;
  /** The unsaved text the app sent, with the same links rewritten. */
  unsaved: string | null;
  changes: LinkChange[];
}

export interface RenameLinksResult {
  /** Whether the rename itself was done. Nothing is changed when it was not. */
  ok: boolean;
  error: string | null;
  notes: number;
  links: number;
  /** Notes that needed a change and could not be written. */
  failed: number;
  open: OpenNoteUpdate[];
}

/** Apply link changes to a text as plain replacements, longest first. */
export function applyLinkChanges(text: string, changes: LinkChange[]): string {
  const ordered = [...changes].sort((a, b) => b.from.length - a.from.length);
  let out = text;
  for (const { from, to } of ordered) {
    if (from && from !== to) out = out.split(from).join(to);
  }
  return out;
}

/**
 * An open note's text after a rename.
 *
 * `sentUnsaved` is the unsaved text that went to the backend with the
 * request, or undefined when the note had none. The tab is read again when
 * the answer arrives, because the vault scan takes a moment and the user may
 * have kept typing:
 *
 * - no unsaved edits: the tab takes the text now on disk
 * - the same unsaved text as was sent: the tab takes the backend's rewrite
 * - edited since: the link changes are applied to what is in the tab now
 *
 * The saved text always becomes what is on disk, so the next save is
 * compared against the right version.
 */
export function updateOpenNote(
  tab: { content: string; savedContent: string },
  update: OpenNoteUpdate,
  sentUnsaved: string | undefined
): { content: string; savedContent: string } {
  const savedContent = update.saved ?? tab.savedContent;
  if (tab.content === tab.savedContent) {
    return { content: savedContent, savedContent };
  }
  if (sentUnsaved !== undefined && tab.content === sentUnsaved) {
    return { content: update.unsaved ?? tab.content, savedContent };
  }
  return { content: applyLinkChanges(tab.content, update.changes), savedContent };
}

/** The status bar message after a rename, or null when no link changed. */
export function linkUpdateMessage(result: Pick<RenameLinksResult, "notes" | "links" | "failed">): string | null {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (result.links > 0) {
    parts.push(`Updated ${count(result.links, "link", "links")} in ${count(result.notes, "note", "notes")}`);
  }
  if (result.failed > 0) {
    parts.push(`${count(result.failed, "note", "notes")} could not be updated`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}
