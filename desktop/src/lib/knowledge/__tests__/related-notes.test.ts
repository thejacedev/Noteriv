import { describe, expect, it } from "vitest";
import { findRelatedNotes } from "../related-notes";

describe("related-note retrieval", () => {
  it("orders notes by meaningful textual overlap", () => {
    const matches = findRelatedNotes(
      "Rust ownership",
      "Ownership and borrowing prevent data races by controlling mutable references.",
      [
        {
          absolutePath: "/vault/Cooking.md",
          relativePath: "Cooking.md",
          title: "Cooking",
          content: "Bread flour hydration and fermentation notes.",
        },
        {
          absolutePath: "/vault/Rust/Borrowing.md",
          relativePath: "Rust/Borrowing.md",
          title: "Borrowing",
          content: "Rust ownership uses mutable and immutable references to prevent data races.",
        },
        {
          absolutePath: "/vault/Concurrency.md",
          relativePath: "Concurrency.md",
          title: "Concurrency",
          content: "Data races happen when concurrent mutable access is not controlled.",
        },
      ],
      5,
    );

    expect(matches.map((match) => match.notePath)).toEqual([
      "Rust/Borrowing.md",
      "Concurrency.md",
    ]);
    expect(matches[0].whyItMatches).toContain("Shared terms");
  });

  it("excludes the source note", () => {
    const matches = findRelatedNotes(
      "Borrowing",
      "Borrowing controls references.",
      [{
        absolutePath: "/vault/Borrowing.md",
        relativePath: "Borrowing.md",
        title: "Borrowing",
        content: "Borrowing controls references.",
      }],
      5,
      "Borrowing.md",
    );
    expect(matches).toEqual([]);
  });
});
