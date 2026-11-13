import { describe, expect, it } from "vitest";
import {
  applyLinkChanges,
  linkUpdateMessage,
  updateOpenNote,
  type OpenNoteUpdate,
} from "../link-updates";
import { findLinkedNote } from "../wiki-link-utils";
import fixture from "../__fixtures__/link-resolution.json";

describe("findLinkedNote", () => {
  // The backend rewrites links on rename with its own copy of this rule and
  // runs the same fixture, so the two cannot drift apart.
  const files = [...fixture.notes].sort().map((rel) => ({
    filePath: `/home/me/vault/${rel}`,
    fileName: (rel.split("/").pop() || "").replace(/\.(md|markdown)$/i, ""),
    relativePath: rel,
  }));

  it("has a fixture worth running", () => {
    expect(fixture.cases.length).toBeGreaterThan(15);
  });

  for (const c of fixture.cases) {
    it(`[[${c.target}]] -> ${c.expect ?? "nothing"}`, () => {
      expect(findLinkedNote(files, c.target)?.relativePath ?? null).toBe(c.expect);
    });
  }
});

describe("applyLinkChanges", () => {
  it("replaces every occurrence of each changed link", () => {
    const changes = [
      { from: "[[Inbox]]", to: "[[Home]]" },
      { from: "[[Inbox#Today]]", to: "[[Home#Today]]" },
      { from: "](attachments/pic.png)", to: "](files/pic.png)" },
    ];
    expect(
      applyLinkChanges("[[Inbox]] ![[Inbox]] [[Inbox#Today]] ![p](attachments/pic.png) [[Inboxes]]", changes)
    ).toBe("[[Home]] ![[Home]] [[Home#Today]] ![p](files/pic.png) [[Inboxes]]");
  });

  it("does nothing without changes", () => {
    expect(applyLinkChanges("[[Inbox]]", [])).toBe("[[Inbox]]");
  });
});

describe("updateOpenNote", () => {
  const update: OpenNoteUpdate = {
    path: "/v/Plan.md",
    saved: "see [[Home]]\n",
    unsaved: "see [[Home]]\nand a new line with [[Home#Top]]\n",
    changes: [
      { from: "[[Inbox]]", to: "[[Home]]" },
      { from: "[[Inbox#Top]]", to: "[[Home#Top]]" },
    ],
  };

  it("gives a note with no unsaved edits the text now on disk", () => {
    const tab = { content: "see [[Inbox]]\n", savedContent: "see [[Inbox]]\n" };
    expect(updateOpenNote(tab, { ...update, unsaved: null }, undefined)).toEqual({
      content: "see [[Home]]\n",
      savedContent: "see [[Home]]\n",
    });
  });

  it("keeps unsaved edits and rewrites the links in them", () => {
    const sent = "see [[Inbox]]\nand a new line with [[Inbox#Top]]\n";
    const tab = { content: sent, savedContent: "see [[Inbox]]\n" };
    const next = updateOpenNote(tab, update, sent);
    expect(next.content).toBe("see [[Home]]\nand a new line with [[Home#Top]]\n");
    // Still unsaved, and compared against what is on disk now.
    expect(next.savedContent).toBe("see [[Home]]\n");
    expect(next.content).not.toBe(next.savedContent);
  });

  it("keeps what was typed while the vault was being scanned", () => {
    const sent = "see [[Inbox]]\nand a new line with [[Inbox#Top]]\n";
    const typedSince = sent + "typed during the rename, mentions [[Inbox]] again\n";
    const tab = { content: typedSince, savedContent: "see [[Inbox]]\n" };
    expect(updateOpenNote(tab, update, sent).content).toBe(
      "see [[Home]]\nand a new line with [[Home#Top]]\ntyped during the rename, mentions [[Home]] again\n"
    );
  });

  it("handles a note that was clean when sent and edited before the answer came", () => {
    const tab = { content: "see [[Inbox]]\nnew", savedContent: "see [[Inbox]]\n" };
    expect(updateOpenNote(tab, { ...update, unsaved: null }, undefined)).toEqual({
      content: "see [[Home]]\nnew",
      savedContent: "see [[Home]]\n",
    });
  });

  it("only rewrites the unsaved text when the saved text had no links to change", () => {
    const sent = "draft with [[Inbox]]";
    const tab = { content: sent, savedContent: "nothing here" };
    expect(updateOpenNote(tab, { ...update, saved: null, unsaved: "draft with [[Home]]" }, sent)).toEqual({
      content: "draft with [[Home]]",
      savedContent: "nothing here",
    });
  });
});

describe("linkUpdateMessage", () => {
  it("says how many links changed in how many notes", () => {
    expect(linkUpdateMessage({ notes: 1, links: 1, failed: 0 })).toBe("Updated 1 link in 1 note");
    expect(linkUpdateMessage({ notes: 3, links: 12, failed: 0 })).toBe("Updated 12 links in 3 notes");
  });

  it("says nothing when no link needed changing", () => {
    expect(linkUpdateMessage({ notes: 0, links: 0, failed: 0 })).toBeNull();
  });

  it("reports notes that could not be written", () => {
    expect(linkUpdateMessage({ notes: 2, links: 5, failed: 1 })).toBe(
      "Updated 5 links in 2 notes; 1 note could not be updated"
    );
    expect(linkUpdateMessage({ notes: 0, links: 0, failed: 2 })).toBe("2 notes could not be updated");
  });
});
