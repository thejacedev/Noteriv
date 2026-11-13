/**
 * What the app is asked to do from outside its window: by a command line
 * (`noteriv open Plan`), by a second launch, or by a `noteriv://` link. The
 * backend reads and checks the request (`src-tauri/src/app_requests.rs`);
 * the window carries it out.
 */

export type WriteMode = "create" | "append" | "prepend" | "overwrite";

export interface AppRequest {
  action: "focus" | "open" | "new" | "daily" | "unique" | "search" | "error";
  /** It came from a link, which anything can make: the user is asked before it writes. */
  fromLink: boolean;
  /** Carrying it out creates or changes a note. */
  writes?: boolean;
  vaultId?: string | null;
  vaultPath?: string;
  /** open: the file, as a full path. Absent to just show the vault. */
  filePath?: string | null;
  line?: number | null;
  heading?: string | null;
  /** new: the note, as a path inside the vault ending in .md. Absent for an untitled note. */
  name?: string | null;
  content?: string | null;
  mode?: WriteMode;
  /** new: do not open the note afterwards. */
  silent?: boolean;
  query?: string;
  /** error: what to tell the user. */
  message?: string;
}

/** A note's text with new text added at the end, or at the start below any properties block. */
export function addText(existing: string, text: string, where: "append" | "prepend"): string {
  if (!text) return existing;
  if (where === "append") {
    if (existing === "") return text;
    return existing.endsWith("\n") ? existing + text : `${existing}\n${text}`;
  }
  const block = existing.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  const head = block ? block[0] : "";
  const rest = existing.slice(head.length);
  const piece = text.endsWith("\n") || rest === "" ? text : `${text}\n`;
  return head + (head && !head.endsWith("\n") ? "\n" : "") + piece + rest;
}

/** A name that is not taken: "Plan.md", then "Plan 2.md", "Plan 3.md". */
export function freeNoteName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/** The line a heading is on (counting from 1), or null. Capitals and outer spaces are not compared. */
export function headingLine(content: string, heading: string): number | null {
  const wanted = heading.trim().replace(/^#+\s*/, "").toLowerCase();
  if (!wanted) return null;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match && match[1].trim().toLowerCase() === wanted) return i + 1;
  }
  return null;
}

/** What to ask the user before a link writes: a title and the text of the question. */
export function linkWriteQuestion(request: AppRequest): { title: string; message: string } {
  const preview = (request.content ?? "").trim();
  const shown = preview.length > 300 ? `${preview.slice(0, 300)}…` : preview;
  const body = shown ? `\n\n${shown}` : "";
  if (request.action === "daily") {
    return { title: "A link wants to open today's daily note", message: "The note is created if there is none yet." };
  }
  const name = request.action === "unique" ? "a new note named by the time" : request.name ? `"${request.name}"` : "a new note";
  const verb = request.mode === "append" ? "add text to the end of" : request.mode === "prepend" ? "add text to the start of" : "create";
  return {
    title: `A link wants to ${verb} ${name}`,
    message: `Links can come from anywhere. Go ahead only if you meant to follow this one.${body}`,
  };
}
