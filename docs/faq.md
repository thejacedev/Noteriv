---
title: FAQ
order: 90
---

# Frequently Asked Questions

## 1. What is Noteriv?

Noteriv is an open-source, cross-platform markdown note-taking application. It stores your notes as plain `.md` files on your filesystem and provides a rich editing environment with wiki-links, graph view, themes, plugins, sync, flashcards, and more. It runs on desktop (Windows, macOS, Linux) and mobile (Android, iOS).

## 2. Is Noteriv free?

Yes. Noteriv is completely free and open-source under the MIT License. There are no paid tiers, no subscriptions, and no feature gates. Every feature is available to everyone.

## 3. Is Noteriv an Obsidian alternative?

Noteriv shares several concepts with Obsidian -- local-first markdown files, wiki-links, graph view, community plugins, and themes. However, Noteriv is fully open-source (including the desktop app), has a built-in MCP server for AI assistant integration, includes real-time collaboration, and ships with a native mobile app built on React Native rather than a web wrapper. If you are looking for an open-source alternative to Obsidian with AI-native features, Noteriv is worth trying.

## 4. Where are my notes stored?

Your notes are stored as plain `.md` files in a folder on your filesystem called a vault. You choose the vault location when you first set up Noteriv. On desktop, vaults can be anywhere on your disk. On mobile, vaults are stored in the app's document directory. You can access your vault files with any file manager, text editor, or command-line tool.

## 5. What file format does Noteriv use?

Standard markdown (`.md` files) with optional YAML frontmatter. Noteriv adds extensions like wiki-links (`[[note]]`), callouts, highlights, math (KaTeX), Mermaid diagrams, dataview queries, and flashcard syntax, but the files remain valid markdown that can be opened in any text editor. Canvas files use `.canvas` (JSON), and drawings use `.drawing` (JSON).

## 6. What sync options are available?

Noteriv supports three sync methods:

- **GitHub sync**: Uses native git on desktop and the GitHub REST API on mobile. Push and pull your vault to a GitHub repository with configurable auto-sync intervals.
- **Folder sync**: Mirror your vault to a cloud storage folder (Dropbox, Google Drive, OneDrive, iCloud Drive). The desktop app watches for file changes and syncs bidirectionally.
- **WebDAV sync**: Connect to a WebDAV server (Nextcloud, ownCloud, or any compatible provider) for self-hosted sync.

All sync is optional. Noteriv works perfectly offline with local-only storage.

## 7. Is there a mobile app?

Yes. The mobile app is built with React Native and Expo and runs natively on Android and iOS. It includes the markdown editor, preview, wiki-link navigation, board view, graph view, calendar, flashcards, dataview, GitHub sync, themes, and more. See the [Mobile](./mobile/) documentation for details.

## 8. What is the MCP server?

The MCP (Model Context Protocol) server gives AI assistants like Claude, ChatGPT, and Cursor direct access to your notes. It exposes 22 tools for reading, writing, searching, and managing your vault. Install it with `npx -y noteriv-mcp` and connect it to any MCP-compatible AI assistant. See the [MCP Server](./mcp/) documentation for setup instructions.

## 9. Can I install plugins?

Yes. Noteriv has a community plugin system. Plugins are JavaScript files that extend the app with new commands, sidebar panels, status bar items, and custom behavior. Browse and install plugins from the community repository in Settings, or create your own. Plugins are per-vault, so each vault can have different plugins enabled. See [Plugins](./plugins/) for details.

## 10. Can I customize the theme?

Yes. Noteriv ships with 10 built-in themes (8 dark, 2 light) and supports custom themes. Create a theme by writing a JSON file with 18 color properties and saving it to `.noteriv/themes/` in your vault. You can also install community themes from the [NoterivThemes](https://github.com/thejacedev/NoterivThemes) repository. For finer control, CSS snippets let you override any visual style. See [Themes](./themes/) for details.

## 11. Does Noteriv have Vim mode?

Yes. The desktop editor includes full Vim keybinding support powered by `@replit/codemirror-vim`. Enable it in Settings to get Normal, Insert, and Visual modes with the standard Vim command vocabulary. Vim mode is desktop-only because touch keyboards do not support modal editing.

## 12. Does Noteriv work offline?

Yes. Noteriv is local-first. All features work without an internet connection. Notes are stored on your device, and all processing (rendering, search, dataview queries, flashcard scheduling) happens locally. Internet is only needed for sync (GitHub, WebDAV) and for installing community plugins/themes.

## 13. What export options are available?

- **Publish HTML**: Export any note as a standalone HTML page styled with your current theme. The HTML includes all CSS inline and opens correctly in any browser.
- **PDF export**: Export notes as PDF documents (desktop only).
- **Slide presentation**: Present any note as a slideshow, split at horizontal rules or headings.
- **Raw markdown**: Your notes are already plain markdown files. Copy them anywhere.

## 14. Does Noteriv support collaboration?

Yes. The desktop app supports real-time collaborative editing using Yjs and WebRTC. Multiple users can edit the same note simultaneously with live cursors and conflict-free merging. Collaboration is peer-to-peer, meaning data flows directly between participants without passing through a central server.

## 15. Can I self-host the sync server?

Noteriv does not require a central sync server. GitHub sync uses GitHub's infrastructure. Folder sync uses your existing cloud storage. WebDAV sync connects to any WebDAV-compatible server that you host yourself (Nextcloud, ownCloud, Apache with mod_dav, etc.). For real-time collaboration, connections are peer-to-peer via WebRTC, though a signaling server is used for the initial connection.

## 16. What is the open-source license?

Noteriv is released under the MIT License. You are free to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software. The full license text is in the `LICENSE` file in the repository root.

## 17. What are the keyboard shortcuts?

Noteriv has 70+ keyboard shortcuts covering file operations, navigation, editing, formatting, view controls, and features. Key shortcuts include:

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Command palette / Quick open |
| `Ctrl+S` | Save |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+Shift+L` | Cycle view mode |
| `Ctrl+Shift+D` | Focus mode |
| `Ctrl+Shift+E` | Zen mode |
| `Ctrl+\` | Split editor |
| `Ctrl+,` | Settings |
| `Ctrl+G` | Graph view |
| `Ctrl+Shift+F` | Vault search |

See the full list in [Keyboard Shortcuts](./getting-started/keyboard-shortcuts.md).

## 18. What is dataview?

Dataview is a query engine that lets you treat your notes as a database. Write queries inside fenced code blocks to generate tables, lists, and task collections from your notes. Queries can filter by tag, folder, or frontmatter fields, and sort and limit results. See [Markdown Syntax - Dataview](./reference/markdown-syntax.md#dataview) for the query syntax.

## 19. How do flashcards work?

Noteriv extracts flashcards from your notes using two formats: Q:/A: pairs and {{cloze}} deletions. The review system uses the SM-2 spaced repetition algorithm to schedule cards based on your recall performance. Review data is stored in `.noteriv/flashcard-reviews.json`. Cards are collected from all notes in your vault, so you can embed study material directly in your regular notes. See [Markdown Syntax - Flashcards](./reference/markdown-syntax.md#flashcards).

## 20. How can I contribute?

There are many ways to contribute:

- **Report bugs**: Open an issue on GitHub with steps to reproduce.
- **Suggest features**: Open a feature request issue.
- **Submit code**: Fork the repo, make changes, and submit a pull request.
- **Create plugins**: Build and share plugins via the NoterivPlugins repository.
- **Create themes**: Design themes and submit them to NoterivThemes.
- **Create CSS snippets**: Share visual tweaks via NoterivSnippets.
- **Improve documentation**: Fix typos, add examples, or write new guides.

See [Contributing](./contributing.md) for the full guide.

## Bonus Questions

### Can I use Noteriv with multiple vaults?

Yes. You can create and switch between as many vaults as you want. Each vault is an independent folder with its own notes, settings, plugins, themes, and sync configuration. Use the vault switcher in the sidebar (desktop) or the home screen (mobile) to change vaults.

### Does Noteriv support templates?

Yes. The template system lets you create reusable note templates and insert them when creating new notes or into existing notes. Templates are markdown files stored in a designated folder in your vault. Access them from the command palette ("Insert Template") or the template picker.

### Can I use Noteriv as a daily journal?

Absolutely. The daily notes feature creates a new note for each day in a `Daily/` folder with the filename `YYYY-MM-DD.md`. Open the calendar view to navigate between days visually, or use the command palette to jump to today's note. The MCP server also supports daily notes, so AI assistants can create and read your journal entries.

### What happens if I delete a note accidentally?

Noteriv uses soft delete by default. When you delete a note, it moves to `.noteriv/trash/` in your vault. You can restore it from the trash panel at any time. Additionally, if your vault is synced with git, you can recover any previous version from the git history. The file recovery system also keeps automatic snapshots in `.noteriv/snapshots/`.

### Can I use Noteriv without the desktop app?

Yes. The mobile app is fully standalone. You can create vaults, write notes, and use all mobile features without ever installing the desktop app. The MCP server can also be pointed at any directory containing markdown files, regardless of whether the desktop app is installed.
