/**
 * Putting a picture into a note: one pasted from the clipboard, or one
 * dragged onto the editor from outside the app. The picture is saved in the
 * attachment folder and a link to it is written at the cursor or at the drop.
 *
 * Nothing here touches the page, so all of it runs in the tests.
 */

import type { EditorState, TransactionSpec } from "@codemirror/state";
import { encodePath } from "./link-resolve";
import { vaultRelative } from "./vault-links";

/**
 * The kinds of picture the editor shows. `IMAGE_EXTENSIONS` in
 * `src-tauri/src/scope.rs` is the same list: a dropped file is only handed
 * to the page when it is one of these.
 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

const EXTENSION_FOR_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

/** The last part of a path, whichever way its slashes lean. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || "";
}

/** The extension of a file name in lower case, without the dot. "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

/**
 * The extension to save a clipboard file under, or null when it is not a
 * picture the editor shows. The type decides when there is one: a bitmap
 * copied in another program arrives under a made-up name.
 */
export function imageExtensionFor(file: { name: string; type: string }): string | null {
  const byType = EXTENSION_FOR_TYPE[file.type.toLowerCase()];
  if (byType) return byType;
  const byName = extensionOf(file.name);
  return IMAGE_EXTENSIONS.includes(byName) ? byName : null;
}

/** The name for a picture that had none: `pasted-image-20261117-185230.png`. */
export function pastedImageName(now: Date, extension: string): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `pasted-image-${day}-${time}.${extension}`;
}

/**
 * A file name that can stand in a markdown link as it is, and be a file on
 * any system. Spaces become dashes; brackets, which would end the link
 * early, and the characters a link or Windows reads as something else are
 * left out. Letters of every script are kept.
 */
export function safeImageName(name: string): string {
  const extension = extensionOf(name);
  const base = extension ? name.slice(0, name.length - extension.length - 1) : name;
  const safe = (text: string) =>
    text
      .replace(/\s+/g, "-")
      .replace(/[\u0000-\u001f\u007f()<>[\]{}%#?*"|\\/:]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");
  const cleanBase = safe(base) || "image";
  const cleanExtension = safe(name.slice(name.length - extension.length));
  return extension && cleanExtension ? `${cleanBase}.${cleanExtension}` : cleanBase;
}

/**
 * `name`, or `name-1`, `name-2`... when a file of that name is there
 * already. `taken` holds the names in lower case: on Windows and macOS
 * `Photo.png` and `photo.png` are one file.
 */
export function freeName(taken: ReadonlySet<string>, name: string): string {
  if (!taken.has(name.toLowerCase())) return name;
  const extension = extensionOf(name);
  const base = extension ? name.slice(0, name.length - extension.length - 1) : name;
  const tail = extension ? name.slice(name.length - extension.length - 1) : "";
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}${tail}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Base64 of some bytes, built in pieces: a large picture cannot be spread into one call. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Where a drag is, in the page's own coordinates. The app reports it in the
 * units of the window system: device pixels on Windows, and the same units
 * as the page on Linux and macOS.
 */
export function dropPoint(
  at: { x: number; y: number },
  platform: string,
  pixelRatio: number
): { x: number; y: number } {
  const scale = platform === "win32" && pixelRatio > 0 ? pixelRatio : 1;
  return { x: at.x / scale, y: at.y / scale };
}

/**
 * True when a paste brought nothing the page can use: no file with anything
 * in it, no text and no list of addresses. It is the moment to ask the app
 * what is on the clipboard. On Linux this is what arrives with WebKitGTK 2.50
 * when the clipboard holds a picture, and with WebKitGTK 2.54 when the
 * picture is not a PNG: the page is then handed a file of no bytes.
 * The types are not looked at: with 2.50 they are empty even for text.
 */
export function pasteIsEmpty(data: {
  files: ArrayLike<{ size: number }> | null;
  getData: (type: string) => string;
}): boolean {
  const files = Array.from(data.files ?? []);
  return files.every((file) => file.size === 0) && data.getData("text/plain") === "" && data.getData("text/uri-list") === "";
}

/**
 * A picture to put into a note: a file somewhere on the disk, bytes from the
 * clipboard, or a picture the app read from the clipboard and handed over as
 * base64.
 */
export type ImageSource =
  | { path: string }
  | { name: string; bytes: Uint8Array }
  | { name: string; base64: string };

/** The file calls that saving a picture needs. `window.electronAPI` has them. */
export interface ImageFiles {
  createDir: (dirPath: string) => Promise<boolean>;
  readDir: (dirPath: string) => Promise<{ name: string }[]>;
  copyFile: (src: string, dest: string) => Promise<boolean>;
  writeBinaryFile: (filePath: string, base64: string) => Promise<boolean>;
}

/**
 * Save pictures into the attachment folder and return a markdown image for
 * each one that was saved, in the order given.
 *
 * A file that is already in the vault is linked where it is. Any other is
 * copied, under its own name made safe for a link; a name that is taken
 * gets a number, so that no picture is written over another.
 */
export async function saveImages(
  files: ImageFiles,
  vaultPath: string,
  folder: string,
  images: ImageSource[]
): Promise<string[]> {
  const links: string[] = [];
  const directory = `${vaultPath}/${folder}`;
  let taken: Set<string> | null = null;

  for (const image of images) {
    if ("path" in image) {
      const inside = vaultRelative(vaultPath, image.path);
      if (inside) {
        links.push(`![](${encodePath(inside)})`);
        continue;
      }
    }

    if (!taken) {
      await files.createDir(directory);
      const entries = await files.readDir(directory).catch(() => []);
      taken = new Set(entries.map((entry) => entry.name.toLowerCase()));
    }

    const wanted = safeImageName("path" in image ? fileNameOf(image.path) : image.name);
    const name = freeName(taken, wanted);
    const target = `${directory}/${name}`;
    let saved = false;
    try {
      if ("path" in image) saved = await files.copyFile(image.path, target);
      else saved = await files.writeBinaryFile(target, "base64" in image ? image.base64 : bytesToBase64(image.bytes));
    } catch {
      saved = false;
    }
    if (!saved) continue;
    taken.add(name.toLowerCase());
    links.push(`![](${folder}/${name})`);
  }

  return links;
}

/**
 * The change that writes image links into a note.
 *
 * They go in at `at`, or over the selection when no place is given. With
 * `ownLine`, links that end their line are followed by a new line with the
 * cursor on it: the editor shows the line under the cursor as markdown, so
 * this is what makes the picture appear at once.
 */
export function imageInsertion(
  state: EditorState,
  links: string[],
  options: { at?: number; ownLine: boolean }
): TransactionSpec | null {
  if (links.length === 0) return null;
  const length = state.doc.length;
  const selection = state.selection.main;
  const from = options.at === undefined ? selection.from : Math.max(0, Math.min(options.at, length));
  const to = options.at === undefined ? selection.to : from;

  const line = state.doc.lineAt(to);
  const endsLine = state.doc.sliceString(to, line.to).trim() === "";
  const insert = links.join("\n") + (options.ownLine && endsLine ? "\n" : "");

  return {
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: "input.paste",
  };
}
