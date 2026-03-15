import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  VAULTS: 'noteriv:vaults',
  ACTIVE_VAULT: 'noteriv:activeVault',
  SETTINGS: 'noteriv:settings',
  SETUP_COMPLETE: 'noteriv:setupComplete',
  WORKSPACE: (vaultId: string) => `noteriv:workspace:${vaultId}`,
  GITHUB_TOKEN: (vaultId: string) => `noteriv:ghToken:${vaultId}`,
};

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

export { KEYS };
