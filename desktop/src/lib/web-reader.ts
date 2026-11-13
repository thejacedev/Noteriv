/**
 * The reading half of the web viewer.
 *
 * Noteriv never runs a remote page inside its own window. The backend fetches
 * the page's HTML as text (`web_fetch_page`), and this module picks the
 * readable article out of that text and turns it into a note. Nothing here
 * touches the network or runs anything from the page.
 *
 * The page is parsed with `DOMParser`, whose document is inert: its scripts do
 * not run and its images do not load. The parsed document is then copied into
 * plain objects, and everything else works on that copy. Only a short list of
 * tags and attributes is ever written back out, and the result still goes
 * through `sanitizeHtml`, the same as every other piece of untrusted markup in
 * the app.
 */

import { stringify as stringifyYaml } from "yaml";
import { isSafeUrl, sanitizeHtml } from "@/lib/sanitize-html";

/** What `window.electronAPI.webFetchPage` returns. */
export interface WebPage {
  ok: boolean;
  /** A sentence for the user. Null when the page loaded. */
  error: string | null;
  /** The address the page was finally read from, after any redirects. */
  url: string;
  /** The HTTP status, or 0 when the site never answered. */
  status: number;
  contentType: string;
  /** The page's text. Empty on failure. */
  html: string;
  /** True when the page was longer than the limit and the end was cut off. */
  truncated: boolean;
}

export interface Article {
  title: string;
  /** Who wrote it, when the page says. */
  byline: string;
  siteName: string;
  /** The page's language code, as the page gives it. */
  lang: string;
  /** The readable part of the page. Already sanitized. */
  contentHtml: string;
  /** How many characters of text the readable part holds. */
  textLength: number;
  /** A sentence or two: the page's own description, or the start of its text. */
  excerpt: string;
}

export type LinkKind = "page" | "anchor" | "external-scheme" | "unsafe";

export interface ResolvedLink {
  /**
   * page: another web page, which the reader can open.
   * anchor: a place on the page already open.
   * external-scheme: mail and phone links, which belong to another program.
   * unsafe: anything else. Do nothing with it.
   */
  kind: LinkKind;
  /** The full address. Empty for an unsafe link. */
  url: string;
  /** The part after "#", decoded. Empty when there is none. */
  fragment: string;
}

export interface MarkdownOptions {
  /** When the page was saved, as an ISO date. Left out of the note when not given. */
  clipped?: string;
  /** Set to false for a note without the properties block. */
  frontmatter?: boolean;
}

// ---------------------------------------------------------------------------
// A plain copy of the page
// ---------------------------------------------------------------------------

interface El {
  tag: string;
  attrs: Record<string, string>;
  children: PageNode[];
}

/** An element, or a run of text. */
type PageNode = El | string;

const isEl = (node: PageNode): node is El => typeof node !== "string";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Copy a parsed node into plain objects. Comments and anything else that is
 * neither an element nor text are left behind.
 */
function copyNode(node: Node): PageNode | null {
  if (node.nodeType === TEXT_NODE) return node.nodeValue ?? "";
  if (node.nodeType !== ELEMENT_NODE) return null;
  const source = node as Element;
  // No prototype: a page can name an attribute anything, "constructor" included.
  const attrs: Record<string, string> = Object.create(null);
  for (let i = 0; i < source.attributes.length; i++) {
    const attr = source.attributes[i];
    attrs[attr.name.toLowerCase()] = attr.value;
  }
  const children: PageNode[] = [];
  for (let i = 0; i < source.childNodes.length; i++) {
    const child = copyNode(source.childNodes[i]);
    if (child === null) continue;
    const last = children.length - 1;
    // A comment between two runs of text leaves them side by side. Join them,
    // so later steps can look at the text around a character.
    if (typeof child === "string" && typeof children[last] === "string") {
      children[last] = (children[last] as string) + child;
    } else {
      children.push(child);
    }
  }
  return { tag: source.nodeName.toLowerCase(), attrs, children };
}

function parsePage(html: string): El {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.documentElement ? copyNode(doc.documentElement) : null;
  return root && isEl(root) ? root : { tag: "html", attrs: {}, children: [] };
}

/** The first element that passes the test, in page order. */
function find(root: El, test: (el: El) => boolean): El | null {
  for (const child of root.children) {
    if (!isEl(child)) continue;
    if (test(child)) return child;
    const inside = find(child, test);
    if (inside) return inside;
  }
  return null;
}

function contains(root: El, test: (el: El) => boolean): boolean {
  return find(root, test) !== null;
}

/** All the text inside a node, as the page wrote it. */
function rawText(node: PageNode): string {
  if (!isEl(node)) return node;
  let text = "";
  for (const child of node.children) text += rawText(child);
  return text;
}

const squash = (text: string) => text.replace(/[ \t\n\r\f]+/g, " ").trim();

/** The text inside a node as a reader would see it: one space between words. */
const plainText = (node: PageNode) => squash(rawText(node));

/** How much text a node holds, leaving out the text of links. */
function textOutsideLinks(node: PageNode): number {
  if (!isEl(node)) return node.replace(/\s+/g, " ").trim().length;
  if (node.tag === "a") return 0;
  let total = 0;
  for (const child of node.children) total += textOutsideLinks(child);
  return total;
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** A full web address for `raw`, or null when it is not one the reader shows. */
function resolveWebUrl(raw: string | undefined, base: string): string | null {
  const value = (raw ?? "").trim();
  if (!value || !isSafeUrl(value)) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function fragmentOf(url: URL): string {
  const hash = url.hash.slice(1);
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

/**
 * Says what a clicked link is, so the viewer knows whether to open it in the
 * reader, scroll to it, hand it to another program, or ignore it.
 */
export function resolveLink(href: string, pageUrl: string): ResolvedLink {
  const unsafe: ResolvedLink = { kind: "unsafe", url: "", fragment: "" };
  const value = href.trim();
  if (!value || !isSafeUrl(value)) return unsafe;

  let target: URL;
  try {
    target = new URL(value, pageUrl);
  } catch {
    return unsafe;
  }

  if (target.protocol === "mailto:" || target.protocol === "tel:") {
    return { kind: "external-scheme", url: target.href, fragment: "" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return unsafe;

  const fragment = fragmentOf(target);
  let samePage = false;
  try {
    const page = new URL(pageUrl);
    samePage = page.origin === target.origin && page.pathname === target.pathname && page.search === target.search;
  } catch {
    // The page's own address should always parse. If it does not, every link is another page.
  }
  // A link to "#" alone points at the top of the page already open.
  if (samePage && (target.hash !== "" || value.startsWith("#"))) {
    return { kind: "anchor", url: target.href, fragment };
  }
  return { kind: "page", url: target.href, fragment };
}

/**
 * Turns what was typed in the address bar into a web address. "https://" is
 * added when no scheme was typed; an address on this computer gets "http://",
 * because that is what a local server speaks. Null when it is not an address.
 */
export function addressToUrl(typed: string): string | null {
  const value = typed.trim();
  if (!value || /\s/.test(value)) return null;

  let candidate = value;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    // "mailto:someone", "javascript:..." and the like. "example.com:8080" is
    // not one of these: what follows its colon is a port number.
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return null;
    const local = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?([/?#]|$)/i.test(value);
    candidate = (local ? "http://" : "https://") + value;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What the page says about itself
// ---------------------------------------------------------------------------

/** The page's `<meta>` values by name. The first of each name wins. */
function readMeta(root: El): Map<string, string> {
  const meta = new Map<string, string>();
  const visit = (el: El) => {
    if (el.tag === "meta") {
      const key = (el.attrs.property || el.attrs.name || el.attrs["http-equiv"] || "").trim().toLowerCase();
      const value = squash(el.attrs.content ?? "");
      if (key && value && !meta.has(key)) meta.set(key, value);
    }
    for (const child of el.children) if (isEl(child)) visit(child);
  };
  visit(root);
  return meta;
}

function firstMeta(meta: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = meta.get(name);
    if (value) return value;
  }
  return "";
}

function hostOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/** Letters and digits only, lower case, for comparing names loosely. */
const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** True when a piece of the page title is the site's name rather than the article's. */
function namesTheSite(piece: string, siteName: string, host: string): boolean {
  const name = bare(piece);
  if (!name) return false;
  if (siteName && name === bare(siteName)) return true;
  if (!host) return false;
  if (name === bare(host)) return true;
  // "Example" for example.com. The last label is the ending (com, org), not a name.
  return host.split(".").slice(0, -1).some((label) => bare(label) === name);
}

/** What sets the site's name apart from the headline in a page title: " | ", " - " and the like. */
const TITLE_BREAK = /\s+[|\-–—·•»:]{1,2}\s+/g;

/** "Headline | Site" and "Site - Headline" become "Headline". */
function stripSiteName(title: string, siteName: string, host: string): string {
  const breaks = [...title.matchAll(TITLE_BREAK)];
  if (breaks.length === 0) return title;

  const last = breaks[breaks.length - 1];
  const lastAt = last.index ?? 0;
  if (namesTheSite(title.slice(lastAt + last[0].length), siteName, host)) {
    return title.slice(0, lastAt).trim();
  }
  const first = breaks[0];
  const firstAt = first.index ?? 0;
  if (namesTheSite(title.slice(0, firstAt), siteName, host)) {
    return title.slice(firstAt + first[0].length).trim();
  }
  return title;
}

/** Every element of `tag` that is not inside another one of the same tag, in page order. */
function outermost(root: El, tag: string): El[] {
  const found: El[] = [];
  const visit = (el: El) => {
    for (const child of el.children) {
      if (!isEl(child)) continue;
      if (child.tag === tag) found.push(child);
      else visit(child);
    }
  };
  visit(root);
  return found;
}

/**
 * The page's own headline, when the title is that headline with more after
 * it: "DOMParser - Web APIs | MDN" on a page headed "DOMParser". This catches
 * the site names `stripSiteName` cannot know. Only the start of the title is
 * tried: a heading that matches its end is as likely to be the site's name in
 * the page's banner.
 */
function headlineIn(title: string, root: El, siteName: string, host: string): string | null {
  const firstBreak = [...title.matchAll(TITLE_BREAK)][0];
  if (!firstBreak) return null;
  const start = title.slice(0, firstBreak.index).trim();
  if (!start || namesTheSite(start, siteName, host)) return null;
  // The page's main headings: every <h1>, or on a page without one, its first <h2>.
  const main = outermost(root, "h1");
  const headings = main.length > 0 ? main : outermost(root, "h2").slice(0, 1);
  return headings.some((heading) => bare(plainText(heading)) === bare(start)) ? start : null;
}

function pickTitle(root: El, meta: Map<string, string>, siteName: string, host: string): string {
  const titleEl = find(root, (el) => el.tag === "title");
  const given = firstMeta(meta, "og:title", "twitter:title") || (titleEl ? plainText(titleEl) : "");
  if (given) {
    const title = stripSiteName(given, siteName, host) || given;
    return headlineIn(title, root, siteName, host) ?? title;
  }
  const heading = find(root, (el) => el.tag === "h1");
  return heading ? plainText(heading) : "";
}

function classWords(el: El): string[] {
  return `${el.attrs.class ?? ""} ${el.attrs.id ?? ""}`
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "By Ines Okafor" as "Ines Okafor". */
const authorName = (el: El) => plainText(el).replace(/^by\s+/i, "");

/** The element the page marks as naming the author, if it marks one. */
function markedByline(scope: El): El | null {
  return find(scope, (el) => {
    const rel = (el.attrs.rel ?? "").toLowerCase().split(/\s+/);
    const prop = (el.attrs.itemprop ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("author") && !prop.includes("author") && !classWords(el).includes("byline")) return false;
    const text = plainText(el);
    return text.length > 1 && text.length <= 100;
  });
}

function pickByline(body: El, content: El, meta: Map<string, string>): string {
  const named = firstMeta(meta, "author", "article:author", "parsely-author", "dc.creator", "sailthru.author");
  // Some sites put the author's profile address there. That is not a name.
  if (named && !/^https?:\/\//i.test(named)) return named;
  const marked = markedByline(content) ?? markedByline(body);
  return marked ? authorName(marked) : "";
}

/** The elements from `root` down to `target`, or null when it is not inside. */
function pathTo(root: El, target: El): El[] | null {
  if (root === target) return [root];
  for (const child of root.children) {
    if (!isEl(child)) continue;
    const rest = pathTo(child, target);
    if (rest) return [root, ...rest];
  }
  return null;
}

/**
 * Takes the author's line out of the article, because the reader shows the
 * author above it. Only a line of its own goes: a name in the middle of a
 * sentence stays where it is.
 */
function dropBylineLine(content: El, byline: string): void {
  const marked = markedByline(content);
  const path = marked ? pathTo(content, marked) : null;
  if (!marked || !path) return;
  const isTheByline = (el: El) => bare(authorName(el)) === bare(byline);
  if (!isTheByline(marked)) return;

  // "By <a>Ines</a>" in a paragraph of its own: the whole paragraph is the line.
  let at = path.length - 1;
  while (at > 1 && isTheByline(path[at - 1])) at--;
  const ownLine = at < path.length - 1 || BLOCK_TAGS.has(marked.tag) || classWords(marked).includes("byline");
  if (!ownLine || at === 0) return;
  path[at - 1].children = path[at - 1].children.filter((child) => child !== path[at]);
}

// ---------------------------------------------------------------------------
// Taking the page apart
// ---------------------------------------------------------------------------

/** Never part of an article, whatever is inside them. */
const DROPPED_TAGS = new Set([
  "script", "style", "noscript", "template", "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "input", "button", "select", "option", "optgroup", "datalist", "textarea", "label", "fieldset",
  "svg", "canvas", "video", "audio", "track", "map", "area", "dialog", "menu", "link", "meta", "base",
  "head", "title", "portal",
]);

/** Page furniture by what the element is for. */
const CHROME_ROLES = new Set([
  "navigation", "banner", "complementary", "contentinfo", "search", "dialog", "alertdialog", "alert",
  "menu", "menubar", "toolbar", "tablist", "form",
]);

/** Page furniture by name: one of these words in an element's class or id. */
const CHROME_WORD =
  /^(nav|navbar|navigation|topnav|subnav|sitenav|menu|menubar|sidebar|share|sharing|shares|social|related|recommended|promo|promos|promoted|promotion|sponsor|sponsored|ad|ads|advert|adverts|advertisement|advertising|adsbygoogle|adslot|adunit|comment|comments|disqus|cookie|cookies|consent|gdpr|banner|popup|modal|overlay|newsletter|subscribe|subscription|signup|paywall|breadcrumb|breadcrumbs|pagination|pager|footer|masthead|toolbar|widget|widgets|outbrain|taboola|skip|skiplink|noprint|editsection|catlinks|printfooter)$/;

/** Comment threads can be longer than the article, so their size does not excuse them. */
const COMMENT_WORD = /^(comment|comments|disqus)$/;

/**
 * Words that turn the next one into a description of the page rather than a
 * name for the element: "has-sidebar" and "no-comments" sit on wrappers that
 * hold the article.
 */
const DESCRIBING_WORD = /^(has|with|without|no|hide|hides|show|shows|is|not)$/;

const MAIN_CONTENT = (el: El) => el.tag === "article" || el.tag === "main" || el.attrs.role === "main";

interface Surroundings {
  /** Inside the page's `<article>` or `<main>`. */
  inContent: boolean;
  /** How much text the whole page holds outside links. */
  pageText: number;
}

function isHidden(el: El): boolean {
  if ("hidden" in el.attrs) return true;
  // Hidden from screen readers usually means a decoration or a duplicate. An
  // image is the exception: sites mark the picture of a formula this way.
  if (el.attrs["aria-hidden"] === "true" && el.tag !== "img") return true;
  return /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.attrs.style ?? "");
}

function chromeWord(el: El): string | null {
  const words = classWords(el);
  for (let i = 0; i < words.length; i++) {
    if (!CHROME_WORD.test(words[i])) continue;
    if (i > 0 && DESCRIBING_WORD.test(words[i - 1])) continue;
    return words[i];
  }
  return null;
}

/** True for navigation, sidebars, comment threads, cookie notices and the like. */
function isChrome(el: El, around: Surroundings): boolean {
  if (el.tag === "nav") return true;
  if (CHROME_ROLES.has((el.attrs.role ?? "").toLowerCase())) return true;
  // A footer is tags and share links even inside an article. A header or an
  // aside there belongs to it: the headline block, a note set beside the text.
  if (el.tag === "footer") return true;
  if ((el.tag === "header" || el.tag === "aside") && !around.inContent) return true;

  const word = chromeWord(el);
  if (!word) return false;
  // A wrapper can be named for the furniture it also holds. If the article is
  // in there, or most of the page's text, it is not furniture.
  if (contains(el, MAIN_CONTENT)) return false;
  if (COMMENT_WORD.test(word)) return true;
  return textOutsideLinks(el) < around.pageText * 0.5;
}

/** Remove everything that is never shown, in place. */
function dropUnwanted(el: El): void {
  el.children = el.children.filter((child) => !isEl(child) || (!DROPPED_TAGS.has(child.tag) && !isHidden(child)));
  for (const child of el.children) if (isEl(child)) dropUnwanted(child);
}

/** Remove page furniture, in place. */
function dropChrome(el: El, around: Surroundings): void {
  el.children = el.children.filter((child) => !isEl(child) || !isChrome(child, around));
  for (const child of el.children) {
    if (!isEl(child)) continue;
    dropChrome(child, MAIN_CONTENT(child) ? { ...around, inContent: true } : around);
  }
}

/** Below this much text, a block is not taken for the article. */
const MIN_ARTICLE_TEXT = 140;

/** A child holding this share of its parent's text is where the article is. */
const DOMINANT_SHARE = 0.8;

/** Containers the search may step into. A paragraph or a list is content, not a container. */
const CONTAINER_TAGS = new Set(["div", "section", "article", "main", "center", "span", "font", "td", "th"]);

/** The cells of a table, not counting those of tables nested inside it. */
function cellsOf(table: El): El[] {
  const cells: El[] = [];
  const visit = (el: El) => {
    for (const child of el.children) {
      if (!isEl(child) || child.tag === "table") continue;
      if (child.tag === "td" || child.tag === "th") cells.push(child);
      else visit(child);
    }
  };
  visit(table);
  return cells;
}

/**
 * Finds the block that holds the article when the page does not mark one.
 * Starting from the whole page, step into whichever child holds nearly all of
 * the text, and stop where the text is spread over several children. Link text
 * does not count, so menus and lists of links weigh nothing.
 */
function densestBlock(body: El): El {
  let block = body;
  for (;;) {
    const total = textOutsideLinks(block);
    if (total < MIN_ARTICLE_TEXT) return block;

    let best: El | null = null;
    let bestText = 0;
    for (const child of block.children) {
      if (!isEl(child)) continue;
      const text = textOutsideLinks(child);
      if (text > bestText) {
        best = child;
        bestText = text;
      }
    }
    if (!best || bestText < total * DOMINANT_SHARE) return block;

    if (best.tag === "table") {
      // An old page laid out with a table: the article is one cell of it.
      const cell = cellsOf(best).find((c) => textOutsideLinks(c) >= bestText * DOMINANT_SHARE);
      if (!cell) return block;
      block = cell;
    } else if (CONTAINER_TAGS.has(best.tag) || best.tag.includes("-")) {
      // The second test is for a site's own elements, such as <app-root>.
      block = best;
    } else {
      return block;
    }
  }
}

function pickContent(body: El): El {
  // An article the page marks itself. Several of them is a list of teasers,
  // unless one holds most of their text.
  const articles = outermost(body, "article");
  if (articles.length > 0) {
    const sizes = articles.map(textOutsideLinks);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const largest = Math.max(...sizes);
    if (largest >= MIN_ARTICLE_TEXT && (articles.length === 1 || largest >= total * 0.6)) {
      return articles[sizes.indexOf(largest)];
    }
  }
  const main = find(body, (el) => el.tag === "main" || el.attrs.role === "main");
  if (main && textOutsideLinks(main) >= MIN_ARTICLE_TEXT) return main;
  return densestBlock(body);
}

// ---------------------------------------------------------------------------
// Putting the article back together
// ---------------------------------------------------------------------------

/** Tags written out as they are. Anything else is replaced by its contents. */
const KEPT_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "blockquote",
  "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "figure", "figcaption",
  "img", "a", "em", "strong", "b", "i", "u", "s", "del", "ins", "mark", "sub", "sup", "small", "abbr",
  "cite", "q", "kbd", "samp", "var", "time", "br", "hr", "span", "details", "summary",
]);

/** Older names for tags the reader keeps. */
const RENAMED_TAGS = new Map([
  ["strike", "s"],
  ["tt", "code"],
]);

/** Tags that start a new block, written out as a plain `<div>`. */
const BLOCK_WRAPPERS = new Set(["article", "section", "main", "header", "aside", "address", "center", "hgroup", "body"]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

/** Elements that are content on their own, with nothing inside them. */
const STANDS_ALONE = new Set(["br", "hr", "img", "td", "th"]);

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "pre",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "figure", "figcaption", "hr", "details",
  "summary",
]);

const WHOLE_NUMBER = /^\d{1,5}$/;

/** A language name as it appears after "language-" in a class. */
const LANGUAGE = /^[a-z0-9][a-z0-9+#._-]{0,29}$/i;

const NO_LANGUAGE = new Set(["none", "plain", "plaintext", "text", "txt", "nohighlight"]);

/** The language a code block says it is written in, if it says. */
function codeLanguage(...elements: (El | null | undefined)[]): string {
  for (const el of elements) {
    if (!el) continue;
    const classes = el.attrs.class ?? "";
    const match =
      /(?:^|\s)(?:language-|lang-|highlight-source-|highlight-text-|brush:\s*)([a-z0-9+#._-]+)/i.exec(classes) ||
      /(?:^|\s)sourceCode\s+([a-z0-9+#._-]+)/.exec(classes);
    const named = (el.attrs["data-lang"] || el.attrs["data-language"] || match?.[1] || "").toLowerCase();
    // "language-none" and its kind say there is no language to name.
    if (LANGUAGE.test(named) && !NO_LANGUAGE.has(named)) return named;
  }
  return "";
}

/** The text of a code block, with the line breaks its markup implies. */
function codeText(node: PageNode): string {
  if (!isEl(node)) return node;
  if (node.tag === "br") return "\n";
  let text = "";
  for (const child of node.children) text += codeText(child);
  // Some highlighters put each line in its own block and leave the line break out.
  if ((node.tag === "div" || node.tag === "p" || node.tag === "li" || node.tag === "tr") && !text.endsWith("\n")) {
    text += "\n";
  }
  return text;
}

/** Every address in a `srcset`, made absolute. Entries that cannot be are dropped. */
function resolveSrcset(srcset: string | undefined, base: string): string {
  const entries: string[] = [];
  for (const match of (srcset ?? "").matchAll(/(\S+)(\s+[\d.]+[wxh])?\s*(?:,|$)/g)) {
    const url = resolveWebUrl(match[1].replace(/,+$/, ""), base);
    if (url) entries.push(url + (match[2] ? ` ${match[2].trim()}` : ""));
  }
  return entries.join(", ");
}

interface Rebuild {
  /** Relative addresses are read against this: the page's `<base>`, or its own address. */
  baseUrl: string;
  /** The parent of the node being rebuilt, for code blocks that take their language from a wrapper. */
  parent: El | null;
}

function rebuildImage(el: El, context: Rebuild, fallbackSrcset = ""): PageNode[] {
  const { attrs } = el;
  // A page that loads its pictures late keeps the real address in one of
  // these, and a placeholder in `src`.
  const lazy = attrs["data-src"] || attrs["data-lazy-src"] || attrs["data-original"];
  const srcset = resolveSrcset(attrs["data-srcset"] || attrs["data-lazy-srcset"] || attrs.srcset || fallbackSrcset, context.baseUrl);

  let src = resolveWebUrl(lazy, context.baseUrl) ?? resolveWebUrl(attrs.src, context.baseUrl);
  if (!src && srcset) src = srcset.split(/\s/)[0].replace(/,$/, "");
  // A picture written into the page itself is kept as it is.
  if (!src && /^data:image\//i.test((attrs.src ?? "").trim()) && isSafeUrl(attrs.src)) src = attrs.src.trim();
  if (!src) return [];

  const width = WHOLE_NUMBER.test(attrs.width ?? "") ? attrs.width : "";
  const height = WHOLE_NUMBER.test(attrs.height ?? "") ? attrs.height : "";
  // One pixel square: there to count visits, not to be looked at.
  if ((width && Number(width) <= 1) || (height && Number(height) <= 1)) return [];

  const out: Record<string, string> = { src };
  if (srcset) out.srcset = srcset;
  out.alt = squash(attrs.alt ?? "");
  if (attrs.title) out.title = squash(attrs.title);
  if (width && height) {
    out.width = width;
    out.height = height;
  }
  return [{ tag: "img", attrs: out, children: [] }];
}

/** The TeX a formula was written from, when the page keeps it beside the formula. */
function formulaSource(math: El): string {
  const note = find(math, (el) => el.tag === "annotation" && /tex/i.test(el.attrs.encoding ?? ""));
  return squash(note ? rawText(note) : math.attrs.alttext ?? "");
}

function hasContent(node: PageNode): boolean {
  if (!isEl(node)) return node.trim() !== "";
  if (STANDS_ALONE.has(node.tag) || "data-anchor" in node.attrs) return true;
  return node.children.some(hasContent);
}

/**
 * Rebuild one node from the page as the reader will show it. Only the tags in
 * `KEPT_TAGS` come out, and only the attributes written here. Classes, styles
 * and ids from the page never do, so the page cannot dress itself in the
 * app's own styles or stand in for one of the app's elements.
 */
function rebuild(node: PageNode, context: Rebuild): PageNode[] {
  if (!isEl(node)) return [node];
  const { attrs } = node;
  const tag = RENAMED_TAGS.get(node.tag) ?? node.tag;
  const inside = (): PageNode[] => node.children.flatMap((child) => rebuild(child, { ...context, parent: node }));

  if (tag === "img") return rebuildImage(node, context);
  if (tag === "picture") {
    const img = find(node, (el) => el.tag === "img");
    const source = find(node, (el) => el.tag === "source");
    const srcset = source ? source.attrs["data-srcset"] || source.attrs.srcset || "" : "";
    return img ? rebuildImage(img, context, srcset) : [];
  }
  if (tag === "math") {
    const source = formulaSource(node);
    return source ? [{ tag: "code", attrs: {}, children: [source] }] : [];
  }
  if (tag === "pre") {
    const code = node.children.find((child): child is El => isEl(child) && child.tag === "code");
    const text = codeText(node).replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
    if (!text) return [];
    const language = codeLanguage(node, code, context.parent);
    const codeAttrs: Record<string, string> = language ? { "data-lang": language } : {};
    return [{ tag: "pre", attrs: {}, children: [{ tag: "code", attrs: codeAttrs, children: [text] }] }];
  }

  // Where a link on the page points with "#name". Ids themselves are not kept.
  const anchor = (attrs.id || (tag === "a" ? attrs.name : "") || "").trim();
  const out: Record<string, string> = {};
  if (anchor) out["data-anchor"] = anchor;
  const direction = (attrs.dir ?? "").toLowerCase();
  if (direction === "rtl" || direction === "ltr" || direction === "auto") out.dir = direction;

  let outTag = tag;
  if (tag === "a") {
    const value = (attrs.href ?? "").trim();
    let href: string | null = null;
    if (value && isSafeUrl(value)) {
      try {
        const url = new URL(value, context.baseUrl);
        if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) href = url.href;
      } catch {
        // Not an address. The link's words are kept, the link is not.
      }
    }
    if (href) {
      out.href = href;
      if (attrs.title) out.title = squash(attrs.title);
    } else {
      outTag = "span";
    }
  } else if (BLOCK_WRAPPERS.has(tag)) {
    outTag = "div";
  } else if (!KEPT_TAGS.has(tag)) {
    // Not a tag the reader writes out: keep what is inside it. An anchor on
    // it moves to an empty marker in front, so links to it still land.
    const kept = inside();
    return anchor ? [{ tag: "span", attrs: { "data-anchor": anchor }, children: [] }, ...kept] : kept;
  }

  if ((tag === "td" || tag === "th") && WHOLE_NUMBER.test(attrs.colspan ?? "")) out.colspan = attrs.colspan;
  if ((tag === "td" || tag === "th") && WHOLE_NUMBER.test(attrs.rowspan ?? "")) out.rowspan = attrs.rowspan;
  if (tag === "ol" && WHOLE_NUMBER.test(attrs.start ?? "")) out.start = attrs.start;
  if (tag === "abbr" && attrs.title) out.title = squash(attrs.title);
  if (tag === "code") {
    const language = codeLanguage(node);
    if (language) out["data-lang"] = language;
  }

  const children = VOID_TAGS.has(outTag) ? [] : inside();
  // A span with nothing to say about its contents is only its contents.
  if (outTag === "span" && Object.keys(out).length === 0) return children;
  const built: El = { tag: outTag, attrs: out, children };
  return hasContent(built) ? [built] : [];
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtmlText(text).replace(/"/g, "&quot;");
}

function toHtml(nodes: PageNode[]): string {
  let html = "";
  for (const node of nodes) {
    if (!isEl(node)) {
      html += escapeHtmlText(node);
      continue;
    }
    html += `<${node.tag}`;
    for (const [name, value] of Object.entries(node.attrs)) html += ` ${name}="${escapeHtmlAttr(value)}"`;
    html += ">";
    if (!VOID_TAGS.has(node.tag)) html += `${toHtml(node.children)}</${node.tag}>`;
  }
  return html;
}

/** The first heading, if nothing but whitespace comes before it. */
function leadingHeading(nodes: PageNode[]): { list: PageNode[]; index: number } | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!isEl(node)) {
      if (node.trim() !== "") return null;
      continue;
    }
    if (/^h[1-6]$/.test(node.tag)) return { list: nodes, index };
    if (node.tag === "div") return leadingHeading(node.children);
    return null;
  }
  return null;
}

/** The first paragraph with a sentence or so in it: where the article really starts. */
function openingParagraph(nodes: PageNode[]): string {
  for (const node of nodes) {
    if (!isEl(node)) continue;
    const text = node.tag === "p" ? plainText(node) : openingParagraph(node.children);
    if (text.length >= 60) return text;
  }
  return "";
}

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Picks the readable article out of a page's HTML.
 *
 * `pageUrl` is the address the HTML was read from, after redirects. Every link
 * and picture in the result is made absolute against it.
 */
export function extractArticle(html: string, pageUrl: string): Article {
  const root = parsePage(html);
  const body = find(root, (el) => el.tag === "body") ?? root;
  const meta = readMeta(root);
  const host = hostOf(pageUrl);

  const siteName = firstMeta(meta, "og:site_name", "application-name") || host;
  const title = pickTitle(root, meta, siteName, host);
  const lang = (root.attrs.lang || firstMeta(meta, "content-language")).trim();

  // The page can name the address its relative links start from.
  const baseEl = find(root, (el) => el.tag === "base" && !!el.attrs.href);
  const baseUrl = resolveWebUrl(baseEl?.attrs.href, pageUrl) ?? pageUrl;

  dropUnwanted(body);
  dropChrome(body, { inContent: false, pageText: textOutsideLinks(body) });
  const content = pickContent(body);
  const byline = pickByline(body, content, meta);
  if (byline) dropBylineLine(content, byline);

  const nodes = content.children.flatMap((child) => rebuild(child, { baseUrl, parent: content }));
  // The title is shown above the article, so a headline repeating it goes.
  const heading = leadingHeading(nodes);
  if (heading && title && bare(plainText(heading.list[heading.index])) === bare(title)) {
    heading.list.splice(heading.index, 1);
  }

  const text = squash(nodes.map(rawText).join(" "));
  const described = firstMeta(meta, "og:description", "description", "twitter:description");

  return {
    title,
    byline,
    siteName,
    lang,
    contentHtml: sanitizeHtml(toHtml(nodes)),
    textLength: text.length,
    excerpt: shorten(described || openingParagraph(nodes) || text, 200),
  };
}

/**
 * Where a page sends its visitors, when all it does is send them on: the
 * address in `<meta http-equiv="refresh" content="0; url=...">`. Moved pages
 * are often left behind as one of these. Null when the page stays put, or
 * only reloads itself now and then.
 */
export function metaRefreshUrl(html: string, pageUrl: string): string | null {
  // Most pages have no such tag. Do not parse the page to find that out.
  if (!/http-equiv\s*=\s*["']?refresh/i.test(html)) return null;
  const root = parsePage(html);
  const meta = find(root, (el) => el.tag === "meta" && (el.attrs["http-equiv"] ?? "").trim().toLowerCase() === "refresh");
  const match = /^\s*(\d+)(?:\.\d*)?\s*[;,]\s*(?:url\s*=\s*)?["']?([^"']+?)["']?\s*$/i.exec(meta?.attrs.content ?? "");
  // A wait of more than a few seconds is a page that means to be read first.
  if (!match || Number(match[1]) > 5) return null;
  const target = resolveWebUrl(match[2], pageUrl);
  if (!target) return null;
  const withoutFragment = (url: string) => url.replace(/#.*$/, "");
  return withoutFragment(target) === withoutFragment(pageUrl) ? null : target;
}

/**
 * An article for a page that is plain text rather than HTML: the text as it
 * is, in one block.
 */
export function textToArticle(text: string, pageUrl: string): Article {
  const host = hostOf(pageUrl);
  let name = "";
  try {
    name = decodeURIComponent(new URL(pageUrl).pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    // Keep the host as the title.
  }
  const body = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const nodes: PageNode[] = body ? [{ tag: "pre", attrs: {}, children: [{ tag: "code", attrs: {}, children: [body] }] }] : [];
  return {
    title: name || host,
    byline: "",
    siteName: host,
    lang: "",
    contentHtml: sanitizeHtml(toHtml(nodes)),
    textLength: squash(body).length,
    excerpt: shorten(squash(body), 200),
  };
}

// ---------------------------------------------------------------------------
// The article as a note
// ---------------------------------------------------------------------------

interface Inline {
  /** Inside the words of a link, where every bracket has to be escaped. */
  inLink: boolean;
  /** Inside a table cell, where "|" ends the cell. */
  inTable: boolean;
  bold: boolean;
  italic: boolean;
}

const PLAIN: Inline = { inLink: false, inTable: false, bold: false, italic: false };

interface Block {
  /** A list sits tight under the paragraph that introduces it. */
  kind: "list" | "other";
  text: string;
}

const isSpace = (ch: string) => ch === " " || ch === "\n" || ch === "\u00a0";
const isWordChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

/** What follows a "#" when the two together are a tag: tag characters, not all of them digits. */
const TAG_AFTER_HASH = /^[\p{N}/]*[\p{L}_-]/u;

/** What can be written as ^raised^ or ~lowered~ text: a short run with no spaces or marks in it. */
const SIMPLE_SCRIPT = /^[\p{L}\p{N}+\-−=().,]{1,20}$/u;

/**
 * Escapes the characters in a run of text that markdown would read as
 * formatting. Only those: a backslash in front of every asterisk and bracket
 * would be correct too, but the note is also read as plain text.
 */
function escapeMarkdown(text: string, context: Inline): string {
  const dollars = text.split("$").length - 1;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // At the edge of the run the neighbour is unknown, so assume the worst.
    const before = i > 0 ? text[i - 1] : "";
    const after = i + 1 < text.length ? text[i + 1] : "";
    let escape = false;

    switch (ch) {
      case "\\":
        // Before punctuation a backslash is itself an escape.
        escape = after === "" || ASCII_PUNCTUATION.test(after);
        break;
      case "`":
        escape = true;
        break;
      case "*":
        // An asterisk with a space on both sides cannot open or close emphasis.
        escape = !(isSpace(before) && isSpace(after));
        break;
      case "_":
        // Nor can an underscore inside a word, as in snake_case.
        escape = !((isSpace(before) && isSpace(after)) || (isWordChar(before) && isWordChar(after)));
        break;
      case "[": {
        if (context.inLink || before === "[" || before === "]" || after === "[" || after === "^") {
          // Link text, a [[wiki link]], the second half of [words][ref], or a [^footnote].
          escape = true;
          break;
        }
        const close = text.indexOf("]", i + 1);
        const next = close === -1 ? "" : text[close + 1] ?? "";
        // "[words](address)", "[words][ref]" and "[ref]: address" are links.
        // "[1]" on its own is only brackets.
        escape = close === -1 || next === "(" || next === "[" || next === ":";
        break;
      }
      case "]":
        escape = context.inLink;
        break;
      case "<":
        // The start of a tag or of an <address>.
        escape = /[a-z/!?]/i.test(after);
        break;
      case "&":
        escape = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i.test(text.slice(i, i + 40));
        break;
      case "~":
        escape = before === "~" || after === "~";
        break;
      case "|":
        escape = context.inTable;
        break;
      case "$":
        // A pair of dollar signs reads as a formula in apps that draw maths.
        escape = dollars >= 2;
        break;
      case "#":
        // "#word" at the start of a word is a tag in a vault. "#42" is not:
        // the vault's index takes a number alone for a count (see
        // `vault_index.rs`).
        escape = (before === "" || isSpace(before) || "([,;".includes(before)) && TAG_AFTER_HASH.test(text.slice(i + 1, i + 80));
        break;
    }
    out += escape ? `\\${ch}` : ch;
  }
  return out;
}

/** Escapes what would turn a line of text into a heading, a quote, a list or a rule. */
function escapeLineStart(line: string): string {
  if (/^#{1,6}(\s|$)/.test(line)) return `\\${line}`;
  if (/^>/.test(line)) return `\\${line}`;
  // A "*" here had a space before it that has since been trimmed away, so it
  // was not escaped as the start of emphasis. It would start a list.
  if (/^[-+*](\s|$)/.test(line) || /^[-=]+\s*$/.test(line)) return `\\${line}`;
  if (/^\[[ xX]\]\s/.test(line)) return `\\${line}`;
  const numbered = /^(\d{1,9})([.)])(\s|$)/.exec(line);
  if (numbered) return `${numbered[1]}\\${line.slice(numbered[1].length)}`;
  return line;
}

/** An address as it goes between the round brackets of a link. */
function markdownUrl(url: string): string {
  return url.replace(/[()<>\\\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

const titlePart = (title: string | undefined, shown: string) =>
  title && title !== shown ? ` "${title.replace(/["\\]/g, "\\$&")}"` : "";

/** Wraps text in a marker, keeping the spaces around it outside the marker. */
function wrap(inner: string, marker: string, closing = marker): string {
  const text = inner.trim();
  if (!text) return inner;
  const lead = inner.slice(0, inner.length - inner.trimStart().length);
  const tail = inner.slice(inner.trimEnd().length);
  return `${lead}${marker}${text}${closing}${tail}`;
}

function codeSpan(text: string, context: Inline): string {
  let code = text.replace(/\s+/g, " ");
  if (!code.trim()) return "";
  if (context.inTable) code = code.replace(/\|/g, "\\|");
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  // A space keeps a backtick at either end apart from the fence.
  const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
}

/** Markdown for nodes that sit in a line of text. A line break comes out as "\n". */
function inlineMarkdown(nodes: PageNode[], context: Inline): string {
  let out = "";
  for (const node of nodes) {
    if (!isEl(node)) {
      out += escapeMarkdown(node.replace(/[ \t\n\r\f]+/g, " "), context);
      continue;
    }
    const inner = (next: Inline = context) => inlineMarkdown(node.children, next);
    switch (node.tag) {
      case "br":
        out += "\n";
        break;
      case "img": {
        const src = node.attrs.src ?? "";
        // A picture written into the page as data would fill the note with it.
        if (!src || /^data:/i.test(src)) break;
        const alt = (node.attrs.alt ?? "").replace(/\s+/g, " ").replace(/[\\[\]]/g, "\\$&");
        out += `![${alt}](${markdownUrl(src)}${titlePart(node.attrs.title, alt)})`;
        break;
      }
      case "a": {
        const href = node.attrs.href;
        const words = inner({ ...context, inLink: true }).replace(/\s*\n\s*/g, " ");
        if (!href || context.inLink) {
          out += context.inLink ? words : inner().replace(/\s*\n\s*/g, " ");
        } else if (words.trim() === "") {
          // A link around nothing the note can show, such as an icon.
        } else if (rawText(node).trim() === href) {
          // The link's words are its own address.
          out += `<${href}>`;
        } else {
          out += wrap(words, "[", `](${markdownUrl(href)}${titlePart(node.attrs.title, words.trim())})`);
        }
        break;
      }
      case "strong":
      case "b":
        out += context.bold ? inner() : wrap(inner({ ...context, bold: true }), "**");
        break;
      case "em":
      case "i":
      case "cite":
        out += context.italic ? inner() : wrap(inner({ ...context, italic: true }), "*");
        break;
      case "del":
      case "s":
        out += wrap(inner(), "~~");
        break;
      case "mark":
        out += wrap(inner(), "==");
        break;
      case "code":
      case "kbd":
      case "samp":
        out += codeSpan(rawText(node), context);
        break;
      case "sub":
      case "sup": {
        // Noteriv writes these as ~lowered~ and ^raised^. Without the marks
        // "x²" would be saved as "x2". Anything longer than a short plain run,
        // such as a footnote link, is written as ordinary text instead.
        const text = rawText(node).trim();
        const mark = node.tag === "sup" ? "^" : "~";
        const simple = node.children.every((child) => !isEl(child)) && SIMPLE_SCRIPT.test(text);
        out += simple ? `${mark}${text}${mark}` : inner();
        break;
      }
      case "q":
        out += wrap(inner(), "\u201c", "\u201d");
        break;
      default:
        // A block inside a line of text: keep its words apart from the rest.
        out += BLOCK_TAGS.has(node.tag) ? ` ${inner()} ` : inner();
    }
  }
  return out;
}

/** One paragraph from inline markdown: each line trimmed, breaks kept, starts escaped. */
function paragraph(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .map(escapeLineStart)
    .join("  \n");
}

/** On one line: for headings, table cells and captions. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function indentRest(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 || line === "" ? line : pad + line))
    .join("\n");
}

function joinBlocks(blocks: Block[], tight: boolean): string {
  let out = "";
  blocks.forEach((block, i) => {
    if (i > 0) out += tight && block.kind === "list" && blocks[i - 1].kind !== "list" ? "\n" : "\n\n";
    out += block.text;
  });
  return out;
}

function listMarkdown(list: El, context: Inline): string {
  const ordered = list.tag === "ol";
  let number = ordered && WHOLE_NUMBER.test(list.attrs.start ?? "") ? Number(list.attrs.start) : 1;
  const items: string[] = [];
  for (const child of list.children) {
    if (!isEl(child)) continue;
    const blocks = child.tag === "li" ? blockMarkdown(child.children, context) : blockMarkdown([child], context);
    if (blocks.length === 0) continue;
    const marker = ordered ? `${number++}. ` : "- ";
    items.push(marker + indentRest(joinBlocks(blocks, true), " ".repeat(marker.length)));
  }
  return items.join("\n");
}

function fencedCode(pre: El): string {
  const code = pre.children.find((child): child is El => isEl(child) && child.tag === "code");
  const language = code?.attrs["data-lang"] ?? pre.attrs["data-lang"] ?? "";
  const text = codeText(pre).replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${LANGUAGE.test(language) ? language : ""}\n${text}\n${fence}`;
}

/** Tags in a cell that a table in markdown cannot hold. */
const TOO_MUCH_FOR_A_CELL = new Set(["table", "ul", "ol", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "figure"]);

function rowsOf(table: El): { cells: El[]; inHead: boolean }[] {
  const rows: { cells: El[]; inHead: boolean }[] = [];
  const visit = (el: El, inHead: boolean) => {
    for (const child of el.children) {
      if (!isEl(child) || child.tag === "table") continue;
      if (child.tag === "tr") {
        rows.push({ cells: child.children.filter((c): c is El => isEl(c) && (c.tag === "td" || c.tag === "th")), inHead });
      } else {
        visit(child, inHead || child.tag === "thead");
      }
    }
  };
  visit(table, false);
  return rows.filter((row) => row.cells.length > 0);
}

function tableMarkdown(table: El, context: Inline): Block[] {
  const rows = rowsOf(table);
  if (rows.length === 0) return [];

  const columns = Math.max(...rows.map((row) => row.cells.length));
  const paragraphs = (cell: El) => cell.children.filter((c) => isEl(c) && c.tag === "p").length;
  const laidOut =
    columns < 2 || rows.some((row) => row.cells.some((cell) => paragraphs(cell) > 1 || contains(cell, (el) => TOO_MUCH_FOR_A_CELL.has(el.tag))));
  if (laidOut) {
    // A table used to arrange the page, or one whose cells hold more than a
    // line: give its contents in reading order instead.
    return rows.flatMap((row) => row.cells.flatMap((cell) => blockMarkdown(cell.children, context)));
  }

  // Lay the cells out on a grid, so a cell spanning rows or columns keeps the
  // ones after it in their own columns.
  const grid: string[][] = [];
  const held: number[] = [];
  for (const row of rows) {
    const line: string[] = [];
    let column = 0;
    const skipHeld = () => {
      while (held[column] > 0) {
        held[column]--;
        line[column++] = "";
      }
    };
    for (const cell of row.cells) {
      skipHeld();
      const across = Math.max(1, Number(cell.attrs.colspan) || 1);
      const down = Math.max(1, Number(cell.attrs.rowspan) || 1);
      const text = oneLine(inlineMarkdown(cell.children, { ...context, inTable: true }).replace(/\s*\n\s*/g, "<br>"));
      for (let i = 0; i < across; i++) {
        if (down > 1) held[column] = down - 1;
        line[column++] = i === 0 ? text : "";
      }
    }
    skipHeld();
    grid.push(line);
  }

  const width = Math.max(...grid.map((line) => line.length));
  const write = (line: string[]) => `| ${Array.from({ length: width }, (_, i) => line[i] ?? "").join(" | ")} |`;
  const headed = rows[0].inHead || rows[0].cells.every((cell) => cell.tag === "th");
  // A table in markdown must have a heading row. One without gets an empty one.
  const head = headed ? grid[0] : [];
  const body = headed ? grid.slice(1) : grid;
  const lines = [write(head), write(Array.from({ length: width }, () => "---")), ...body.map(write)];

  const blocks: Block[] = [];
  const caption = table.children.find((c): c is El => isEl(c) && c.tag === "caption");
  const captionText = caption ? oneLine(inlineMarkdown(caption.children, { ...context, italic: true })) : "";
  if (captionText) blocks.push({ kind: "other", text: `*${captionText}*` });
  blocks.push({ kind: "other", text: lines.join("\n") });
  return blocks;
}

function definitionList(list: El, context: Inline): Block[] {
  const groups: string[][] = [];
  let lastWasTerm = false;
  for (const child of list.children) {
    if (!isEl(child)) continue;
    if (child.tag === "dt") {
      const term = paragraph(inlineMarkdown(child.children, context));
      if (!term) continue;
      if (!lastWasTerm) groups.push([]);
      groups[groups.length - 1].push(term);
      lastWasTerm = true;
    } else if (child.tag === "dd") {
      const meaning = joinBlocks(blockMarkdown(child.children, context), true);
      if (!meaning) continue;
      if (groups.length === 0) groups.push([]);
      groups[groups.length - 1].push(`: ${indentRest(meaning, "  ")}`);
      lastWasTerm = false;
    } else {
      groups.push([joinBlocks(blockMarkdown([child], context), false)]);
      lastWasTerm = false;
    }
  }
  return groups.filter((group) => group.length > 0).map((group) => ({ kind: "other", text: group.join("\n") }));
}

/** Markdown for nodes that each start on a line of their own. */
function blockMarkdown(nodes: PageNode[], context: Inline): Block[] {
  const blocks: Block[] = [];
  let line: PageNode[] = [];

  const endLine = () => {
    if (line.length === 0) return;
    // Two line breaks in a row are how older pages separate paragraphs.
    for (const part of inlineMarkdown(line, context).split(/\n(?:[ \t]*\n)+/)) {
      const text = paragraph(part);
      if (text) blocks.push({ kind: "other", text });
    }
    line = [];
  };
  const add = (text: string, kind: Block["kind"] = "other") => {
    if (text) blocks.push({ kind, text });
  };

  for (const node of nodes) {
    if (!isEl(node) || !BLOCK_TAGS.has(node.tag)) {
      line.push(node);
      continue;
    }
    endLine();
    const { tag, children } = node;
    if (/^h[1-6]$/.test(tag)) {
      // A "#" at the end of a heading is read as decoration and dropped.
      const text = oneLine(inlineMarkdown(children, context)).replace(/(^|\s)(#+)$/, "$1\\$2");
      if (text) add(`${"#".repeat(Number(tag[1]))} ${text}`);
    } else if (tag === "hr") {
      add("---");
    } else if (tag === "pre") {
      add(fencedCode(node));
    } else if (tag === "ul" || tag === "ol") {
      add(listMarkdown(node, context), "list");
    } else if (tag === "blockquote") {
      const quoted = joinBlocks(blockMarkdown(children, context), false);
      if (quoted) add(quoted.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n"));
    } else if (tag === "table") {
      blocks.push(...tableMarkdown(node, context));
    } else if (tag === "dl") {
      blocks.push(...definitionList(node, context));
    } else if (tag === "figcaption" || tag === "caption") {
      const text = oneLine(inlineMarkdown(children, { ...context, italic: true }));
      if (text) add(`*${text}*`);
    } else if (tag === "summary" || tag === "dt") {
      const text = oneLine(inlineMarkdown(children, { ...context, bold: true }));
      if (text) add(`**${text}**`);
    } else {
      // A paragraph, or a block that only groups others.
      blocks.push(...blockMarkdown(children, context));
    }
  }
  endLine();
  return blocks;
}

/** The article's HTML as markdown, with one blank line between blocks. */
function htmlToMarkdown(html: string): string {
  const root = parsePage(html);
  const body = find(root, (el) => el.tag === "body") ?? root;
  return joinBlocks(blockMarkdown(body.children, PLAIN), false);
}

/**
 * Turns an article into a note: a properties block with the title, the
 * author, where it came from and when it was saved, then the title as a
 * heading and the text.
 *
 * The time of saving is passed in rather than read from the clock here, so
 * the same article always gives the same note.
 */
export function articleToMarkdown(article: Article, pageUrl: string, options: MarkdownOptions = {}): string {
  const parts: string[] = [];

  if (options.frontmatter !== false) {
    const properties: Record<string, string> = {};
    if (article.title) properties.title = article.title;
    // The author's line is taken out of the article, so the note keeps the name here.
    if (article.byline) properties.author = article.byline;
    properties.source = pageUrl;
    if (options.clipped) properties.clipped = options.clipped;
    // The library decides what needs quotes: a colon, a "#", a leading quote.
    parts.push(`---\n${stringifyYaml(properties, { lineWidth: 0 }).trimEnd()}\n---`);
  }

  const title = oneLine(escapeMarkdown(article.title, PLAIN));
  if (title) parts.push(`# ${title}`);

  const body = htmlToMarkdown(article.contentHtml);
  if (body) parts.push(body);

  return `${parts.join("\n\n")}\n`;
}
