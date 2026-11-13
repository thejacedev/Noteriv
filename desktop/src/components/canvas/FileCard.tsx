"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fileCardKind,
  fileCardTitle,
  resolveCanvasFile,
  subpathAnchor,
  subpathLabel,
  subpathPage,
  type CanvasNode,
  type FileCardKind,
} from "@/lib/canvas-utils";
import { extractEmbedSection, truncateEmbed } from "@/lib/embed-utils";
import { markdownToHTML } from "@/lib/markdown-to-html";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { extractHeadings } from "@/lib/toc-utils";
import { localImageTag } from "@/components/markdown/renderers/images";
import { CardChrome, cardColor, stopPointer, type CardHandlers } from "./CardChrome";
import { readFileBytes, useObjectUrl, useSeen } from "./media";

// ─── A note ───

/**
 * The text of a note, read once the card has been on screen and again each
 * time the file changes. undefined while it has not been read, null when it
 * cannot be.
 */
function useNoteText(absolutePath: string | null, wanted: boolean): string | null | undefined {
  const [loaded, setLoaded] = useState<{ path: string; text: string | null } | null>(null);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (!absolutePath || !wanted) return;
    let gone = false;
    (window.electronAPI?.readFile(absolutePath) ?? Promise.resolve(null))
      .catch(() => null)
      .then((text) => {
        if (!gone) setLoaded({ path: absolutePath, text });
      });
    return () => {
      gone = true;
    };
  }, [absolutePath, wanted, changes]);

  useEffect(() => {
    if (!absolutePath) return;
    const mine = absolutePath.replace(/\\/g, "/");
    return window.electronAPI?.onVaultChanged?.((changed) => {
      if (changed.replace(/\\/g, "/") === mine) setChanges((n) => n + 1);
    });
  }, [absolutePath]);

  return loaded && loaded.path === absolutePath ? loaded.text : undefined;
}

/**
 * A note's markdown as HTML for a card. Note text is not trusted (a vault is
 * synced from other machines), so the result always goes through the sanitizer.
 */
function noteHtml(markdown: string, vaultPath: string): string {
  const { text, hiddenLines } = truncateEmbed(markdown, 300);
  let html = markdownToHTML(text);

  // The converter leaves wiki links as text. Make them the links the app's
  // click handler opens, the same way an embedded note does.
  html = html.replace(/!?\[\[([^\]|<>]+)(?:\|([^\]<>]+))?\]\]/g, (_all, target: string, alias?: string) => {
    return `<span class="md-wikilink" data-target="${target}">${alias ?? target}</span>`;
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
  return sanitizeHtml(html);
}

function NoteBody({
  text,
  subpath,
  vaultPath,
}: {
  text: string | null | undefined;
  subpath: string | undefined;
  vaultPath: string;
}) {
  const anchor = useMemo(() => subpathAnchor(subpath), [subpath]);
  const section = useMemo(
    () => (typeof text === "string" ? extractEmbedSection(text, anchor) : null),
    [text, anchor]
  );
  const html = useMemo(() => (section ? noteHtml(section, vaultPath) : ""), [section, vaultPath]);

  if (text === undefined) return <div className="canvas-card-status">Loading…</div>;
  if (text === null) return <div className="canvas-card-status">This note could not be read.</div>;
  if (section === null) {
    return <div className="canvas-card-status">This note has no “{subpathLabel(subpath)}”.</div>;
  }
  if (!section) return <div className="canvas-card-status">Empty</div>;

  return (
    <div
      className="canvas-card-note embed-content"
      // A link in the note must not take the app's own window to that page.
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest("a");
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) window.electronAPI?.openExternal(href);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── An image ───

function ImageBody({ absolutePath, seen, name }: { absolutePath: string; seen: boolean; name: string }) {
  const { url, failed } = useObjectUrl(absolutePath, seen);
  if (failed) return <div className="canvas-card-status">This image could not be read.</div>;
  if (!url) return <div className="canvas-card-status">Loading…</div>;
  // An object URL made on this machine: there is nothing for next/image to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="canvas-card-image" src={url} alt={name} draggable={false} />;
}

// ─── Sound and video ───

/**
 * A player that reads its file only when asked to play. A recording can be
 * large, and a canvas shows all its cards at once when it opens.
 */
function MediaBody({ absolutePath, kind, name }: { absolutePath: string; kind: "audio" | "video"; name: string }) {
  const [wanted, setWanted] = useState(false);
  const { url, failed } = useObjectUrl(absolutePath, wanted);
  const player = useRef<HTMLMediaElement | null>(null);

  // The press on Play is what asked for the file, so start once it is here.
  useEffect(() => {
    if (url) player.current?.play().catch(() => {});
  }, [url]);

  if (!url) {
    return (
      <div className="canvas-card-media">
        <button
          type="button"
          className="canvas-card-button"
          disabled={wanted && !failed}
          onPointerDown={stopPointer}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => setWanted(true)}
        >
          {failed ? "Could not be read" : wanted ? "Loading…" : kind === "audio" ? "Play sound" : "Play video"}
        </button>
      </div>
    );
  }
  return (
    <div className="canvas-card-media" onPointerDown={stopPointer} onDoubleClick={(e) => e.stopPropagation()}>
      {kind === "audio" ? (
        <audio ref={(el) => { player.current = el; }} controls src={url} title={name} />
      ) : (
        <video ref={(el) => { player.current = el; }} controls src={url} title={name} />
      )}
    </div>
  );
}

// ─── A PDF ───

interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    viewport: unknown;
  }): { promise: Promise<void>; cancel(): void };
}
interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: { data: Uint8Array }): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

/**
 * pdf.js, loaded the way the PDF viewer loads it: straight from /public, past
 * the bundler, which cannot wrap this module.
 */
async function loadPdfJs(): Promise<PdfJs> {
  const nativeImport = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
  const pdfjs = (await nativeImport("/pdf.min.mjs")) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

/** How wide a page is drawn, in pixels: sharp on a card a few hundred wide, and no more. */
const PDF_PREVIEW_WIDTH = 800;

/** One page of a PDF as a picture. The whole document opens in the PDF viewer. */
function PdfBody({ absolutePath, page, seen }: { absolutePath: string; page: number; seen: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<{ page: number; pages: number } | "failed" | null>(null);

  useEffect(() => {
    if (!seen) return;
    let gone = false;
    let loading: ReturnType<PdfJs["getDocument"]> | null = null;
    let drawing: { cancel(): void } | null = null;

    (async () => {
      const pdfjs = await loadPdfJs();
      const bytes = await readFileBytes(absolutePath);
      if (gone) return;
      if (!bytes) {
        setShown("failed");
        return;
      }
      loading = pdfjs.getDocument({ data: bytes });
      const pdf = await loading.promise;
      if (gone) return;
      const number = Math.min(Math.max(page, 1), pdf.numPages);
      const pdfPage = await pdf.getPage(number);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (gone || !canvas || !context) return;
      const viewport = pdfPage.getViewport({ scale: PDF_PREVIEW_WIDTH / pdfPage.getViewport({ scale: 1 }).width });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = pdfPage.render({ canvasContext: context, canvas, viewport });
      drawing = task;
      await task.promise;
      if (!gone) setShown({ page: number, pages: pdf.numPages });
    })().catch(() => {
      // Cancelling the drawing on the way out also lands here.
      if (!gone) setShown("failed");
    });

    return () => {
      gone = true;
      drawing?.cancel();
      // Frees the document and the worker's copy of it.
      loading?.destroy().catch(() => {});
    };
  }, [absolutePath, page, seen]);

  return (
    <div className="canvas-card-pdf">
      {shown === "failed" ? (
        <div className="canvas-card-status">This PDF could not be read.</div>
      ) : (
        <>
          <canvas ref={canvasRef} style={shown ? undefined : { visibility: "hidden" }} />
          {!shown && <div className="canvas-card-status canvas-card-status-over">Loading…</div>}
          {shown && (
            <div className="canvas-card-caption">
              Page {shown.page} of {shown.pages}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── The card ───

const KIND_ICONS: Record<FileCardKind, React.ReactNode> = {
  note: (
    <>
      <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  image: (
    <>
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
      <path d="M1 11l4-3 3 2 3-4 4 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
  audio: <path d="M6 12V3l7-1.5V10M6 12a2 2 0 11-2-2 2 2 0 012 2zm7-2a2 2 0 11-2-2 2 2 0 012 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  video: (
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 6v4l3.5-2-3.5-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
  pdf: (
    <>
      <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 9h5M5.5 11.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  other: (
    <>
      <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
};

/**
 * A card that shows a file of the vault: a note as rendered text (all of it,
 * or one heading), an image, one page of a PDF, a player for sound or video.
 * Any other file shows its name and a button that opens it.
 */
export function FileCard({
  node,
  selected,
  vaultPath,
  onOpen,
  onHeadingMenu,
  ...handlers
}: {
  node: CanvasNode;
  selected: boolean;
  vaultPath: string;
  /** Open the card's file in the app. */
  onOpen: (nodeId: string) => void;
  /** Ask the canvas to show the list of the note's headings under the given point. */
  onHeadingMenu: (nodeId: string, at: { x: number; y: number }, headings: string[]) => void;
} & CardHandlers) {
  const cardRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(cardRef);
  const file = node.file || "";
  const kind = fileCardKind(file);
  const absolutePath = resolveCanvasFile(node.file, vaultPath);
  const noteText = useNoteText(kind === "note" ? absolutePath : null, seen);
  const headings = useMemo(
    () => (typeof noteText === "string" ? extractHeadings(noteText).map((h) => h.text) : []),
    [noteText]
  );
  const color = cardColor(node.color);
  const title = fileCardTitle(file) || "No file";
  const part = subpathLabel(node.subpath);

  let body: React.ReactNode;
  if (!absolutePath) {
    body = <div className="canvas-card-status">{file ? "This file is outside the vault." : "No file."}</div>;
  } else if (kind === "note") {
    body = <NoteBody text={noteText} subpath={node.subpath} vaultPath={vaultPath} />;
  } else if (kind === "image") {
    body = <ImageBody key={absolutePath} absolutePath={absolutePath} seen={seen} name={title} />;
  } else if (kind === "pdf") {
    body = <PdfBody key={absolutePath} absolutePath={absolutePath} page={subpathPage(node.subpath) ?? 1} seen={seen} />;
  } else if (kind === "audio" || kind === "video") {
    body = <MediaBody key={absolutePath} absolutePath={absolutePath} kind={kind} name={title} />;
  } else {
    body = (
      <div className="canvas-card-other">
        <span className="canvas-card-other-name">{file.split("/").pop()}</span>
        <button
          type="button"
          className="canvas-card-button"
          onPointerDown={stopPointer}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => onOpen(node.id)}
        >
          Open
        </button>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`canvas-node canvas-node-file${selected ? " selected" : ""}`}
      data-kind={kind}
      data-color={color.name}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, ...color.style }}
      onPointerDown={(e) => handlers.onPointerDown(node.id, e)}
      onDoubleClick={() => handlers.onDoubleClick(node.id)}
      onContextMenu={(e) => handlers.onContextMenu(node.id, e)}
    >
      <div className="canvas-node-header">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {KIND_ICONS[kind]}
        </svg>
        <span className="file-name" title={file}>
          {title}
          {part && <span className="canvas-card-part"> › {part}</span>}
        </span>
        <span className="canvas-card-tools">
          {kind === "note" && (
            <button
              type="button"
              className={`canvas-card-tool${node.subpath ? " active" : ""}`}
              title="Show one heading"
              aria-label="Show one heading"
              disabled={headings.length === 0 && !node.subpath}
              onPointerDown={stopPointer}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                // The list closes on a click anywhere; this click is the one that opens it.
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                onHeadingMenu(node.id, { x: box.left, y: box.bottom + 4 }, headings);
              }}
            >
              #
            </button>
          )}
          <button
            type="button"
            className="canvas-card-tool"
            title="Open"
            aria-label="Open"
            disabled={!absolutePath}
            onPointerDown={stopPointer}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => onOpen(node.id)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      </div>
      <div
        className="canvas-card-body"
        // A selected card scrolls its own content; otherwise the wheel zooms the canvas.
        onWheel={(e) => { if (selected) e.stopPropagation(); }}
      >
        {body}
      </div>
      <CardChrome
        node={node}
        selected={selected}
        onAnchorPointerDown={handlers.onAnchorPointerDown}
        onResizePointerDown={handlers.onResizePointerDown}
      />
    </div>
  );
}
