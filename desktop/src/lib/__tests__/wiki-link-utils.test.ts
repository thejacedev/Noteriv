import { describe, expect, it } from "vitest";
import { findAnchorLine, findBacklinks, findLinkedFile, splitWikiTarget } from "../wiki-link-utils";
import { lintMarkdown } from "../markdown-lint";

describe("splitWikiTarget", () => {
  it("leaves a plain target alone", () => {
    expect(splitWikiTarget("Project Alpha")).toEqual({ file: "Project Alpha", anchor: null });
  });

  it("splits off a heading", () => {
    expect(splitWikiTarget("Project Alpha#Goals")).toEqual({
      file: "Project Alpha",
      anchor: { type: "heading", text: "Goals" },
    });
  });

  it("splits off a block id", () => {
    expect(splitWikiTarget("Project Alpha#^key-decision")).toEqual({
      file: "Project Alpha",
      anchor: { type: "block", id: "key-decision" },
    });
  });

  it("treats an empty note part as the current note", () => {
    expect(splitWikiTarget("#Goals")).toEqual({ file: "", anchor: { type: "heading", text: "Goals" } });
  });

  it("uses the last of nested headings", () => {
    expect(splitWikiTarget("Note#Plan#Goals").anchor).toEqual({ type: "heading", text: "Goals" });
  });

  it("ignores an empty fragment", () => {
    expect(splitWikiTarget("Note#")).toEqual({ file: "Note", anchor: null });
    expect(splitWikiTarget("Note#^")).toEqual({ file: "Note", anchor: null });
  });
});

describe("findAnchorLine", () => {
  const note = [
    "---", // 1
    "title: Alpha", // 2
    "# not a heading, a YAML comment", // 3
    "---", // 4
    "", // 5
    "# Project Alpha", // 6
    "", // 7
    "```md", // 8
    "## Goals", // 9  (inside a code block)
    "```", // 10
    "", // 11
    "## **Goals** for 2026 ##", // 12
    "", // 13
    "We decided to stay local-first. ^key-decision", // 14
    "", // 15
    "- one", // 16
    "- two", // 17
    "", // 18
    "^the-list", // 19
  ].join("\n");

  it("finds a heading, ignoring case and inline markup", () => {
    expect(findAnchorLine(note, { type: "heading", text: "goals for 2026" })).toBe(12);
  });

  it("does not match headings inside code blocks or frontmatter", () => {
    expect(findAnchorLine(note, { type: "heading", text: "Goals" })).toBeNull();
    expect(findAnchorLine(note, { type: "heading", text: "not a heading, a YAML comment" })).toBeNull();
  });

  it("finds a block id at the end of a line", () => {
    expect(findAnchorLine(note, { type: "block", id: "key-decision" })).toBe(14);
  });

  it("points an id on its own line at the block above it", () => {
    expect(findAnchorLine(note, { type: "block", id: "the-list" })).toBe(17);
  });

  it("returns null when nothing matches", () => {
    expect(findAnchorLine(note, { type: "heading", text: "Missing" })).toBeNull();
    expect(findAnchorLine(note, { type: "block", id: "missing" })).toBeNull();
  });
});

describe("links with a heading or block part", () => {
  it("count as backlinks to the note", async () => {
    const files = [
      { filePath: "/v/Home.md", fileName: "Home.md" },
      { filePath: "/v/Project Alpha.md", fileName: "Project Alpha.md" },
    ];
    const contents: Record<string, string> = {
      "/v/Home.md": "See [[Project Alpha#Goals]].\nAnd [[Project Alpha#^key-decision|the decision]].\nNot [[Project Alphabet]].",
      "/v/Project Alpha.md": "# Project Alpha",
    };
    const backlinks = await findBacklinks("Project Alpha.md", "/v", files, async (p) => contents[p] ?? null);
    expect(backlinks.map((b) => b.line)).toEqual([1, 2]);
  });

  it("are not reported as broken by the linter", () => {
    const content = "[[Project Alpha#Goals]] [[#Local heading]] [[Missing Note#Part]]";
    const broken = lintMarkdown(content, "/v", ["project alpha"]).filter((w) => w.rule === "broken-wikilink");
    expect(broken.map((w) => w.message)).toEqual(["Broken wiki-link: [[Missing Note#Part]]"]);
  });
});

describe("findLinkedFile", () => {
  const files = ["attachments/deep/photo.png", "img/photo.png", "img/Diagram.SVG", "paper.pdf", "z/paper.pdf", "Notes/Plan.md"];

  it("finds a file by its path, or by its name with the shallowest winning", () => {
    expect(findLinkedFile(files, "img/photo.png")).toBe("img/photo.png");
    expect(findLinkedFile(files, "attachments/deep/photo.png")).toBe("attachments/deep/photo.png");
    expect(findLinkedFile(files, "photo.png")).toBe("img/photo.png");
    expect(findLinkedFile(files, "PHOTO.PNG")).toBe("img/photo.png");
    expect(findLinkedFile(files, "diagram.svg")).toBe("img/Diagram.SVG");
    expect(findLinkedFile(files, "paper.pdf")).toBe("paper.pdf");
  });

  it("falls back to the name when the path is not there, and finds nothing for a missing file", () => {
    expect(findLinkedFile(files, "old/place/photo.png")).toBe("img/photo.png");
    expect(findLinkedFile(files, "img\\photo.png")).toBe("img/photo.png");
    expect(findLinkedFile(files, "missing.png")).toBeNull();
    expect(findLinkedFile(files, "")).toBeNull();
  });
});
