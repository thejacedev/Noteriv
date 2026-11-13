import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commonmarkLanguage, markdownLanguage } from "@codemirror/lang-markdown";
import { sanitizeHtml } from "@/lib/sanitize-html";
import {
  addressToUrl,
  articleToMarkdown,
  extractArticle,
  metaRefreshUrl,
  resolveLink,
  textToArticle,
  type Article,
} from "../web-reader";
import { TinyDOMParser } from "./web-reader-dom";

// The tests run in Node, where there is no DOM. The real sanitizer needs one
// and hands back nothing without it, so here it passes the markup through and
// records that it was asked. What the reader itself leaves out is checked on
// the markup it hands to the sanitizer.
vi.mock("@/lib/sanitize-html", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sanitize-html")>();
  return { ...real, sanitizeHtml: vi.fn((html: string) => html) };
});

beforeAll(() => {
  vi.stubGlobal("DOMParser", TinyDOMParser);
});

beforeEach(() => {
  vi.mocked(sanitizeHtml).mockClear();
});

const PAGE_URL = "https://dailyloaf.example/2026/starter?ref=home";

/** A page shaped like a real article page: the article, and everything around it. */
const ARTICLE_PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>How to keep a sourdough starter alive | The Daily Loaf</title>
<meta property="og:site_name" content="The Daily Loaf">
<meta name="description" content="Feed it, keep it warm, and do not panic when it sulks.">
<meta name="author" content="Mara Lindqvist">
<link rel="stylesheet" href="/site.css">
<style>body { font: 16px serif; }</style>
<script>window.dataLayer = []; document.write("<p>written by a script</p>");</script>
</head>
<body class="single-post has-sidebar">
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header">
  <a href="/">The Daily Loaf</a>
  <nav><ul><li><a href="/recipes">Recipes</a></li><li><a href="/about">About us</a></li></ul></nav>
</header>
<div id="cookie-banner"><p>We use cookies to make this site work better for everyone who visits it.</p><button>Accept all</button></div>
<div class="layout">
<main id="content">
<article class="post">
<header><h1>How to keep a sourdough starter alive</h1><p class="byline">By Mara Lindqvist</p></header>
<p>A starter is flour, water and patience. Left alone on the counter it goes sour and thin within a few days, and most people assume at that point that they have killed it. They almost never have.</p>
<h2 id="feeding">Feeding</h2>
<p>Feed it once a day with equal weights of flour and water. Read about <a href="/guides/flour">which flour to use</a>, or skip ahead to <a href="#troubleshooting">troubleshooting</a> if yours already smells of nail polish.</p>
<figure>
  <img src="/img/placeholder.gif" data-src="/img/starter-day-3.jpg" alt="A jar of starter" class="lazy" onerror="alert(1)">
  <figcaption>Day three: bubbles, and a smell like yoghurt.</figcaption>
</figure>
<ul>
  <li>Use a clean jar.</li>
  <li>Keep it somewhere warm.</li>
</ul>
<h2 id="troubleshooting">Troubleshooting</h2>
<p>A grey liquid on top is only alcohol. Pour it off, feed the starter, and carry on as before.</p>
<div class="share-buttons"><a href="https://social.example/share">Post this</a> <a href="mailto:?subject=Starter">Email this</a></div>
<aside class="related-posts"><h3>Related</h3><ul><li><a href="/2025/ten-breads">Ten breads to try</a></li></ul></aside>
<script>track("read");</script>
<iframe src="https://ads.example/frame"></iframe>
<form action="/subscribe"><input type="email" name="email"><button>Subscribe now</button></form>
<footer><p>Filed under <a href="/tags/bread">bread</a></p></footer>
</article>
<section id="comments">
  <h2>Comments</h2>
  <article class="comment"><p>First! I have been baking for thirty years and I have never once fed a starter on schedule, and my bread is perfectly good, thank you very much. This whole article is nonsense from start to finish and I will be telling everyone I know.</p></article>
  <article class="comment"><p>Mine died anyway. I followed every step in this article to the letter, I weighed the flour and the water, I kept the jar warm, and on day four it was a puddle. I would like my flour back, please.</p></article>
</section>
</main>
<aside class="sidebar"><h3>Popular</h3><ul><li><a href="/2024/rye">Rye for beginners</a></li></ul><p>Sign up to our letter for a new recipe every week.</p></aside>
</div>
<footer class="site-footer"><p>Copyright 2026 The Daily Loaf. All rights reserved.</p></footer>
</body>
</html>`;

describe("extractArticle on an article page", () => {
  const article = () => extractArticle(ARTICLE_PAGE, PAGE_URL);

  it("reads what the page says about itself", () => {
    const found = article();
    expect(found.title).toBe("How to keep a sourdough starter alive");
    expect(found.siteName).toBe("The Daily Loaf");
    expect(found.byline).toBe("Mara Lindqvist");
    expect(found.lang).toBe("en-GB");
    expect(found.excerpt).toBe("Feed it, keep it warm, and do not panic when it sulks.");
  });

  it("keeps the article", () => {
    const { contentHtml } = article();
    expect(contentHtml).toContain("A starter is flour, water and patience.");
    expect(contentHtml).toContain("<h2 data-anchor=\"feeding\">Feeding</h2>");
    expect(contentHtml).toContain("<li>Use a clean jar.</li>");
    expect(contentHtml).toContain("<figcaption>Day three: bubbles, and a smell like yoghurt.</figcaption>");
    expect(contentHtml).toContain("A grey liquid on top is only alcohol.");
  });

  it("leaves out everything around the article", () => {
    const { contentHtml } = article();
    for (const chrome of [
      "Skip to content",
      "Recipes",
      "About us",
      "We use cookies",
      "Accept all",
      "Post this",
      "Email this",
      "Related",
      "Ten breads to try",
      "Subscribe now",
      "Filed under",
      "Comments",
      "First!",
      "Mine died anyway",
      "Popular",
      "Rye for beginners",
      "Sign up to our letter",
      "All rights reserved",
    ]) {
      expect(contentHtml, chrome).not.toContain(chrome);
    }
  });

  it("never lets scripts, styles, frames or forms through", () => {
    const { contentHtml } = article();
    expect(contentHtml).not.toMatch(/<(script|style|iframe|form|input|button|noscript|link|meta)\b/i);
    expect(contentHtml).not.toContain("dataLayer");
    expect(contentHtml).not.toContain("written by a script");
    expect(contentHtml).not.toContain("track(");
    expect(contentHtml).not.toContain("font: 16px");
    // Nor the page's own classes, ids, styles and handlers.
    expect(contentHtml).not.toMatch(/\s(class|id|style|on[a-z]+)=/i);
  });

  it("does not repeat the title as a heading", () => {
    expect(article().contentHtml).not.toContain("<h1");
  });

  it("makes links and pictures absolute", () => {
    const { contentHtml } = article();
    expect(contentHtml).toContain('<a href="https://dailyloaf.example/guides/flour">which flour to use</a>');
    // A link to a place on the same page keeps the page's whole address.
    expect(contentHtml).toContain('<a href="https://dailyloaf.example/2026/starter?ref=home#troubleshooting">troubleshooting</a>');
    expect(contentHtml).toContain('<h2 data-anchor="troubleshooting">');
  });

  it("shows a late-loading picture, not its placeholder", () => {
    const { contentHtml } = article();
    expect(contentHtml).toContain('<img src="https://dailyloaf.example/img/starter-day-3.jpg" alt="A jar of starter">');
    expect(contentHtml).not.toContain("placeholder.gif");
  });

  it("counts the text it kept", () => {
    const found = article();
    expect(found.textLength).toBeGreaterThan(500);
    expect(found.textLength).toBeLessThan(900);
  });

  it("returns exactly what the sanitizer returned", () => {
    vi.mocked(sanitizeHtml).mockReturnValueOnce("<p>only what the sanitizer let through</p>");
    const found = article();
    expect(found.contentHtml).toBe("<p>only what the sanitizer let through</p>");
    expect(sanitizeHtml).toHaveBeenCalledTimes(1);
    // What it was handed is the article, already stripped down.
    const handed = vi.mocked(sanitizeHtml).mock.calls[0][0];
    expect(handed).toContain("A starter is flour, water and patience.");
    expect(handed).not.toMatch(/<script|<iframe|<form/i);
  });
});

describe("extractArticle on pages that do not mark their article", () => {
  const filler = (subject: string) =>
    `<p>${subject} is worth a paragraph of its own, long enough that nobody could take it for a menu or a caption, and written in whole sentences.</p>`;

  it("finds the block that holds the text", () => {
    const html = `<html><head><title>Notes on tide tables</title></head><body>
      <div id="wrap">
        <div id="top"><a href="/">Harbour Notes</a> <a href="/archive">Archive</a> <a href="/contact">Contact</a></div>
        <div id="middle">
          <div class="post">
            <h2>Notes on tide tables</h2>
            ${filler("The spring tide")}
            ${filler("The neap tide")}
            ${filler("The slack water between them")}
          </div>
          <div class="sidebar"><p>These notes are written by a retired harbour pilot.</p><ul><li><a href="/1">Older notes</a></li></ul></div>
        </div>
        <div id="bottom"><p>Written in the harbour office.</p></div>
      </div></body></html>`;
    const { title, contentHtml } = extractArticle(html, "https://harbour.example/notes/tides");

    expect(title).toBe("Notes on tide tables");
    expect(contentHtml).toContain("The spring tide is worth");
    expect(contentHtml).toContain("The slack water between them is worth");
    expect(contentHtml).not.toContain("Archive");
    expect(contentHtml).not.toContain("retired harbour pilot");
    expect(contentHtml).not.toContain("harbour office");
    // The heading that only repeats the title is gone too.
    expect(contentHtml).not.toContain("<h2");
  });

  it("finds the article in a page laid out with a table", () => {
    const html = `<html><head><title>On keeping bees</title></head><body><table><tbody><tr>
      <td><a href="/">Home</a><br><a href="/essays">Essays</a><br><a href="/rss">Feed</a></td>
      <td><font face="verdana">Bees do not need much from the person who keeps them, and most of what goes wrong in a first year comes from opening the hive too often.<br><br>A hive left alone through a cold spring will usually be stronger in June than one that was inspected every week.</font></td>
      </tr></tbody></table></body></html>`;
    const article = extractArticle(html, "https://bees.example/essays/keeping");

    expect(article.contentHtml).toContain("Bees do not need much");
    expect(article.contentHtml).not.toContain("Essays");
    expect(article.contentHtml).not.toMatch(/<(table|td|font)\b/);
    // Two line breaks in a row are a paragraph break in the note.
    const markdown = articleToMarkdown(article, "https://bees.example/essays/keeping", { frontmatter: false });
    expect(markdown).toBe(
      "# On keeping bees\n\n" +
        "Bees do not need much from the person who keeps them, and most of what goes wrong in a first year comes from opening the hive too often.\n\n" +
        "A hive left alone through a cold spring will usually be stronger in June than one that was inspected every week.\n"
    );
  });

  it("keeps a wrapper that is named for the sidebar it also holds", () => {
    const html = `<html><body><div class="page with-sidebar"><div class="has-sidebar no-comments">
      ${filler("The first point")}${filler("The second point")}
      </div></div></body></html>`;
    const { contentHtml } = extractArticle(html, "https://example.com/");
    expect(contentHtml).toContain("The first point");
    expect(contentHtml).toContain("The second point");
  });

  it("drops a comment thread even when it is longer than the article", () => {
    const html = `<html><body>
      <div class="entry">${filler("The article itself")}${filler("Its second half")}</div>
      <div id="comments">${filler("One reader")}${filler("Another reader")}${filler("A third reader")}${filler("A fourth reader")}</div>
      </body></html>`;
    const { contentHtml } = extractArticle(html, "https://example.com/");
    expect(contentHtml).toContain("The article itself");
    expect(contentHtml).not.toContain("reader");
  });

  it("does not take one teaser for the article on a page that lists several", () => {
    const teaser = (name: string) => `<article><h2>${name}</h2>${filler(name)}</article>`;
    const html = `<html><body><main>${teaser("Monday")}${teaser("Tuesday")}${teaser("Wednesday")}</main></body></html>`;
    const { contentHtml } = extractArticle(html, "https://example.com/");
    for (const day of ["Monday", "Tuesday", "Wednesday"]) expect(contentHtml).toContain(`${day} is worth`);
  });

  it("takes the one long article when shorter ones sit beside it", () => {
    const html = `<html><body>
      <article>${filler("The feature")}${filler("Its middle")}${filler("Its end")}${filler("Its afterword")}</article>
      <article><p>A short note from last week.</p></article>
      </body></html>`;
    const { contentHtml } = extractArticle(html, "https://example.com/");
    expect(contentHtml).toContain("The feature is worth");
    expect(contentHtml).not.toContain("last week");
  });

  it("gives back whatever a nearly empty page has", () => {
    const article = extractArticle("<html><body><div id=\"app\"></div><p>Loading</p></body></html>", "https://app.example/");
    // The empty block stays as a mark for links to "#app"; it shows nothing.
    expect(article.contentHtml).toBe('<div data-anchor="app"></div><p>Loading</p>');
    expect(article.textLength).toBe(7);
    expect(article.title).toBe("");
    expect(article.siteName).toBe("app.example");
  });
});

describe("extractArticle: what is kept and what is dropped", () => {
  const body = (inner: string, url = "https://example.com/docs/guide/") =>
    extractArticle(`<html><body><article>${inner}</article></body></html>`, url).contentHtml;
  const long = "<p>This paragraph is here so that the article is long enough to be taken for one, which needs a hundred and forty characters of plain text or more.</p>";

  it("drops addresses that could run something", () => {
    const html = body(`${long}
      <p><a href="javascript:alert(1)">one</a> <a href="JaVa&#9;script:alert(1)">two</a>
      <a href="data:text/html,<b>x</b>">three</a> <a href="vbscript:x">four</a>
      <a href="file:///etc/passwd">five</a> <a href="mailto:hello@example.com">six</a></p>
      <p><img src="javascript:alert(1)" alt="bad"><img src="pic.png" onerror="alert(1)" onload="alert(2)" alt="good"></p>`);

    expect(html).not.toMatch(/javascript|vbscript|data:text|file:|onerror|onload|alert/i);
    // The words of a dropped link stay; the link does not.
    expect(html).toContain("one two");
    expect(html).toContain('<a href="mailto:hello@example.com">six</a>');
    expect(html).toContain('<img src="https://example.com/docs/guide/pic.png" alt="good">');
    expect(html).not.toContain("bad");
  });

  it("resolves every kind of relative address", () => {
    const html = body(`${long}
      <p><a href="next">a</a> <a href="../up">b</a> <a href="/root">c</a> <a href="//cdn.example.net/x">d</a>
      <a href="?page=2">e</a> <a href="https://other.example/y">f</a></p>`);
    expect(html).toContain('href="https://example.com/docs/guide/next"');
    expect(html).toContain('href="https://example.com/docs/up"');
    expect(html).toContain('href="https://example.com/root"');
    expect(html).toContain('href="https://cdn.example.net/x"');
    expect(html).toContain('href="https://example.com/docs/guide/?page=2"');
    expect(html).toContain('href="https://other.example/y"');
  });

  it("reads relative addresses against the page's <base> when it has one", () => {
    const article = extractArticle(
      `<html><head><base href="https://static.example.org/mirror/"></head><body><article>${long}<p><a href="page">link</a><img src="pic.png" alt=""></p></article></body></html>`,
      "https://example.com/a/b"
    );
    expect(article.contentHtml).toContain('href="https://static.example.org/mirror/page"');
    expect(article.contentHtml).toContain('src="https://static.example.org/mirror/pic.png"');
  });

  it("resolves a srcset and turns <picture> into a plain image", () => {
    const html = body(`${long}
      <img src="small.jpg" srcset="small.jpg 480w, /large,v2.jpg 1200w" alt="one">
      <picture><source srcset="wide.webp 2x"><img alt="two"></picture>
      <img data-lazy-src="late.jpg" data-srcset="late.jpg 1x,late@2x.jpg 2x" alt="three">`);
    expect(html).toContain(
      '<img src="https://example.com/docs/guide/small.jpg" srcset="https://example.com/docs/guide/small.jpg 480w, https://example.com/large,v2.jpg 1200w" alt="one">'
    );
    expect(html).toContain('<img src="https://example.com/docs/guide/wide.webp" srcset="https://example.com/docs/guide/wide.webp 2x" alt="two">');
    expect(html).toContain(
      '<img src="https://example.com/docs/guide/late.jpg" srcset="https://example.com/docs/guide/late.jpg 1x, https://example.com/docs/guide/late@2x.jpg 2x" alt="three">'
    );
    expect(html).not.toMatch(/<(picture|source)\b/);
  });

  it("drops pictures that are only there to count visits", () => {
    const html = body(`${long}<img src="https://stats.example/pixel.gif" width="1" height="1" alt=""><img src="real.png" width="640" height="480" alt="real">`);
    expect(html).not.toContain("stats.example");
    expect(html).toContain('<img src="https://example.com/docs/guide/real.png" alt="real" width="640" height="480">');
  });

  it("drops what the page hides", () => {
    const html = body(`${long}
      <p hidden>hidden by attribute</p>
      <p style="color: red; display:none">hidden by style</p>
      <div style="visibility: hidden">hidden by visibility</div>
      <span aria-hidden="true">decoration</span>
      <img src="formula.svg" aria-hidden="true" alt="E = mc^2">`);
    expect(html).not.toContain("hidden by");
    expect(html).not.toContain("decoration");
    // A picture hidden from screen readers is still a picture.
    expect(html).toContain('alt="E = mc^2"');
  });

  it("drops inline drawings, media players and embedded pages", () => {
    const html = body(`${long}
      <svg viewBox="0 0 10 10"><title>icon</title><path d="M0 0"></path></svg>
      <video src="clip.mp4" controls></video><audio src="clip.mp3"></audio>
      <object data="thing.swf"></object><embed src="thing.swf"><canvas></canvas>
      <noscript><img src="tracker.gif" alt=""></noscript><template><p>template text</p></template>`);
    expect(html).not.toMatch(/<(svg|path|video|audio|object|embed|canvas|noscript|template)\b/);
    expect(html).not.toMatch(/icon|clip\.|thing\.swf|tracker|template text/);
  });

  it("keeps the structure of the text", () => {
    const html = body(`${long}
      <section><h3>Part</h3><blockquote><p>Quoted <em>with</em> <strong>care</strong>.</p></blockquote></section>
      <ol start="3"><li>three<ul><li>nested</li></ul></li></ol>
      <table><thead><tr><th>Name</th><th colspan="2">Value</th></tr></thead><tbody><tr><td>a</td><td>1</td><td>2</td></tr></tbody></table>
      <hr><p>line one<br>line two</p>`);
    expect(html).toContain("<div><h3>Part</h3><blockquote><p>Quoted <em>with</em> <strong>care</strong>.</p></blockquote></div>");
    expect(html).toContain('<ol start="3"><li>three<ul><li>nested</li></ul></li></ol>');
    expect(html).toContain('<table><thead><tr><th>Name</th><th colspan="2">Value</th></tr></thead><tbody><tr><td>a</td><td>1</td><td>2</td></tr></tbody></table>');
    expect(html).toContain("<hr><p>line one<br>line two</p>");
  });

  it("keeps a code block as plain text and notes its language", () => {
    const html = body(`${long}
      <pre><code class="hljs language-rust"><span class="kw">fn</span> main() {
    println!(<span class="str">"&lt;hi&gt;"</span>);
}</code></pre>
      <div class="highlight highlight-source-python"><pre>print(<span>1</span>)</pre></div>
      <pre class="language-none">no language</pre>
      <p>Inline <code class="lang-js">let x</code> too.</p>`);
    expect(html).toContain('<pre><code data-lang="rust">fn main() {\n    println!("&lt;hi&gt;");\n}</code></pre>');
    expect(html).toContain('<pre><code data-lang="python">print(1)</code></pre>');
    expect(html).toContain("<pre><code>no language</code></pre>");
    expect(html).toContain('<code data-lang="js">let x</code>');
  });

  it("keeps a note set beside the text, and replaces tags it does not write by their contents", () => {
    const html = body(`${long}
      <aside><p>A note in the margin.</p></aside>
      <p><font color="red">red</font> <custom-chip>chip</custom-chip> <strike>old</strike> <tt>mono</tt> <span>plain</span></p>`);
    expect(html).toContain("<div><p>A note in the margin.</p></div>");
    expect(html).toContain("<p>red chip <s>old</s> <code>mono</code> plain</p>");
  });

  it("shows the source of a formula when the page carries it", () => {
    const html = body(`${long}
      <p>Energy: <math><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math>.</p>
      <p>Unknown: <math><mi>x</mi></math>.</p>`);
    expect(html).toContain("<p>Energy: <code>E = mc^2</code>.</p>");
    expect(html).toContain("<p>Unknown: .</p>");
  });

  it("escapes text and attribute values on the way out", () => {
    const html = body(`${long}<p title="x">5 &lt; 6 &amp;&amp; 7 &gt; 2</p><p><a href="/q?a=1&amp;b=&quot;2&quot;" title="say &quot;hi&quot; &lt;now&gt;">go</a></p>`);
    expect(html).toContain("<p>5 &lt; 6 &amp;&amp; 7 &gt; 2</p>");
    expect(html).toContain('<a href="https://example.com/q?a=1&amp;b=%222%22" title="say &quot;hi&quot; &lt;now&gt;">go</a>');
  });

  it("marks where the page's own anchors were, without keeping ids", () => {
    const html = body(`${long}<p id="first">one</p><a name="old-style"></a><custom-box id="boxed">two</custom-box>`);
    expect(html).toContain('<p data-anchor="first">one</p>');
    expect(html).toContain('<span data-anchor="old-style"></span>');
    expect(html).toContain('<span data-anchor="boxed"></span>two');
    expect(html).not.toMatch(/\sid=|\sname=/);
  });
});

describe("extractArticle: the title", () => {
  const titled = (head: string, body = "", url = "https://www.example.com/post") =>
    extractArticle(`<html><head>${head}</head><body>${body}</body></html>`, url).title;

  it("prefers the title the page shares", () => {
    expect(titled('<title>Something else</title><meta property="og:title" content="The shared title">')).toBe("The shared title");
  });

  it("strips the site's name from the end of the page title", () => {
    const site = '<meta property="og:site_name" content="Example News">';
    expect(titled(`<title>A headline | Example News</title>${site}`)).toBe("A headline");
    expect(titled(`<title>A headline - Example News</title>${site}`)).toBe("A headline");
    expect(titled(`<title>A headline \u2014 EXAMPLE NEWS</title>${site}`)).toBe("A headline");
    expect(titled(`<title>Example News: A headline</title>${site}`)).toBe("Example News: A headline");
    expect(titled(`<title>Example News | A headline</title>${site}`)).toBe("A headline");
  });

  it("knows the site by its address when the page does not name it", () => {
    expect(titled("<title>A headline | Example</title>")).toBe("A headline");
    expect(titled("<title>A headline - example.com</title>")).toBe("A headline");
  });

  it("leaves a title alone when its last part is not the site", () => {
    expect(titled("<title>War and Peace - Part Two</title>")).toBe("War and Peace - Part Two");
    expect(titled("<title>Self-hosting | a field guide</title>")).toBe("Self-hosting | a field guide");
  });

  it("takes the page's own headline when the title only adds to it", () => {
    // A site name the page never states, and that is not in its address.
    expect(titled("<title>DOMParser - Web APIs | MDN</title>", "<h1>DOMParser</h1>", "https://developer.mozilla.org/x")).toBe("DOMParser");
    // No <h1> on the page: its first <h2> is the headline.
    expect(titled("<title>Announcing 1.83 | Rust Blog</title>", "<h2>Announcing 1.83</h2><h2>Rust Blog</h2>", "https://blog.rust-lang.org/x")).toBe(
      "Announcing 1.83"
    );
  });

  it("does not take the site's name in the banner for the headline", () => {
    // The heading matches the end of the title, which is where a site's name goes.
    expect(titled("<title>My post | Kitchen Notes</title>", "<h1>Kitchen Notes</h1><h2>My post</h2>", "https://kn.example/x")).toBe(
      "My post | Kitchen Notes"
    );
    // The start of the title is the site, by its address.
    expect(titled("<title>Example - A headline</title>", "<h1>Example</h1>")).toBe("A headline");
    // A heading that is only a later section of the page.
    expect(titled("<title>War and Peace - Part Two</title>", "<h1>A reading diary</h1><h2>War and Peace</h2>")).toBe("War and Peace - Part Two");
  });

  it("falls back to the first heading", () => {
    expect(titled("", "<h1>  The   heading </h1><h1>Another</h1>")).toBe("The heading");
    expect(titled("", "<p>nothing to go on</p>")).toBe("");
  });

  it("takes the site's name from the address when the page gives none", () => {
    expect(extractArticle("<html><body></body></html>", "https://www.example.com/x").siteName).toBe("example.com");
  });
});

describe("extractArticle: who wrote it and what it is about", () => {
  const long = "<p>This paragraph is here so that the article is long enough to be taken for one, which needs a hundred and forty characters of plain text or more.</p>";

  it("finds the author in the page when the head does not name one", () => {
    const page = (inner: string) => extractArticle(`<html><body><article>${inner}${long}</article></body></html>`, "https://example.com/").byline;
    expect(page('<a rel="author" href="/people/ines">Ines Okafor</a>')).toBe("Ines Okafor");
    expect(page('<span itemprop="author">By Ines Okafor</span>')).toBe("Ines Okafor");
    expect(page('<p class="post-byline">by Ines Okafor</p>')).toBe("Ines Okafor");
    expect(page("<p>No one signed this.</p>")).toBe("");
  });

  it("takes the author's line out of the article, where it would be said twice", () => {
    const page = (inner: string, head = "") =>
      extractArticle(`<html><head>${head}</head><body><article>${inner}${long}</article></body></html>`, "https://example.com/");

    expect(page('<p class="byline">By Ines Okafor</p>').contentHtml).not.toContain("Ines");
    // The line is the paragraph, not only the link inside it.
    expect(page('<div class="meta"><p>By <a rel="author" href="/ines">Ines Okafor</a></p></div>').contentHtml).not.toMatch(/Ines|By/);
    // The head names the author, and the page repeats the name on a line of its own.
    const both = page('<p class="byline">by INES OKAFOR</p>', '<meta name="author" content="Ines Okafor">');
    expect(both.byline).toBe("Ines Okafor");
    expect(both.contentHtml).not.toMatch(/ines/i);
  });

  it("leaves the author's name where it is part of a sentence, or is someone else", () => {
    const page = (inner: string, head = "") =>
      extractArticle(`<html><head>${head}</head><body><article>${inner}${long}</article></body></html>`, "https://example.com/");

    const sentence = page('<p>Written by <a rel="author" href="/ines">Ines Okafor</a> on a Tuesday.</p>');
    expect(sentence.byline).toBe("Ines Okafor");
    expect(sentence.contentHtml).toContain('<p>Written by <a href="https://example.com/ines">Ines Okafor</a> on a Tuesday.</p>');

    const other = page('<p class="byline">By the news desk</p>', '<meta name="author" content="Ines Okafor">');
    expect(other.contentHtml).toContain("<p>By the news desk</p>");
  });

  it("does not take a profile address for a name", () => {
    const html = `<html><head><meta property="article:author" content="https://social.example/ines"></head><body><article>${long}</article></body></html>`;
    expect(extractArticle(html, "https://example.com/").byline).toBe("");
  });

  it("uses the start of the text when the page has no description", () => {
    const short = extractArticle(`<html><body><article>${long}${long}</article></body></html>`, "https://example.com/");
    expect(short.excerpt).toBe(
      "This paragraph is here so that the article is long enough to be taken for one, which needs a hundred and forty characters of plain text or more."
    );

    // A long opening paragraph is cut at a word, and says that it was.
    const twice = `<p>${long.replace(/<\/?p>/g, "")} ${long.replace(/<\/?p>/g, "")}</p>`;
    const { excerpt } = extractArticle(`<html><body><article>${twice}</article></body></html>`, "https://example.com/");
    expect(excerpt.startsWith("This paragraph is here")).toBe(true);
    expect(excerpt.endsWith("\u2026")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(201);
    expect(excerpt).not.toMatch(/\s\u2026$/);

    // The first real paragraph, not the captions and labels in front of it.
    const boxed = extractArticle(
      `<html><body><article><table><tbody><tr><th>Type</th><td>Bread</td></tr></tbody></table><p>Short label</p><div>${long}</div></article></body></html>`,
      "https://example.com/"
    );
    expect(boxed.excerpt.startsWith("This paragraph is here")).toBe(true);
  });
});

describe("metaRefreshUrl", () => {
  const page = "https://example.com/old/post.html";
  const refresh = (content: string) => `<!doctype html><title>Redirect</title><noscript><meta http-equiv="Refresh" content="${content}"></noscript><p>Moved.</p>`;

  it("finds where a moved page sends its visitors", () => {
    expect(metaRefreshUrl(refresh("0; url=https://example.com/new/post/"), page)).toBe("https://example.com/new/post/");
    expect(metaRefreshUrl(refresh("0;URL='../new/'"), page)).toBe("https://example.com/new/");
    expect(metaRefreshUrl(refresh("3, /elsewhere"), page)).toBe("https://example.com/elsewhere");
  });

  it("ignores a page that stays where it is", () => {
    // No such tag, a page that reloads itself, and one that only points at itself.
    expect(metaRefreshUrl("<html><head><title>Plain</title></head><body><p>refresh</p></body></html>", page)).toBeNull();
    expect(metaRefreshUrl(refresh("300"), page)).toBeNull();
    expect(metaRefreshUrl(refresh("0; url=post.html#top"), page)).toBeNull();
    // A page that waits half a minute means to be read first.
    expect(metaRefreshUrl(refresh("30; url=/next"), page)).toBeNull();
  });

  it("does not follow a page anywhere but the web", () => {
    expect(metaRefreshUrl(refresh("0; url=javascript:alert(1)"), page)).toBeNull();
    expect(metaRefreshUrl(refresh("0; url=file:///etc/passwd"), page)).toBeNull();
    expect(metaRefreshUrl(refresh("0; url=data:text/html,hello"), page)).toBeNull();
  });
});

describe("textToArticle", () => {
  it("shows a plain text page as it is", () => {
    const article = textToArticle("line <one>\r\n  line two\n", "https://example.com/files/notes%20today.txt");
    expect(article.title).toBe("notes today.txt");
    expect(article.siteName).toBe("example.com");
    expect(article.contentHtml).toBe("<pre><code>line &lt;one&gt;\n  line two</code></pre>");
    expect(articleToMarkdown(article, "https://example.com/files/notes%20today.txt", { frontmatter: false })).toBe(
      "# notes today.txt\n\n```\nline <one>\n  line two\n```\n"
    );
  });
});

describe("resolveLink", () => {
  const page = "https://example.com/docs/guide?v=2#intro";

  it("opens other pages in the reader", () => {
    expect(resolveLink("next", page)).toEqual({ kind: "page", url: "https://example.com/docs/next", fragment: "" });
    expect(resolveLink("https://other.example/a#part", page)).toEqual({ kind: "page", url: "https://other.example/a#part", fragment: "part" });
    // The same path with another query is another page.
    expect(resolveLink("?v=3", page).kind).toBe("page");
    // A link to the page itself reloads it.
    expect(resolveLink("https://example.com/docs/guide?v=2", page).kind).toBe("page");
  });

  it("scrolls to a place on the page already open", () => {
    expect(resolveLink("#setup", page)).toEqual({ kind: "anchor", url: "https://example.com/docs/guide?v=2#setup", fragment: "setup" });
    expect(resolveLink("https://example.com/docs/guide?v=2#caf%C3%A9", page)).toEqual({
      kind: "anchor",
      url: "https://example.com/docs/guide?v=2#caf%C3%A9",
      fragment: "café",
    });
    expect(resolveLink("#", page)).toEqual({ kind: "anchor", url: "https://example.com/docs/guide?v=2#", fragment: "" });
  });

  it("hands mail and phone links to another program", () => {
    expect(resolveLink("mailto:hello@example.com", page)).toEqual({ kind: "external-scheme", url: "mailto:hello@example.com", fragment: "" });
    expect(resolveLink("tel:+15551234", page).kind).toBe("external-scheme");
  });

  it("refuses everything else", () => {
    for (const href of [
      "javascript:alert(1)",
      "java\nscript:alert(1)",
      " JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:image/png;base64,AAAA",
      "blob:https://example.com/1234",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "tauri://localhost/",
      "http://[bad",
      "",
      "   ",
    ]) {
      expect(resolveLink(href, page), href).toEqual({ kind: "unsafe", url: "", fragment: "" });
    }
  });
});

describe("addressToUrl", () => {
  it("adds https:// when no scheme is typed", () => {
    expect(addressToUrl("example.com")).toBe("https://example.com/");
    expect(addressToUrl("  example.com/a b".trim().replace(" ", "%20"))).toBe("https://example.com/a%20b");
    expect(addressToUrl("example.com:8443/path?q=1#top")).toBe("https://example.com:8443/path?q=1#top");
    expect(addressToUrl("  www.example.com  ")).toBe("https://www.example.com/");
  });

  it("keeps a scheme that was typed", () => {
    expect(addressToUrl("http://example.com")).toBe("http://example.com/");
    expect(addressToUrl("HTTPS://Example.com/Page")).toBe("https://example.com/Page");
  });

  it("uses http:// for an address on this computer", () => {
    expect(addressToUrl("localhost:3000")).toBe("http://localhost:3000/");
    expect(addressToUrl("localhost/docs")).toBe("http://localhost/docs");
    expect(addressToUrl("127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
    expect(addressToUrl("[::1]:9000")).toBe("http://[::1]:9000/");
    // Not this computer, only named like it.
    expect(addressToUrl("localhost.example.com")).toBe("https://localhost.example.com/");
  });

  it("refuses what is not a web address", () => {
    for (const typed of [
      "",
      "   ",
      "how to bake bread",
      "javascript:alert(1)",
      "mailto:hello@example.com",
      "file:///etc/passwd",
      "ftp://example.com/",
      "about:blank",
      "alice:secret@example.com",
      "https://alice:secret@example.com/",
    ]) {
      expect(addressToUrl(typed), typed).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The article as a note
// ---------------------------------------------------------------------------

const SOURCE = "https://example.com/post";

const blank: Article = { title: "", byline: "", siteName: "", lang: "", contentHtml: "", textLength: 0, excerpt: "" };

/** The markdown for a piece of article HTML, without properties or title. */
const md = (contentHtml: string) => articleToMarkdown({ ...blank, contentHtml }, SOURCE, { frontmatter: false }).replace(/\n$/, "");

/** The kinds of thing a markdown parser finds in a text. */
function shapes(markdown: string, language = markdownLanguage): Set<string> {
  const names = new Set<string>();
  language.parser.parse(markdown).iterate({
    enter: (node) => {
      names.add(node.name);
    },
  });
  return names;
}

describe("articleToMarkdown: the properties block", () => {
  const article: Article = { ...blank, title: "A plain title", contentHtml: "<p>Body.</p>" };

  it("writes the title, the source and when it was saved", () => {
    expect(articleToMarkdown(article, SOURCE, { clipped: "2026-11-13T09:30:00.000Z" })).toBe(
      "---\ntitle: A plain title\nsource: https://example.com/post\nclipped: 2026-11-13T09:30:00.000Z\n---\n\n# A plain title\n\nBody.\n"
    );
  });

  it("leaves the date out when it is not given, and never reads the clock", () => {
    const first = articleToMarkdown(article, SOURCE);
    expect(first).toBe("---\ntitle: A plain title\nsource: https://example.com/post\n---\n\n# A plain title\n\nBody.\n");
    expect(articleToMarkdown(article, SOURCE)).toBe(first);
  });

  it("names the author when the page did", () => {
    expect(articleToMarkdown({ ...article, byline: "Ines Okafor" }, SOURCE)).toBe(
      "---\ntitle: A plain title\nauthor: Ines Okafor\nsource: https://example.com/post\n---\n\n# A plain title\n\nBody.\n"
    );
  });

  it("can be left out", () => {
    expect(articleToMarkdown({ ...article, byline: "Ines Okafor" }, SOURCE, { frontmatter: false })).toBe("# A plain title\n\nBody.\n");
  });

  it("quotes a title that YAML would misread", async () => {
    const { parse } = await import("yaml");
    for (const title of ['Tides: a "short" guide #1', "- not a list", "'quoted'", "yes", "42", "a: b: c", "[draft] plan", "50% off & more"]) {
      const note = articleToMarkdown({ ...article, title }, "https://example.com/a?b=c#d: e", { clipped: "2026-11-13" });
      const block = /^---\n([\s\S]*?)\n---\n/.exec(note);
      expect(block, title).not.toBeNull();
      expect(parse(block![1]), title).toEqual({ title, source: "https://example.com/a?b=c#d: e", clipped: "2026-11-13" });
    }
  });

  it("writes no title property and no heading for a page without a title", () => {
    expect(articleToMarkdown({ ...blank, contentHtml: "<p>Body.</p>" }, SOURCE)).toBe("---\nsource: https://example.com/post\n---\n\nBody.\n");
  });
});

describe("articleToMarkdown: each kind of block", () => {
  it("writes headings", () => {
    expect(md("<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>")).toBe(
      "# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six"
    );
    // A heading is one line, whatever the page did inside it.
    expect(md("<h2>Split<br>in <em>two</em></h2>")).toBe("## Split in *two*");
    // A closing "#" would be dropped as decoration.
    expect(md("<h2>Why C #</h2>")).toBe("## Why C \\#");
  });

  it("writes paragraphs with one blank line between them", () => {
    expect(md("<p>First.</p>\n\n\n<p>Second.</p><div><p>Third.</p></div><p>   </p><p>Fourth\n   wrapped   line.</p>")).toBe(
      "First.\n\nSecond.\n\nThird.\n\nFourth wrapped line."
    );
    // A space that must not break is an ordinary space in the note, so that
    // searching the vault for "10 km" finds it.
    expect(md("<p>10&nbsp;km&nbsp;&nbsp;away</p><p>&nbsp;</p>")).toBe("10 km away");
  });

  it("writes emphasis, keeping spaces outside the marks", () => {
    expect(md("<p>Some <em>stressed</em> and <strong>strong</strong> and <b><i>both</i></b> words.</p>")).toBe(
      "Some *stressed* and **strong** and ***both*** words."
    );
    expect(md("<p>A<b> padded </b>word, <i></i>an empty one, <strong>bold <b>inside bold</b></strong>.</p>")).toBe(
      "A **padded** word, an empty one, **bold inside bold**."
    );
    expect(md("<p><del>gone</del> <s>struck</s> <mark>marked</mark> H<sub>2</sub>O x<sup>2</sup> <q>said</q></p>")).toBe(
      "~~gone~~ ~~struck~~ ==marked== H~2~O x^2^ \u201csaid\u201d"
    );
  });

  it("writes links", () => {
    expect(md('<p>See <a href="https://example.com/a">the page</a>.</p>')).toBe("See [the page](https://example.com/a).");
    expect(md('<p><a href="https://example.com/a" title="A &quot;title&quot;">words</a></p>')).toBe('[words](https://example.com/a "A \\"title\\"")');
    expect(md('<p><a href="https://example.com/a_(b)">brackets</a></p>')).toBe("[brackets](https://example.com/a_%28b%29)");
    expect(md('<p><a href="https://example.com/a">https://example.com/a</a></p>')).toBe("<https://example.com/a>");
    expect(md('<p><a href="https://example.com/a"> spaced </a>out</p>')).toBe("[spaced](https://example.com/a) out");
    // A link with nothing in it to show, and a link that lost its address.
    expect(md('<p>Before<a href="https://example.com/a"></a> after <a>plain</a>.</p>')).toBe("Before after plain.");
    expect(md('<p><a href="https://example.com/a">a [bracketed] word</a></p>')).toBe("[a \\[bracketed\\] word](https://example.com/a)");
  });

  it("writes pictures", () => {
    expect(md('<p><img src="https://example.com/a.png" alt="A cat"></p>')).toBe("![A cat](https://example.com/a.png)");
    expect(md('<img src="https://example.com/a b.png" alt="A [cat]" title="Tom">')).toBe('![A \\[cat\\]](https://example.com/a%20b.png "Tom")');
    expect(md('<p><a href="https://example.com/"><img src="https://example.com/a.png" alt="Home"></a></p>')).toBe(
      "[![Home](https://example.com/a.png)](https://example.com/)"
    );
    expect(md('<figure><img src="https://example.com/a.png" alt="A cat"><figcaption>Tom, <em>asleep</em>.</figcaption></figure>')).toBe(
      "![A cat](https://example.com/a.png)\n\n*Tom, asleep.*"
    );
    // A picture written into the page as data would bury the note.
    expect(md('<p>Before <img src="data:image/png;base64,AAAA" alt="dot"> after.</p>')).toBe("Before after.");
  });

  it("writes lists", () => {
    expect(md("<ul><li>one</li><li>two</li></ul>")).toBe("- one\n- two");
    expect(md("<ol><li>one</li><li>two</li></ol>")).toBe("1. one\n2. two");
    expect(md('<ol start="9"><li>nine</li><li>ten</li></ol>')).toBe("9. nine\n10. ten");
  });

  it("writes lists inside lists", () => {
    expect(
      md("<ul><li>fruit<ul><li>apple<ol><li>peel</li><li>core</li></ol></li><li>pear</li></ul></li><li>bread</li></ul>")
    ).toBe("- fruit\n  - apple\n    1. peel\n    2. core\n  - pear\n- bread");
    expect(md("<ol><li>first<ul><li>inside</li></ul></li><li><p>second</p><p>with more</p></li></ol>")).toBe(
      "1. first\n   - inside\n2. second\n\n   with more"
    );
    const nested = shapes(md("<ul><li>fruit<ul><li>apple</li></ul></li></ul>"));
    expect(nested.has("BulletList")).toBe(true);
  });

  it("writes quotes", () => {
    expect(md("<blockquote><p>One.</p><p>Two.</p></blockquote>")).toBe("> One.\n>\n> Two.");
    expect(md("<blockquote>Said plainly.<blockquote><ul><li>deeper</li></ul></blockquote></blockquote>")).toBe(
      "> Said plainly.\n>\n> > - deeper"
    );
  });

  it("writes code blocks, with the language when the page gives it", () => {
    expect(md('<pre><code data-lang="rust">fn main() {\n    let x = 1;\n}</code></pre>')).toBe("```rust\nfn main() {\n    let x = 1;\n}\n```");
    expect(md("<pre><code>no *language*\n\n\n# not a heading</code></pre>")).toBe("```\nno *language*\n\n\n# not a heading\n```");
    // A fence longer than any run of backticks inside.
    expect(md("<pre><code>```js\nx\n```</code></pre>")).toBe("````\n```js\nx\n```\n````");
    expect(md("<ul><li>Run:<pre><code data-lang=\"sh\">ls\n\npwd</code></pre></li></ul>")).toBe("- Run:\n\n  ```sh\n  ls\n\n  pwd\n  ```");
  });

  it("writes code in a line", () => {
    expect(md("<p>Call <code>f(x)</code> or <code>a `b` c</code> or <code>`</code>.</p>")).toBe("Call `f(x)` or ``a `b` c`` or `` ` ``.");
    expect(md("<p><code>*not* _formatted_ [here]</code></p>")).toBe("`*not* _formatted_ [here]`");
  });

  it("writes tables", () => {
    const table = md(
      '<table><thead><tr><th>Name</th><th>Use</th></tr></thead><tbody><tr><td>a|b</td><td><code>x | y</code></td></tr><tr><td>line<br>break</td><td><a href="https://example.com/">link</a></td></tr><tr><td><code>plain code</code></td><td>1</td></tr></tbody></table>'
    );
    // A pipe in a cell is written as a character reference. Noteriv's table
    // view cuts a row at every pipe, a backslash in front or not, and code
    // with a pipe in it is written as ordinary text for the same reason.
    expect(table).toBe(
      "| Name | Use |\n| --- | --- |\n| a&#124;b | x &#124; y |\n| line<br>break | [link](https://example.com/) |\n| `plain code` | 1 |"
    );
    const found = shapes(table);
    expect(found.has("Table")).toBe(true);
    expect(found.has("TableHeader")).toBe(true);
    // Every row has the same number of pipes: none was added by a cell's text.
    expect(table.split("\n").map((row) => row.split("|").length)).toEqual([4, 4, 4, 4, 4]);
    // Outside a table a pipe is only a pipe.
    expect(md("<p>a | b and <code>x | y</code></p>")).toBe("a | b and `x | y`");
  });

  it("gives a table without headings an empty heading row", () => {
    expect(md("<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>")).toBe(
      "|  |  |\n| --- | --- |\n| a | b |\n| c | d |"
    );
  });

  it("keeps the columns of a table whose cells span rows or columns", () => {
    expect(
      md(
        '<table><caption>Opening hours</caption><tbody><tr><th>Day</th><th>From</th><th>To</th></tr><tr><td rowspan="2">Weekend</td><td>10</td><td>16</td></tr><tr><td>12</td><td>16</td></tr><tr><td colspan="2">Monday</td><td>closed</td></tr><tr><td>Tuesday</td></tr></tbody></table>'
      )
    ).toBe(
      "*Opening hours*\n\n| Day | From | To |\n| --- | --- | --- |\n| Weekend | 10 | 16 |\n|  | 12 | 16 |\n| Monday |  | closed |\n| Tuesday |  |  |"
    );
  });

  it("writes out a table that only arranges the page", () => {
    expect(md("<table><tbody><tr><td><p>Left column.</p><ul><li>item</li></ul></td><td><p>Right column.</p></td></tr></tbody></table>")).toBe(
      "Left column.\n\n- item\n\nRight column."
    );
  });

  it("writes rules, line breaks and definition lists", () => {
    expect(md("<p>Above</p><hr><p>Below</p>")).toBe("Above\n\n---\n\nBelow");
    expect(md("<p>Roses are red,<br>violets are blue.</p>")).toBe("Roses are red,  \nviolets are blue.");
    expect(md("<dl><dt>Tide</dt><dd>The rise and fall of the sea.</dd><dt>Ebb</dt><dt>Flood</dt><dd>Its two directions.</dd></dl>")).toBe(
      "Tide\n: The rise and fall of the sea.\n\nEbb\nFlood\n: Its two directions."
    );
    expect(md("<details><summary>More</summary><p>Hidden until opened.</p></details>")).toBe("**More**\n\nHidden until opened.");
  });

  it("writes a whole article with one blank line between blocks and one newline at the end", () => {
    const article = extractArticle(ARTICLE_PAGE, PAGE_URL);
    const note = articleToMarkdown(article, PAGE_URL, { clipped: "2026-11-13T09:30:00.000Z" });
    expect(note).toBe(
      [
        "---",
        "title: How to keep a sourdough starter alive",
        "author: Mara Lindqvist",
        "source: https://dailyloaf.example/2026/starter?ref=home",
        "clipped: 2026-11-13T09:30:00.000Z",
        "---",
        "",
        "# How to keep a sourdough starter alive",
        "",
        "A starter is flour, water and patience. Left alone on the counter it goes sour and thin within a few days, and most people assume at that point that they have killed it. They almost never have.",
        "",
        "## Feeding",
        "",
        "Feed it once a day with equal weights of flour and water. Read about [which flour to use](https://dailyloaf.example/guides/flour), or skip ahead to [troubleshooting](https://dailyloaf.example/2026/starter?ref=home#troubleshooting) if yours already smells of nail polish.",
        "",
        "![A jar of starter](https://dailyloaf.example/img/starter-day-3.jpg)",
        "",
        "*Day three: bubbles, and a smell like yoghurt.*",
        "",
        "- Use a clean jar.",
        "- Keep it somewhere warm.",
        "",
        "## Troubleshooting",
        "",
        "A grey liquid on top is only alcohol. Pour it off, feed the starter, and carry on as before.",
        "",
      ].join("\n")
    );
    expect(note).not.toMatch(/\n{3,}/);
  });
});

describe("articleToMarkdown: text that markdown would misread", () => {
  /** Takes the backslashes back out, as a markdown reader does. */
  const unescape = (markdown: string) => markdown.replace(/\\([!-/:-@[-`{-~])/g, "$1");

  const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const TRICKY = [
    "2 * 3 * 4 is not *emphasis* and neither is **this**",
    "a *b",
    "__init__ and _private and trailing_ but snake_case_name stays",
    "use `backticks` and ``two``",
    "[not a link](https://example.com) and ![not a picture](x.png)",
    "[ref]: https://example.com",
    "[[not a wiki link]] and [^1] and [text][ref]",
    "<div>not a tag</div> <!-- nor a comment --> <https://example.com>",
    "AT&amp;T and &copy; and &#169; and &#xA9;",
    "# not a heading",
    "###### nor this",
    "> not a quote",
    "- not a list",
    "+ nor this",
    "* nor this",
    "1. not numbered",
    "12) nor this",
    "---",
    "===",
    "~~not struck~~",
    "back\\slash and \\* and a trailing one\\",
    "[ ] not a task",
    "<3 and a < b stay as they are, and so does b > a",
  ];

  it("reads back as the same text", () => {
    for (const text of TRICKY) {
      const markdown = md(`<p>${escapeHtml(text)}</p>`);
      expect(unescape(markdown), text).toBe(text);
      // To a markdown parser it is one paragraph of plain text and escapes.
      expect([...shapes(markdown, commonmarkLanguage)].sort(), `${text} -> ${markdown}`).toEqual(
        markdown.includes("\\") ? ["Document", "Escape", "Paragraph"] : ["Document", "Paragraph"]
      );
    }
  });

  it("stays the same text inside a list item, a quote and a heading", () => {
    for (const text of ["# one", "- two", "1. three", "> four", "*five*", "[six](x)"]) {
      for (const wrapper of ["<ul><li>$</li></ul>", "<blockquote><p>$</p></blockquote>", "<h2>$</h2>"]) {
        const markdown = md(wrapper.replace("$", escapeHtml(text)));
        const found = shapes(markdown, commonmarkLanguage);
        for (const formatting of ["Emphasis", "StrongEmphasis", "Link", "Image", "OrderedList", "HTMLTag", "InlineCode"]) {
          expect(found.has(formatting), `${markdown} has ${formatting}`).toBe(false);
        }
        expect(unescape(markdown), markdown).toContain(text);
      }
    }
  });

  it("escapes only where it has to", () => {
    expect(md("<p>snake_case, 2 * 3, a < b, AT&T, [1], C:\\Users\\me, 50% and #1 are left alone.</p>".replace("a < b", "a &lt; b").replace("AT&T", "AT&amp;T"))).toBe(
      "snake_case, 2 * 3, a < b, AT&T, [1], C:\\Users\\me, 50% and #1 are left alone."
    );
  });

  it("keeps a word after # from becoming a tag, and a pair of dollar signs from becoming a formula", () => {
    expect(md("<p>Tagged #bread and (#sourdough-starter) and #2026-plans today, issue #42, C# and a#b.</p>")).toBe(
      "Tagged \\#bread and (\\#sourdough-starter) and \\#2026-plans today, issue #42, C# and a#b."
    );
    expect(md("<p>It costs $5 here and $10 there.</p>")).toBe("It costs \\$5 here and \\$10 there.");
    expect(md("<p>It costs $5.</p>")).toBe("It costs $5.");
  });

  it("escapes a title too", () => {
    expect(articleToMarkdown({ ...blank, title: "*Stars* and [brackets](x)" }, SOURCE, { frontmatter: false })).toBe(
      "# \\*Stars\\* and \\[brackets](x)\n"
    );
  });

  it("escapes each line of a paragraph with line breaks", () => {
    const markdown = md("<p>Shopping:<br>- eggs<br>1. flour<br># sugar</p>");
    expect(markdown).toBe("Shopping:  \n\\- eggs  \n1\\. flour  \n\\# sugar");
    expect([...shapes(markdown, commonmarkLanguage)].sort()).toEqual(["Document", "Escape", "HardBreak", "Paragraph"]);
  });

  it("escapes a mark that only reaches the start of a line once the space before it is trimmed", () => {
    // A footnote written as " * Some parts...", with the asterisk in an element of its own.
    for (const html of ["<p> * Some parts may vary.</p>", "<p><span> </span>* Some parts may vary.</p>", "<div>\n  * Some parts may vary.\n</div>"]) {
      const markdown = md(html);
      expect(markdown, html).toBe("\\* Some parts may vary.");
      expect(shapes(markdown, commonmarkLanguage).has("BulletList"), html).toBe(false);
    }
    expect(md("<p> - dash</p>")).toBe("\\- dash");
    expect(md("<p> # hash</p>")).toBe("\\# hash");
    // Real emphasis at the start of a line is left as it is.
    expect(md("<p><em>stressed</em> start</p>")).toBe("*stressed* start");
  });
});
