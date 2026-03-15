/**
 * Utility for opening a random note from the vault.
 */

/**
 * Pick a random markdown file from the vault.
 * Returns the file path, or null if the vault is empty.
 */
export async function getRandomNote(vaultPath: string): Promise<string | null> {
  if (!window.electronAPI) return null;

  const files = await window.electronAPI.listAllFiles(vaultPath);
  if (!files || files.length === 0) return null;

  const index = Math.floor(Math.random() * files.length);
  return files[index].filePath;
}
