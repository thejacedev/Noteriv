import { describe, expect, it } from "vitest";
import {
  EMPTY_BOOKMARKS,
  addGroup,
  bookmarkLabel,
  groupedBookmarks,
  hasBookmark,
  moveBookmark,
  parseBookmarks,
  removeBookmarkPaths,
  removeBookmark,
  removeGroup,
  renameBookmarkPaths,
  serializeBookmarks,
  toggleBookmarkItem,
  type BookmarkStore,
} from "../bookmarks";

const file = (target: string, group?: string) => ({ kind: "file" as const, target, ...(group ? { group } : {}) });

describe("bookmark store", () => {
  it("toggles a bookmark on and off", () => {
    const on = toggleBookmarkItem(EMPTY_BOOKMARKS, "file", "/v/Plan.md");
    expect(hasBookmark(on, "file", "/v/Plan.md")).toBe(true);
    expect(hasBookmark(on, "folder", "/v/Plan.md")).toBe(false);
    expect(toggleBookmarkItem(on, "file", "/v/Plan.md").items).toEqual([]);
    expect(toggleBookmarkItem(on, "search", "")).toBe(on);
  });

  it("files a bookmark under a group and takes it out again", () => {
    let store = toggleBookmarkItem(EMPTY_BOOKMARKS, "file", "/v/Plan.md");
    store = moveBookmark(store, file("/v/Plan.md"), "Work");
    expect(store.groups).toEqual(["Work"]);
    expect(store.items).toEqual([file("/v/Plan.md", "Work")]);
    store = moveBookmark(store, file("/v/Plan.md"), null);
    expect(store.items).toEqual([file("/v/Plan.md")]);
    expect(store.groups).toEqual(["Work"]);
  });

  it("keeps a group's bookmarks when the group is removed", () => {
    let store: BookmarkStore = { groups: ["Work", "Home"], items: [file("/v/A.md", "Work"), file("/v/B.md", "Home")] };
    store = removeGroup(store, "Work");
    expect(store.groups).toEqual(["Home"]);
    expect(store.items).toEqual([file("/v/A.md"), file("/v/B.md", "Home")]);
    expect(addGroup(store, " Home ")).toBe(store);
    expect(addGroup(store, "New").groups).toEqual(["Home", "New"]);
    expect(removeBookmark(store, file("/v/A.md")).items).toEqual([file("/v/B.md", "Home")]);
  });

  it("shows ungrouped bookmarks first, then each group in order", () => {
    const store: BookmarkStore = {
      groups: ["Work", "Empty"],
      items: [file("/v/A.md", "Work"), file("/v/B.md"), { kind: "search", target: "tag:#x", group: "Gone" }],
    };
    expect(groupedBookmarks(store).map((s) => [s.group, s.items.map((i) => i.target)])).toEqual([
      [null, ["/v/B.md", "tag:#x"]],
      ["Work", ["/v/A.md"]],
      ["Empty", []],
    ]);
  });

  it("follows a renamed note or folder", () => {
    const store: BookmarkStore = {
      groups: [],
      items: [
        file("/v/Projects/Plan.md"),
        { kind: "heading", target: "/v/Projects/Plan.md#Next steps" },
        { kind: "folder", target: "/v/Projects" },
        { kind: "search", target: "/v/Projects" },
        file("/v/Projects 2/Other.md"),
      ],
    };
    expect(renameBookmarkPaths(store, "/v/Projects", "/v/Work").items.map((i) => i.target)).toEqual([
      "/v/Work/Plan.md",
      "/v/Work/Plan.md#Next steps",
      "/v/Work",
      "/v/Projects",
      "/v/Projects 2/Other.md",
    ]);
    expect(renameBookmarkPaths(store, "/v/Nothing", "/v/X")).toBe(store);
  });

  it("survives being saved and read back, and reads rubbish as empty", () => {
    const store: BookmarkStore = { groups: ["Work"], items: [file("/v/A.md", "Work"), { kind: "search", target: "a b" }] };
    expect(parseBookmarks(serializeBookmarks(store))).toEqual(store);
    expect(parseBookmarks("not json")).toEqual(EMPTY_BOOKMARKS);
    expect(parseBookmarks(null)).toEqual(EMPTY_BOOKMARKS);
    expect(parseBookmarks('{"items":[{"kind":"alien","target":"x"},{"kind":"file"},{"kind":"file","target":"/v/A.md"},{"kind":"file","target":"/v/A.md"}]}').items).toEqual([file("/v/A.md")]);
    expect(parseBookmarks('{"items":[{"kind":"file","target":"/v/A.md","group":"New"}]}').groups).toEqual(["New"]);
  });

  it("names each kind for the list", () => {
    expect(bookmarkLabel(file("/v/Projects/Plan.md"), "/v")).toEqual({ name: "Plan", detail: "Projects" });
    expect(bookmarkLabel(file("/v/Inbox.md"), "/v")).toEqual({ name: "Inbox", detail: "" });
    expect(bookmarkLabel({ kind: "folder", target: "/v/Projects" }, "/v")).toEqual({ name: "Projects", detail: "Folder" });
    expect(bookmarkLabel({ kind: "search", target: "tag:#work" }, "/v")).toEqual({ name: "tag:#work", detail: "Search" });
    expect(bookmarkLabel({ kind: "heading", target: "/v/Plan.md#Next steps" }, "/v")).toEqual({ name: "Next steps", detail: "Plan" });
  });
});

describe("bookmark paths in the vault's file", () => {
  const store = {
    items: [
      { kind: "file" as const, target: "/home/me/vault/Projects/Alpha.md", group: "Work" },
      { kind: "folder" as const, target: "/home/me/vault/Projects" },
      { kind: "heading" as const, target: "/home/me/vault/Plan.md#Goals #1" },
      { kind: "search" as const, target: "tag:#work path:/home/me/vault" },
      { kind: "file" as const, target: "/elsewhere/Loose.md" },
    ],
    groups: ["Work"],
  };

  it("writes paths from the top of the vault and reads them back in another place", () => {
    const text = serializeBookmarks(store, "/home/me/vault");
    expect(JSON.parse(text).items.map((i: { target: string }) => i.target)).toEqual([
      "Projects/Alpha.md",
      "Projects",
      "Plan.md#Goals #1",
      "tag:#work path:/home/me/vault",
      "/elsewhere/Loose.md",
    ]);
    expect(parseBookmarks(text, "/home/me/vault")).toEqual(store);
    // The same file on a Windows machine, where the vault is somewhere else.
    const there = parseBookmarks(text, "C:\\Users\\me\\Notes");
    expect(there.items[0].target).toBe("C:\\Users\\me\\Notes\\Projects\\Alpha.md");
    expect(there.items[2].target).toBe("C:\\Users\\me\\Notes\\Plan.md#Goals #1");
    expect(serializeBookmarks(there, "C:\\Users\\me\\Notes")).toBe(text);
  });

  it("keeps full paths from an older file and drops a path that leaves the vault", () => {
    const old = '{"items":[{"kind":"file","target":"/home/me/vault/A.md"},{"kind":"file","target":"../outside.md"}]}';
    expect(parseBookmarks(old, "/home/me/vault").items).toEqual([{ kind: "file", target: "/home/me/vault/A.md" }]);
  });
});

describe("removeBookmarkPaths", () => {
  const store = {
    items: [
      { kind: "file" as const, target: "/v/Projects/Alpha.md" },
      { kind: "heading" as const, target: "/v/Projects/Alpha.md#Goals" },
      { kind: "folder" as const, target: "/v/Projects" },
      { kind: "file" as const, target: "/v/Projects2/Other.md" },
      { kind: "search" as const, target: "path:/v/Projects" },
    ],
    groups: ["Work"],
  };

  it("drops the bookmarks on a deleted note, its headings included", () => {
    expect(removeBookmarkPaths(store, "/v/Projects/Alpha.md").items.map((b) => b.target)).toEqual([
      "/v/Projects",
      "/v/Projects2/Other.md",
      "path:/v/Projects",
    ]);
  });

  it("drops everything inside a deleted folder, and nothing that only starts with its name", () => {
    const left = removeBookmarkPaths(store, "/v/Projects");
    expect(left.items.map((b) => b.target)).toEqual(["/v/Projects2/Other.md", "path:/v/Projects"]);
    expect(left.groups).toEqual(["Work"]);
  });

  it("gives back the same store when nothing was bookmarked there", () => {
    expect(removeBookmarkPaths(store, "/v/Nothing.md")).toBe(store);
  });
});
