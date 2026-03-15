import { readDir, readFile, writeFile, createDir, deleteFile } from '@/lib/file-system';
import { ThemeDefinition, ThemeColors } from '@/constants/theme';

// --- Types ---

export interface CommunityThemeEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  type: 'dark' | 'light';
  file: string;
  preview?: string[];
}

// --- Constants ---

const THEMES_URL = 'https://raw.githubusercontent.com/thejacedev/NoterivThemes/main';
const CUSTOM_THEMES_DIR = '.noteriv/themes';

// --- Helpers ---

function themesPath(vaultPath: string): string {
  return `${vaultPath}/${CUSTOM_THEMES_DIR}`;
}

function isValidThemeColors(obj: unknown): obj is ThemeColors {
  if (!obj || typeof obj !== 'object') return false;
  const requiredKeys: (keyof ThemeColors)[] = [
    'bgPrimary', 'bgSecondary', 'bgTertiary', 'border',
    'textPrimary', 'textSecondary', 'textMuted', 'accent',
    'green', 'red', 'yellow', 'blue', 'mauve', 'peach', 'teal', 'pink',
  ];
  const o = obj as Record<string, unknown>;
  return requiredKeys.every((key) => typeof o[key] === 'string');
}

// --- Community Themes ---

export async function fetchCommunityThemes(): Promise<CommunityThemeEntry[]> {
  try {
    const res = await fetch(`${THEMES_URL}/manifest.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.themes ?? data) as CommunityThemeEntry[];
  } catch {
    return [];
  }
}

export async function installCommunityTheme(
  vaultPath: string,
  entry: CommunityThemeEntry
): Promise<ThemeDefinition | null> {
  const dir = themesPath(vaultPath);
  createDir(dir);

  try {
    const res = await fetch(`${THEMES_URL}/${entry.file}`);
    if (!res.ok) return null;

    const themeData = await res.json();

    // Validate the theme has proper colors
    if (!themeData.colors || !isValidThemeColors(themeData.colors)) {
      return null;
    }

    const theme: ThemeDefinition = {
      id: `custom-${entry.id}`,
      name: entry.name,
      type: entry.type,
      colors: themeData.colors as ThemeColors,
    };

    const filename = `${entry.id}.json`;
    writeFile(`${dir}/${filename}`, JSON.stringify(theme, null, 2));

    return theme;
  } catch {
    return null;
  }
}

// --- Custom / Installed Themes ---

export async function loadCustomThemes(vaultPath: string): Promise<ThemeDefinition[]> {
  const dir = themesPath(vaultPath);
  createDir(dir);

  const entries = readDir(dir);
  const themes: ThemeDefinition[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith('.json')) continue;

    const raw = await readFile(entry.path);
    if (!raw) continue;

    try {
      const theme = JSON.parse(raw) as ThemeDefinition;
      if (theme.id && theme.name && theme.colors && isValidThemeColors(theme.colors)) {
        themes.push(theme);
      }
    } catch {
      // Skip invalid theme files
    }
  }

  return themes.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteCustomTheme(vaultPath: string, themeId: string): boolean {
  const dir = themesPath(vaultPath);
  const entries = readDir(dir);

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith('.json')) continue;

    // We need to check if the file matches the theme id
    // Since we can't synchronously read, we use a naming convention
    const filenameId = `custom-${entry.name.replace(/\.json$/, '')}`;
    if (filenameId === themeId) {
      deleteFile(entry.path);
      return true;
    }
  }
  return false;
}
