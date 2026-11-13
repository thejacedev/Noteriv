import { describe, expect, it } from "vitest";
import {
  isExcludedPath,
  newNoteFolder,
  nextTimestampName,
  parseExcludedPatterns,
  sortFileEntries,
  timestampName,
  nameComparer,
} from "../file-list";
import { extractFootnotes } from "../footnotes";

const entries = [
  { name: "beta.md", isDirectory: false, mtime: 300, ctime: 10 },
  { name: "Alpha.md", isDirectory: false, mtime: 100, ctime: 30 },
  { name: "Zeta", isDirectory: true, mtime: 50, ctime: 5 },
  { name: "note 10.md", isDirectory: false, mtime: 200, ctime: 20 },
  { name: "note 2.md", isDirectory: false, mtime: 250, ctime: 25 },
];
const names = (list: { name: string }[]) => list.map((e) => e.name);

describe("sortFileEntries", () => {
  it("sorts by name with folders first, numbers in order and case ignored", () => {
    expect(names(sortFileEntries(entries, "nameAsc"))).toEqual(["Zeta", "Alpha.md", "beta.md", "note 2.md", "note 10.md"]);
    expect(names(sortFileEntries(entries, "nameDesc"))).toEqual(["Zeta", "note 10.md", "note 2.md", "beta.md", "Alpha.md"]);
  });

  it("sorts by when a file was changed or made", () => {
    expect(names(sortFileEntries(entries, "modifiedNew"))).toEqual(["Zeta", "beta.md", "note 2.md", "note 10.md", "Alpha.md"]);
    expect(names(sortFileEntries(entries, "modifiedOld"))).toEqual(["Zeta", "Alpha.md", "note 10.md", "note 2.md", "beta.md"]);
    expect(names(sortFileEntries(entries, "createdNew"))).toEqual(["Zeta", "Alpha.md", "note 2.md", "note 10.md", "beta.md"]);
    expect(names(sortFileEntries(entries, "createdOld"))).toEqual(["Zeta", "beta.md", "note 10.md", "note 2.md", "Alpha.md"]);
  });

  it("keeps the user's own order, with anything new after it", () => {
    expect(names(sortFileEntries(entries, "manual", ["note 2.md", "Zeta"]))).toEqual([
      "note 2.md",
      "Zeta",
      "beta.md",
      "Alpha.md",
      "note 10.md",
    ]);
    expect(sortFileEntries(entries, "manual")).toBe(entries);
  });

  it("does not change the list it was given", () => {
    const before = names(entries);
    sortFileEntries(entries, "nameDesc");
    expect(names(entries)).toEqual(before);
  });
});

describe("excluded files", () => {
  it("reads one pattern per line", () => {
    expect(parseExcludedPatterns("Archive\n\n  Templates/Old.md  \n# a comment\n*.tmp\n/Leading\\Slash\r\n")).toEqual([
      "Archive",
      "Templates/Old.md",
      "*.tmp",
      "Leading/Slash",
    ]);
    expect(parseExcludedPatterns(undefined)).toEqual([]);
  });

  it("matches a folder, a file or a file ending", () => {
    const patterns = ["Archive", "Templates/Old.md", "*.tmp"];
    expect(isExcludedPath("Archive/2024/Note.md", patterns)).toBe(true);
    expect(isExcludedPath("archive", patterns)).toBe(true);
    expect(isExcludedPath("Archived/Note.md", patterns)).toBe(false);
    expect(isExcludedPath("Templates/Old.md", patterns)).toBe(true);
    expect(isExcludedPath("Templates/New.md", patterns)).toBe(false);
    expect(isExcludedPath("Notes/scratch.TMP", patterns)).toBe(true);
    expect(isExcludedPath("Notes\\Archive\\x.md", patterns)).toBe(false);
    expect(isExcludedPath("Anything.md", [])).toBe(false);
    expect(isExcludedPath("Anything.md", ["*"])).toBe(false);
  });
});

describe("newNoteFolder", () => {
  it("picks the top of the vault, the open note's folder or a named folder", () => {
    expect(newNoteFolder("/v", "root", "Inbox", "/v/Projects/Plan.md")).toBe("/v");
    expect(newNoteFolder("/v", "current", "Inbox", "/v/Projects/Plan.md")).toBe("/v/Projects");
    expect(newNoteFolder("/v", "current", "Inbox", "/v/Plan.md")).toBe("/v");
    expect(newNoteFolder("/v", "current", "Inbox", null)).toBe("/v");
    expect(newNoteFolder("/v", "folder", " /Inbox/New/ ", null)).toBe("/v/Inbox/New");
  });

  it("falls back to the top of the vault for a folder it cannot use", () => {
    expect(newNoteFolder("/v", "folder", "", null)).toBe("/v");
    expect(newNoteFolder("/v", "folder", "../outside", null)).toBe("/v");
    expect(newNoteFolder("/v", "current", "", "/elsewhere/Note.md")).toBe("/v");
  });
});

describe("timestamp names", () => {
  const at = new Date(2026, 10, 13, 9, 5);
  it("names a note by the minute", () => {
    expect(timestampName(at)).toBe("202611130905");
  });

  it("moves to the next free minute, across the hour and the day", () => {
    const taken = new Set(["202611130905", "202611130906"]);
    expect(nextTimestampName(at, (n) => taken.has(n))).toBe("202611130907");
    expect(nextTimestampName(new Date(2026, 11, 31, 23, 59), (n) => n === "202612312359")).toBe("202701010000");
    expect(nextTimestampName(at, () => false)).toBe("202611130905");
  });
});

describe("extractFootnotes", () => {
  it("lists numbered and inline footnotes in the order they appear", () => {
    const text = [
      "A claim[^1] and another[^note] and again[^1].",
      "An aside^[written in place] here.",
      "",
      "[^1]: The first source.",
      "[^note]: A named one.",
    ].join("\n");
    expect(extractFootnotes(text)).toEqual([
      { id: null, text: "written in place", line: 2, references: 1, missing: false },
      { id: "1", text: "The first source.", line: 4, references: 2, missing: false },
      { id: "note", text: "A named one.", line: 5, references: 1, missing: false },
    ]);
  });

  it("flags a reference with no definition, and a definition nothing refers to", () => {
    const found = extractFootnotes("See[^lost].\n\n[^unused]: Nobody points here.");
    expect(found).toEqual([
      { id: "lost", text: "", line: 1, references: 1, missing: true },
      { id: "unused", text: "Nobody points here.", line: 3, references: 0, missing: false },
    ]);
  });

  it("ignores code", () => {
    expect(extractFootnotes("`[^1]` and `^[x]`\n```\n[^2]: in a block\n```")).toEqual([]);
  });
});

describe("nameComparer", () => {
  it("sorts names without regard to capitals, and numbers by value", () => {
    const names = ["apple", "Zebra", "Plan", "note 10", "Note 2", "Média", "media"];
    const sorted = [...names].sort(nameComparer("en"));
    expect(sorted.map((n) => n.toLowerCase())).toEqual(["apple", "média", "media", "note 2", "note 10", "plan", "zebra"]);
  });

  it("does not fall back to character-code order on a system set to the C locale", () => {
    const sorted = ["apple", "Zebra", "Plan", "tone.mp3"].sort(nameComparer("en-US-u-va-posix"));
    expect(sorted).toEqual(["apple", "Plan", "tone.mp3", "Zebra"]);
  });
});
