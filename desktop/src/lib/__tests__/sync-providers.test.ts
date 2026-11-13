import { describe, expect, it } from "vitest";
import { autoSyncApplies, providerConfig, syncFilterConfig } from "../sync-providers";

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

describe("what sync is given", () => {
  const base = {
    folderSync: { targetPath: "/cloud/Notes", direction: "both" as const },
    webdavSync: { url: "https://dav.example", username: "u", password: "p", remotePath: "/Notes", encryptionPassword: "" },
    syncFilter: { images: true, pdfs: false, audio: false, video: true, settings: true, excludeFolders: " Archive/ \n\n/Work\\Private\n../outside\n" },
  };

  it("turns the list of folders into paths and drops one that leaves the vault", () => {
    expect(syncFilterConfig(base.syncFilter)).toEqual({
      images: true,
      pdfs: false,
      audio: false,
      video: true,
      settings: true,
      excludeFolders: ["Archive", "Work/Private"],
    });
  });

  it("gives each provider its own details with the filter, and no password when none is set", () => {
    expect(providerConfig({ ...base, extraSyncProvider: "none" })).toBeNull();
    expect(providerConfig({ ...base, extraSyncProvider: "folder" })).toMatchObject({
      targetPath: "/cloud/Notes",
      direction: "both",
      filter: { pdfs: false, excludeFolders: ["Archive", "Work/Private"] },
    });
    const plain = providerConfig({ ...base, extraSyncProvider: "webdav" });
    expect(plain).toMatchObject({ url: "https://dav.example", remotePath: "/Notes", encryptionPassword: null });
    const secret = providerConfig({
      ...base,
      extraSyncProvider: "webdav",
      webdavSync: { ...base.webdavSync, encryptionPassword: "pw" },
    });
    expect(secret?.encryptionPassword).toBe("pw");
  });
});
