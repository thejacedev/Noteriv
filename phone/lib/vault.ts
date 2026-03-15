import { Vault, WorkspaceState } from '@/types';
import { getItem, setItem, KEYS } from './storage';
import { ensureVaultsDir, getVaultPath, createDir } from './file-system';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export async function getVaults(): Promise<Vault[]> {
  return (await getItem<Vault[]>(KEYS.VAULTS)) ?? [];
}

export async function getActiveVault(): Promise<Vault | null> {
  const id = await getItem<string>(KEYS.ACTIVE_VAULT);
  if (!id) return null;
  const vaults = await getVaults();
  return vaults.find((v) => v.id === id) ?? null;
}

export async function setActiveVault(id: string): Promise<void> {
  await setItem(KEYS.ACTIVE_VAULT, id);
  const vaults = await getVaults();
  const updated = vaults.map((v) =>
    v.id === id ? { ...v, lastOpened: Date.now() } : v
  );
  await setItem(KEYS.VAULTS, updated);
}

export async function createVault(name: string): Promise<Vault> {
  ensureVaultsDir();
  const vaultPath = getVaultPath(name);
  createDir(vaultPath);

  // Create .noteriv metadata directory
  createDir(`${vaultPath}.noteriv/`);
  createDir(`${vaultPath}.noteriv/snapshots/`);
  createDir(`${vaultPath}.noteriv/themes/`);

  const vault: Vault = {
    id: generateId(),
    name,
    path: vaultPath,
    gitRemote: null,
    gitBranch: 'main',
    autoSync: false,
    lastOpened: Date.now(),
  };

  const vaults = await getVaults();
  vaults.push(vault);
  await setItem(KEYS.VAULTS, vaults);
  await setActiveVault(vault.id);

  return vault;
}

export async function updateVault(id: string, updates: Partial<Vault>): Promise<void> {
  const vaults = await getVaults();
  const idx = vaults.findIndex((v) => v.id === id);
  if (idx >= 0) {
    vaults[idx] = { ...vaults[idx], ...updates };
    await setItem(KEYS.VAULTS, vaults);
  }
}

export async function deleteVault(id: string): Promise<void> {
  const vaults = await getVaults();
  const filtered = vaults.filter((v) => v.id !== id);
  await setItem(KEYS.VAULTS, filtered);
}

export async function isSetupComplete(): Promise<boolean> {
  return (await getItem<boolean>(KEYS.SETUP_COMPLETE)) ?? false;
}

export async function setSetupComplete(): Promise<void> {
  await setItem(KEYS.SETUP_COMPLETE, true);
}

export async function loadWorkspace(vaultId: string): Promise<WorkspaceState> {
  const saved = await getItem<WorkspaceState>(KEYS.WORKSPACE(vaultId));
  return saved ?? {
    openTabs: [],
    activeTab: null,
    expandedFolders: [],
    viewMode: 'edit',
    bookmarks: [],
  };
}

export async function saveWorkspace(vaultId: string, state: WorkspaceState): Promise<void> {
  await setItem(KEYS.WORKSPACE(vaultId), state);
}
