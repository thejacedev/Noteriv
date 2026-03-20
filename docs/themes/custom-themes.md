---
title: Custom Themes
order: 2
---

# Custom Themes

You can create your own Noteriv theme by writing a JSON file with your color definitions. Custom themes appear in the theme picker alongside the built-in themes, and they work on both desktop and mobile.

## Theme File Format

A theme is a JSON file with the following structure:

```json
{
  "id": "my-custom-theme",
  "name": "My Custom Theme",
  "author": "Your Name",
  "version": "1.0.0",
  "description": "A brief description of your theme.",
  "colors": {
    "bgPrimary": "#1a1b26",
    "bgSecondary": "#16161e",
    "bgTertiary": "#24283b",
    "border": "#3b4261",
    "textPrimary": "#c0caf5",
    "textSecondary": "#a9b1d6",
    "textMuted": "#565f89",
    "accent": "#7aa2f7",
    "green": "#9ece6a",
    "red": "#f7768e",
    "yellow": "#e0af68",
    "blue": "#7aa2f7",
    "mauve": "#bb9af7",
    "peach": "#ff9e64",
    "teal": "#73daca",
    "pink": "#bb9af7",
    "scrollbar": "#3b4261",
    "scrollbarHover": "#545c7e"
  }
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier for the theme. Use lowercase with hyphens (e.g., `my-custom-theme`). Must be unique across all installed themes. |
| `name` | string | Display name shown in the theme picker. |
| `author` | string | Your name or handle. |
| `version` | string | Semantic version number (e.g., `1.0.0`). |
| `colors` | object | An object containing all 18 color properties (see below). |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `description` | string | A short description of the theme's aesthetic. Shown in the theme browser. |

### Color Properties

Every theme must define all 18 color properties. Values must be valid CSS color strings. Hex codes are recommended for consistency, but `rgb()`, `hsl()`, and named colors also work.

| Property | Purpose | Example |
|---|---|---|
| `bgPrimary` | Main editor background | `#1e1e2e` |
| `bgSecondary` | Sidebar and panel backgrounds | `#181825` |
| `bgTertiary` | Hover states, active items, and input field backgrounds | `#313244` |
| `border` | Borders between UI sections, input outlines, and dividers | `#45475a` |
| `textPrimary` | Main body text, headings, and editor content | `#cdd6f4` |
| `textSecondary` | Secondary text like sidebar items, file names, and metadata | `#bac2de` |
| `textMuted` | Muted text like placeholders, timestamps, and line numbers | `#6c7086` |
| `accent` | Primary interactive color for links, buttons, and selections | `#89b4fa` |
| `green` | Success states, git additions, and tag indicators | `#a6e3a1` |
| `red` | Error states, git deletions, and danger callout borders | `#f38ba8` |
| `yellow` | Warning indicators, highlights (`==text==`), and warning callouts | `#f9e2af` |
| `blue` | Info callouts, external links, and certain UI accents | `#89b4fa` |
| `mauve` | Purple accents used for code keywords and special callout types | `#cba6f7` |
| `peach` | Orange accents for numbers, strings, and decorative elements | `#fab387` |
| `teal` | Teal accents for strings, success states, and secondary accents | `#94e2d5` |
| `pink` | Pink accents for decorative elements and certain syntax highlights | `#f5c2e7` |
| `scrollbar` | Scrollbar track background color | `#45475a` |
| `scrollbarHover` | Scrollbar thumb color when hovered | `#585b70` |

## Installing a Custom Theme

Save your theme JSON file to your vault's `.noteriv/themes/` directory:

```
your-vault/
  .noteriv/
    themes/
      my-custom-theme.json
```

The filename should match the `id` field in the JSON (e.g., `my-custom-theme.json` for a theme with `"id": "my-custom-theme"`). After saving the file, the theme will appear in the Settings theme picker the next time you open Settings or reload the app.

## Creating a Theme Step by Step

### 1. Start with an Existing Theme

The easiest way to create a custom theme is to start from one of the built-in themes and modify the colors. Here is the Catppuccin Mocha theme as a starting point:

```json
{
  "id": "my-dark-theme",
  "name": "My Dark Theme",
  "author": "Your Name",
  "version": "1.0.0",
  "description": "A personalized dark theme.",
  "colors": {
    "bgPrimary": "#1e1e2e",
    "bgSecondary": "#181825",
    "bgTertiary": "#313244",
    "border": "#45475a",
    "textPrimary": "#cdd6f4",
    "textSecondary": "#bac2de",
    "textMuted": "#6c7086",
    "accent": "#89b4fa",
    "green": "#a6e3a1",
    "red": "#f38ba8",
    "yellow": "#f9e2af",
    "blue": "#89b4fa",
    "mauve": "#cba6f7",
    "peach": "#fab387",
    "teal": "#94e2d5",
    "pink": "#f5c2e7",
    "scrollbar": "#45475a",
    "scrollbarHover": "#585b70"
  }
}
```

### 2. Adjust Background Colors

Start by changing the three background colors (`bgPrimary`, `bgSecondary`, `bgTertiary`) and the border color. These four properties have the biggest visual impact.

- `bgPrimary` should be your main background color.
- `bgSecondary` should be slightly darker (for dark themes) or slightly lighter (for light themes) than `bgPrimary`.
- `bgTertiary` should be between `bgPrimary` and the border color, used for hover and active states.

### 3. Adjust Text Colors

Set your three text colors from highest to lowest contrast:

- `textPrimary` is your main reading text. It should have strong contrast against `bgPrimary`.
- `textSecondary` is for less prominent text. Slightly lower contrast than `textPrimary`.
- `textMuted` is for the least important text. Should be readable but noticeably dimmer.

### 4. Choose Accent Colors

The eight accent colors (`accent`, `green`, `red`, `yellow`, `blue`, `mauve`, `peach`, `teal`, `pink`) should complement your background and text colors. They are used for syntax highlighting, callouts, tags, diff markers, and UI elements.

For dark themes, use lighter accent colors. For light themes, use darker accent colors. Make sure each accent color is distinguishable from the others.

### 5. Test Your Theme

Switch to your theme in Settings and check these screens:

- **Editor**: Does text have enough contrast? Are code blocks readable?
- **Preview**: Do callouts, code blocks, and math render clearly?
- **Sidebar**: Is the file tree easy to scan?
- **Graph view**: Are nodes and edges visible?
- **Settings modal**: Are labels and inputs clear?

## Exporting and Sharing

To share your theme with others, distribute the JSON file. They can install it by placing it in their vault's `.noteriv/themes/` directory.

To submit your theme to the community repository, see the contributing guidelines at [NoterivThemes](https://github.com/thejacedev/NoterivThemes).

## Importing a Theme

If someone shares a theme JSON file with you:

1. Copy the `.json` file to `your-vault/.noteriv/themes/`.
2. Open Settings and select the theme from the picker.

You can also import themes through the Settings UI by clicking **Import Theme** and pasting the JSON content.

## Deleting a Custom Theme

To remove a custom theme, delete its JSON file from `.noteriv/themes/` or use the **Delete** button next to the theme in Settings. Built-in themes cannot be deleted.
