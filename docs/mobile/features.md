---
title: Mobile Features
order: 3
---

# Mobile Features

This page walks through every feature available in the Noteriv mobile app, with details on how each one works on a touch device.

## Editor

The mobile editor is a full-text `TextInput` with a formatting toolbar that slides in above the keyboard. The toolbar provides one-tap buttons for:

- **Bold** (`**text**`), **Italic** (`*text*`), **Strikethrough** (`~~text~~`)
- **Headings** (H1 through H6)
- **Links** (`[text](url)`), **Wiki-links** (`[[note name]]`)
- **Code** (inline `` `code` `` and fenced code blocks)
- **Lists** (unordered, ordered, task lists)
- **Blockquotes** (`> text`)
- **Highlight** (`==text==`)
- **Math** (inline `$...$` and block `$$...$$`)
- **Horizontal rule** (`---`)
- **Tables** (inserts a template table)

The toolbar scrolls horizontally, so all buttons are accessible even on narrow screens. Tap a formatting button to wrap the current selection, or insert the formatting template at the cursor if nothing is selected.

The editor supports auto-save. Changes are written to disk automatically after a configurable interval (default: 30 seconds). You can also save manually from the menu.

## Markdown Preview

Switch from editing to preview mode by tapping the eye icon in the toolbar. The preview renders your markdown as styled HTML with full support for:

- **Headings** with proper hierarchy and sizes
- **Bold**, **italic**, **strikethrough**, and **==highlighted==** text
- **Inline code** and **fenced code blocks** with syntax highlighting for 12 languages (JavaScript, TypeScript, Python, Rust, Go, Java, C, C++, HTML, CSS, JSON, YAML)
- **Math** rendered via KaTeX -- both inline `$E = mc^2$` and display-mode `$$\int_0^\infty$$`
- **Mermaid diagrams** rendered in a WebView -- flowcharts, sequence diagrams, Gantt charts, and more
- **Tables** with interactive checkboxes that update the underlying markdown when tapped
- **Task lists** with toggleable checkboxes
- **Callouts** in all 14 types (note, tip, info, warning, danger, bug, example, quote, success, question, abstract, todo, failure, important) with colored borders and icons
- **Wiki-links** rendered as tappable links that navigate to the target note
- **Embeds** (`![[note]]`) that inline the content of another note
- **Images** with support for width and height syntax (`![alt|400x300](url)`)
- **Footnotes** with linked references
- **Definition lists** and **superscript/subscript** text
- **Table of contents** via `[TOC]` placeholder
- **Dataview blocks** that execute queries and render results as tables or lists

The preview adapts to your current theme, so colors, fonts, and spacing all match your chosen appearance.

## Wiki-Link Navigation

Tapping a `[[wiki-link]]` in the preview navigates you to the linked note. If the linked note does not exist, the app offers to create it. The resolver searches for notes by name across all folders in your vault, so you do not need to specify paths.

Aliased links like `[[actual-note|display text]]` work as expected -- the display text is shown in the preview, and tapping it opens `actual-note.md`.

## Board View

Notes that contain a `board: true` frontmatter field are rendered as a Kanban board instead of a regular note. The board parses headings as columns and list items as cards. You can move cards between columns by tapping and selecting a target column from a context menu.

Board view is useful for project management, sprint planning, or any workflow where you want to visualize items moving through stages.

## Graph View

The graph view renders an interactive network diagram of your vault. Each note is a node, and wiki-links between notes create edges. The graph uses a force-directed layout that clusters related notes together.

On mobile, you can:

- **Pinch to zoom** in and out
- **Pan** by dragging the background
- **Tap a node** to navigate to that note
- **See tag colors** -- nodes are colored by their primary tag

The graph helps you discover connections between notes that you might not notice in a flat file list.

## Calendar View

The calendar view displays a monthly calendar with dots on days that have a daily note. Tap any day to open or create the daily note for that date. Daily notes are stored in a `Daily/` folder with filenames in `YYYY-MM-DD.md` format.

Swipe left and right to navigate between months. The current day is highlighted.

## Flashcards

The flashcard system extracts study cards from your notes using two formats:

**Q:/A: pairs:**
```markdown
Q: What is the capital of France?
A: Paris
```

**Cloze deletions:**
```markdown
The {{capital of France}} is known for the Eiffel Tower.
```

The review screen shows one card at a time. Tap to reveal the answer, then rate your recall (Again, Hard, Good, Easy). The app uses the SM-2 spaced repetition algorithm to schedule future reviews, storing review data in `.noteriv/flashcard-reviews.json`.

Cards are collected from all notes in your vault. The review screen shows how many cards are due today and lets you review them in a focused, distraction-free interface.

## Trash

When you delete a note, it is moved to a `.noteriv/trash/` directory rather than being permanently removed. The trash screen shows all soft-deleted notes with their original name and deletion date.

From the trash screen, you can:

- **Restore** a note to its original location
- **Permanently delete** a single note
- **Empty trash** to permanently delete all trashed notes

## Dataview

Dataview lets you query your notes like a database. Add a fenced code block with the `dataview` language identifier:

````markdown
```dataview
TABLE status, due FROM #project WHERE status != "done" SORT BY due
```
````

The query engine supports three query types:

- **TABLE** -- Renders results as a table with customizable columns
- **LIST** -- Renders a simple list of note names
- **TASK** -- Collects all task list items from matching notes

Queries can filter by tag (`FROM #tag`), folder (`FROM "folder"`), or frontmatter fields (`WHERE field = "value"`). Results update live as you edit your notes.

## Focus Mode

Focus mode dims every line in the editor except the one you are currently typing on. This helps you concentrate on the current thought without visual distractions from surrounding text. Toggle it from the editor menu.

## Markdown Lint

The lint panel checks your note for common formatting issues:

- Missing space after heading markers (`##Heading` instead of `## Heading`)
- Multiple H1 headings in a single note
- Trailing whitespace
- Broken wiki-links pointing to notes that do not exist
- Empty headings
- Inconsistent list markers

Tap any warning to jump to the relevant line in the editor.

## Publish HTML

Export any note as a standalone HTML file themed to match your current color scheme. The generated HTML includes all styling inline, so the page looks correct when opened in any browser without external dependencies. Use the share sheet to send the HTML file via email, messaging, or any other sharing method on your device.

## Note History

If your vault is synced with GitHub, you can view the git commit history for any note. The history screen shows a timeline of changes with commit dates and messages. Select any two versions to see a side-by-side diff highlighting added and removed lines.

## GitHub Sync

The mobile app syncs with GitHub using the REST API (no native git binary required). Configure sync in Settings by providing your GitHub repository URL and a personal access token.

Sync operations:

- **Pull** -- Download changes from the remote repository
- **Push** -- Upload local changes to the remote repository
- **Auto-sync** -- Optionally sync at a configurable interval (1, 5, 10, or 30 minutes)
- **Sync on save** -- Optionally push after every manual save

The sync engine handles merge conflicts by keeping both versions and letting you resolve them manually.

## Themes

The mobile app supports all 10 built-in themes (Catppuccin Mocha, Catppuccin Latte, Nord, Dracula, Solarized Dark, Solarized Light, One Dark, Gruvbox Dark, Tokyo Night, GitHub Dark) plus community themes and custom themes saved in your vault. Themes affect the entire interface: editor background, text colors, toolbar, navigation, and preview rendering.

You can also choose from 8 accent colors (Blue, Lavender, Mauve, Pink, Peach, Yellow, Green, Teal) that tint interactive elements like links, buttons, and selection highlights.

## Additional Features

- **Templates** -- Insert pre-built templates into new or existing notes from a template picker.
- **Note composer** -- Merge selected notes into one, or split a note at a heading into separate files.
- **File recovery** -- Access automatic snapshots stored in `.noteriv/snapshots/` to restore previous versions.
- **Slide presentation** -- Present any note as a slideshow, split at horizontal rules.
- **Frontmatter editor** -- Visual editor for YAML frontmatter without hand-editing the YAML block.
- **Bookmarks** -- Pin frequently accessed notes for quick access from the home screen.
- **Outline panel** -- Navigate headings within the current note.
- **Tag browser** -- Browse all tags and see which notes use each one.
- **Vault search** -- Full-text search with real-time results as you type.
- **CSS snippets** -- Toggle custom CSS snippets on and off.
- **Plugins** -- Enable and configure community plugins.
- **Random note** -- Open a randomly selected note from your vault for serendipitous review.
