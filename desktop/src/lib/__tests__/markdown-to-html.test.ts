import { describe, expect, it } from "vitest";
import { markdownToHTML, wikiLinksForExport } from "../markdown-to-html";

describe("wikiLinksForExport", () => {
  it("shows a link as its text", () => {
    expect(wikiLinksForExport("<p>See [[Projects/Alpha]] and [[Plan|the plan]].</p>")).toBe(
      '<p>See <span class="wikilink">Alpha</span> and <span class="wikilink">the plan</span>.</p>'
    );
    expect(wikiLinksForExport("[[Alpha.md#Goals]] [[#Here]] [[Alpha#^block]]")).toBe(
      '<span class="wikilink">Alpha › Goals</span> <span class="wikilink">Here</span> <span class="wikilink">Alpha › block</span>'
    );
  });

  it("shows an embedded picture as a picture, and another embedded file by name", () => {
    expect(wikiLinksForExport("![[attachments/photo one.png|320]]")).toBe(
      '<img src="attachments/photo one.png" alt="photo one.png">'
    );
    expect(wikiLinksForExport("![[paper.pdf]] ![[Note]]")).toBe(
      '<span class="wikilink">paper.pdf</span> <span class="wikilink">Note</span>'
    );
  });

  it("leaves code as written", () => {
    const html = "<p>[[A]]</p><pre><code>[[B]]</code></pre><p><code>![[c.png]]</code> [[D]]</p>";
    expect(wikiLinksForExport(html)).toBe(
      '<p><span class="wikilink">A</span></p><pre><code>[[B]]</code></pre><p><code>![[c.png]]</code> <span class="wikilink">D</span></p>'
    );
  });

  it("is what an export of a note with wiki links reads like", () => {
    const html = wikiLinksForExport(markdownToHTML("A note about [[Alpha|the first project]].\n\n![[sketch.png]]\n"));
    expect(html).toContain('<span class="wikilink">the first project</span>');
    expect(html).toContain('<img src="sketch.png" alt="sketch.png">');
    expect(html).not.toContain("[[");
  });
});
