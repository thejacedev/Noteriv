/**
 * Audio recording utilities for Noteriv.
 *
 * Provides helpers for recording audio via MediaRecorder, converting blobs
 * to base64 for saving through the Electron IPC bridge, and generating
 * timestamped filenames.
 *
 * ## IPC Limitations
 *
 * The current `window.electronAPI.writeFile(path, content)` handler writes
 * content as UTF-8 text. For binary audio files we convert the blob to a
 * base64 data-URL string and save that. A future IPC addition could support
 * true binary writes:
 *
 * ```
 * // preload.js — add:
 * writeBinaryFile: (filePath, base64Data) =>
 *   ipcRenderer.invoke("fs:writeBinaryFile", { filePath, base64Data }),
 *
 * // main.js — add handler:
 * ipcMain.handle("fs:writeBinaryFile", async (_, { filePath, base64Data }) => {
 *   const dir = path.dirname(filePath);
 *   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
 *   const buffer = Buffer.from(base64Data, "base64");
 *   fs.writeFileSync(filePath, buffer);
 *   return true;
 * });
 * ```
 *
 * Until that handler exists the recorder saves the base64 data-URL as the
 * file contents and playback relies on loading the data-URL back.
 */

/**
 * Generate a filename for an audio recording based on the current timestamp.
 * Format: recording-YYYY-MM-DD-HHmmss.webm
 */
export function generateRecordingFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `recording-${date}-${time}.webm`;
}

/**
 * Get the attachments directory path for a vault.
 */
export function getAttachmentsDir(vaultPath: string): string {
  return `${vaultPath}/attachments`;
}

/**
 * Convert a Blob to a base64 data-URL string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Format seconds into a mm:ss display string.
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Save an audio blob to the vault's attachments folder.
 *
 * Converts the blob to a base64 data-URL and writes it via the Electron
 * IPC bridge. Returns the relative markdown-ready path on success.
 *
 * See module-level docs for notes on binary file IPC limitations.
 */
export async function saveAudioToVault(
  blob: Blob,
  vaultPath: string,
  filename: string,
): Promise<string> {
  const attachDir = getAttachmentsDir(vaultPath);
  const filePath = `${attachDir}/${filename}`;

  // Ensure the attachments directory exists
  await window.electronAPI.createDir(attachDir);

  // Convert to base64 and save
  const base64 = await blobToBase64(blob);
  const success = await window.electronAPI.writeFile(filePath, base64);

  if (!success) {
    throw new Error(`Failed to save audio file: ${filePath}`);
  }

  return `attachments/${filename}`;
}
