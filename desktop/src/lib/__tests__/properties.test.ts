import { describe, expect, it } from "vitest";
import {
  coerce,
  deleteProperty,
  frontmatterLineCount,
  hasInvalidProperties,
  hasProperties,
  inferType,
  parsePropertyTypes,
  readProperties,
  renameProperty,
  serializePropertyTypes,
  setProperty,
  summarizeProperties,
  typeOf,
} from "../properties";

const note = `---
title: Weekly plan
# written by hand
tags:
  - work
  - planning
rating: 4
done: false
due: 2026-11-20
---
# Heading

Body text.
`;

describe("readProperties", () => {
  it("reads values with their types, in the order written", () => {
    expect(readProperties(note)).toEqual([
      { key: "title", value: "Weekly plan" },
      { key: "tags", value: ["work", "planning"] },
      { key: "rating", value: 4 },
      { key: "done", value: false },
      { key: "due", value: "2026-11-20" },
    ]);
  });

  it("gives nothing for a note without frontmatter, or with frontmatter it cannot read", () => {
    expect(readProperties("# Just a note\n")).toEqual([]);
    expect(readProperties("---\n- a\n- b\n---\nBody")).toEqual([]);
    expect(readProperties("---\nkey: [unclosed\n---\nBody")).toEqual([]);
    expect(hasInvalidProperties("---\nkey: [unclosed\n---\nBody")).toBe(true);
    expect(hasInvalidProperties(note)).toBe(false);
    expect(hasInvalidProperties("# Just a note\n")).toBe(false);
  });

  it("ends the block only at a line that is the fence and nothing else", () => {
    const dots = "---\nsummary: To be continued...\nrating: 4\n---\nBody";
    expect(readProperties(dots)).toEqual([
      { key: "summary", value: "To be continued..." },
      { key: "rating", value: 4 },
    ]);
    expect(setProperty(dots, "rating", 5)).toBe("---\nsummary: To be continued...\nrating: 5\n---\nBody");
    const dashes = "---\ntitle: before --- after\nnote: x---\n---\nBody";
    expect(readProperties(dashes).map((p) => p.key)).toEqual(["title", "note"]);
    // A document end marker closes the block too.
    expect(readProperties("---\na: 1\n...\nBody")).toEqual([{ key: "a", value: 1 }]);
    // Not frontmatter: the first line has more than the fence, or the block never closes.
    expect(hasProperties("--- \na: 1\n---\n")).toBe(false);
    expect(hasProperties("---\na: 1\nBody")).toBe(false);
    expect(hasProperties("---\n")).toBe(false);
    expect(hasProperties("text\n---\na: 1\n---\n")).toBe(false);
  });

  it("counts the lines the block takes", () => {
    expect(frontmatterLineCount(note)).toBe(10);
    expect(frontmatterLineCount("---\n---\nBody")).toBe(2);
    expect(frontmatterLineCount("---\r\na: 1\r\n---\r\nBody")).toBe(3);
    expect(frontmatterLineCount("---\na: 1\n---")).toBe(3);
    expect(frontmatterLineCount("# Title")).toBe(0);
  });

  it("reads an empty frontmatter block and a null value", () => {
    expect(readProperties("---\n---\nBody")).toEqual([]);
    expect(readProperties("---\nempty:\n---\nBody")).toEqual([{ key: "empty", value: null }]);
  });
});

describe("editing properties", () => {
  it("changes one value and leaves everything else as written", () => {
    const next = setProperty(note, "rating", 5);
    expect(next).toContain("rating: 5");
    // The comment, the multi-line list and the body are untouched.
    expect(next).toContain("# written by hand");
    expect(next).toContain("tags:\n  - work\n  - planning");
    expect(next.endsWith("# Heading\n\nBody text.\n")).toBe(true);
    expect(readProperties(next).map((p) => p.key)).toEqual(["title", "tags", "rating", "done", "due"]);
  });

  it("adds a property at the end, and frontmatter to a note that has none", () => {
    expect(readProperties(setProperty(note, "status", "open")).at(-1)).toEqual({ key: "status", value: "open" });
    expect(setProperty("# Title\n\nBody\n", "status", "open")).toBe("---\nstatus: open\n---\n# Title\n\nBody\n");
    expect(setProperty("", "done", true)).toBe("---\ndone: true\n---\n");
  });

  it("writes a list on one line and quotes what needs quoting", () => {
    expect(setProperty("Body", "tags", ["a", "b c"])).toBe("---\ntags: [a, b c]\n---\nBody");
    // A list already written one item to a line stays that way, and one on a line stays on its line.
    expect(setProperty(note, "tags", ["work", "planning", "urgent"])).toContain("tags:\n  - work\n  - planning\n  - urgent\n");
    expect(setProperty("---\ntags: [a]\n---\n", "tags", ["a", "b"])).toBe("---\ntags: [a, b]\n---\n");
    expect(setProperty(note, "tags", [])).toContain("tags: []\n");
    const tricky = setProperty("Body", "title", "Plan: phase #2");
    expect(readProperties(tricky)).toEqual([{ key: "title", value: "Plan: phase #2" }]);
    expect(readProperties(setProperty("Body", "version", "1.0"))).toEqual([{ key: "version", value: "1.0" }]);
  });

  it("removes a property, and the whole block with the last one", () => {
    expect(readProperties(deleteProperty(note, "rating")).map((p) => p.key)).toEqual(["title", "tags", "done", "due"]);
    expect(deleteProperty("---\nonly: 1\n---\n# Title\n", "only")).toBe("# Title\n");
  });

  it("renames a property in place and refuses a name that is taken", () => {
    const renamed = renameProperty(note, "rating", "score");
    expect(readProperties(renamed).map((p) => p.key)).toEqual(["title", "tags", "score", "done", "due"]);
    expect(readProperties(renamed)[2].value).toBe(4);
    expect(renameProperty(note, "rating", "title")).toBe(note);
    expect(renameProperty(note, "rating", "  ")).toBe(note);
  });

  it("does not touch frontmatter it cannot read", () => {
    const broken = "---\nkey: [unclosed\n---\nBody";
    expect(setProperty(broken, "x", 1)).toBe(broken);
    expect(deleteProperty(broken, "key")).toBe(broken);
  });

  it("keeps Windows line endings in the body", () => {
    const crlf = "---\r\ntitle: A\r\n---\r\nLine one\r\nLine two\r\n";
    expect(setProperty(crlf, "n", 1)).toBe("---\r\ntitle: A\r\nn: 1\r\n---\r\nLine one\r\nLine two\r\n");
    expect(setProperty("One\r\nTwo\r\n", "n", 1)).toBe("---\r\nn: 1\r\n---\r\nOne\r\nTwo\r\n");
  });
});

describe("types", () => {
  it("infers a type from a value", () => {
    expect(inferType(["a"])).toBe("list");
    expect(inferType(3)).toBe("number");
    expect(inferType(true)).toBe("checkbox");
    expect(inferType("2026-11-13")).toBe("date");
    expect(inferType("2026-11-13T09:30")).toBe("datetime");
    expect(inferType("2026-11-13 09:30:00")).toBe("datetime");
    expect(inferType("hello")).toBe("text");
    expect(inferType(null)).toBe("text");
  });

  it("lets the vault's recorded type win, except for the built-in names", () => {
    expect(typeOf("rating", "4", { rating: "number" })).toBe("number");
    expect(typeOf("tags", "work", { tags: "text" })).toBe("list");
    expect(typeOf("Aliases", "x", {})).toBe("list");
    expect(typeOf("note", "plain", {})).toBe("text");
  });

  it("changes a value to fit a new type", () => {
    expect(coerce("a, b ,c", "list")).toEqual(["a", "b", "c"]);
    expect(coerce(["a", null, 2], "list")).toEqual(["a", 2]);
    expect(coerce("4.5", "number")).toBe(4.5);
    expect(coerce("four", "number")).toBeNull();
    expect(coerce("", "number")).toBeNull();
    expect(coerce("yes", "checkbox")).toBe(true);
    expect(coerce("no", "checkbox")).toBe(false);
    expect(coerce("due 2026-11-20 at noon", "date")).toBe("2026-11-20");
    expect(coerce("2026-11-20", "datetime")).toBe("2026-11-20T00:00");
    expect(coerce("2026-11-20 09:30:15", "datetime")).toBe("2026-11-20T09:30:15");
    expect(coerce(["a", "b"], "text")).toBe("a, b");
    expect(coerce(null, "text")).toBe("");
    expect(coerce(5, "text")).toBe("5");
  });

  it("saves and reads the vault's types, ignoring anything unknown", () => {
    const types = { rating: "number" as const, due: "date" as const };
    expect(parsePropertyTypes(serializePropertyTypes(types))).toEqual(types);
    expect(parsePropertyTypes('{"types":{"a":"number","b":"alien","c":7}}')).toEqual({ a: "number" });
    expect(parsePropertyTypes("garbage")).toEqual({});
    expect(parsePropertyTypes(null)).toEqual({});
  });

  it("summarizes the properties used across notes", () => {
    const notes = [
      { properties: { tags: ["a"], rating: 3 } },
      { properties: { rating: 5, due: "2026-01-01" } },
      { properties: {} },
    ];
    expect(summarizeProperties(notes, { due: "datetime" })).toEqual([
      { name: "due", type: "datetime", count: 1 },
      { name: "rating", type: "number", count: 2 },
      { name: "tags", type: "list", count: 1 },
    ]);
  });
});
