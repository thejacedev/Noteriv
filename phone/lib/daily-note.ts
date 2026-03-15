import { File, Directory } from 'expo-file-system';
import { writeFile, fileExists, createDir } from '@/lib/file-system';

/**
 * Get or create today's daily note.
 *
 * Daily notes are stored as `YYYY-MM-DD.md`. The function first checks for
 * a `DailyNotes/` subdirectory; if it exists, the note is placed there.
 * Otherwise the note is placed in the vault root.
 *
 * Returns the file path of the daily note.
 */
export async function getOrCreateDailyNote(
  vaultPath: string
): Promise<string> {
  const notePath = getDailyNotePath(vaultPath);

  if (!fileExists(notePath)) {
    const parentDir = notePath.slice(0, notePath.lastIndexOf('/'));
    createDir(parentDir);

    const today = new Date();
    const title = formatDateLong(today);
    const content = `# ${title}\n\n`;
    writeFile(notePath, content);
  }

  return notePath;
}

/**
 * Get the path for today's daily note.
 *
 * If a `DailyNotes/` directory exists in the vault, the path will point
 * there. Otherwise it points to the vault root.
 */
export function getDailyNotePath(vaultPath: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath.slice(0, -1) : vaultPath;
  const dateStr = formatDateShort(new Date());
  const fileName = `${dateStr}.md`;

  const dailyNotesDir = `${base}/DailyNotes`;
  const dir = new Directory(dailyNotesDir);

  if (dir.exists) {
    return `${dailyNotesDir}/${fileName}`;
  }

  return `${base}/${fileName}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatDateShort(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLong(date: Date): string {
  const weekday = date.toLocaleString('en-US', { weekday: 'long' });
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}
