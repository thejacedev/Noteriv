import { describe, expect, it } from "vitest";
import {
  buildRelativeNotePath,
  joinVaultPath,
  validateRelativeNotePath,
} from "../path-safety";

describe("knowledge path safety", () => {
  it.each([
    "../outside.md",
    "folder/../../outside.md",
    "/tmp/outside.md",
    "C:\\outside.md",
    ".noteriv/knowledge.md",
    ".noteriv./knowledge.md",
    ".knowledge/note.md",
    "Knowledge/.hidden.md",
    "folder//note.md",
    "folder/note.md:stream.md",
    "folder/note. /child.md",
    "folder/aux.md",
    "folder/note.txt",
  ])("rejects unsafe path %s", (path) => {
    expect(() => validateRelativeNotePath(path)).toThrow();
  });

  it("builds a normalized Markdown path inside the vault", () => {
    expect(buildRelativeNotePath("Knowledge/Rust", "Ownership: Rules"))
      .toBe("Knowledge/Rust/Ownership- Rules.md");
    expect(joinVaultPath("/vault/", "Knowledge/Rust.md"))
      .toBe("/vault/Knowledge/Rust.md");
    expect(joinVaultPath("/", "Knowledge/Rust.md"))
      .toBe("/Knowledge/Rust.md");
    expect(buildRelativeNotePath("Knowledge", ".NET"))
      .toBe("Knowledge/NET.md");
  });
});
