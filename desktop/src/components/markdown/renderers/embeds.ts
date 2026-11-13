import type { InlineRenderer, InlineReplacement } from "../types";
import { markdownToHTML } from "@/lib/markdown-to-html";
import {
  embedTitle,
  extractEmbedSection,
  parseEmbed,
  truncateEmbed,
  type ParsedEmbed,
} from "@/lib/embed-utils";
import { localImageTag, localMediaTag } from "./images";
import { baseEmbedTag, scheduleBaseEmbeds } from "./base-block";

/**
 * Obsidian-style embeds: `![[Note]]`, `![[Note#Heading]]`, `![[image.png|160]]`.
 *
 * A renderer's `find()` is synchronous, but resolving an embed needs the vault's
 * file list and the embedded note's text. Those are loaded in the background
 * and kept here; `find()` renders from what is loaded and shows a plain link
 * until then. When something arrives, `onEmbedDataChange` listeners are told so
 * the editor can render again.
 */

// ── Change notification ─────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
let notifyQueued = false;

/** Subscribe to "embed data loaded or changed". Returns the unsubscribe function. */
export function onEmbedDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyChanged() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((listener) => listener());
  });
}

// ── Vault data, loaded in the background ────────────────────────────

const NOTE_LIST_TTL = 10_000;
const NOTE_TEXT_TTL = 5_000;
const ATTACHMENT_LIST_TTL = 30_000;
const MAX_FOLDERS_SCANNED = 3_000;

interface NoteEntry {
  filePath: string;
  /** Lower-cased name without extension. */
  name: string;
  /** Lower-cased path inside the vault, without extension. */
  rel: string;
}

interface Loaded<T> {
  vaultPath: string;
  value: T;
  loadedAt: number;
}

let noteList: Loaded<NoteEntry[]> | null = null;
let noteListLoading = false;

/** File name (lower case) and vault-relative path (lower case) to absolute path. */
let attachments: Loaded<Map<string, string>> | null = null;
let attachmentsLoading = false;

const noteText = new Map<string, { text: string | null; loadedAt: number }>();
const noteTextLoading = new Set<string>();

function currentVaultPath(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path") ?? null;
}

const stripNoteExtension = (path: string) => path.replace(/\.(md|markdown)$/i, "");
const forwardSlashes = (path: string) => path.replace(/\\/g, "/");

function getNotes(vaultPath: string): NoteEntry[] | null {
  const fresh = noteList && noteList.vaultPath === vaultPath;
  if ((!fresh || Date.now() - noteList!.loadedAt > NOTE_LIST_TTL) && !noteListLoading) {
    noteListLoading = true;
    window.electronAPI
      ?.listAllFiles(vaultPath)
      .then((files) => {
        const value = files.map((f) => ({
          filePath: f.filePath,
          name: stripNoteExtension(forwardSlashes(f.filePath).split("/").pop() || "").toLowerCase(),
          rel: stripNoteExtension(forwardSlashes(f.relativePath)).toLowerCase(),
        }));
        const before = noteList && noteList.vaultPath === vaultPath ? noteList.value : null;
        const changed =
          !before ||
          before.length !== value.length ||
          before.some((entry, i) => entry.filePath !== value[i].filePath);
        noteList = { vaultPath, value, loadedAt: Date.now() };
        if (changed) notifyChanged();
      })
      .catch(() => {})
      .finally(() => {
        noteListLoading = false;
      });
  }
  return fresh ? noteList!.value : null;
}

/** Same matching as a click on a wiki link: by name, or by path inside the vault. */
function findNote(notes: NoteEntry[], file: string): NoteEntry | null {
  const wanted = stripNoteExtension(forwardSlashes(file)).toLowerCase();
  return notes.find((n) => n.name === wanted || n.rel === wanted) ?? null;
}

function getNoteText(filePath: string): string | null | undefined {
  const cached = noteText.get(filePath);
  if ((!cached || Date.now() - cached.loadedAt > NOTE_TEXT_TTL) && !noteTextLoading.has(filePath)) {
    noteTextLoading.add(filePath);
    window.electronAPI
      ?.readFile(filePath)
      .then((text) => {
        const changed = !cached || cached.text !== text;
        noteText.set(filePath, { text, loadedAt: Date.now() });
        if (changed) notifyChanged();
      })
      .catch(() => {})
      .finally(() => {
        noteTextLoading.delete(filePath);
      });
  }
  // undefined: not loaded yet. null: the file could not be read.
  return cached ? cached.text : undefined;
}

/** Walk the vault for files that are not notes, so `![[photo.png]]` finds them by name. */
async function scanAttachments(vaultPath: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const root = forwardSlashes(vaultPath).replace(/\/+$/, "");
  const queue: string[] = [vaultPath];
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_FOLDERS_SCANNED) {
    const dir = queue.shift()!;
    scanned++;
    let entries: { name: string; path: string; isDirectory: boolean }[] = [];
    try {
      entries = (await window.electronAPI?.readDir(dir)) ?? [];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isDirectory) {
        queue.push(entry.path);
        continue;
      }
      if (/\.(md|markdown)$/i.test(entry.name)) continue;
      const rel = forwardSlashes(entry.path).slice(root.length + 1).toLowerCase();
      found.set(rel, entry.path);
      // The walk is breadth-first, so the shallowest file wins a shared name.
      const name = entry.name.toLowerCase();
      if (!found.has(name)) found.set(name, entry.path);
    }
  }
  return found;
}

function getAttachments(vaultPath: string): Map<string, string> | null {
  const fresh = attachments && attachments.vaultPath === vaultPath;
  if ((!fresh || Date.now() - attachments!.loadedAt > ATTACHMENT_LIST_TTL) && !attachmentsLoading) {
    attachmentsLoading = true;
    scanAttachments(vaultPath)
      .then((value) => {
        const before = attachments && attachments.vaultPath === vaultPath ? attachments.value : null;
        const changed =
          !before ||
          before.size !== value.size ||
          [...value].some(([key, path]) => before.get(key) !== path);
        attachments = { vaultPath, value, loadedAt: Date.now() };
        if (changed) notifyChanged();
      })
      .catch(() => {})
      .finally(() => {
        attachmentsLoading = false;
      });
  }
  return fresh ? attachments!.value : null;
}

// ── HTML ────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The plain link shown for targets that are not rendered inline, or not loaded yet. */
function chip(label: string, extraClass = ""): string {
  const cls = extraClass ? `md-embed ${extraClass}` : "md-embed";
  return `<span class="${cls}"><span class="md-embed-icon">&#8689;</span> ${escapeHtml(label)}</span>`;
}

/** Render a note's markdown for display inside an embed. */
function renderEmbeddedMarkdown(markdown: string, vaultPath: string): string {
  const { text, hiddenLines } = truncateEmbed(markdown);
  let html = markdownToHTML(text);

  // The converter leaves wiki links as text. Make them (and nested embeds,
  // which are not expanded again) into links the app's click handler opens.
  html = html.replace(/!?\[\[([^\]|<>]+)(?:\|([^\]<>]+))?\]\]/g, (_all, target: string, alias?: string) => {
    const label = alias ?? target;
    return `<span class="md-wikilink" data-target="${target}">${label}</span>`;
  });

  // Images given by a path inside the vault are loaded the way the editor loads them.
  html = html.replace(/<img src="([^"]*)" alt="([^"]*)"[^>]*>/g, (all, src: string, alt: string) => {
    if (/^(https?:|data:|file:)/i.test(src)) return all;
    const absolute = `${vaultPath}/${src.replace(/&amp;/g, "&")}`;
    return localImageTag(absolute, alt.replace(/&quot;/g, '"').replace(/&amp;/g, "&"), "", "md-embed-img");
  });

  if (hiddenLines > 0) {
    html += `<div class="embed-truncated">… ${hiddenLines} more lines</div>`;
  }
  return html;
}

function noteEmbedHtml(embed: ParsedEmbed, body: string): string {
  return (
    `<div class="embed-container">` +
    `<div class="embed-header embed-header-clickable">` +
    `<span class="embed-icon">&#8689;</span>` +
    `<span class="embed-title md-wikilink" data-target="${escapeHtml(embed.target)}">${escapeHtml(embedTitle(embed))}</span>` +
    `</div>` +
    `<div class="embed-content">${body}</div>` +
    `</div>`
  );
}

function sizeStyle(embed: ParsedEmbed): string {
  if (!embed.width) return "";
  return ` style="width:${embed.width}px${embed.height ? `;height:${embed.height}px` : ""}"`;
}

// ── Renderer ────────────────────────────────────────────────────────

export const embedRenderer: InlineRenderer = {
  name: "embeds",
  priority: 7,

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    const regex = /!\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const from = offset + match.index;
      const to = from + match[0].length;
      const embed = parseEmbed(match[1]);
      const vaultPath = currentVaultPath();

      // Images render inline wherever they are written.
      if (embed.kind === "image" && vaultPath) {
        const files = getAttachments(vaultPath);
        const wanted = forwardSlashes(embed.file).toLowerCase();
        const path = files?.get(wanted) ?? files?.get(wanted.split("/").pop() || "");
        if (path) {
          const img = localImageTag(path, embed.file, sizeStyle(embed), "md-embed-img");
          results.push({ from, to, html: img, className: "md-embed-wrapper md-embed-image" });
        } else {
          // Still scanning the vault, or no such file.
          results.push({
            from,
            to,
            html: chip(match[1], files ? "md-embed-missing" : ""),
            className: "md-embed-wrapper",
          });
        }
        continue;
      }

      // Sound and video play in place; a PDF is a card that opens it at its page.
      if ((embed.kind === "audio" || embed.kind === "video" || embed.kind === "pdf") && vaultPath) {
        const files = getAttachments(vaultPath);
        const wanted = forwardSlashes(embed.file).toLowerCase();
        const path = files?.get(wanted) ?? files?.get(wanted.split("/").pop() || "");
        if (!path) {
          results.push({
            from,
            to,
            html: chip(match[1], files ? "md-embed-missing" : ""),
            className: "md-embed-wrapper",
          });
        } else if (embed.kind === "pdf") {
          const label = embed.page ? `${embed.file}, page ${embed.page}` : embed.file;
          results.push({
            from,
            to,
            html:
              `<span class="md-embed md-embed-pdf md-wikilink" data-target="${escapeHtml(embed.target)}">` +
              `<span class="md-embed-icon">&#128196;</span> ${escapeHtml(label)}</span>`,
            className: "md-embed-wrapper",
          });
        } else {
          results.push({
            from,
            to,
            html: localMediaTag(path, embed.kind, embed.file),
            className: `md-embed-wrapper md-embed-${embed.kind}`,
          });
        }
        continue;
      }

      // A note is shown inline only when the embed is the whole line; in the
      // middle of a sentence it stays a link.
      const wholeLine = text.trim() === match[0];

      // A base file shows its views, or the one named after the "#".
      if (embed.kind === "base" && vaultPath && wholeLine) {
        const files = getAttachments(vaultPath);
        const wanted = forwardSlashes(embed.file).toLowerCase();
        const path = files?.get(wanted) ?? files?.get(wanted.split("/").pop() || "");
        if (path) {
          const view = embed.anchor?.type === "heading" ? embed.anchor.text : null;
          results.push({
            from,
            to,
            html: baseEmbedTag(path, view, embed.file),
            className: "md-embed-wrapper md-embed-block",
          });
          scheduleBaseEmbeds();
        } else {
          results.push({ from, to, html: chip(match[1], files ? "md-embed-missing" : ""), className: "md-embed-wrapper" });
        }
        continue;
      }
      if (embed.kind === "note" && vaultPath && wholeLine) {
        const notes = getNotes(vaultPath);
        const note = notes && embed.file ? findNote(notes, embed.file) : null;
        const content = note ? getNoteText(note.filePath) : undefined;

        if (notes && embed.file && !note) {
          const body = `<div class="embed-not-found">No note called “${escapeHtml(embed.file)}”</div>`;
          results.push({ from, to, html: noteEmbedHtml(embed, body), className: "md-embed-wrapper md-embed-block" });
          continue;
        }
        if (note && content !== undefined) {
          let body: string;
          if (content === null) {
            body = `<div class="embed-error">This note could not be read</div>`;
          } else {
            const section = extractEmbedSection(content, embed.anchor);
            body =
              section === null
                ? `<div class="embed-not-found">Nothing in this note matches “${escapeHtml(embed.target)}”</div>`
                : renderEmbeddedMarkdown(section, vaultPath);
          }
          results.push({ from, to, html: noteEmbedHtml(embed, body), className: "md-embed-wrapper md-embed-block" });
          continue;
        }
      }

      // Not loaded yet, a file with its own viewer, or an embed inside a line.
      // It is a link all the same: a click opens what it points at.
      results.push({
        from,
        to,
        html: `<span class="md-wikilink" data-target="${escapeHtml(embed.target)}">${chip(match[1])}</span>`,
        className: "md-embed-wrapper",
      });
    }

    return results;
  },
};
