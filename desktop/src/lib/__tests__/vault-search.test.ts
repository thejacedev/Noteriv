import { describe, expect, it } from "vitest";
import { highlightPieces, resultsAsText, searchRows, type VaultSearchResult } from "../vault-search";

const result: VaultSearchResult = {
  totalFiles: 2,
  error: null,
  files: [
    {
      filePath: "/v/Plan.md",
      relativePath: "Projects/Plan.md",
      name: "Plan.md",
      mtime: 2,
      ctime: 1,
      lines: [
        { line: 3, text: "  buy flour", ranges: [[6, 11]] },
        { line: 9, text: "flour and water", ranges: [[0, 5]] },
      ],
      moreLines: 4,
    },
    { filePath: "/v/Tagged.md", relativePath: "Tagged.md", name: "Tagged.md", mtime: 3, ctime: 3, lines: [], moreLines: 0 },
  ],
};

describe("searchRows", () => {
  it("lists each note, then its matching lines", () => {
    expect(searchRows(result).map((r) => (r.kind === "file" ? r.file.name : r.line.line))).toEqual([
      "Plan.md",
      3,
      9,
      "Tagged.md",
    ]);
  });
});

describe("highlightPieces", () => {
  it("cuts a line into plain and matched pieces", () => {
    expect(highlightPieces("buy flour now", [[4, 9]])).toEqual([
      { text: "buy ", match: false },
      { text: "flour", match: true },
      { text: " now", match: false },
    ]);
  });

  it("handles matches at both ends, several, and none", () => {
    expect(highlightPieces("flour and flour", [[0, 5], [10, 15]])).toEqual([
      { text: "flour", match: true },
      { text: " and ", match: false },
      { text: "flour", match: true },
    ]);
    expect(highlightPieces("plain", [])).toEqual([{ text: "plain", match: false }]);
  });

  it("draws overlapping matches once and ignores ones past the end", () => {
    expect(highlightPieces("abcdef", [[1, 4], [2, 5], [9, 12]])).toEqual([
      { text: "a", match: false },
      { text: "bcd", match: true },
      { text: "e", match: true },
      { text: "f", match: false },
    ]);
  });
});

describe("resultsAsText", () => {
  it("writes the notes and their lines", () => {
    expect(resultsAsText(result)).toBe(
      ["Projects/Plan", "  3: buy flour", "  9: flour and water", "  ... and 4 more", "Tagged"].join("\n")
    );
  });
});
