export interface ThemeDefinition {
  id: string;
  name: string;
  author: string;
  version: string;
  description?: string;
  colors: ThemeColors;
}

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
  mauve: string;
  peach: string;
  teal: string;
  pink: string;
  scrollbar: string;
  scrollbarHover: string;
}

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    author: "Catppuccin",
    version: "1.0.0",
    description: "Warm dark theme with pastel colors",
    colors: {
      bgPrimary: "#1e1e2e",
      bgSecondary: "#181825",
      bgTertiary: "#313244",
      border: "#45475a",
      textPrimary: "#cdd6f4",
      textSecondary: "#bac2de",
      textMuted: "#6c7086",
      accent: "#89b4fa",
      green: "#a6e3a1",
      red: "#f38ba8",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      mauve: "#cba6f7",
      peach: "#fab387",
      teal: "#94e2d5",
      pink: "#f5c2e7",
      scrollbar: "#45475a",
      scrollbarHover: "#585b70",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    author: "Catppuccin",
    version: "1.0.0",
    description: "Light theme with soft pastel tones",
    colors: {
      bgPrimary: "#eff1f5",
      bgSecondary: "#e6e9ef",
      bgTertiary: "#ccd0da",
      border: "#bcc0cc",
      textPrimary: "#4c4f69",
      textSecondary: "#5c5f77",
      textMuted: "#9ca0b0",
      accent: "#1e66f5",
      green: "#40a02b",
      red: "#d20f39",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      mauve: "#8839ef",
      peach: "#fe640b",
      teal: "#179299",
      pink: "#ea76cb",
      scrollbar: "#bcc0cc",
      scrollbarHover: "#acb0be",
    },
  },
  {
    id: "nord",
    name: "Nord",
    author: "Arctic Ice Studio",
    version: "1.0.0",
    description: "Arctic, north-bluish clean theme",
    colors: {
      bgPrimary: "#2e3440",
      bgSecondary: "#272c36",
      bgTertiary: "#3b4252",
      border: "#434c5e",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textMuted: "#7b88a1",
      accent: "#88c0d0",
      green: "#a3be8c",
      red: "#bf616a",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      mauve: "#b48ead",
      peach: "#d08770",
      teal: "#8fbcbb",
      pink: "#b48ead",
      scrollbar: "#434c5e",
      scrollbarHover: "#4c566a",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    author: "Dracula Theme",
    version: "1.0.0",
    description: "Dark theme with vibrant colors",
    colors: {
      bgPrimary: "#282a36",
      bgSecondary: "#21222c",
      bgTertiary: "#343746",
      border: "#44475a",
      textPrimary: "#f8f8f2",
      textSecondary: "#e2e2dc",
      textMuted: "#6272a4",
      accent: "#bd93f9",
      green: "#50fa7b",
      red: "#ff5555",
      yellow: "#f1fa8c",
      blue: "#8be9fd",
      mauve: "#bd93f9",
      peach: "#ffb86c",
      teal: "#8be9fd",
      pink: "#ff79c6",
      scrollbar: "#44475a",
      scrollbarHover: "#6272a4",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    author: "Ethan Schoonover",
    version: "1.0.0",
    description: "Precision dark theme with reduced contrast",
    colors: {
      bgPrimary: "#002b36",
      bgSecondary: "#00212b",
      bgTertiary: "#073642",
      border: "#2a4f5a",
      textPrimary: "#839496",
      textSecondary: "#93a1a1",
      textMuted: "#586e75",
      accent: "#268bd2",
      green: "#859900",
      red: "#dc322f",
      yellow: "#b58900",
      blue: "#268bd2",
      mauve: "#6c71c4",
      peach: "#cb4b16",
      teal: "#2aa198",
      pink: "#d33682",
      scrollbar: "#073642",
      scrollbarHover: "#2a4f5a",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    author: "Ethan Schoonover",
    version: "1.0.0",
    description: "Precision light theme with warm undertones",
    colors: {
      bgPrimary: "#fdf6e3",
      bgSecondary: "#eee8d5",
      bgTertiary: "#e0dbc8",
      border: "#d3cdb8",
      textPrimary: "#657b83",
      textSecondary: "#586e75",
      textMuted: "#93a1a1",
      accent: "#268bd2",
      green: "#859900",
      red: "#dc322f",
      yellow: "#b58900",
      blue: "#268bd2",
      mauve: "#6c71c4",
      peach: "#cb4b16",
      teal: "#2aa198",
      pink: "#d33682",
      scrollbar: "#d3cdb8",
      scrollbarHover: "#c5bfa8",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    author: "Atom",
    version: "1.0.0",
    description: "Atom-inspired dark theme",
    colors: {
      bgPrimary: "#282c34",
      bgSecondary: "#21252b",
      bgTertiary: "#2c313c",
      border: "#3e4452",
      textPrimary: "#abb2bf",
      textSecondary: "#9da5b4",
      textMuted: "#636d83",
      accent: "#61afef",
      green: "#98c379",
      red: "#e06c75",
      yellow: "#e5c07b",
      blue: "#61afef",
      mauve: "#c678dd",
      peach: "#d19a66",
      teal: "#56b6c2",
      pink: "#c678dd",
      scrollbar: "#3e4452",
      scrollbarHover: "#4b5263",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    author: "morhetz",
    version: "1.0.0",
    description: "Retro groove color scheme",
    colors: {
      bgPrimary: "#282828",
      bgSecondary: "#1d2021",
      bgTertiary: "#3c3836",
      border: "#504945",
      textPrimary: "#ebdbb2",
      textSecondary: "#d5c4a1",
      textMuted: "#928374",
      accent: "#83a598",
      green: "#b8bb26",
      red: "#fb4934",
      yellow: "#fabd2f",
      blue: "#83a598",
      mauve: "#d3869b",
      peach: "#fe8019",
      teal: "#8ec07c",
      pink: "#d3869b",
      scrollbar: "#504945",
      scrollbarHover: "#665c54",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    author: "enkia",
    version: "1.0.0",
    description: "Clean dark theme inspired by Tokyo city lights",
    colors: {
      bgPrimary: "#1a1b26",
      bgSecondary: "#16161e",
      bgTertiary: "#24283b",
      border: "#3b4261",
      textPrimary: "#c0caf5",
      textSecondary: "#a9b1d6",
      textMuted: "#565f89",
      accent: "#7aa2f7",
      green: "#9ece6a",
      red: "#f7768e",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      mauve: "#bb9af7",
      peach: "#ff9e64",
      teal: "#73daca",
      pink: "#bb9af7",
      scrollbar: "#3b4261",
      scrollbarHover: "#545c7e",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    author: "GitHub",
    version: "1.0.0",
    description: "GitHub's default dark theme",
    colors: {
      bgPrimary: "#0d1117",
      bgSecondary: "#010409",
      bgTertiary: "#161b22",
      border: "#30363d",
      textPrimary: "#e6edf3",
      textSecondary: "#c9d1d9",
      textMuted: "#7d8590",
      accent: "#58a6ff",
      green: "#3fb950",
      red: "#f85149",
      yellow: "#d29922",
      blue: "#58a6ff",
      mauve: "#bc8cff",
      peach: "#f0883e",
      teal: "#39d353",
      pink: "#db61a2",
      scrollbar: "#30363d",
      scrollbarHover: "#484f58",
    },
  },
];

export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement.style;
  root.setProperty("--bg-primary", theme.colors.bgPrimary);
  root.setProperty("--bg-secondary", theme.colors.bgSecondary);
  root.setProperty("--bg-tertiary", theme.colors.bgTertiary);
  root.setProperty("--border", theme.colors.border);
  root.setProperty("--text-primary", theme.colors.textPrimary);
  root.setProperty("--text-secondary", theme.colors.textSecondary);
  root.setProperty("--text-muted", theme.colors.textMuted);
  root.setProperty("--green", theme.colors.green);
  root.setProperty("--red", theme.colors.red);
  root.setProperty("--yellow", theme.colors.yellow);
  root.setProperty("--blue", theme.colors.blue);
  root.setProperty("--mauve", theme.colors.mauve);
  root.setProperty("--peach", theme.colors.peach);
  root.setProperty("--teal", theme.colors.teal);
  root.setProperty("--pink", theme.colors.pink);
  root.setProperty("--scrollbar", theme.colors.scrollbar);
  root.setProperty("--scrollbar-hover", theme.colors.scrollbarHover);
}

export async function loadCustomThemes(vaultPath: string): Promise<ThemeDefinition[]> {
  if (!window.electronAPI) return [];
  const themesDir = `${vaultPath}/.noteriv/themes`;
  await window.electronAPI.createDir(themesDir);

  try {
    const entries = await window.electronAPI.readDir(themesDir);
    const themes: ThemeDefinition[] = [];
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await window.electronAPI.readFile(entry.path);
        if (raw) {
          const theme = JSON.parse(raw) as ThemeDefinition;
          if (theme.id && theme.name && theme.colors) {
            themes.push(theme);
          }
        }
      } catch { /* skip invalid */ }
    }
    return themes;
  } catch {
    return [];
  }
}

export async function saveCustomTheme(vaultPath: string, theme: ThemeDefinition): Promise<boolean> {
  if (!window.electronAPI) return false;
  const themesDir = `${vaultPath}/.noteriv/themes`;
  await window.electronAPI.createDir(themesDir);
  return window.electronAPI.writeFile(`${themesDir}/${theme.id}.json`, JSON.stringify(theme, null, 2));
}

export async function deleteCustomTheme(vaultPath: string, themeId: string): Promise<boolean> {
  if (!window.electronAPI) return false;
  return window.electronAPI.deleteFile(`${vaultPath}/.noteriv/themes/${themeId}.json`);
}

export function exportTheme(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

export function importTheme(json: string): ThemeDefinition | null {
  try {
    const theme = JSON.parse(json) as ThemeDefinition;
    if (!theme.id || !theme.name || !theme.colors || !theme.colors.bgPrimary) return null;
    return theme;
  } catch {
    return null;
  }
}

export function getDefaultTheme(): ThemeDefinition {
  return BUILT_IN_THEMES[0]; // Catppuccin Mocha
}
