import { readFile, readDir } from '@/lib/file-system';
import { FileEntry } from '@/types';

export interface TemplateEntry {
  name: string;
  path: string;
}

/**
 * List all .md files in {vaultPath}Templates/
 */
export function listTemplates(vaultPath: string): TemplateEntry[] {
  const templatesDir = vaultPath.endsWith('/')
    ? `${vaultPath}Templates`
    : `${vaultPath}/Templates`;

  const entries: FileEntry[] = readDir(templatesDir);
  const templates: TemplateEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory && entry.name.endsWith('.md')) {
      templates.push({
        name: entry.name.replace(/\.md$/, ''),
        path: entry.path,
      });
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load template content from a file path.
 */
export async function loadTemplate(path: string): Promise<string | null> {
  return readFile(path);
}

/**
 * Process template variables in content.
 *
 * Supported variables:
 * - {{date}}      - Current date (YYYY-MM-DD)
 * - {{time}}      - Current time (HH:MM)
 * - {{title}}     - Note title (provided or "Untitled")
 * - {{datetime}}  - Full date and time (YYYY-MM-DD HH:MM)
 * - {{weekday}}   - Day of the week (Monday, Tuesday, etc.)
 * - {{month}}     - Month name (January, February, etc.)
 * - {{year}}      - Four-digit year
 * - {{timestamp}} - Unix timestamp in milliseconds
 */
export function processTemplate(content: string, title?: string): string {
  const now = new Date();

  const year = now.getFullYear().toString();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const weekday = now.toLocaleString('en-US', { weekday: 'long' });
  const date = formatDate(now);
  const time = formatTime(now);

  const variables: Record<string, string> = {
    date,
    time,
    title: title ?? 'Untitled',
    datetime: `${date} ${time}`,
    weekday,
    month,
    year,
    timestamp: now.getTime().toString(),
  };

  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
  }

  return result;
}

/**
 * Returns the list of supported template variables with descriptions.
 */
export function getTemplateVariables(): { variable: string; description: string }[] {
  return [
    { variable: '{{date}}', description: 'Current date (YYYY-MM-DD)' },
    { variable: '{{time}}', description: 'Current time (HH:MM)' },
    { variable: '{{title}}', description: 'Note title' },
    { variable: '{{datetime}}', description: 'Full date and time (YYYY-MM-DD HH:MM)' },
    { variable: '{{weekday}}', description: 'Day of the week (e.g. Monday)' },
    { variable: '{{month}}', description: 'Month name (e.g. January)' },
    { variable: '{{year}}', description: 'Four-digit year' },
    { variable: '{{timestamp}}', description: 'Unix timestamp in milliseconds' },
  ];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
