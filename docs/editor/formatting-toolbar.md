---
title: Formatting Toolbar
order: 8
---

# Formatting Toolbar

The formatting toolbar is a row of buttons at the top of the editor area that provides quick access to common Markdown formatting operations. Each button either wraps the current text selection in the appropriate Markdown syntax or inserts a formatting template at the cursor position when no text is selected.

## Toolbar Location

The toolbar sits between the tab bar and the editor content area. It is visible in live mode and source mode. In view mode, the toolbar is hidden since the document is read-only. When Zen mode is active, the toolbar is also hidden to maximize the writing area.

## Formatting Actions

### Bold

- **Button**: **B** (bold icon)
- **Shortcut**: `Ctrl+B`
- **With selection**: Wraps the selected text in `**...**` delimiters. If the selection is already bold (surrounded by `**`), the delimiters are removed (toggle behavior).
- **Without selection**: Inserts `****` with the cursor positioned between the delimiters, ready for you to type the bold text.

### Italic

- **Button**: *I* (italic icon)
- **Shortcut**: `Ctrl+I`
- **With selection**: Wraps the selected text in `*...*` delimiters. If already italic, the delimiters are removed.
- **Without selection**: Inserts `**` with the cursor between the delimiters.

### Headings

- **Button**: H (heading icon with dropdown)
- **Behavior**: Clicking the button opens a dropdown menu with heading levels 1 through 6. Selecting a level prefixes the current line with the corresponding number of `#` characters followed by a space. If the line is already a heading, the level is changed to the selected one. Selecting the same level that is already applied removes the heading prefix.
- **Shortcut**: `Ctrl+1` through `Ctrl+6` set the heading level directly.

### Link

- **Button**: Link icon (chain)
- **Shortcut**: `Ctrl+K`
- **With selection**: Wraps the selected text in `[selected text](url)` syntax, with the cursor positioned on the `url` placeholder so you can type or paste the destination.
- **Without selection**: Inserts `[link text](url)` with `link text` selected, ready for you to type the display text.
- **Clipboard detection**: If the clipboard contains a URL when you invoke the link action with text selected, the URL is automatically inserted as the link destination, saving you a paste step.

### Image

- **Button**: Image icon
- **With selection**: Treats the selection as alt text and inserts `![selection](url)` with the cursor on the `url` placeholder.
- **Without selection**: Inserts `![alt text](url)` with `alt text` selected.

### Unordered List

- **Button**: Bullet list icon
- **Behavior**: Prefixes the current line (or each line in a multi-line selection) with `- `. If the line is already an unordered list item, the prefix is removed. This toggles list formatting on and off.
- **Nested lists**: If the cursor is inside an existing list item, the new item is inserted at the same indentation level.

### Ordered List

- **Button**: Numbered list icon
- **Behavior**: Prefixes the current line (or each selected line) with `1. `. Subsequent lines are numbered sequentially (`2. `, `3. `, etc.) when applied to a multi-line selection. If the lines are already an ordered list, the numbering is removed.

### Task List

- **Button**: Checkbox icon
- **Behavior**: Prefixes the current line with `- [ ] ` to create an unchecked task item. If the line is already a task item, the prefix is removed. If the task is checked (`- [x] `), clicking the button unchecks it (`- [ ] `). Applied to multi-line selections, each line gets a task prefix.

### Code (Inline)

- **Button**: `<>` icon
- **Shortcut**: `Ctrl+E`
- **With selection**: Wraps the selection in `` ` `` backtick delimiters. If already wrapped, the backticks are removed.
- **Without selection**: Inserts ` `` ` with the cursor between the backticks.

### Code Block

- **Button**: Code block icon (rectangular bracket)
- **Shortcut**: `Ctrl+Shift+K`
- **With selection**: Wraps the selection in a fenced code block (`` ``` `` on the lines above and below). The cursor is positioned after the opening fence to type the language identifier.
- **Without selection**: Inserts a fenced code block template with the cursor on the language line:
  ````
  ```language

  ```
  ````

### Blockquote

- **Button**: Quote icon (left quotation mark)
- **Behavior**: Prefixes the current line (or each selected line) with `> `. If already a blockquote, the prefix is removed. Applying to a line that is already quoted adds another level of nesting (`>> `).

### Table

- **Button**: Table icon (grid)
- **Behavior**: Inserts a table template at the cursor position with a configurable number of rows and columns. The default is a 3-column, 2-row table:

  ```markdown
  | Header 1 | Header 2 | Header 3 |
  | --- | --- | --- |
  | Cell | Cell | Cell |
  | Cell | Cell | Cell |
  ```

  The cursor is positioned on the first header cell, with "Header 1" selected for immediate replacement. Pressing `Tab` moves to the next cell.

### Horizontal Rule

- **Button**: Horizontal line icon
- **Behavior**: Inserts `---` on a new line at the cursor position, with blank lines above and below to ensure proper Markdown rendering. If the cursor is in the middle of a line, the rule is inserted on the next line.

### Highlight

- **Button**: Highlighter icon
- **Shortcut**: `Ctrl+Shift+H`
- **With selection**: Wraps the selected text in `==...==` delimiters. If already highlighted, the delimiters are removed.
- **Without selection**: Inserts `====` with the cursor between the delimiters.

### Math (Inline)

- **Button**: Sigma or formula icon
- **Shortcut**: `Ctrl+Shift+M`
- **With selection**: Wraps the selection in `$...$` delimiters for inline math.
- **Without selection**: Inserts `$$` with the cursor between the delimiters.
- **Block math**: Holding `Shift` while clicking the button (or using `Ctrl+Shift+Alt+M`) inserts a display math block with `$$` delimiters on separate lines.

## Toggle Behavior

All formatting actions that wrap text in delimiters support toggle behavior. If the selection is already wrapped in the relevant delimiters, the action removes them instead of adding a second layer. This applies to bold, italic, inline code, highlight, and math. The toolbar button appearance reflects the formatting state of the current selection -- for example, the bold button appears active/pressed when the cursor is inside bold text.

## Multi-Line Selections

When you select multiple lines and apply a formatting action:

- **Inline formatters** (bold, italic, code, highlight, math) wrap the entire selection, including line breaks.
- **Line-level formatters** (headings, lists, task lists, blockquotes) apply their prefix to each line independently.
- **Block formatters** (code block, table, horizontal rule) wrap or insert around the entire selection.

## Toolbar Customization

The toolbar can be customized in Settings > Editor:

- **Show/hide toolbar**: Toggle the toolbar visibility. Keyboard shortcuts still work when the toolbar is hidden.
- **Button order**: Drag buttons to reorder them.
- **Compact mode**: Reduce button padding for a more compact toolbar on smaller screens.

## Undo Integration

Every toolbar action is a single undo step. Pressing `Ctrl+Z` after applying a formatting action reverts it cleanly, restoring the original text and cursor position.

## Accessibility

Each toolbar button has a tooltip showing its name and keyboard shortcut. The buttons are keyboard-navigable with `Tab` and `Shift+Tab`, and activatable with `Enter` or `Space`. Screen readers announce the button name and its current state (active/inactive for toggle buttons).
