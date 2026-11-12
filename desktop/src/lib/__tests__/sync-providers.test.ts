import { describe, expect, it } from "vitest";
import { autoSyncApplies } from "../sync-providers";

describe("autoSyncApplies", () => {
  it("is true for a vault with a Git remote, whatever else it uses", () => {
    expect(autoSyncApplies("git@github.com:me/notes.git", "none")).toBe(true);
    expect(autoSyncApplies("git@github.com:me/notes.git", "folder")).toBe(true);
  });

  it("is true for a vault that only syncs through WebDAV", () => {
    // These never synced on the timer or on save before: both checks asked for a Git remote.
    expect(autoSyncApplies(null, "webdav")).toBe(true);
    expect(autoSyncApplies(undefined, "webdav")).toBe(true);
    expect(autoSyncApplies("", "webdav")).toBe(true);
  });

  it("is false for a vault that only uses folder sync, which stays manual", () => {
    expect(autoSyncApplies(null, "folder")).toBe(false);
  });

  it("is false when nothing is set up", () => {
    expect(autoSyncApplies(null, "none")).toBe(false);
    expect(autoSyncApplies("", "none")).toBe(false);
  });
});
