import { describe, expect, it } from "vitest";
import { lintMarkdown } from "../markdown-lint";
import { LinkIndex } from "../link-resolve";

// A small vault: three notes, a picture, a PDF and a base.
const files = [
  "Home.md",
  "Projects/Plan.md",
  "Projects/v1.2 notes.md",
  "attachments/photo.png",
  "Papers/paper.pdf",
  "Projects.base",
];
const index = new LinkIndex(files);
// What the lint panel passes: the notes' names, and the app's own lookup.
const names = ["Home", "Plan", "v1.2 notes"];
const lookupFrom = (from: string) => (target: string) => index.wiki(from, target);

function broken(content: string, from = "Home.md", aliases: string[] = []): string[] {
  return lintMarkdown(`# Title\n${content}`, "/vault", names, aliases, lookupFrom(from))
    .filter((w) => w.rule === "broken-wikilink")
    .map((w) => w.message);
}

describe("broken wiki-links", () => {
  it("does not report an embedded picture that is in the vault", () => {
    expect(broken("![[photo.png]]")).toEqual([]);
    expect(broken("![[attachments/photo.png]]")).toEqual([]);
    expect(broken("![[photo.png|300]]")).toEqual([]);
  });

  it("does not report a link to a PDF, a PDF page, or a base", () => {
    expect(broken("[[paper.pdf]] and [[paper.pdf#page=3]]")).toEqual([]);
    expect(broken("![[Projects.base]] and [[Projects.base]]")).toEqual([]);
  });

  it("still reports a picture or a note that is not in the vault", () => {
    expect(broken("![[missing.png]]")).toEqual(["Broken wiki-link: [[missing.png]]"]);
    expect(broken("[[Nowhere]]")).toEqual(["Broken wiki-link: [[Nowhere]]"]);
    expect(broken("[[paper.docx]]")).toEqual(["Broken wiki-link: [[paper.docx]]"]);
  });

  it("knows a note whose name has a dot in it", () => {
    expect(broken("[[v1.2 notes]]")).toEqual([]);
    expect(broken("[[v1.3 notes]]")).toEqual(["Broken wiki-link: [[v1.3 notes]]"]);
  });

  it("finds a note by a path from the note the link is in", () => {
    expect(broken("[[../Home]]", "Projects/Plan.md")).toEqual([]);
    expect(broken("[[./Plan]]", "Projects/v1.2 notes.md")).toEqual([]);
  });

  it("does not report a link to a heading, a block or an alias", () => {
    expect(broken("[[Plan#Goals]] [[Plan#^abc]] [[#Here]]")).toEqual([]);
    expect(broken("[[The plan]]", "Home.md", ["The Plan"])).toEqual([]);
  });

  it("reports only notes when it is given no lookup", () => {
    const messages = lintMarkdown("# Title\n[[Plan]] ![[photo.png]]", "/vault", names)
      .filter((w) => w.rule === "broken-wikilink")
      .map((w) => w.message);
    expect(messages).toEqual(["Broken wiki-link: [[photo.png]]"]);
  });

  it("leaves links in a code block alone", () => {
    expect(broken("```\n[[Nowhere]]\n```")).toEqual([]);
  });
});
