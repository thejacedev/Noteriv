import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "../settings";
import {
  noVaultSync,
  pickVaultSync,
  settingsToStore,
  vaultSyncFrom,
  withVaultSync,
} from "../vault-sync-settings";

const workSync = {
  extraSyncProvider: "webdav" as const,
  folderSync: { targetPath: "", direction: "both" as const },
  webdavSync: { url: "https://dav.example.com", username: "me", password: "secret", remotePath: "/Work", encryptionPassword: "" },
  syncFilter: { images: true, pdfs: false, audio: false, video: false, settings: true, excludeFolders: "Archive" },
};

// A settings file as 3.0.0 left it, after the backend gave the vault "work" its entry.
const stored = {
  theme: "nord",
  fontSize: 17,
  hotkeys: { save: "Ctrl+S" },
  extraSyncProvider: "webdav",
  webdavSync: { url: "https://dav.example.com", username: "me", password: "secret", remotePath: "/Work" },
  vaultSync: { work: workSync },
};

describe("vaultSyncFrom", () => {
  it("reads the vault's own settings", () => {
    expect(vaultSyncFrom(stored, "work")).toEqual(workSync);
  });

  it("gives a vault with no entry no sync, whatever the top level of the file says", () => {
    expect(vaultSyncFrom(stored, "home")).toEqual(noVaultSync());
    expect(vaultSyncFrom(stored, "home").extraSyncProvider).toBe("none");
    expect(vaultSyncFrom(stored, "home").webdavSync.url).toBe("");
    // A file from before vaults had their own, which the backend has not seen yet.
    expect(vaultSyncFrom({ extraSyncProvider: "webdav", webdavSync: workSync.webdavSync }, "work")).toEqual(noVaultSync());
    expect(vaultSyncFrom({}, "work")).toEqual(noVaultSync());
  });

  it("fills in what an entry leaves out and passes over what it cannot read", () => {
    const partial = vaultSyncFrom({ vaultSync: { v: { extraSyncProvider: "folder", folderSync: { targetPath: "/cloud/N" } } } }, "v");
    expect(partial.extraSyncProvider).toBe("folder");
    expect(partial.folderSync).toEqual({ targetPath: "/cloud/N", direction: "both" });
    expect(partial.syncFilter).toEqual(DEFAULT_SETTINGS.syncFilter);

    expect(vaultSyncFrom({ vaultSync: { v: { extraSyncProvider: "s3" } } }, "v").extraSyncProvider).toBe("none");
    expect(vaultSyncFrom({ vaultSync: { v: "webdav" } }, "v")).toEqual(noVaultSync());
    expect(vaultSyncFrom({ vaultSync: ["v"] }, "v")).toEqual(noVaultSync());
    expect(vaultSyncFrom({ vaultSync: null }, "v")).toEqual(noVaultSync());
  });

  it("does not hand out the defaults themselves", () => {
    const a = noVaultSync();
    a.webdavSync.url = "changed";
    a.syncFilter.audio = true;
    expect(noVaultSync().webdavSync.url).toBe("");
    expect(DEFAULT_SETTINGS.webdavSync.url).toBe("");
    expect(DEFAULT_SETTINGS.syncFilter.audio).toBe(false);
  });
});

describe("withVaultSync", () => {
  // What the app holds after reading the file: the top level, old sync settings and all.
  const loaded = mergeSettings(stored as unknown as Partial<AppSettings>);

  it("shows the open vault's sync settings", () => {
    const shown = withVaultSync(loaded, vaultSyncFrom(stored, "work"));
    expect(pickVaultSync(shown)).toEqual(workSync);
    expect(shown.theme).toBe("nord");
    expect(shown.fontSize).toBe(17);
  });

  it("shows no sync when the open vault's settings are not the ones in hand", () => {
    // The old shared settings are in `loaded`, and must not show through.
    expect(loaded.extraSyncProvider).toBe("webdav");
    const shown = withVaultSync(loaded, null);
    expect(shown.extraSyncProvider).toBe("none");
    expect(shown.webdavSync.url).toBe("");
    expect(shown.theme).toBe("nord");

    expect(pickVaultSync(withVaultSync(loaded, vaultSyncFrom(stored, "home")))).toEqual(noVaultSync());
  });
});

describe("settingsToStore", () => {
  const loaded = mergeSettings(stored as unknown as Partial<AppSettings>);

  it("writes a vault's sync settings under that vault and nowhere else", () => {
    const homeSync = { ...noVaultSync(), extraSyncProvider: "folder" as const, folderSync: { targetPath: "/cloud/Home", direction: "push" as const } };
    const shown = { ...withVaultSync(loaded, homeSync), fontSize: 20 };
    const next = settingsToStore(stored, shown, "home");

    expect(next.vaultSync).toEqual({ work: workSync, home: homeSync });
    // The other vault's settings are as they were.
    expect(vaultSyncFrom(next, "work")).toEqual(workSync);
    expect(vaultSyncFrom(next, "home")).toEqual(homeSync);
    // The rest goes to the top level, and what the app does not know stays.
    expect(next.fontSize).toBe(20);
    expect(next.theme).toBe("nord");
    expect(next.hotkeys).toEqual({ save: "Ctrl+S" });
    // The old shared settings are left exactly as they were.
    expect(next.extraSyncProvider).toBe("webdav");
    expect(next.webdavSync).toEqual(stored.webdavSync);
    expect("folderSync" in next).toBe(false);
    expect("syncFilter" in next).toBe(false);
  });

  it("writes no sync settings when they were not a vault's", () => {
    // No vault open, or its settings not read yet: what is shown is "no sync".
    const shown = { ...withVaultSync(loaded, null), fontSize: 12 };
    const next = settingsToStore(stored, shown, null);
    expect(next.vaultSync).toEqual({ work: workSync });
    expect(next.fontSize).toBe(12);
    expect(next.extraSyncProvider).toBe("webdav");
  });

  it("keeps what else is in the file as the file has it now, not as it was at the start", () => {
    // `loaded` was made from the file when the app started. Since then the
    // hotkeys were changed and another vault's sync settings were saved.
    const now = {
      ...stored,
      hotkeys: { save: "Ctrl+Shift+S" },
      vaultSync: { work: workSync, home: { ...noVaultSync(), extraSyncProvider: "folder" } },
      somethingNewer: true,
    };
    for (const vaultId of ["work", null]) {
      const next = settingsToStore(now, { ...withVaultSync(loaded, workSync), fontSize: 13 }, vaultId);
      expect(next.hotkeys).toEqual({ save: "Ctrl+Shift+S" });
      expect(next.somethingNewer).toBe(true);
      expect(vaultSyncFrom(next, "home").extraSyncProvider).toBe("folder");
      expect(vaultSyncFrom(next, "work")).toEqual(workSync);
      expect(next.fontSize).toBe(13);
    }
  });

  it("makes the entry in a file that has none", () => {
    const next = settingsToStore({}, withVaultSync(DEFAULT_SETTINGS, workSync), "work");
    expect(next.vaultSync).toEqual({ work: workSync });
    expect("extraSyncProvider" in next).toBe(false);
    expect(next.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("round-trips: what is stored for a vault is what is shown for it again", () => {
    const edited = { ...workSync, webdavSync: { ...workSync.webdavSync, remotePath: "/Work-2" } };
    const next = settingsToStore(stored, withVaultSync(loaded, edited), "work");
    const again = withVaultSync(mergeSettings(next as Partial<AppSettings>), vaultSyncFrom(next, "work"));
    expect(pickVaultSync(again)).toEqual(edited);
  });
});
