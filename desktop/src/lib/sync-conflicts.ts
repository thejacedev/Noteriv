/**
 * The notes a sync kept two versions of, held until the user dismisses the
 * notice. Sync resolves a conflict as it runs, so a later run does not report
 * it again: what is collected here is the only record the app has.
 */

/** One note that sync kept two versions of, as the sync command reports it. */
export interface ConflictCopy {
  /** The note, relative to the vault, with "/" between folders. */
  note: string;
  /** The conflict copy, relative the same way. */
  copy: string;
  /**
   * The copy's full path, for opening it. Null when the copy is not in the
   * vault: push-only folder sync keeps it in the target folder.
   */
  copyPath: string | null;
}

/** A reported conflict, with the vault it happened in. */
export interface SyncConflict extends ConflictCopy {
  vaultPath: string;
}

const key = (c: SyncConflict) => `${c.vaultPath}\n${c.copy}`;

/**
 * Add what a run reported to the conflicts not yet dismissed. A run that
 * reports nothing changes nothing, so a clean sync never clears the notice.
 */
export function addConflicts(
  current: SyncConflict[],
  vaultPath: string,
  reported: ConflictCopy[] | null | undefined,
): SyncConflict[] {
  if (!reported || reported.length === 0) return current;
  const seen = new Set(current.map(key));
  const added: SyncConflict[] = [];
  for (const c of reported) {
    const conflict: SyncConflict = {
      note: c.note,
      copy: c.copy,
      copyPath: c.copyPath ?? null,
      vaultPath,
    };
    if (seen.has(key(conflict))) continue;
    seen.add(key(conflict));
    added.push(conflict);
  }
  return added.length > 0 ? [...current, ...added] : current;
}

/** The conflicts to show while this vault is open. */
export function conflictsFor(
  current: SyncConflict[],
  vaultPath: string | null | undefined,
): SyncConflict[] {
  if (!vaultPath) return [];
  return current.filter((c) => c.vaultPath === vaultPath);
}

/** Forget one vault's conflicts; other vaults keep theirs. */
export function dismissConflicts(
  current: SyncConflict[],
  vaultPath: string | null | undefined,
): SyncConflict[] {
  if (!vaultPath) return current;
  return current.filter((c) => c.vaultPath !== vaultPath);
}

/**
 * Drop one copy's entry, for a copy that is no longer where sync left it:
 * the user has deleted, renamed or moved it, which is how a conflict ends.
 */
export function removeConflictCopy(current: SyncConflict[], copyPath: string): SyncConflict[] {
  const next = current.filter((c) => c.copyPath !== copyPath);
  return next.length === current.length ? current : next;
}

/** A full path's folder and file name, for either kind of path separator. */
export function splitPath(filePath: string): { folder: string; name: string } {
  const cut = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (cut < 0) return { folder: "", name: filePath };
  return { folder: filePath.slice(0, cut), name: filePath.slice(cut + 1) };
}

/**
 * How a note is named in the notice: "Projects/Plan.md" is "Plan" in
 * "Projects". Only markdown extensions are dropped, as in the sidebar.
 */
export function noteLabel(rel: string): { name: string; folder: string } {
  const slash = rel.lastIndexOf("/");
  const folder = slash >= 0 ? rel.slice(0, slash) : "";
  const file = slash >= 0 ? rel.slice(slash + 1) : rel;
  const name = file.replace(/\.(md|markdown)$/i, "");
  return { name: name || file, folder };
}

/** Attachments can conflict too, so the headline only says "notes" when all of them are. */
export function conflictHeadline(conflicts: { note: string }[]): string {
  const count = conflicts.length;
  const allNotes = conflicts.every((c) => /\.(md|markdown|txt)$/i.test(c.note));
  const what = allNotes ? (count === 1 ? "note" : "notes") : count === 1 ? "file" : "files";
  return `Sync kept both versions of ${count} ${what}`;
}
