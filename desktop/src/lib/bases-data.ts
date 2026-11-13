/**
 * The rows a base works on: every file of the vault, notes with their
 * properties, tags and links, other files with their name and place alone.
 */

import { makeNoteRow, type NoteRow } from "./bases";
import { loadVaultIndex } from "./vault-index";

const NOTE = /\.(md|markdown)$/i;

/** Whether a file is a base, by its name. */
export function isBaseFile(path: string): boolean {
  return /\.base$/i.test(path);
}

export async function loadBaseRows(vaultPath: string): Promise<NoteRow[]> {
  const [notes, files] = await Promise.all([
    loadVaultIndex(vaultPath),
    window.electronAPI?.listVaultFiles ? window.electronAPI.listVaultFiles(vaultPath) : Promise.resolve([] as string[]),
  ]);
  const rows: NoteRow[] = notes.map((note) =>
    makeNoteRow({
      path: note.relativePath,
      note: note.properties,
      size: note.size,
      ctime: note.ctime,
      mtime: note.mtime,
      tags: note.allTags,
      links: note.links,
    })
  );
  const seen = new Set(rows.map((row) => row.file.path));
  for (const path of files) {
    // Notes came with the index; the app's own folder is not the user's.
    if (NOTE.test(path) || seen.has(path) || path.startsWith(".noteriv/")) continue;
    rows.push(makeNoteRow({ path }));
  }
  return rows;
}

/** The text of a base that lists every note: what a new base starts as. */
export const NEW_BASE = `filters:
  and:
    - file.ext == "md"
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.folder
      - file.mtime
`;
