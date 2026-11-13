import { describe, expect, it } from "vitest";
import { addText, freeNoteName, headingLine, linkWriteQuestion } from "../app-requests";

describe("addText", () => {
  it("adds at the end on a line of its own", () => {
    expect(addText("One", "Two", "append")).toBe("One\nTwo");
    expect(addText("One\n", "Two", "append")).toBe("One\nTwo");
    expect(addText("", "Two", "append")).toBe("Two");
    expect(addText("One", "", "append")).toBe("One");
  });

  it("adds at the start, below a properties block", () => {
    expect(addText("One", "Zero", "prepend")).toBe("Zero\nOne");
    expect(addText("---\ntitle: A\n---\nOne", "Zero", "prepend")).toBe("---\ntitle: A\n---\nZero\nOne");
    expect(addText("---\ntitle: A\n---\n", "Zero", "prepend")).toBe("---\ntitle: A\n---\nZero");
    expect(addText("", "Zero", "prepend")).toBe("Zero");
  });
});

describe("freeNoteName", () => {
  it("keeps a free name and numbers a taken one", () => {
    const taken = new Set(["Plan.md", "Plan 2.md", "Folder/Idea.md"]);
    expect(freeNoteName("New.md", (n) => taken.has(n))).toBe("New.md");
    expect(freeNoteName("Plan.md", (n) => taken.has(n))).toBe("Plan 3.md");
    expect(freeNoteName("Folder/Idea.md", (n) => taken.has(n))).toBe("Folder/Idea 2.md");
  });
});

describe("headingLine", () => {
  const note = "# Title\n\ntext\n\n## Goals ##\n\n```\n# not this\n```\n";
  it("finds a heading whatever its level or capitals", () => {
    expect(headingLine(note, "goals")).toBe(5);
    expect(headingLine(note, "## Title")).toBe(1);
    expect(headingLine(note, "Missing")).toBeNull();
    expect(headingLine(note, "  ")).toBeNull();
  });
});

describe("linkWriteQuestion", () => {
  it("says what the link would do and shows the start of its text", () => {
    const q = linkWriteQuestion({ action: "new", fromLink: true, name: "Inbox.md", mode: "append", content: "x".repeat(400) });
    expect(q.title).toBe('A link wants to add text to the end of "Inbox.md"');
    expect(q.message).toContain("x".repeat(300) + "…");
    expect(linkWriteQuestion({ action: "new", fromLink: true, mode: "create" }).title).toBe("A link wants to create a new note");
    expect(linkWriteQuestion({ action: "unique", fromLink: true }).title).toBe(
      "A link wants to create a new note named by the time"
    );
    expect(linkWriteQuestion({ action: "daily", fromLink: true }).title).toBe("A link wants to open today's daily note");
  });
});
