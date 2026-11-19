import { describe, expect, it } from "vitest";
import { FILE_LIST_DRAG, TAB_DRAG } from "../drag-kinds";

// A drag that carries text is typed in wherever it is let go, and one that
// carries an address is opened. A row of the file list and a tab must be
// neither, or a note dropped on the open note writes its path into it.
describe("what a row and a tab are dragged as", () => {
  const kinds = [FILE_LIST_DRAG, TAB_DRAG];

  it("is not text, an address or a file", () => {
    for (const kind of kinds) {
      expect(kind.startsWith("text/")).toBe(false);
      expect(["Text", "URL", "Files"]).not.toContain(kind);
    }
  });

  it("is a kind of the app's own, written as the page will read it back", () => {
    for (const kind of kinds) {
      expect(kind).toMatch(/^application\/x-noteriv-[a-z]+$/);
      expect(kind).toBe(kind.toLowerCase());
    }
    expect(FILE_LIST_DRAG).not.toBe(TAB_DRAG);
  });
});
