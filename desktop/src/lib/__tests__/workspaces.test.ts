import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUTS,
  cleanLayoutName,
  describeLayout,
  fromStoredLayout,
  layoutNames,
  parseLayouts,
  putLayout,
  removeLayout,
  renameLayout,
  serializeLayouts,
  toStoredLayout,
  type Layout,
} from "../workspaces";

const layout: Layout = {
  openTabs: ["/v/Plan.md", "/v/Projects/Alpha.md", "/elsewhere/Loose.md"],
  activeTab: "/v/Projects/Alpha.md",
  splitTab: "/v/Plan.md",
  pinnedTabs: ["/v/Plan.md"],
  expandedFolders: ["/v/Projects"],
  fileViewModes: { "/v/Plan.md": "view", "/elsewhere/Loose.md": "source" },
  viewMode: "live",
  sidebarCollapsed: false,
  sidebarWidth: 300,
  panels: ["outline", "backlinks"],
};

describe("stored layouts", () => {
  it("writes paths from the top of the vault and leaves out what is outside it", () => {
    const stored = toStoredLayout(layout, "/v");
    expect(stored.openTabs).toEqual(["Plan.md", "Projects/Alpha.md"]);
    expect(stored.activeTab).toBe("Projects/Alpha.md");
    expect(stored.splitTab).toBe("Plan.md");
    expect(stored.pinnedTabs).toEqual(["Plan.md"]);
    expect(stored.expandedFolders).toEqual(["Projects"]);
    expect(stored.fileViewModes).toEqual({ "Plan.md": "view" });
    expect(stored.panels).toEqual(["outline", "backlinks"]);
  });

  it("comes back with full paths for the vault where it is now", () => {
    const stored = toStoredLayout(layout, "/v");
    const there = fromStoredLayout(stored, "C:\\Notes");
    expect(there.openTabs).toEqual(["C:\\Notes\\Plan.md", "C:\\Notes\\Projects\\Alpha.md"]);
    expect(there.activeTab).toBe("C:\\Notes\\Projects\\Alpha.md");
    expect(there.fileViewModes).toEqual({ "C:\\Notes\\Plan.md": "view" });
    const back = fromStoredLayout(stored, "/v");
    expect(back.openTabs).toEqual(["/v/Plan.md", "/v/Projects/Alpha.md"]);
    expect(back.splitTab).toBe("/v/Plan.md");
  });

  it("drops a stored path that tries to leave the vault", () => {
    const bad = { ...toStoredLayout(layout, "/v"), openTabs: ["../secret.md", "Plan.md"], activeTab: "../secret.md" };
    const restored = fromStoredLayout(bad, "/v");
    expect(restored.openTabs).toEqual(["/v/Plan.md"]);
    expect(restored.activeTab).toBe("/v/Plan.md");
  });
});

describe("the layouts file", () => {
  it("round-trips and keeps the active layout", () => {
    let store = putLayout(EMPTY_LAYOUTS, "  Writing   desk ", toStoredLayout(layout, "/v"));
    store = putLayout(store, "Review", { ...toStoredLayout(layout, "/v"), panels: [] });
    expect(layoutNames(store)).toEqual(["Review", "Writing desk"]);
    expect(store.active).toBe("Review");
    expect(parseLayouts(serializeLayouts(store))).toEqual(store);
  });

  it("reads a damaged file without failing", () => {
    expect(parseLayouts("nonsense")).toEqual(EMPTY_LAYOUTS);
    expect(parseLayouts(null)).toEqual(EMPTY_LAYOUTS);
    const odd = parseLayouts(
      JSON.stringify({
        layouts: {
          Good: { openTabs: ["A.md", 7, ""], activeTab: "Gone.md", viewMode: "sideways", sidebarWidth: 9000, pinnedTabs: ["B.md"] },
          "": { openTabs: [] },
          Bad: "text",
        },
        active: "Missing",
      })
    );
    expect(Object.keys(odd.layouts)).toEqual(["Good"]);
    expect(odd.layouts.Good).toMatchObject({
      openTabs: ["A.md"],
      activeTab: "A.md",
      viewMode: "live",
      sidebarWidth: 520,
      pinnedTabs: [],
      panels: [],
    });
    expect(odd.active).toBeNull();
  });

  it("renames and removes", () => {
    let store = putLayout(putLayout(EMPTY_LAYOUTS, "One", layout), "Two", layout);
    store = renameLayout(store, "Two", "Second");
    expect(layoutNames(store)).toEqual(["One", "Second"]);
    expect(store.active).toBe("Second");
    // A taken or empty name changes nothing.
    expect(renameLayout(store, "One", "Second")).toBe(store);
    expect(renameLayout(store, "One", "   ")).toBe(store);
    store = removeLayout(store, "Second");
    expect(layoutNames(store)).toEqual(["One"]);
    expect(store.active).toBeNull();
    expect(removeLayout(store, "Nope")).toBe(store);
    expect(putLayout(store, "  ", layout)).toBe(store);
  });

  it("cleans a name and describes a layout", () => {
    expect(cleanLayoutName("  a \t b  ")).toBe("a b");
    expect(describeLayout(layout)).toBe("3 notes open, split, outline, backlinks");
    expect(describeLayout({ ...layout, openTabs: ["/v/A.md"], splitTab: null, panels: [] })).toBe("1 note open");
    expect(describeLayout({ ...layout, openTabs: [], splitTab: null, panels: [] })).toBe("No notes open");
  });
});
