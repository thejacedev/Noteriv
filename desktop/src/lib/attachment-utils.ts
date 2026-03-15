/**
 * Attachment management utilities for Noteriv.
 *
 * Handles listing, categorising, and managing files in the vault's
 * `attachments/` folder.
 */

export interface Attachment {
  name: string;
  path: string;
  type: "image" | "audio" | "video" | "pdf" | "other";
  size: number;
  modified: number;
}

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "tif",
]);
const AUDIO_EXTS = new Set([
  "mp3", "wav", "ogg", "webm", "flac", "aac", "m4a", "wma",
]);
const VIDEO_EXTS = new Set([
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm",
]);
// Note: .webm can be audio or video. We prioritise audio since the recorder
// produces webm files. If the file is in video exts too, audio wins.

/**
 * Returns the absolute path to the attachments directory for a vault.
 */
export function getAttachmentsDir(vaultPath: string): string {
  return `${vaultPath}/attachments`;
}

/**
 * Determine the attachment type from a filename extension.
 */
export function getAttachmentType(
  filename: string,
): "image" | "audio" | "video" | "pdf" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext) && ext !== "webm") return "video";
  // .webm is treated as audio since the recorder produces it
  if (ext === "webm") return "audio";
  return "other";
}

/**
 * Format a byte count into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Generate a conflict-free attachment name by prepending a timestamp prefix.
 * Example: "photo.png" -> "20260313-143022-photo.png"
 */
export function generateAttachmentName(originalName: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `${stamp}-${originalName}`;
}

/**
 * List all attachment files in the vault's attachments/ directory.
 *
 * Uses the Electron IPC `readDir` call, which returns entries without size
 * or modified time. To get full metadata we would need a stat IPC handler.
 * For now, size and modified are set to 0 — the UI can still show names
 * and types. If an `fs:stat` handler is added later, this function can be
 * updated to populate those fields.
 */
export async function listAttachments(
  vaultPath: string,
): Promise<Attachment[]> {
  const attachDir = getAttachmentsDir(vaultPath);

  // Ensure the directory exists first
  await window.electronAPI.createDir(attachDir);

  const entries = await window.electronAPI.readDir(attachDir);

  const attachments: Attachment[] = entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: getAttachmentType(entry.name),
      size: 0, // readDir does not return size — see note above
      modified: 0, // readDir does not return mtime — see note above
    }));

  return attachments;
}

/**
 * Delete an attachment file.
 */
export async function deleteAttachment(filePath: string): Promise<boolean> {
  return window.electronAPI.deleteFile(filePath);
}

/**
 * Copy a dropped/selected file into the attachments directory.
 *
 * Since we are in a renderer context with contextIsolation, we cannot use
 * Node's fs directly. For drag-and-drop files we receive a browser File
 * object, which we read as a data-URL and write via IPC (same base64
 * approach as audio). Returns the relative markdown path.
 */
export async function importAttachment(
  file: File,
  vaultPath: string,
): Promise<string> {
  const attachDir = getAttachmentsDir(vaultPath);
  await window.electronAPI.createDir(attachDir);

  const safeName = generateAttachmentName(file.name);
  const destPath = `${attachDir}/${safeName}`;

  // Read file content as data-URL (base64)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const success = await window.electronAPI.writeFile(destPath, dataUrl);
  if (!success) {
    throw new Error(`Failed to import attachment: ${safeName}`);
  }

  return `attachments/${safeName}`;
}

/**
 * Build a markdown link for an attachment based on its type.
 */
export function markdownLinkForAttachment(
  name: string,
  type: Attachment["type"],
): string {
  const relativePath = `attachments/${name}`;
  switch (type) {
    case "image":
      return `![${name}](${relativePath})`;
    case "audio":
      return `![Audio](${relativePath})`;
    case "video":
      return `![Video](${relativePath})`;
    case "pdf":
      return `[${name}](${relativePath})`;
    default:
      return `[${name}](${relativePath})`;
  }
}
