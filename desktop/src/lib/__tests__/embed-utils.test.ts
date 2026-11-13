import { describe, expect, it } from "vitest";
import { embedTitle, extractEmbedSection, parseEmbed, truncateEmbed } from "../embed-utils";

describe("parseEmbed", () => {
  it("treats a bare name as a note", () => {
    expect(parseEmbed("Meeting Notes")).toEqual({
      target: "Meeting Notes",
      file: "Meeting Notes",
      anchor: null,
      kind: "note",
    });
    expect(parseEmbed("v2.4 release notes").kind).toBe("note");
    expect(parseEmbed("Folder/Note.md").kind).toBe("note");
  });

  it("reads a heading or block part", () => {
    expect(parseEmbed("Project Alpha#Goals").anchor).toEqual({ type: "heading", text: "Goals" });
    expect(parseEmbed("Project Alpha#^key").anchor).toEqual({ type: "block", id: "key" });
  });

  it("recognises images and their size", () => {
    expect(parseEmbed("diagram.png")).toMatchObject({ kind: "image", file: "diagram.png" });
    expect(parseEmbed("diagram.png|160")).toMatchObject({ kind: "image", width: 160 });
    expect(parseEmbed("Attachments/photo.JPG|320x200")).toMatchObject({
      kind: "image",
      file: "Attachments/photo.JPG",
      width: 320,
      height: 200,
    });
  });

  it("leaves files with their own viewer as links", () => {
    expect(parseEmbed("sketch.drawing").kind).toBe("other");
    expect(parseEmbed("Board.canvas").kind).toBe("other");
  });

  it("knows sound, video and PDF files, and the page a PDF embed names", () => {
    expect(parseEmbed("memo.mp3").kind).toBe("audio");
    expect(parseEmbed("Recordings/talk.M4A").kind).toBe("audio");
    expect(parseEmbed("clip.mp4").kind).toBe("video");
    expect(parseEmbed("clip.webm|320").kind).toBe("video");
    expect(parseEmbed("paper.pdf").kind).toBe("pdf");
    expect(parseEmbed("paper.pdf").page).toBeUndefined();
    expect(parseEmbed("paper.pdf#page=3")).toMatchObject({ kind: "pdf", file: "paper.pdf", page: 3 });
    expect(parseEmbed("paper.pdf#page=0").page).toBeUndefined();
    expect(parseEmbed("docs/paper.pdf#height=400&page=12").page).toBe(12);
  });

  it("knows a base file and the view an embed of it names", () => {
    expect(parseEmbed("Projects.base")).toMatchObject({ kind: "base", file: "Projects.base", anchor: null });
    expect(parseEmbed("Work/Projects.base#Open tasks")).toMatchObject({
      kind: "base",
      file: "Work/Projects.base",
      anchor: { type: "heading", text: "Open tasks" },
    });
  });

  it("ignores an alias on a note embed", () => {
    expect(parseEmbed("Note|shown differently")).toEqual({
      target: "Note",
      file: "Note",
      anchor: null,
      kind: "note",
    });
  });
});

describe("embedTitle", () => {
  it("names the note and the part it shows", () => {
    expect(embedTitle(parseEmbed("Projects/Alpha"))).toBe("Alpha");
    expect(embedTitle(parseEmbed("Alpha#Goals"))).toBe("Alpha › Goals");
    expect(embedTitle(parseEmbed("Alpha#^key"))).toBe("Alpha › ^key");
  });
});

describe("extractEmbedSection", () => {
  const note = [
    "---",
    "status: active",
    "---",
    "",
    "# Alpha",
    "",
    "Intro text.",
    "",
    "## Goals",
    "",
    "- Ship it",
    "- Keep it simple",
    "",
    "### Stretch",
    "",
    "Maybe later.",
    "",
    "## Decisions",
    "",
    "We stay local-first.",
    "It keeps things simple. ^key",
    "",
    "Another paragraph.",
  ].join("\n");

  it("shows the whole note without its frontmatter", () => {
    const section = extractEmbedSection(note, null)!;
    expect(section.startsWith("# Alpha")).toBe(true);
    expect(section).not.toContain("status: active");
    expect(section.endsWith("Another paragraph.")).toBe(true);
  });

  it("shows a heading with its subsections, up to the next heading of that level", () => {
    expect(extractEmbedSection(note, { type: "heading", text: "Goals" })).toBe(
      ["## Goals", "", "- Ship it", "- Keep it simple", "", "### Stretch", "", "Maybe later."].join("\n")
    );
  });

  it("shows the last section through to the end", () => {
    const section = extractEmbedSection(note, { type: "heading", text: "Decisions" })!;
    expect(section.startsWith("## Decisions")).toBe(true);
    expect(section.endsWith("Another paragraph.")).toBe(true);
  });

  it("shows the paragraph holding a block id, without the id", () => {
    expect(extractEmbedSection(note, { type: "block", id: "key" })).toBe(
      "We stay local-first.\nIt keeps things simple."
    );
  });

  it("returns null for a heading or block that is not there", () => {
    expect(extractEmbedSection(note, { type: "heading", text: "Missing" })).toBeNull();
    expect(extractEmbedSection(note, { type: "block", id: "missing" })).toBeNull();
  });
});

describe("truncateEmbed", () => {
  it("leaves short content alone", () => {
    expect(truncateEmbed("a\nb", 5)).toEqual({ text: "a\nb", hiddenLines: 0 });
  });

  it("cuts long content and reports what was hidden", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const cut = truncateEmbed(text, 4);
    expect(cut.text.split("\n")).toHaveLength(4);
    expect(cut.hiddenLines).toBe(6);
  });

  it("closes a code block that the cut would leave open", () => {
    const text = ["```js", "one", "two", "three", "```", "after"].join("\n");
    expect(truncateEmbed(text, 3).text.split("\n")).toEqual(["```js", "one", "two", "```"]);
  });
});
