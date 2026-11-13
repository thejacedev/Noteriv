/**
 * The formats the app can import notes from, and what each needs from the
 * user. The importing itself is done by the backend (`src-tauri/src/importers`).
 */

export type ImportKind =
  | "evernote"
  | "notion"
  | "googleKeep"
  | "roam"
  | "logseq"
  | "bear"
  | "textbundle"
  | "html"
  | "csv";

export interface ImportRequest {
  kind: ImportKind;
  /** The exported file or folder, as a full path picked in a file dialog. */
  sourcePath: string;
  vaultPath: string;
  /** Where the notes go, as a path inside the vault. */
  destFolder: string;
  options?: { titleColumn?: string; includeTrashed?: boolean };
}

export interface ImportOutcome {
  ok: boolean;
  error: string | null;
  notes: number;
  attachments: number;
  skipped: { name: string; reason: string }[];
  /** The folder the notes were written to, inside the vault. */
  folder: string;
}

export interface ImportFormat {
  kind: ImportKind;
  name: string;
  /** How to get the export out of the other app. */
  howTo: string;
  /** File endings a file picker should offer; empty when only a folder makes sense. */
  fileTypes: string[];
  /** Whether a folder can be chosen as well as, or instead of, a file. */
  folder: boolean;
  /** Whether the format has a trash whose notes are left out unless asked for. */
  trash?: boolean;
}

export const IMPORT_FORMATS: ImportFormat[] = [
  {
    kind: "evernote",
    name: "Evernote",
    howTo: "In Evernote, right-click a notebook and choose Export Notebook, as ENEX. Choose the .enex file, or a folder of them.",
    fileTypes: ["enex"],
    folder: true,
  },
  {
    kind: "notion",
    name: "Notion",
    howTo: "In Notion, choose Export, with the format Markdown & CSV. Choose the zip it gives you, or the folder if you have unpacked it.",
    fileTypes: ["zip"],
    folder: true,
  },
  {
    kind: "googleKeep",
    name: "Google Keep",
    howTo: "Ask Google Takeout for your Keep data. Choose the zip it sends, or the unpacked Takeout folder.",
    fileTypes: ["zip"],
    folder: true,
    trash: true,
  },
  {
    kind: "roam",
    name: "Roam Research",
    howTo: "In Roam, choose Export All, as JSON. Choose the .json file, or the zip it came in.",
    fileTypes: ["json", "zip"],
    folder: false,
  },
  {
    kind: "logseq",
    name: "Logseq",
    howTo: "Choose your Logseq graph folder: the one that holds the pages and journals folders. A zip of it works too.",
    fileTypes: ["zip"],
    folder: true,
  },
  {
    kind: "bear",
    name: "Bear",
    howTo: "In Bear, choose File, Export Notes, as Textbundle or as a Bear backup. Choose the file, or the folder the notes were exported to.",
    fileTypes: ["bear2bk", "textpack", "textbundle", "zip"],
    folder: true,
    trash: true,
  },
  {
    kind: "textbundle",
    name: "Textbundle",
    howTo: "Choose a .textbundle or .textpack, or a folder or zip that holds several.",
    fileTypes: ["textpack", "textbundle", "zip"],
    folder: true,
  },
  {
    kind: "html",
    name: "HTML files",
    howTo: "Choose one .html file, or a folder or zip of them. Pictures and files the pages link to next to them come along.",
    fileTypes: ["html", "htm", "zip"],
    folder: true,
  },
  {
    kind: "csv",
    name: "CSV table",
    howTo: "Choose a .csv file. Every row becomes a note, and every column a property.",
    fileTypes: ["csv", "tsv", "txt"],
    folder: true,
  },
];

/** The folder an import goes to unless the user names another. */
export function defaultImportFolder(format: ImportFormat): string {
  return `Imported/${format.name}`;
}

/** A sentence for what an import did. */
export function importSummary(outcome: ImportOutcome): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [count(outcome.notes, "note", "notes")];
  if (outcome.attachments > 0) parts.push(count(outcome.attachments, "attachment", "attachments"));
  const made = `Imported ${parts.join(" and ")} into ${outcome.folder || "the vault"}.`;
  return outcome.skipped.length > 0
    ? `${made} ${count(outcome.skipped.length, "item was", "items were")} left out.`
    : made;
}
