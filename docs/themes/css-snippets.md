---
title: CSS Snippets
order: 3
---

# CSS Snippets

CSS snippets let you fine-tune the visual appearance of Noteriv beyond what themes control. A snippet is a small CSS file that overrides specific styles. You can toggle individual snippets on and off without affecting each other, making it easy to experiment with visual changes.

## How Snippets Work

Each snippet is a `.css` file stored in your vault's `.noteriv/snippets/` directory. When a snippet is enabled, its CSS is injected into the application's `<head>` as a `<style>` element. This means snippets can override any CSS rule in the interface, from font sizes and spacing to hiding UI elements entirely.

Snippets are applied after the theme, so they take precedence over theme styles. Multiple enabled snippets are applied in alphabetical order by filename.

## Creating a Snippet

### From Settings

1. Open **Settings** and navigate to the **CSS Snippets** section.
2. Click **New Snippet**.
3. Enter a name for the snippet (e.g., "Wider Editor").
4. Write your CSS in the editor.
5. Click **Save**.

The snippet is saved as a `.css` file in `.noteriv/snippets/` and is initially disabled.

### Manually

Create a `.css` file directly in your vault's `.noteriv/snippets/` directory:

```
your-vault/
  .noteriv/
    snippets/
      wider-editor.css
      custom-fonts.css
      hide-statusbar.css
```

The filename (without the `.css` extension) becomes the snippet ID. The display name is derived from the filename by replacing hyphens and underscores with spaces and capitalizing words.

## Enabling and Disabling Snippets

Open **Settings** > **CSS Snippets** to see all available snippets. Each one has a toggle switch. Enable a snippet to apply it immediately. Disable it to remove its styles. Changes take effect in real time without a restart.

The enabled/disabled state is stored in `.noteriv/snippet-config.json`:

```json
{
  "enabled": ["wider-editor", "custom-fonts"]
}
```

## Example Snippets

### Wider Editor

Make the editor content area wider by adjusting the max-width:

```css
/* Wider editor content */
.editor-container {
  max-width: 900px;
}

.cm-editor .cm-content {
  max-width: 900px;
}
```

### Custom Code Font

Change the font used in code blocks and the source editor:

```css
/* Use a different monospace font */
.cm-editor,
pre code,
code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}
```

### Larger Headings

Increase the size of headings in the preview:

```css
/* Bigger headings in preview */
.markdown-preview h1 { font-size: 2.4em; }
.markdown-preview h2 { font-size: 1.9em; }
.markdown-preview h3 { font-size: 1.5em; }
```

### Hide Status Bar

Remove the status bar at the bottom of the window:

```css
/* Hide the status bar */
.status-bar {
  display: none !important;
}
```

### Rounded Callouts

Add rounded corners to callout blocks:

```css
/* Rounded callout boxes */
.callout {
  border-radius: 12px;
  overflow: hidden;
}
```

### Custom Scrollbar

Style the scrollbar to be thinner:

```css
/* Thin scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-thumb {
  border-radius: 3px;
}
```

### Dimmer Sidebar

Reduce the brightness of the sidebar relative to the editor:

```css
/* Subdued sidebar */
.sidebar {
  opacity: 0.85;
}

.sidebar:hover {
  opacity: 1;
}
```

## Using Theme Variables

Snippets can reference the current theme's CSS custom properties. This makes your snippets compatible with any theme:

```css
/* Use theme colors in custom styles */
.my-custom-element {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.my-custom-element:hover {
  background: var(--accent);
  color: var(--bg-primary);
}
```

Available CSS variables from the active theme:

| Variable | Purpose |
|---|---|
| `--bg-primary` | Main background |
| `--bg-secondary` | Panel backgrounds |
| `--bg-tertiary` | Hover/active backgrounds |
| `--border` | Borders and dividers |
| `--text-primary` | Main text |
| `--text-secondary` | Secondary text |
| `--text-muted` | Muted text |
| `--accent` | Accent color (set by accent color picker) |
| `--green`, `--red`, `--yellow`, `--blue` | Semantic colors |
| `--mauve`, `--peach`, `--teal`, `--pink` | Additional accent colors |
| `--scrollbar`, `--scrollbar-hover` | Scrollbar colors |

## Community Snippets

The [NoterivSnippets](https://github.com/thejacedev/NoterivSnippets) repository hosts a curated collection of community-contributed CSS snippets. You can browse and install them from Settings:

1. Open **Settings** > **CSS Snippets**.
2. Click **Browse Community Snippets**.
3. Preview snippets and click **Install** to add them to your vault.

Installed community snippets are saved to `.noteriv/snippets/` just like manually created ones. You can edit them after installation.

Community snippets are organized by category:

| Category | Examples |
|---|---|
| Editor | Wider editor, line spacing, custom cursor |
| Typography | Custom fonts, heading sizes, paragraph spacing |
| Sidebar | Compact file tree, colored folders, icon tweaks |
| Preview | Callout styles, table formatting, image borders |
| UI | Hidden elements, custom status bar, tab styling |

To contribute a snippet to the community repository, follow the contributing guidelines in the repository.

## Editing Snippets

To edit an existing snippet:

1. Open **Settings** > **CSS Snippets**.
2. Click the **Edit** button next to the snippet.
3. Modify the CSS in the editor.
4. Click **Save**.

Changes apply immediately if the snippet is enabled.

You can also edit the `.css` files directly in any text editor. The app picks up file changes the next time you open the snippets settings panel.

## Deleting Snippets

To delete a snippet:

1. Open **Settings** > **CSS Snippets**.
2. Click the **Delete** button next to the snippet.
3. Confirm the deletion.

This removes the `.css` file from `.noteriv/snippets/` and removes it from the enabled list. The change takes effect immediately.

## Order of Application

Styles are applied in this order:

1. **Base styles** -- Noteriv's built-in CSS.
2. **Theme** -- The active theme's CSS custom properties.
3. **Accent color** -- The selected accent color override.
4. **CSS snippets** -- Enabled snippets in alphabetical order by filename.

Because snippets come last, they can override anything. Use `!important` only when necessary, as it can make it harder to override your snippet with another one.

## Tips

- Keep snippets small and focused. One snippet per visual change makes it easy to toggle individual tweaks.
- Name your snippet files descriptively: `wider-editor.css` is better than `fix.css`.
- Test snippets with multiple themes to make sure they look good everywhere. Use `var(--bg-primary)` instead of hard-coded colors.
- If a snippet causes visual issues, disable it from Settings. If you cannot access Settings, delete the `.css` file from `.noteriv/snippets/` manually.
