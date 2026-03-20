---
title: Focus Mode
order: 6
---

# Focus Mode

Focus mode is a distraction-reduction feature that narrows your visual attention to the line you are currently writing. It dims all lines except the active one and vertically centers your typing position in the viewport. Combined with Zen mode, which hides the application chrome, it creates a minimal writing environment designed for sustained concentration.

## How Focus Mode Works

When focus mode is enabled, the editor applies two visual changes:

### Line Dimming

Every line in the document except the one containing the cursor is rendered at reduced opacity. The exact opacity value is tuned to make surrounding lines legible enough to maintain context but dim enough to draw your eyes to the active line. The dimming is applied via CSS opacity on the CodeMirror line elements, so it works consistently across all themes.

The transition between dimmed and active states is instantaneous -- there is no fade animation, which would be distracting during fast typing or cursor movement.

### Vertical Centering

The editor viewport scrolls to keep the active line at the vertical center of the visible area. As you type and the cursor moves to new lines, the viewport scrolls smoothly to re-center. This means your eyes stay in a fixed position on the screen and the text moves to you, rather than you chasing the cursor down the page.

The centering uses CodeMirror's `scrollIntoView` with a custom margin calculation that accounts for the editor height. On short documents where the content does not fill the viewport, the centering is approximate -- the editor does not add artificial padding above or below the content.

## Enabling Focus Mode

### Keyboard Shortcut

Press `Ctrl+Shift+D` to toggle focus mode on or off. The shortcut works regardless of the current view mode.

### Command Palette

Open the command palette (`Ctrl+P`) and search for "Toggle Focus Mode" or "Focus Mode". Select the command to toggle the mode.

### Context Menu

Right-click inside the editor and select **Focus Mode** from the context menu. A checkmark indicates whether focus mode is currently active.

### Status Bar

When focus mode is active, a small indicator appears in the status bar to remind you that it is on.

## Zen Mode

Zen mode takes focus mode further by hiding all application UI except the editor itself. When Zen mode is active:

- The **sidebar** (file explorer, search panel, tag browser) is hidden.
- The **tab bar** is hidden.
- The **status bar** is hidden.
- The **formatting toolbar** is hidden.
- The editor expands to fill the entire window.
- Focus mode's line dimming and vertical centering are automatically enabled.

This creates a fullscreen-like writing environment where the only visible element is your text.

### Enabling Zen Mode

- **Keyboard shortcut**: Press `Ctrl+Shift+E` to toggle Zen mode.
- **Command palette**: Search for "Toggle Zen Mode" or "Zen Mode".
- **Context menu**: Right-click in the editor and select **Zen Mode**.

### Exiting Zen Mode

Press `Ctrl+Shift+E` again to exit Zen mode and restore all UI elements. You can also press `Escape` to exit Zen mode. All hidden panels are restored to their previous state -- if the sidebar was open before entering Zen mode, it will be open again when you exit.

## Focus Mode with View Modes

Focus mode works with all three editor view modes, though the experience differs slightly:

### Live Mode + Focus

This is the most common combination. You write in live mode with inline rendering, and focus mode dims the rendered lines around your cursor while centering the active (raw Markdown) line. The rendered lines are still readable despite the dimming, so you maintain a sense of the surrounding formatted content.

### Source Mode + Focus

In source mode, focus mode dims the syntax-highlighted lines around the cursor. This can be particularly effective when working on a long document, as the raw Markdown for surrounding lines blends into the background and the active line stands out clearly.

### View Mode + Focus

Focus mode has limited utility in view mode since the document is read-only. However, it can be useful for focused reading -- only the paragraph or heading at your scroll position is highlighted, creating a reading guide effect. In view mode, "active line" is determined by the element nearest to the viewport center.

## Multi-Cursor Behavior

When multiple cursors are active, focus mode highlights all lines that contain a cursor. The dimming is applied to all other lines. Vertical centering uses the primary cursor's position.

## Focus Mode in Split Editor

Focus mode is per-pane. You can enable it in one pane and leave it off in the other. This is useful when you want focused writing in your main editing pane but full visibility in a reference pane.

When both panes have focus mode enabled, each pane independently dims and centers based on its own cursor position.

## Configuration

Focus mode settings are available in Settings > Editor:

### Dim Intensity

Control how much the non-active lines are dimmed. The default is 70% opacity reduction. You can adjust this from 50% (lightly dimmed) to 90% (heavily dimmed) depending on your preference and ambient lighting conditions.

### Typewriter Scrolling

The vertical centering behavior is sometimes called "typewriter scrolling." You can disable it independently of line dimming if you want the dimming effect without the scroll behavior. When disabled, the editor scrolls normally and only the dimming effect is applied.

### Paragraph Mode

By default, focus mode highlights a single line. With paragraph mode enabled, the entire paragraph (contiguous block of non-blank lines) containing the cursor is highlighted, and everything else is dimmed. This is useful when writing prose, where sentences flow across multiple lines and you want to see the full paragraph you are working on.

## Keyboard Reference

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+D` | Toggle focus mode |
| `Ctrl+Shift+E` | Toggle Zen mode |
| `Escape` | Exit Zen mode (when active) |

## Tips

- **Use with a dark theme**: Focus mode's dimming effect is most visually striking on dark themes, where the contrast between the bright active line and the dimmed surroundings is pronounced.
- **Combine with Zen mode for drafting**: When writing a first draft, Zen mode removes every possible distraction and lets you focus entirely on getting words on the page.
- **Use paragraph mode for prose**: If you write long-form text, paragraph mode keeps the full context of your current thought visible.
- **Keep a reference pane open**: In split editor mode, enable focus mode only in the writing pane. The reference pane stays fully visible so you can glance at it without losing your focus flow.
- **Quick toggle**: If you only need focus mode occasionally, use the keyboard shortcut (`Ctrl+Shift+D`) to toggle it on for a writing session and off when you need to navigate or review the full document.
