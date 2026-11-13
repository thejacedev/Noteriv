import { describe, expect, it } from "vitest";
import {
  addConflicts,
  conflictHeadline,
  conflictsFor,
  dismissConflicts,
  noteLabel,
  removeConflictCopy,
  splitPath,
  type SyncConflict,
} from "../sync-conflicts";

const copy = (note: string, stamp = "2026-11-13 09-00-00") => ({
  note,
  copy: note.replace(/\.md$/, ` (conflict ${stamp}).md`),
  copyPath: `/vault/${note.replace(/\.md$/, ` (conflict ${stamp}).md`)}`,
});

describe("addConflicts", () => {
  it("keeps what a run reported, tagged with its vault", () => {
    const result = addConflicts([], "/vault", [copy("Inbox.md"), copy("Projects/Plan.md")]);
    expect(result.map((c) => [c.vaultPath, c.note])).toEqual([
      ["/vault", "Inbox.md"],
      ["/vault", "Projects/Plan.md"],
    ]);
  });

  it("is not cleared by a later run with nothing to report", () => {
    const held = addConflicts([], "/vault", [copy("Inbox.md")]);
    // The same array back: a clean sync must not even re-render the notice.
    expect(addConflicts(held, "/vault", [])).toBe(held);
    expect(addConflicts(held, "/vault", undefined)).toBe(held);
    expect(addConflicts(held, "/vault", null)).toBe(held);
  });

  it("adds a later conflict to the ones not yet dismissed", () => {
    const first = addConflicts([], "/vault", [copy("Inbox.md")]);
    const second = addConflicts(first, "/vault", [copy("Inbox.md", "2026-11-13 09-05-00")]);
    expect(second).toHaveLength(2);
  });

  it("does not list the same copy twice", () => {
    const first = addConflicts([], "/vault", [copy("Inbox.md")]);
    expect(addConflicts(first, "/vault", [copy("Inbox.md")])).toBe(first);
    // The same file name in another vault is a different copy.
    expect(addConflicts(first, "/other", [copy("Inbox.md")])).toHaveLength(2);
  });

  it("reads a copy that is not in the vault as having no path", () => {
    const reported = [{ note: "Inbox.md", copy: "Inbox (conflict x).md", copyPath: null }];
    expect(addConflicts([], "/vault", reported)[0].copyPath).toBeNull();
  });
});

describe("conflictsFor and dismissConflicts", () => {
  const held: SyncConflict[] = [
    ...addConflicts([], "/work", [copy("A.md"), copy("B.md")]),
    ...addConflicts([], "/home", [copy("C.md")]),
  ];

  it("shows only the open vault's conflicts", () => {
    expect(conflictsFor(held, "/work").map((c) => c.note)).toEqual(["A.md", "B.md"]);
    expect(conflictsFor(held, "/home").map((c) => c.note)).toEqual(["C.md"]);
    expect(conflictsFor(held, "/elsewhere")).toEqual([]);
    expect(conflictsFor(held, null)).toEqual([]);
  });

  it("dismisses one vault and keeps the other's for when it is opened again", () => {
    const after = dismissConflicts(held, "/work");
    expect(conflictsFor(after, "/work")).toEqual([]);
    expect(conflictsFor(after, "/home").map((c) => c.note)).toEqual(["C.md"]);
    expect(dismissConflicts(held, undefined)).toBe(held);
  });
});

describe("removeConflictCopy", () => {
  const held = addConflicts([], "/vault", [copy("A.md"), copy("B.md")]);

  it("drops the entry of a copy that is gone and keeps the rest", () => {
    const after = removeConflictCopy(held, held[0].copyPath as string);
    expect(after.map((c) => c.note)).toEqual(["B.md"]);
  });

  it("changes nothing for a path it does not hold", () => {
    expect(removeConflictCopy(held, "/vault/Other.md")).toBe(held);
  });
});

describe("splitPath", () => {
  it("splits on either separator", () => {
    expect(splitPath("/home/me/vault/Projects/Plan (conflict x).md")).toEqual({
      folder: "/home/me/vault/Projects",
      name: "Plan (conflict x).md",
    });
    expect(splitPath("C:\\Users\\me\\vault\\Plan (conflict x).md")).toEqual({
      folder: "C:\\Users\\me\\vault",
      name: "Plan (conflict x).md",
    });
    expect(splitPath("Plan.md")).toEqual({ folder: "", name: "Plan.md" });
  });
});

describe("noteLabel", () => {
  it("names a note the way the sidebar does", () => {
    expect(noteLabel("Inbox.md")).toEqual({ name: "Inbox", folder: "" });
    expect(noteLabel("Projects/Deep/Plan.md")).toEqual({ name: "Plan", folder: "Projects/Deep" });
    expect(noteLabel("Notes/Old.MARKDOWN")).toEqual({ name: "Old", folder: "Notes" });
  });

  it("keeps the extension of anything that is not a note", () => {
    expect(noteLabel("img/pic.png")).toEqual({ name: "pic.png", folder: "img" });
    expect(noteLabel("v1.2 plan.md")).toEqual({ name: "v1.2 plan", folder: "" });
    expect(noteLabel(".md")).toEqual({ name: ".md", folder: "" });
  });
});

describe("conflictHeadline", () => {
  const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ note: `Note ${i}.md` }));

  it("counts notes", () => {
    expect(conflictHeadline(notes(1))).toBe("Sync kept both versions of 1 note");
    expect(conflictHeadline(notes(12))).toBe("Sync kept both versions of 12 notes");
    expect(conflictHeadline([{ note: "todo.txt" }])).toBe("Sync kept both versions of 1 note");
  });

  it("says files when an attachment is among them", () => {
    expect(conflictHeadline([{ note: "img/pic.png" }])).toBe("Sync kept both versions of 1 file");
    expect(conflictHeadline([...notes(2), { note: "Board.canvas" }])).toBe(
      "Sync kept both versions of 3 files",
    );
  });
});
