import { describe, expect, it } from "vitest";
import {
  buildNoteMeta,
  findNoteByAlias,
  parseProperties,
  toStringList,
  toTagList,
  type RawNoteMeta,
} from "../vault-index";

const raw = (over: Partial<RawNoteMeta>): RawNoteMeta => ({
  filePath: "/v/Note.md",
  relativePath: "Note.md",
  name: "Note",
  size: 10,
  mtime: 1,
  ctime: 1,
  frontmatter: null,
  tags: [],
  links: [],
  tasksOpen: 0,
  tasksDone: 0,
  ...over,
});

describe("parseProperties", () => {
  it("keeps each value's type", () => {
    expect(
      parseProperties("title: Plan\ncount: 3\ndone: true\ndue: 2026-11-13\nlist:\n  - a\n  - b\nnested:\n  k: v")
    ).toEqual({
      title: "Plan",
      count: 3,
      done: true,
      due: "2026-11-13",
      list: ["a", "b"],
      nested: { k: "v" },
    });
  });

  it("gives no properties for missing, empty or broken frontmatter", () => {
    expect(parseProperties(null)).toEqual({});
    expect(parseProperties("")).toEqual({});
    expect(parseProperties("   \n")).toEqual({});
    expect(parseProperties("just a string")).toEqual({});
    expect(parseProperties("- a\n- b")).toEqual({});
    expect(parseProperties("key: [unclosed")).toEqual({});
  });
});

describe("toStringList and toTagList", () => {
  it("reads a list however it was written", () => {
    expect(toStringList(["One", " Two ", "One", ""])).toEqual(["One", "Two"]);
    expect(toStringList("One, Two")).toEqual(["One", "Two"]);
    expect(toStringList("Single name")).toEqual(["Single name"]);
    expect(toStringList(42)).toEqual(["42"]);
    expect(toStringList(null)).toEqual([]);
    expect(toStringList([{ a: 1 }, "ok", null])).toEqual(["ok"]);
  });

  it("reads tags from a list or a string, without the #", () => {
    expect(toTagList(["work", "#project/alpha"])).toEqual(["work", "project/alpha"]);
    expect(toTagList("work, #home  misc")).toEqual(["work", "home", "misc"]);
    expect(toTagList(undefined)).toEqual([]);
  });
});

describe("buildNoteMeta", () => {
  it("gathers aliases and joins frontmatter tags with body tags", () => {
    const note = buildNoteMeta(
      raw({ frontmatter: "aliases: [Roadmap, The Plan]\ntags: [work, plan]", tags: ["plan", "inline"] })
    );
    expect(note.aliases).toEqual(["Roadmap", "The Plan"]);
    expect(note.allTags).toEqual(["work", "plan", "inline"]);
    expect(note.properties.aliases).toEqual(["Roadmap", "The Plan"]);
  });

  it("accepts the singular keys and a plain string", () => {
    const note = buildNoteMeta(raw({ frontmatter: "alias: Roadmap\ntag: work" }));
    expect(note.aliases).toEqual(["Roadmap"]);
    expect(note.allTags).toEqual(["work"]);
  });

  it("copes with a note that has no frontmatter", () => {
    const note = buildNoteMeta(raw({ tags: ["x"] }));
    expect(note.properties).toEqual({});
    expect(note.aliases).toEqual([]);
    expect(note.allTags).toEqual(["x"]);
  });
});

describe("findNoteByAlias", () => {
  const notes = [
    buildNoteMeta(raw({ name: "Plan", frontmatter: "aliases: [Roadmap]" })),
    buildNoteMeta(raw({ name: "Other", frontmatter: "aliases: [roadmap, Second]" })),
    buildNoteMeta(raw({ name: "Plain" })),
  ];

  it("finds the first note with the alias, ignoring case", () => {
    expect(findNoteByAlias(notes, "ROADMAP")?.name).toBe("Plan");
    expect(findNoteByAlias(notes, " second ")?.name).toBe("Other");
  });

  it("does not treat a note's own name as an alias", () => {
    expect(findNoteByAlias(notes, "Plain")).toBeNull();
    expect(findNoteByAlias(notes, "")).toBeNull();
  });
});
