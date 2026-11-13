import { describe, expect, it } from "vitest";
import { autoSyncApplies } from "../sync-providers";

describe("autoSyncApplies", () => {
  it("is true for a vault with a Git remote", () => {
    expect(autoSyncApplies("git@github.com:me/notes.git", "none")).toBe(true);
    expect(autoSyncApplies("git@github.com:me/notes.git", "folder")).toBe(true);
  });

  it("is true for a vault that only syncs through WebDAV or a folder", () => {
    // Both checks used to ask for a Git remote, so these never synced on the timer or on save.
    expect(autoSyncApplies(null, "webdav")).toBe(true);
    expect(autoSyncApplies(undefined, "folder")).toBe(true);
    expect(autoSyncApplies("", "webdav")).toBe(true);
    expect(autoSyncApplies("", "folder")).toBe(true);
  });

  it("is false when nothing is set up", () => {
    expect(autoSyncApplies(null, "none")).toBe(false);
    expect(autoSyncApplies("", "none")).toBe(false);
  });
});
