import { File, Directory } from 'expo-file-system';
import { readDir, createDir, deleteFile } from '@/lib/file-system';

export interface Attachment {
  name: string;
  path: string;
  type: 'image' | 'audio' | 'video' | 'pdf' | 'other';
  size: number;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const PDF_EXTS = ['.pdf'];

/**
 * Get the path to the attachments directory inside a vault.
 */
export function getAttachmentsDir(vaultPath: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath.slice(0, -1) : vaultPath;
  return `${base}/attachments`;
}

/**
 * Determine the attachment type from a filename's extension.
 */
export function getAttachmentType(filename: string): Attachment['type'] {
  const ext = getExtension(filename).toLowerCase();

  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (PDF_EXTS.includes(ext)) return 'pdf';
  return 'other';
}

/**
 * Format a byte count into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) return `${value} ${units[unitIndex]}`;
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * List all attachments in the vault's attachments directory.
 */
export function listAttachments(vaultPath: string): Attachment[] {
  const dir = getAttachmentsDir(vaultPath);
  createDir(dir);

  const entries = readDir(dir);
  const attachments: Attachment[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const file = new File(entry.path);
    attachments.push({
      name: entry.name,
      path: entry.path,
      type: getAttachmentType(entry.name),
      size: file.size ?? 0,
    });
  }

  return attachments.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Delete an attachment file. Returns true on success.
 */
export function deleteAttachment(path: string): boolean {
  return deleteFile(path);
}

/**
 * Generate a markdown link/embed string for an attachment.
 *
 * Images use `![name](path)` syntax, other files use `[name](path)`.
 * The path is made relative to the vault root.
 */
export function markdownLinkForAttachment(
  attachment: Attachment,
  vaultPath: string
): string {
  let relativePath = attachment.path;
  if (relativePath.startsWith(vaultPath)) {
    relativePath = relativePath.slice(vaultPath.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }
  }

  const encodedPath = relativePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  if (attachment.type === 'image') {
    return `![${attachment.name}](${encodedPath})`;
  }

  return `[${attachment.name}](${encodedPath})`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.slice(dotIndex);
}
