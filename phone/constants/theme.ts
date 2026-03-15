// --- Theme type definitions ---

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
}

export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
}

// --- Built-in themes ---

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    type: 'dark',
    colors: {
      bgPrimary: '#1e1e2e',
      bgSecondary: '#181825',
      bgTertiary: '#313244',
      border: '#45475a',
      textPrimary: '#cdd6f4',
      textSecondary: '#bac2de',
      textMuted: '#6c7086',
      accent: '#89b4fa',
      green: '#a6e3a1',
      red: '#f38ba8',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      mauve: '#cba6f7',
      peach: '#fab387',
      teal: '#94e2d5',
      pink: '#f5c2e7',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    type: 'light',
    colors: {
      bgPrimary: '#eff1f5',
      bgSecondary: '#e6e9ef',
      bgTertiary: '#ccd0da',
      border: '#bcc0cc',
      textPrimary: '#4c4f69',
      textSecondary: '#5c5f77',
      textMuted: '#9ca0b0',
      accent: '#1e66f5',
      green: '#40a02b',
      red: '#d20f39',
      yellow: '#df8e1d',
      blue: '#1e66f5',
      mauve: '#8839ef',
      peach: '#fe640b',
      teal: '#179299',
      pink: '#ea76cb',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    type: 'dark',
    colors: {
      bgPrimary: '#2e3440',
      bgSecondary: '#272c36',
      bgTertiary: '#3b4252',
      border: '#434c5e',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      textMuted: '#7b88a1',
      accent: '#88c0d0',
      green: '#a3be8c',
      red: '#bf616a',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      mauve: '#b48ead',
      peach: '#d08770',
      teal: '#8fbcbb',
      pink: '#b48ead',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    colors: {
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      bgTertiary: '#343746',
      border: '#44475a',
      textPrimary: '#f8f8f2',
      textSecondary: '#e2e2dc',
      textMuted: '#6272a4',
      accent: '#bd93f9',
      green: '#50fa7b',
      red: '#ff5555',
      yellow: '#f1fa8c',
      blue: '#8be9fd',
      mauve: '#bd93f9',
      peach: '#ffb86c',
      teal: '#8be9fd',
      pink: '#ff79c6',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    type: 'dark',
    colors: {
      bgPrimary: '#002b36',
      bgSecondary: '#00212b',
      bgTertiary: '#073642',
      border: '#2a4f5a',
      textPrimary: '#839496',
      textSecondary: '#93a1a1',
      textMuted: '#586e75',
      accent: '#268bd2',
      green: '#859900',
      red: '#dc322f',
      yellow: '#b58900',
      blue: '#268bd2',
      mauve: '#6c71c4',
      peach: '#cb4b16',
      teal: '#2aa198',
      pink: '#d33682',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    type: 'light',
    colors: {
      bgPrimary: '#fdf6e3',
      bgSecondary: '#eee8d5',
      bgTertiary: '#e0dbc8',
      border: '#d3cdb8',
      textPrimary: '#657b83',
      textSecondary: '#586e75',
      textMuted: '#93a1a1',
      accent: '#268bd2',
      green: '#859900',
      red: '#dc322f',
      yellow: '#b58900',
      blue: '#268bd2',
      mauve: '#6c71c4',
      peach: '#cb4b16',
      teal: '#2aa198',
      pink: '#d33682',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    type: 'dark',
    colors: {
      bgPrimary: '#282c34',
      bgSecondary: '#21252b',
      bgTertiary: '#2c313c',
      border: '#3e4452',
      textPrimary: '#abb2bf',
      textSecondary: '#9da5b4',
      textMuted: '#636d83',
      accent: '#61afef',
      green: '#98c379',
      red: '#e06c75',
      yellow: '#e5c07b',
      blue: '#61afef',
      mauve: '#c678dd',
      peach: '#d19a66',
      teal: '#56b6c2',
      pink: '#c678dd',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    type: 'dark',
    colors: {
      bgPrimary: '#282828',
      bgSecondary: '#1d2021',
      bgTertiary: '#3c3836',
      border: '#504945',
      textPrimary: '#ebdbb2',
      textSecondary: '#d5c4a1',
      textMuted: '#928374',
      accent: '#83a598',
      green: '#b8bb26',
      red: '#fb4934',
      yellow: '#fabd2f',
      blue: '#83a598',
      mauve: '#d3869b',
      peach: '#fe8019',
      teal: '#8ec07c',
      pink: '#d3869b',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    type: 'dark',
    colors: {
      bgPrimary: '#1a1b26',
      bgSecondary: '#16161e',
      bgTertiary: '#24283b',
      border: '#3b4261',
      textPrimary: '#c0caf5',
      textSecondary: '#a9b1d6',
      textMuted: '#565f89',
      accent: '#7aa2f7',
      green: '#9ece6a',
      red: '#f7768e',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      mauve: '#bb9af7',
      peach: '#ff9e64',
      teal: '#73daca',
      pink: '#bb9af7',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    type: 'dark',
    colors: {
      bgPrimary: '#0d1117',
      bgSecondary: '#010409',
      bgTertiary: '#161b22',
      border: '#30363d',
      textPrimary: '#e6edf3',
      textSecondary: '#c9d1d9',
      textMuted: '#7d8590',
      accent: '#58a6ff',
      green: '#3fb950',
      red: '#f85149',
      yellow: '#d29922',
      blue: '#58a6ff',
      mauve: '#bc8cff',
      peach: '#f0883e',
      teal: '#39d353',
      pink: '#db61a2',
    },
  },
];

// --- Helpers ---

export function getTheme(id: string): ThemeColors {
  const theme = BUILT_IN_THEMES.find((t) => t.id === id);
  return theme?.colors ?? BUILT_IN_THEMES[0].colors;
}

// --- Backward compatibility ---

// Legacy palette shape matching the old CatppuccinMocha / CatppuccinLatte exports
const mochaTheme = BUILT_IN_THEMES[0].colors;
const latteTheme = BUILT_IN_THEMES[1].colors;

export const CatppuccinMocha = {
  base: mochaTheme.bgPrimary,
  mantle: mochaTheme.bgSecondary,
  crust: '#11111b',
  surface0: mochaTheme.bgTertiary,
  surface1: mochaTheme.border,
  surface2: '#585b70',
  overlay0: mochaTheme.textMuted,
  overlay1: '#7f849c',
  overlay2: '#9399b2',
  subtext0: '#a6adc8',
  subtext1: mochaTheme.textSecondary,
  text: mochaTheme.textPrimary,
  lavender: '#b4befe',
  blue: mochaTheme.blue,
  sapphire: '#74c7ec',
  sky: '#89dceb',
  teal: mochaTheme.teal,
  green: mochaTheme.green,
  yellow: mochaTheme.yellow,
  peach: mochaTheme.peach,
  maroon: '#eba0ac',
  red: mochaTheme.red,
  mauve: mochaTheme.mauve,
  pink: mochaTheme.pink,
  flamingo: '#f2cdcd',
  rosewater: '#f5e0dc',
};

export const CatppuccinLatte = {
  base: latteTheme.bgPrimary,
  mantle: latteTheme.bgSecondary,
  crust: '#dce0e8',
  surface0: latteTheme.bgTertiary,
  surface1: latteTheme.border,
  surface2: '#acb0be',
  overlay0: latteTheme.textMuted,
  overlay1: '#8c8fa1',
  overlay2: '#7c7f93',
  subtext0: '#6c6f85',
  subtext1: latteTheme.textSecondary,
  text: latteTheme.textPrimary,
  lavender: '#7287fd',
  blue: latteTheme.blue,
  sapphire: '#209fb5',
  sky: '#04a5e5',
  teal: latteTheme.teal,
  green: latteTheme.green,
  yellow: latteTheme.yellow,
  peach: latteTheme.peach,
  maroon: '#e64553',
  red: latteTheme.red,
  mauve: latteTheme.mauve,
  pink: latteTheme.pink,
  flamingo: '#dd7878',
  rosewater: '#dc8a78',
};

export type ThemePalette = typeof CatppuccinMocha;

export const AccentColors = {
  blue: { dark: '#89b4fa', light: '#1e66f5' },
  lavender: { dark: '#b4befe', light: '#7287fd' },
  mauve: { dark: '#cba6f7', light: '#8839ef' },
  pink: { dark: '#f5c2e7', light: '#ea76cb' },
  peach: { dark: '#fab387', light: '#fe640b' },
  yellow: { dark: '#f9e2af', light: '#df8e1d' },
  green: { dark: '#a6e3a1', light: '#40a02b' },
  teal: { dark: '#94e2d5', light: '#179299' },
} as const;

export const Themes = {
  'catppuccin-mocha': CatppuccinMocha,
  'catppuccin-latte': CatppuccinLatte,
} as const;

export type ThemeId = keyof typeof Themes;
