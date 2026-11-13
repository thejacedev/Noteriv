"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import {
  addressToUrl,
  articleToMarkdown,
  extractArticle,
  metaRefreshUrl,
  resolveLink,
  textToArticle,
  type Article,
} from "@/lib/web-reader";
import "@/styles/web-viewer.css";

interface WebViewerProps {
  /** The page to show. An empty string shows an empty reader waiting for an address. */
  url: string;
  /** The reader moved to another page. The parent stores the address, and may hand it back as `url`. */
  onNavigate: (url: string) => void;
  /** Open an address outside the app. Also called for mail and phone links. */
  onOpenExternal: (url: string) => void;
  /** Save the page as a note. Resolve to false, or reject, when it could not be saved. */
  onSaveNote: (markdown: string, title: string) => Promise<boolean> | void;
  onClose?: () => void;
  /** The page's title once it has loaded, for the tab's label. */
  onTitleChange?: (title: string) => void;
  /**
   * A name for the tab this reader is in, the same for as long as the tab is
   * open. The app draws only the tab in front, so a reader is taken down
   * whenever another tab is chosen. With this, the tab's history, its page
   * and the place reached on it are there again when the tab comes back.
   * Without it, the reader starts again from `url` each time.
   */
  tabId?: string;
}

/** This tab's own history: the pages visited, and which one is showing. */
interface History {
  entries: string[];
  index: number;
  /** Counts reloads, so loading the same address again is a new request. */
  reloads: number;
}

type Loaded =
  | { status: "ready"; key: string; url: string; article: Article; truncated: boolean }
  | { status: "error"; key: string; url: string; message: string };

type LoadResult =
  | { status: "ready"; url: string; article: Article; truncated: boolean }
  | { status: "error"; url: string; message: string };

type SaveState = "saving" | "saved" | "failed";

/** Below this much text, with no pictures either, the page probably needs scripts to show anything. */
const LITTLE_TEXT = 200;

/** How many pages that only say "go there instead" are followed in a row. */
const MAX_PAGE_REDIRECTS = 2;

const requestKey = (history: History, url: string) => `${history.reloads}\n${url}`;

/** What a tab's reader had when it was last on screen. */
interface Kept {
  history: History;
  loaded: Loaded | null;
  scrollTop: number;
}

/** How many tabs are remembered. A page can be large, and a closed tab is only forgotten when the parent says so. */
const KEPT_TABS = 24;

const keptTabs = new Map<string, Kept>();

function keepTab(tabId: string, state: Kept): void {
  // Taken out and put back, so the tab used last is the last to be dropped.
  keptTabs.delete(tabId);
  keptTabs.set(tabId, state);
  for (const oldest of keptTabs.keys()) {
    if (keptTabs.size <= KEPT_TABS) break;
    keptTabs.delete(oldest);
  }
}

/** Drop what is remembered for a tab. Call it when the tab is closed. */
export function forgetWebTab(tabId: string): void {
  keptTabs.delete(tabId);
}

/** Where a reader starts: where its tab left off, or at `url` with nothing loaded. */
function startingState(tabId: string | undefined, url: string): Kept {
  const first = addressToUrl(url) ?? url;
  const kept = tabId ? keptTabs.get(tabId) : undefined;
  if (kept) {
    // Only if the tab is still on the page the parent names. Otherwise the
    // parent has moved it, or the name has been given to a new tab.
    const at = kept.history.entries[kept.history.index];
    if (at === first || at === url) {
      const onScreen = kept.loaded?.key === requestKey(kept.history, at);
      return { history: kept.history, loaded: onScreen ? kept.loaded : null, scrollTop: onScreen ? kept.scrollTop : 0 };
    }
  }
  return { history: { entries: [first], index: 0, reloads: 0 }, loaded: null, scrollTop: 0 };
}

/**
 * Fetch a page through the backend and pick the article out of it. Never
 * rejects: whatever goes wrong comes back as a sentence to show.
 */
async function loadPage(url: string): Promise<LoadResult> {
  const fetchPage = typeof window === "undefined" ? undefined : window.electronAPI?.webFetchPage;
  if (!fetchPage) {
    return { status: "error", url, message: "Web pages can only be opened in the Noteriv desktop app." };
  }
  try {
    let page = await fetchPage(url);
    let finalUrl = page.url || url;
    // A site that does not say what it sent is read as a page.
    const isPage = () => page.contentType === "" || /html|xml/i.test(page.contentType);
    // A page that only sends its visitors on is followed, as the backend
    // follows a redirect. Twice at most, so two such pages cannot trade the
    // reader back and forth.
    for (let hops = 0; hops < MAX_PAGE_REDIRECTS && page.ok && isPage(); hops++) {
      const next = metaRefreshUrl(page.html, finalUrl);
      if (!next) break;
      page = await fetchPage(next);
      finalUrl = page.url || next;
    }
    if (!page.ok) {
      return { status: "error", url: finalUrl, message: page.error || "The page could not be loaded." };
    }
    const article = isPage() ? extractArticle(page.html, finalUrl) : textToArticle(page.html, finalUrl);
    return { status: "ready", url: finalUrl, article, truncated: page.truncated };
  } catch {
    return { status: "error", url, message: "The page could not be loaded." };
  }
}

function fragmentOf(url: string): string {
  try {
    const hash = new URL(url).hash.slice(1);
    try {
      return decodeURIComponent(hash);
    } catch {
      return hash;
    }
  } catch {
    return "";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * Puts the article's HTML into the reader.
 *
 * The HTML is the sanitized `contentHtml` and nothing else. It is parsed in a
 * document of its own first, where pictures do not load, so that every picture
 * can be told not to send a referrer, and to load only when scrolled to,
 * before it is on screen.
 */
function showArticle(host: HTMLElement, contentHtml: string): void {
  const holder = document.implementation.createHTMLDocument("").createElement("div");
  holder.innerHTML = contentHtml;
  for (const img of holder.querySelectorAll("img")) {
    img.setAttribute("referrerpolicy", "no-referrer");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  }
  for (const link of holder.querySelectorAll("a[href]")) {
    link.setAttribute("rel", "noreferrer noopener");
  }
  host.replaceChildren(...Array.from(holder.childNodes));
}

/**
 * Scroll to where the page had an element with this id. An empty fragment is
 * the top of the page. Says whether there was anywhere to scroll to: the
 * element may be in a part of the page the reader left out.
 */
function scrollToAnchor(scroller: HTMLElement, content: HTMLElement, fragment: string): boolean {
  if (!fragment) {
    scroller.scrollTop = 0;
    return true;
  }
  for (const el of content.querySelectorAll("[data-anchor]")) {
    if (el.getAttribute("data-anchor") === fragment) {
      el.scrollIntoView({ block: "start" });
      return true;
    }
  }
  return false;
}

/**
 * A reader for web pages.
 *
 * It does not show the page itself. The backend fetches the page's HTML, the
 * readable article is picked out of it without running any of it, and that
 * article is shown here as sanitized content. Scripts, forms, frames and the
 * page's own styling never reach the app's window.
 */
export default function WebViewer({ url, onNavigate, onOpenExternal, onSaveNote, onClose, onTitleChange, tabId }: WebViewerProps) {
  const [start] = useState(() => startingState(tabId, url));
  const [history, setHistory] = useState<History>(start.history);
  const [loaded, setLoaded] = useState<Loaded | null>(start.loaded);
  // What is being typed in the address bar. Null while it shows the page's own address.
  const [draft, setDraft] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [save, setSave] = useState<{ key: string; state: SaveState } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  /** The request whose answer is on screen, so an address change after a redirect does not fetch again. */
  const loadedKeyRef = useRef<string | null>(start.loaded?.key ?? null);
  /** How far down the page the tab was when it was last on screen. Used once, for the page it was on. */
  const restoreScrollRef = useRef(start.scrollTop);

  const current = history.entries[history.index];
  const key = requestKey(history, current);
  const view = loaded && loaded.key === key ? loaded : null;
  const article = view?.status === "ready" ? view.article : null;
  const saveState = save && save.key === key ? save.state : null;

  // The parent opened another page in this tab. The address it hands back
  // after `onNavigate` is the one already showing, and changes nothing.
  const [seenUrl, setSeenUrl] = useState(url);
  if (url !== seenUrl) {
    setSeenUrl(url);
    const target = addressToUrl(url) ?? url;
    if (target !== current && url !== current) {
      setDraft(null);
      setAddressError(null);
      setHistory({ entries: [...history.entries.slice(0, history.index + 1), target], index: history.index + 1, reloads: history.reloads });
    }
  }

  const pageArrived = useEffectEvent((result: LoadResult, requested: string, reloads: number) => {
    const arrivedKey = `${reloads}\n${result.url}`;
    loadedKeyRef.current = arrivedKey;
    setLoaded({ ...result, key: arrivedKey });
    if (result.url !== requested) {
      // A redirect: the entry becomes the address the page was really read from.
      setHistory((h) => (h.entries[h.index] === requested ? { ...h, entries: h.entries.map((entry, i) => (i === h.index ? result.url : entry)) } : h));
      onNavigate(result.url);
    }
    if (result.status === "ready") onTitleChange?.(result.article.title || result.article.siteName);
  });

  useEffect(() => {
    if (!current || loadedKeyRef.current === key) return;
    // Set when the reader has moved on. The answer to a request nobody is
    // waiting for is dropped, however late it arrives.
    let stale = false;
    loadPage(current).then((result) => {
      if (!stale) pageArrived(result, current, history.reloads);
    });
    return () => {
      stale = true;
    };
  }, [current, key, history.reloads]);

  const shownHtml = article?.contentHtml ?? null;
  const shownUrl = view?.url ?? "";
  useLayoutEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller || shownHtml === null) return;
    showArticle(content, shownHtml);
    const leftOffAt = restoreScrollRef.current;
    restoreScrollRef.current = 0;
    if (leftOffAt > 0) {
      // The tab coming back to the front: the reader is where it was left.
      scroller.scrollTop = leftOffAt;
    } else if (!scrollToAnchor(scroller, content, fragmentOf(shownUrl))) {
      // A new page starts at the top, unless its address names a place on it.
      scroller.scrollTop = 0;
    }
  }, [shownHtml, shownUrl, key]);

  // Remember this tab for the next time it is shown.
  useEffect(() => {
    if (tabId) keepTab(tabId, { history, loaded, scrollTop: scrollRef.current?.scrollTop ?? 0 });
  }, [tabId, history, loaded]);

  // And how far down the page it was, read as the reader is taken down. A
  // layout effect, because its cleanup runs while the page is still there to
  // be measured.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    return () => {
      const kept = tabId ? keptTabs.get(tabId) : undefined;
      if (kept && scroller) kept.scrollTop = scroller.scrollTop;
    };
  }, [tabId]);

  // An empty reader is waiting for an address, so put the cursor there.
  useEffect(() => {
    if (!current) addressRef.current?.focus();
  }, [current]);

  const go = (target: string) => {
    setDraft(null);
    setAddressError(null);
    if (target === current) {
      // The page already showing: load it again.
      setHistory({ ...history, reloads: history.reloads + 1 });
      return;
    }
    // Going somewhere new from the middle of the history drops what was ahead.
    setHistory({ entries: [...history.entries.slice(0, history.index + 1), target], index: history.index + 1, reloads: history.reloads });
    onNavigate(target);
  };

  const step = (by: number) => {
    const index = history.index + by;
    if (index < 0 || index >= history.entries.length) return;
    setDraft(null);
    setAddressError(null);
    setHistory({ ...history, index });
    onNavigate(history.entries[index]);
  };

  const reload = () => {
    if (current) setHistory({ ...history, reloads: history.reloads + 1 });
  };

  const submitAddress = (event: React.FormEvent) => {
    event.preventDefault();
    const typed = draft ?? current;
    const target = addressToUrl(typed);
    if (!target) {
      setAddressError(typed.trim() ? "That is not a web address. Type one such as example.com." : "Type a web address.");
      return;
    }
    addressRef.current?.blur();
    go(target);
  };

  const saveNote = async () => {
    if (view?.status !== "ready" || saveState === "saving") return;
    setSave({ key, state: "saving" });
    let saved = false;
    try {
      const markdown = articleToMarkdown(view.article, view.url, { clipped: new Date().toISOString() });
      const title = view.article.title || view.article.siteName || hostOf(view.url);
      saved = (await onSaveNote(markdown, title)) !== false;
    } catch {
      saved = false;
    }
    setSave({ key, state: saved ? "saved" : "failed" });
  };

  // Every click on a link in the article is taken over here. Left alone, the
  // click would send the app's own window to the page, which is the one thing
  // the reader exists to avoid.
  const followLink = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (!target || !event.currentTarget.contains(target)) return;
    event.preventDefault();
    if (event.button !== 0 && event.button !== 1) return;

    const link = resolveLink(target.getAttribute("href") ?? "", shownUrl);
    if (link.kind === "anchor") {
      // Nothing happens when the place it points to is not in the article.
      if (scrollRef.current && contentRef.current) scrollToAnchor(scrollRef.current, contentRef.current, link.fragment);
    } else if (link.kind === "external-scheme") {
      onOpenExternal(link.url);
    } else if (link.kind === "page") {
      // The middle button, or a modifier key, asks for the browser instead.
      if (event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey) onOpenExternal(link.url);
      else go(link.url);
    }
  };

  // The webview's own menu on a link offers to open it, which would send the
  // app's window to the page. So would dropping a dragged link on the window.
  // Neither is offered for links and pictures in the article.
  const holdBack = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest("a, img")) event.preventDefault();
  };

  const loading = current !== "" && view === null;
  const externalUrl = view?.url || current;
  const errorParts = view?.status === "error" ? /^(.*?[.!?])\s+(.+)$/.exec(view.message) : null;
  const littleToRead = article !== null && article.textLength < LITTLE_TEXT && !article.contentHtml.includes("<img");

  return (
    <div className="wv-root">
      <div className="wv-bar">
        <button type="button" className="wv-icon-btn" title="Back" aria-label="Back" disabled={history.index === 0} onClick={() => step(-1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M9.5 3.5L5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="wv-icon-btn"
          title="Forward"
          aria-label="Forward"
          disabled={history.index >= history.entries.length - 1}
          onClick={() => step(1)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6.5 3.5L11 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="wv-icon-btn" title="Reload" aria-label="Reload" disabled={!current} onClick={reload}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12.75 2.75v2.5h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <form className="wv-address-form" onSubmit={submitAddress}>
          <input
            ref={addressRef}
            className="wv-address"
            type="text"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Web address"
            aria-invalid={addressError !== null}
            placeholder="Type a web address"
            value={draft ?? current}
            onChange={(e) => {
              setDraft(e.target.value);
              setAddressError(null);
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(null);
                setAddressError(null);
                e.currentTarget.blur();
              }
            }}
          />
        </form>

        <button type="button" className="wv-btn" disabled={!externalUrl} onClick={() => onOpenExternal(externalUrl)}>
          Open in browser
        </button>
        <button type="button" className="wv-btn wv-btn-primary" disabled={article === null || saveState === "saving"} onClick={saveNote}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save to vault"}
        </button>
        {onClose && (
          <button type="button" className="wv-icon-btn" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {(addressError || saveState === "failed") && (
        <p className="wv-notice wv-notice-error" role="alert">
          {addressError ?? "The note could not be saved."}
        </p>
      )}

      <div className="wv-scroll" ref={scrollRef} aria-busy={loading}>
        {loading && (
          <div className="wv-state" role="status">
            <div className="wv-progress" aria-hidden="true" />
            <p className="wv-state-title">Loading {hostOf(current)}</p>
          </div>
        )}

        {!current && (
          <div className="wv-state">
            <p className="wv-state-title">Type a web address above to read a page here.</p>
            <p className="wv-state-text">The reader shows the text and pictures of a page, and can save it as a note.</p>
          </div>
        )}

        {view?.status === "error" && (
          <div className="wv-state" role="alert">
            <p className="wv-state-title">{errorParts ? errorParts[1] : view.message}</p>
            {errorParts && <p className="wv-state-text">{errorParts[2]}</p>}
            <p className="wv-state-url">{view.url}</p>
            <div className="wv-state-actions">
              <button type="button" className="wv-btn wv-btn-primary" onClick={reload}>
                Try again
              </button>
              <button type="button" className="wv-btn" onClick={() => onOpenExternal(view.url)}>
                Open in browser
              </button>
            </div>
          </div>
        )}

        {view?.status === "ready" && (
          <article className="wv-column" lang={view.article.lang || undefined}>
            <header className="wv-head">
              <p className="wv-site">{view.article.siteName}</p>
              <h1 className="wv-title">{view.article.title || hostOf(view.url)}</h1>
              {view.article.byline && <p className="wv-byline">{view.article.byline}</p>}
            </header>

            {view.truncated && <p className="wv-notice">This page is very long. The reader shows the first part of it.</p>}
            {littleToRead && (
              <p className="wv-notice">
                There is little to read on this page. It may build itself with scripts, which the reader does not run.
              </p>
            )}

            {/* Filled by `showArticle`. React renders nothing inside it. */}
            <div
              ref={contentRef}
              className="wv-content markdown-preview"
              dir="auto"
              onClick={followLink}
              onAuxClick={followLink}
              onContextMenu={holdBack}
              onDragStart={holdBack}
            />

            <footer className="wv-foot">
              Reader view: scripts, forms and page styling are left out.{" "}
              <button type="button" className="wv-link" onClick={() => onOpenExternal(view.url)}>
                Open in browser
              </button>{" "}
              for the full page.
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
