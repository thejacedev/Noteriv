/**
 * Which file a link points at.
 *
 * A wiki link names a note by its name or by its whole path inside the
 * vault, and any other file by its path or its name. A markdown link,
 * `[text](path)`, names a file by a path: from the top of the vault, or
 * from the folder of the note the link is written in. Both are worked out
 * here, from a list of the vault's files and the note the link is in.
 *
 * The backend has a second copy of these rules (`src-tauri/src/links.rs`),
 * which it uses to rewrite links when a file is renamed or moved. Both are
 * tested against `__fixtures__/link-resolution.json`; change them together.
 */

const NOTE_EXT = /\.(md|markdown)$/i;

export function isNotePath(path: string): boolean {
  return NOTE_EXT.test(path);
}

/** "Plan.md" and "Plan.markdown" are both the note "Plan". */
export function stripNoteExt(path: string): string {
  return path.replace(NOTE_EXT, "");
}

/** How a link's file part is compared: `\` read as `/`, lower case. */
function key(text: string): string {
  return text.replace(/\\/g, "/").toLowerCase();
}

function fileName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

/** The folder a file is in, as a path inside the vault: "" at the top. */
export function folderOf(rel: string): string {
  const slash = rel.lastIndexOf("/");
  return slash < 0 ? "" : rel.slice(0, slash);
}

/**
 * `path` as read from `folder`, with "." and ".." worked out. Null when it
 * climbs out of the vault.
 */
export function joinPath(folder: string, path: string): string | null {
  const parts = folder ? folder.split("/") : [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/** The way from `folder` to the file `target`: "x.md", "sub/x.md" or "../other/x.md". */
export function relativePath(folder: string, target: string): string {
  const from = folder ? folder.split("/") : [];
  const to = target.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

function startsRelative(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

// ── A markdown link's destination ───────────────────────────────────

export interface Destination {
  /** The file part as written: still percent-encoded, without `<>`, a `#fragment` or a title. */
  path: string;
  /** "#Heading" as written, or "". */
  fragment: string;
  /** Where the file part is within the text that was parsed. */
  from: number;
  to: number;
}

const isBlank = (ch: string | undefined) => ch === " " || ch === "\t";

/** `text` is a title on its own: blank space, then a quoted string, then nothing. */
function isTitle(text: string): boolean {
  // Spaces and tabs only, as the backend's copy of this counts them.
  const body = text.replace(/^[ \t]+|[ \t]+$/g, "");
  if (body === "") return true;
  if (!isBlank(text[0]) || body.length < 2) return false;
  const quote = body[0];
  return (quote === '"' || quote === "'") && body.endsWith(quote) && body.indexOf(quote, 1) === body.length - 1;
}

/**
 * Split the text between `](` and `)`:
 *
 *   path            path#fragment            path "title"
 *   <path with spaces>                       <path> 'title'
 *
 * A title is only a quoted string at the very end with a space before it.
 * Everything else is the path, spaces included, because the app has always
 * read `![](my photo.png)` that way.
 */
export function parseDestination(dest: string): Destination {
  let start = 0;
  while (isBlank(dest[start])) start++;
  let end = dest.length;
  while (end > start && isBlank(dest[end - 1])) end--;

  let from = start;
  let to = end;
  const close = dest[start] === "<" ? dest.indexOf(">", start + 1) : -1;
  if (close >= 0 && isTitle(dest.slice(close + 1))) {
    from = start + 1;
    to = close;
  } else {
    const quote = dest[end - 1];
    if (end - start >= 2 && (quote === '"' || quote === "'")) {
      const open = dest.lastIndexOf(quote, end - 2);
      if (open > start && isBlank(dest[open - 1])) {
        let pathEnd = open;
        while (pathEnd > start && isBlank(dest[pathEnd - 1])) pathEnd--;
        if (pathEnd > start) to = pathEnd;
      }
    }
  }

  const hash = dest.indexOf("#", from);
  if (hash >= 0 && hash < to) {
    return { path: dest.slice(from, hash), fragment: dest.slice(hash, to), from, to: hash };
  }
  return { path: dest.slice(from, to), fragment: "", from, to };
}

/** A web address, a mail address or inline data: never a file in the vault. */
export function isExternalPath(path: string): boolean {
  return path.includes("://") || /^(mailto|data|tel|sms|file|javascript|blob|about):/i.test(path);
}

/**
 * `%20` and the like turned back into the characters they stand for. A `%`
 * that does not start such a sequence is kept as written. Null when the
 * sequences do not spell valid text.
 */
export function percentDecode(text: string): string | null {
  if (!text.includes("%")) return text;
  try {
    return text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => decodeURIComponent(run));
  } catch {
    return null;
  }
}

/**
 * One part of a path, written so that it can stand in a markdown link:
 * everything but letters, digits and `-_.~` is percent-encoded. This is
 * what the backend writes too.
 */
export function percentEncode(part: string): string {
  try {
    return encodeURIComponent(part).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return part;
  }
}

/** A path with each of its parts percent-encoded and the `/` between them kept. */
export function encodePath(path: string): string {
  return path.split("/").map(percentEncode).join("/");
}

// ── The files in a vault ────────────────────────────────────────────

/** A wiki link target split into its file and its `#heading` or `#^block`. */
export interface WikiSplit {
  /** The file the link points at, as a path inside the vault. */
  file: string;
  /** The file part as written. */
  written: string;
  /** "#Heading", "#^block" or "". */
  fragment: string;
}

/**
 * What each kind of link resolves to, for one set of files. Mirrors `Index`
 * in the backend's `links.rs`.
 */
export class LinkIndex {
  /** The files the index was built from. */
  readonly files: string[];
  /** Note name (no extension, lower case) to the first note with it in listing order. */
  private noteByName = new Map<string, string>();
  /** Note path without extension, lower case. */
  private noteByPath = new Map<string, string>();
  /** Any other file, by path, lower case. */
  private otherByPath = new Map<string, string>();
  /** Any other file, by name, lower case: the shallowest wins. */
  private otherByName = new Map<string, string>();
  private exact = new Set<string>();
  private exactLower = new Map<string, string>();

  /**
   * `files` are paths inside the vault with "/" between folders. The notes
   * have to be in the order the app lists them (`listAllFiles`), because the
   * first note in that order wins a shared name. The order of the other
   * files does not matter.
   */
  constructor(files: string[]) {
    this.files = files;
    const others: string[] = [];
    for (const rel of files) {
      this.exact.add(rel);
      const lower = rel.toLowerCase();
      const held = this.exactLower.get(lower);
      if (held === undefined || rel < held) this.exactLower.set(lower, rel);
      if (isNotePath(rel)) {
        const name = key(stripNoteExt(fileName(rel)));
        if (!this.noteByName.has(name)) this.noteByName.set(name, rel);
        const path = key(stripNoteExt(rel));
        if (!this.noteByPath.has(path)) this.noteByPath.set(path, rel);
      } else {
        others.push(rel);
      }
    }
    // Other files are found by name shallowest first, then in path order.
    const depth = (rel: string) => rel.split("/").length;
    others.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const rel of others) {
      if (!this.otherByPath.has(key(rel))) this.otherByPath.set(key(rel), rel);
      const name = key(fileName(rel));
      if (!this.otherByName.has(name)) this.otherByName.set(name, rel);
    }
  }

  has(rel: string): boolean {
    return this.exact.has(rel);
  }

  /** The same vault with one more file in it, for a file that was only just created. */
  with(rel: string): LinkIndex {
    return this.exact.has(rel) ? this : new LinkIndex([...this.files, rel]);
  }

  /** The note a wiki link's note part points at: by name, or by its whole path inside the vault. */
  note(target: string): string | null {
    const wanted = key(stripNoteExt(target.trim()));
    if (!wanted) return null;
    return (wanted.includes("/") ? this.noteByPath : this.noteByName).get(wanted) ?? null;
  }

  /** A file that is not a note, as `![[photo.png]]` finds it: by its path, or failing that by its name. */
  private other(target: string): string | null {
    const wanted = key(target.trim());
    if (!wanted) return null;
    return this.otherByPath.get(wanted) ?? this.otherByName.get(fileName(wanted)) ?? null;
  }

  /**
   * What the file part of a `[[...]]` link points at, wherever the link is
   * written. A target with a file extension that is not a note's is looked
   * up among the other files first.
   */
  wikiAnywhere(target: string): string | null {
    const name = fileName(target.trim());
    const dot = name.lastIndexOf(".");
    const hasOtherExt =
      !isNotePath(name) && dot > 0 && dot < name.length - 1 && !name.slice(dot + 1).includes(" ");
    return hasOtherExt
      ? this.other(target) ?? this.note(target)
      : this.note(target) ?? this.other(target);
  }

  /** A file by its path from the top of the vault, exactly or with the letter case ignored. */
  private at(rel: string): string | null {
    return this.exact.has(rel) ? rel : this.exactLower.get(rel.toLowerCase()) ?? null;
  }

  /** The file at a place in the vault. A note's ".md" may be left off. */
  fileAt(rel: string | null): string | null {
    if (!rel) return null;
    return this.at(rel) ?? this.noteByPath.get(key(rel)) ?? null;
  }

  /**
   * What the file part of a `[[...]]` link points at, from the note `from`
   * that it is written in. A target that starts with "./" or "../" is a path
   * from that note's folder; anything else, and a relative path with nothing
   * at the end of it, is found the way it always was.
   */
  wiki(from: string, target: string): string | null {
    const path = target.trim().replace(/\\/g, "/");
    if (startsRelative(path)) {
      const hit = this.fileAt(joinPath(folderOf(from), path));
      if (hit) return hit;
    }
    return this.wikiAnywhere(target);
  }

  /**
   * Where the file part of a wiki link target ends and its `#heading`
   * begins. The whole target is tried first, so a note with "#" in its name
   * is found, then the part before the first "#", then before each later
   * one, longest first.
   */
  wikiLink(from: string, target: string): WikiSplit | null {
    const whole = this.wiki(from, target);
    if (whole) return { file: whole, written: target, fragment: "" };
    const hashes: number[] = [];
    for (let i = target.indexOf("#"); i >= 0; i = target.indexOf("#", i + 1)) hashes.push(i);
    if (hashes.length === 0) return null;
    for (const at of [hashes[0], ...hashes.slice(1).reverse()]) {
      const file = this.wiki(from, target.slice(0, at).trim());
      if (file) return { file, written: target.slice(0, at), fragment: target.slice(at) };
    }
    return null;
  }

  /**
   * What the file part of a markdown link points at, once decoded:
   *
   *   /path       from the top of the vault
   *   ./path      from the folder of the note the link is in ("../" too).
   *               "./path" with nothing there is read from the top of the
   *               vault, which is how the app read it before it knew
   *               relative paths.
   *   path        from the top of the vault if a file is there; otherwise
   *               from the note's folder; otherwise, when it is a bare
   *               name, the way a wiki link finds it.
   */
  private markdownPath(from: string, path: string): string | null {
    if (!path) return null;
    if (path.startsWith("/")) return this.fileAt(joinPath("", path));
    const relative = this.fileAt(joinPath(folderOf(from), path));
    if (startsRelative(path)) {
      return relative ?? (path.startsWith("./") ? this.fileAt(joinPath("", path)) : null);
    }
    return (
      this.fileAt(joinPath("", path)) ??
      relative ??
      (path.includes("/") ? null : this.wikiAnywhere(path))
    );
  }

  /**
   * The file a markdown link's path points at, from the note `from` that it
   * is written in. `path` is the file part as written (see
   * `parseDestination`): it is read percent-decoded first, and then as
   * written, for a file whose name really holds a "%20".
   */
  markdown(from: string, path: string): string | null {
    if (isExternalPath(path)) return null;
    const decoded = percentDecode(path);
    const hit = decoded === null ? null : this.markdownPath(from, decoded);
    return hit ?? (decoded === path ? null : this.markdownPath(from, path));
  }
}
