---
title: Themes
order: 1
---

# Themes

Noteriv ships with 10 built-in themes and supports unlimited custom themes. Themes control every color in the interface: editor background, text, borders, sidebar, status bar, code blocks, callouts, and preview rendering. Combined with 8 accent colors and configurable fonts, you can make Noteriv look exactly how you want.

## Built-In Themes

Every installation of Noteriv includes these 10 themes, ready to use without any configuration:

### Dark Themes

| Theme | Author | Description |
|---|---|---|
| **Catppuccin Mocha** | Catppuccin | Warm dark theme with pastel colors. This is the default theme. |
| **Nord** | Arctic Ice Studio | Arctic, north-bluish clean theme with muted, frost-inspired colors. |
| **Dracula** | Dracula Theme | Dark theme with vibrant, high-contrast colors. |
| **Solarized Dark** | Ethan Schoonover | Precision dark theme with carefully calibrated reduced contrast. |
| **One Dark** | Atom | Atom-inspired dark theme with balanced, muted tones. |
| **Gruvbox Dark** | morhetz | Retro groove color scheme with warm, earthy tones. |
| **Tokyo Night** | enkia | Clean dark theme inspired by the neon lights of Tokyo. |
| **GitHub Dark** | GitHub | GitHub's default dark theme with cool blue accents. |

### Light Themes

| Theme | Author | Description |
|---|---|---|
| **Catppuccin Latte** | Catppuccin | Light theme with soft pastel tones. Pairs well with the Mocha dark variant. |
| **Solarized Light** | Ethan Schoonover | Precision light theme with warm undertones and reduced contrast. |

## Switching Themes

To change the active theme:

1. Open **Settings** (`Ctrl+,` on desktop, or tap the gear icon on mobile).
2. Find the **Theme** dropdown in the Appearance section.
3. Select a theme from the list.

The theme applies immediately. Both the editor and the preview update in real time.

You can also switch themes from the **Command Palette** (`Ctrl+P`) by searching for "Theme" and selecting from the available options.

## Accent Colors

Independent of the theme, you can choose an accent color that tints interactive elements like links, buttons, selected text, active tabs, and toggle switches. Noteriv provides 8 accent colors:

| Color | Hex Value |
|---|---|
| **Blue** | `#89b4fa` |
| **Lavender** | `#b4befe` |
| **Mauve** | `#cba6f7` |
| **Pink** | `#f38ba8` |
| **Peach** | `#fab387` |
| **Yellow** | `#f9e2af` |
| **Green** | `#a6e3a1` |
| **Teal** | `#94e2d5` |

The default accent color is Blue. Change it in Settings under the Appearance section.

## Community Themes

Beyond the built-in themes, the Noteriv community maintains a collection of additional themes in the [NoterivThemes](https://github.com/thejacedev/NoterivThemes) GitHub repository.

To install a community theme:

1. Open **Settings** and navigate to the **Themes** section.
2. Click **Browse Community Themes**.
3. Preview and install themes directly from the community repository.
4. Installed themes appear in the theme picker alongside the built-in options.

Community themes are saved as JSON files in your vault's `.noteriv/themes/` directory. They follow the same format as custom themes (see [Custom Themes](./custom-themes.md)).

To submit your own theme to the community repository, see the repository's contributing guidelines.

## Custom Themes

You can create your own themes by writing a JSON file with 16 color properties and saving it to `.noteriv/themes/` in your vault. Custom themes appear in the theme picker alongside built-in and community themes.

See [Custom Themes](./custom-themes.md) for the full JSON format and a step-by-step guide.

## CSS Snippets

For fine-grained visual adjustments that go beyond what themes control, you can use CSS snippets. Snippets are small CSS files that override specific styles without replacing the entire theme. For example, you could adjust the editor line spacing, change the font for code blocks, or hide the status bar.

See [CSS Snippets](./css-snippets.md) for details.

## Theme Colors Reference

Every theme defines the following 16 color properties (plus 2 scrollbar colors):

| Property | Purpose |
|---|---|
| `bgPrimary` | Main editor and content background |
| `bgSecondary` | Sidebar and panel backgrounds |
| `bgTertiary` | Hover states, active items, input backgrounds |
| `border` | Borders between panels, dividers, input outlines |
| `textPrimary` | Main body text and headings |
| `textSecondary` | Secondary text (sidebar items, metadata) |
| `textMuted` | Muted text (placeholders, timestamps, line numbers) |
| `accent` | Primary accent for links, buttons, active states |
| `green` | Success indicators, inserted diff lines, tags |
| `red` | Error indicators, removed diff lines, danger callouts |
| `yellow` | Warning indicators, warning callouts, highlights |
| `blue` | Info indicators, info callouts, links |
| `mauve` | Purple accents, code keywords, special callouts |
| `peach` | Orange accents, numbers, certain syntax elements |
| `teal` | Teal accents, strings, success callouts |
| `pink` | Pink accents, decorative elements |
| `scrollbar` | Scrollbar track color |
| `scrollbarHover` | Scrollbar thumb color on hover |

These colors are applied as CSS custom properties on the root element, so they cascade throughout the entire application. Plugins and CSS snippets can reference them using `var(--bg-primary)`, `var(--text-muted)`, and so on.

## How Themes Are Applied

When you select a theme, Noteriv sets CSS custom properties on the `:root` element:

```css
:root {
  --bg-primary: #1e1e2e;
  --bg-secondary: #181825;
  --bg-tertiary: #313244;
  --border: #45475a;
  --text-primary: #cdd6f4;
  /* ... and so on for all 18 properties */
}
```

All UI components reference these variables instead of hard-coded colors. This means themes apply instantly without a page reload, and custom CSS snippets can rely on these variables to stay compatible with any theme.
