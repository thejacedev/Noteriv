// In-memory stand-in for lib/storage.ts (AsyncStorage on the phone).
const store = new Map();

export const KEYS = {
  GITHUB_TOKEN: (vaultId) => `noteriv:ghToken:${vaultId}`,
  GIT_TOKEN: (vaultId) => `noteriv:gitToken:${vaultId}`,
};

export async function getItem(key) {
  return store.has(key) ? JSON.parse(store.get(key)) : null;
}

export async function setItem(key, value) {
  store.set(key, JSON.stringify(value));
}

export async function removeItem(key) {
  store.delete(key);
}
