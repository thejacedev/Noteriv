/**
 * The sync settings that belong to one vault.
 *
 * Where a vault syncs to (a folder or a WebDAV server) and what it carries
 * there are kept for each vault, because a sync folder holds one vault. They
 * were once shared by every vault, and a second vault then synced into the
 * first one's folder and the two were mixed.
 *
 * In the settings file they are under `vaultSync`, by the vault's id. The
 * same four settings at the top level of the file are what versions up to
 * 3.0.0 wrote. They are left as they are and never read here: the backend
 * hands them to the right vault once, when it first finds no `vaultSync`.
 *
 * In the app they still sit in `AppSettings`, so the code that reads
 * `settings.webdavSync` did not have to change. What it reads is the open
 * vault's: `withVaultSync` puts them there, and puts "no sync" there when
 * what is loaded was read for another vault.
 */

import { DEFAULT_SETTINGS, type AppSettings } from "./settings";

export const VAULT_SYNC_KEYS = ["extraSyncProvider", "folderSync", "webdavSync", "syncFilter"] as const;

export type VaultSyncSettings = Pick<AppSettings, (typeof VAULT_SYNC_KEYS)[number]>;

/** What is in the settings file: anything at all, as far as this module knows. */
export type StoredSettings = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A vault that has not been set up to sync with a folder or a server. */
export function noVaultSync(): VaultSyncSettings {
  return {
    extraSyncProvider: "none",
    folderSync: { ...DEFAULT_SETTINGS.folderSync },
    webdavSync: { ...DEFAULT_SETTINGS.webdavSync },
    syncFilter: { ...DEFAULT_SETTINGS.syncFilter },
  };
}

/** The four settings out of a full set. */
export function pickVaultSync(settings: AppSettings): VaultSyncSettings {
  return {
    extraSyncProvider: settings.extraSyncProvider,
    folderSync: settings.folderSync,
    webdavSync: settings.webdavSync,
    syncFilter: settings.syncFilter,
  };
}

/**
 * One vault's sync settings as the settings file has them, with anything
 * missing filled in. A vault with no entry does not sync: the settings other
 * vaults have, and the ones at the top level of the file, are not its own.
 */
export function vaultSyncFrom(stored: StoredSettings, vaultId: string): VaultSyncSettings {
  const none = noVaultSync();
  const all = stored.vaultSync;
  const entry = isObject(all) ? all[vaultId] : undefined;
  if (!isObject(entry)) return none;

  const provider = entry.extraSyncProvider;
  return {
    extraSyncProvider: provider === "folder" || provider === "webdav" ? provider : "none",
    folderSync: { ...none.folderSync, ...(isObject(entry.folderSync) ? entry.folderSync : {}) } as VaultSyncSettings["folderSync"],
    webdavSync: { ...none.webdavSync, ...(isObject(entry.webdavSync) ? entry.webdavSync : {}) } as VaultSyncSettings["webdavSync"],
    syncFilter: { ...none.syncFilter, ...(isObject(entry.syncFilter) ? entry.syncFilter : {}) } as VaultSyncSettings["syncFilter"],
  };
}

/**
 * The settings with a vault's sync settings in them. `sync` is null when no
 * vault is open, or when the open vault's have not been read yet: the vault
 * does not sync until they are.
 */
export function withVaultSync(settings: AppSettings, sync: VaultSyncSettings | null): AppSettings {
  return { ...settings, ...(sync ?? noVaultSync()) };
}

/**
 * What to write to the settings file. Every setting but the four sync
 * settings goes to the top level, as it always has. The four go under the
 * vault they were shown for. With `vaultId` null they are not written at
 * all: they were not a vault's, so they must not replace one's.
 *
 * Only the app's own settings are taken from `settings`. It is made from the
 * whole file as it was when the app started, so it also carries that old
 * copy of whatever else the file holds (the hotkeys, every vault's sync
 * settings). Those are kept as `stored`, read a moment ago, has them.
 */
export function settingsToStore(
  stored: StoredSettings,
  settings: AppSettings,
  vaultId: string | null
): StoredSettings {
  const from = settings as unknown as StoredSettings;
  const rest: StoredSettings = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(VAULT_SYNC_KEYS as readonly string[]).includes(key) && key in from) rest[key] = from[key];
  }
  const next: StoredSettings = { ...stored, ...rest };
  if (vaultId) {
    next.vaultSync = { ...(isObject(stored.vaultSync) ? stored.vaultSync : {}), [vaultId]: pickVaultSync(settings) };
  }
  return next;
}
