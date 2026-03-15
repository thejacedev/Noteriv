import { listAllMarkdownFiles } from '@/lib/file-system';

/**
 * Pick a random markdown note from the vault.
 * Returns the file path, or null if no notes exist.
 */
export async function getRandomNote(
  vaultPath: string
): Promise<string | null> {
  const files = await listAllMarkdownFiles(vaultPath);

  if (files.length === 0) return null;

  const index = Math.floor(Math.random() * files.length);
  return files[index].filePath;
}
