---
title: Getting Started
order: 1
---

# Getting Started with Noteriv

Noteriv is an open-source markdown note-taking application built for writers, developers, researchers, and anyone who thinks in plain text. It runs on desktop (Windows, macOS, Linux) via Tauri 2 and on mobile (Android, iOS) via React Native, giving you access to your notes on every device you own.

## What makes Noteriv different

Most note-taking applications lock you into a proprietary cloud, a proprietary format, or a single platform. Noteriv takes a different approach:

- **Plain markdown files.** Your notes are standard `.md` files stored in regular folders on your filesystem. Open them in any text editor, move them between machines with a USB drive, or process them with command-line tools. There is no database, no proprietary format, and no vendor lock-in.

- **Local-first storage.** Notes live on your device by default. You own your data completely. If you want cloud sync, you can connect a GitHub repository, set up folder sync with Dropbox or Google Drive, or use a WebDAV server. But none of that is required.

- **Cross-platform with feature parity.** The desktop app (Tauri 2 + Next.js) and the mobile app (Expo + React Native) share the same feature set with platform-appropriate adaptations. Write a note on your laptop, review it on your phone.

- **Extensible.** Plugins extend functionality, themes change the look, and CSS snippets let you fine-tune every visual detail. Community repositories for all three are available on GitHub.

## Who Noteriv is for

Noteriv works well for a wide range of use cases:

- **Developers** who want a note-taking app that feels like a code editor, with keyboard shortcuts, vim mode, split panes, and a command palette.
- **Writers** who want distraction-free markdown writing with focus mode, zen mode, and a clean reading view.
- **Researchers** who need to build a knowledge base with wiki-links, backlinks, a graph view, tags, and dataview queries.
- **Students** who want to create flashcards from their notes and review them with spaced repetition.
- **Teams** who need real-time collaboration on shared documents using peer-to-peer WebRTC.
- **Anyone** who wants their notes in a portable, future-proof format that is not tied to a single service.

## Core concepts

Before diving in, it helps to understand a few key ideas:

### Vaults

A vault is simply a folder on your filesystem that contains your notes. You can have multiple vaults for different projects or areas of your life -- one for work, one for personal notes, one for a research project. Each vault has its own settings, plugins, themes, and sync configuration. See the [Vaults](vaults.md) guide for details.

### Markdown

Noteriv uses standard markdown with several extensions: wiki-links (`[[note name]]`), callouts, math (LaTeX via KaTeX), Mermaid diagrams, task lists, footnotes, definition lists, and more. If you have never used markdown before, it is a lightweight way to format text using plain characters -- `**bold**` for **bold**, `# Heading` for headings, `- item` for lists.

### View modes

The editor supports three viewing modes that you can switch between at any time:

- **Live mode** -- See rendered output as you type. Headings, links, images, code blocks, and math all render inline while you edit.
- **Source mode** -- Raw markdown with syntax highlighting. Useful when you need precise control over formatting.
- **View mode** -- A clean, read-only rendered view for reading and reviewing.

### Sync

Noteriv supports multiple sync methods. GitHub sync uses git under the hood (native git binary on desktop, GitHub REST API on mobile). Folder sync mirrors your vault to a cloud storage folder like Dropbox or Google Drive. WebDAV sync connects to Nextcloud, ownCloud, or any compatible server. All sync is optional.

## What to read next

- **[Installation](installation.md)** -- Download and install Noteriv on your platform.
- **[Quickstart](quickstart.md)** -- Create your first vault and write your first note in under five minutes.
- **[Vaults](vaults.md)** -- Learn how vaults work and how to manage multiple workspaces.
- **[Interface](interface.md)** -- Understand the UI layout, from the title bar to the status bar.
- **[Keyboard Shortcuts](keyboard-shortcuts.md)** -- Master the 70+ keyboard shortcuts that make Noteriv fast to use.

## Feature highlights

Here is a quick look at what Noteriv offers. Each of these is covered in more detail in the dedicated documentation sections.

| Category | Features |
|---|---|
| Editor | Live preview, source mode, read-only view, formatting toolbar, auto-save, spell check, vim mode, focus mode, split editor |
| Knowledge | Wiki-links, backlinks, tags, graph view, hover preview, outline panel |
| Organization | Multiple vaults, nested folders, bookmarks, quick open, vault search, daily notes, random note |
| Content | Templates, frontmatter editor, note composer (merge/split), file recovery, slide presentations, PDF export, table of contents, dataview queries |
| Media | Images, audio, video, attachment manager, canvas/whiteboard, PDF annotation, drawing editor |
| Sync | GitHub, folder sync (Dropbox/Drive/OneDrive/iCloud), WebDAV |
| Collaboration | Real-time co-editing (Yjs + WebRTC), publish as HTML, web clipper browser extension |
| AI | MCP server with 22 tools for connecting AI assistants to your vault |
| Customization | 10 built-in themes, community themes, plugins, CSS snippets, 8 accent colors, configurable fonts |

## Tech stack

Noteriv is built with modern web technologies on both platforms:

| Layer | Desktop | Mobile |
|---|---|---|
| Framework | Next.js 16 | Expo 54 |
| UI | React 19 | React Native 0.81 |
| Editor | CodeMirror 6 | TextInput + custom renderer |
| Runtime | Tauri 2 (Rust) | Expo Router 6 |
| File I/O | Rust std::fs | expo-file-system |
| Sync | std::process git | GitHub REST API |
| Styling | Tailwind CSS 4 | StyleSheet + dynamic themes |
| Math | KaTeX | -- |
| Diagrams | Mermaid | -- |

The desktop app uses Tauri 2 to provide native OS integration (file system access, window management, system tray, auto-updates) while rendering the UI with Next.js and React inside the platform's WebView. The editor is powered by CodeMirror 6, a highly extensible code editor framework that provides fast, responsive text editing with full markdown support.

The mobile app uses Expo and React Native to deliver a native experience on Android and iOS. Notes are stored in the app's document directory and synced via the GitHub REST API rather than the native git binary.

Both apps share the same core architecture: vaults as filesystem folders, plain markdown files, YAML frontmatter for metadata, and wiki-links for inter-note connections.

## MCP server for AI integration

Noteriv includes an MCP (Model Context Protocol) server that lets AI assistants like Claude read, write, search, and manage your notes directly. The server provides 22 tools covering every vault operation: reading and writing notes, creating folders, full-text search, tag extraction, backlink discovery, vault statistics, and daily note management.

Install it with a single command:

```bash
npx noteriv-mcp
```

The MCP server auto-discovers your vaults from the Noteriv config file, so no manual path setup is needed. Changes made by the MCP server are detected by the desktop app's vault file watcher and reflected in the sidebar and open files automatically.

## Links

- **GitHub:** [github.com/thejacedev/Noteriv](https://github.com/thejacedev/Noteriv)
- **Website:** [noteriv.com](https://www.noteriv.com)
- **Plugins:** [github.com/thejacedev/NoterivPlugins](https://github.com/thejacedev/NoterivPlugins)
- **Themes:** [github.com/thejacedev/NoterivThemes](https://github.com/thejacedev/NoterivThemes)
- **CSS Snippets:** [github.com/thejacedev/NoterivSnippets](https://github.com/thejacedev/NoterivSnippets)
- **MCP Server:** Available on npm as `noteriv-mcp`

## License

Noteriv is released under the MIT License. You are free to use, modify, and distribute it.
