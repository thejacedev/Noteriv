---
title: Noteriv Documentation
order: 1
---

# Noteriv Documentation

Welcome to the Noteriv documentation. Noteriv is an open-source, cross-platform markdown note-taking application built for writers, developers, researchers, and anyone who wants their notes in a portable, future-proof format. Notes are plain `.md` files stored on your filesystem -- no proprietary format, no cloud lock-in, no database.

Noteriv runs on desktop (Windows, macOS, Linux) via Electron and on mobile (Android, iOS) via React Native. Both platforms share the same file format and vault structure, so your notes work identically everywhere.

## Documentation Sections

### [Getting Started](./getting-started/)

Installation, creating your first vault, understanding the interface, and the quickstart guide. Start here if you are new to Noteriv.

### [Editor](./editor/)

The CodeMirror 6 editor with three view modes (Live, Source, View), split panes, focus mode, Zen mode, Vim keybindings, formatting toolbar, and context menu.

### [Features](./features/)

Deep dives into individual features: wiki-links, backlinks, graph view, tags, templates, daily notes, note composer, bookmarks, quick open, vault search, command palette, flashcards, dataview queries, slide presentations, PDF export, audio recording, canvas whiteboard, drawing editor, note history, file recovery, publish HTML, and web clipper.

### [Views](./views/)

The different ways to visualize your notes: board view (Kanban), graph view (network diagram), calendar view, outline panel, and slide presentation mode.

### [Sync](./sync/)

Syncing your notes across devices: GitHub sync (native git on desktop, REST API on mobile), folder sync (Dropbox, Google Drive, OneDrive, iCloud), and WebDAV sync (Nextcloud, ownCloud).

### [Mobile](./mobile/)

The React Native mobile app: available features, setup for development, swipe navigation, and platform-specific details. [Read more](./mobile/)

### [MCP Server](./mcp/)

The Model Context Protocol server that gives AI assistants access to your vault. 22 tools for reading, writing, searching, and managing notes. Published as `noteriv-mcp` on npm. [Read more](./mcp/)

### [Themes](./themes/)

10 built-in themes, 8 accent colors, community themes, custom theme creation, and CSS snippets for fine-grained visual control. [Read more](./themes/)

### [Plugins](./plugins/)

Community plugin system with a sandboxed JavaScript API. Install plugins from the community repository, or create your own with commands, sidebar panels, status bar items, and event handlers. [Read more](./plugins/)

### [Reference](./reference/)

Comprehensive reference documentation: complete markdown syntax (including all extensions), YAML frontmatter fields, all 14 callout types, supported file types, and the `.noteriv/` directory structure. [Read more](./reference/)

### [FAQ](./faq.md)

Answers to the 20 most common questions about Noteriv.

### [Contributing](./contributing.md)

How to contribute to Noteriv: reporting bugs, suggesting features, submitting pull requests, and creating plugins, themes, and CSS snippets.

## Key Features at a Glance

| Category | Highlights |
|---|---|
| **Editor** | Live preview, source mode, read-only view, CodeMirror 6, Vim mode, focus mode, Zen mode, split editor |
| **Knowledge** | Wiki-links, backlinks, tags, graph view, hover preview, outline panel, dataview queries |
| **Organization** | Multiple vaults, nested folders, bookmarks, quick open, command palette, daily notes, templates |
| **Media** | Images, audio, video, canvas/whiteboard, drawing editor, PDF viewer, attachment manager |
| **Sync** | GitHub (git), folder sync (Dropbox/Drive/OneDrive/iCloud), WebDAV |
| **Collaboration** | Real-time co-editing (Yjs + WebRTC), publish as HTML, web clipper extension |
| **Study** | Flashcards with SM-2 spaced repetition, cloze deletions |
| **AI** | MCP server with 22 tools for Claude, Cursor, and other AI assistants |
| **Customization** | 10 themes, 8 accent colors, community themes, CSS snippets, plugins |
| **Mobile** | Full-featured React Native app with swipe navigation, board view, graph view |

## Links

- **GitHub**: [github.com/thejacedev/Noteriv](https://github.com/thejacedev/Noteriv)
- **Website**: [noteriv.com](https://www.noteriv.com)
- **MCP Server**: [npmjs.com/package/noteriv-mcp](https://www.npmjs.com/package/noteriv-mcp)
- **Plugins**: [github.com/thejacedev/NoterivPlugins](https://github.com/thejacedev/NoterivPlugins)
- **Themes**: [github.com/thejacedev/NoterivThemes](https://github.com/thejacedev/NoterivThemes)
- **CSS Snippets**: [github.com/thejacedev/NoterivSnippets](https://github.com/thejacedev/NoterivSnippets)

## Getting Help

If you cannot find what you are looking for in the documentation:

- **Search**: Use the search function to find pages by keyword.
- **FAQ**: Check the [FAQ](./faq.md) for answers to the 20 most common questions.
- **GitHub Issues**: Open an issue on the [GitHub repository](https://github.com/thejacedev/Noteriv/issues) for bug reports and feature requests.
- **GitHub Discussions**: Start a discussion for general questions, ideas, and community conversation.

## About Noteriv

Noteriv is designed around a few core principles:

- **Your notes are yours.** Plain markdown files on your filesystem. No cloud requirement, no proprietary format, no lock-in. Move your notes to another app at any time by simply copying the files.
- **Local-first, sync-optional.** Everything works offline. Sync is available when you want it (GitHub, folder sync, WebDAV) but never required.
- **Keyboard-driven.** Over 70 keyboard shortcuts, a command palette, Vim mode, and focus mode for writers who prefer to keep their hands on the keyboard.
- **Extensible.** Plugins, themes, and CSS snippets let you customize every aspect of the application without forking the codebase.
- **Open source.** MIT licensed. Read the code, modify it, contribute to it.

## License

Noteriv is released under the MIT License.
