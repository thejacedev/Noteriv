---
title: Mobile App
order: 1
---

# Mobile App

Noteriv's mobile app brings your notes to your phone and tablet. Built with React Native and Expo, it runs natively on both Android and iOS, giving you a fast, platform-appropriate experience without the overhead of a web wrapper.

The mobile app is not a stripped-down companion. It is a full-featured note-taking environment that shares the same file format and vault structure as the desktop app. Notes you create on your phone are standard `.md` files in your vault folder, and they work identically when you open them on your desktop.

## Technology Stack

The mobile app is built on the following technologies:

- **React Native 0.81** for native UI rendering on Android and iOS.
- **Expo SDK 54** for build tooling, file system access, routing, and device APIs.
- **Expo Router** for file-based navigation between screens.
- **React Native Gesture Handler** for swipe navigation between notes, pull-to-refresh, and other touch interactions.
- **React Native WebView** for rendering math (KaTeX), Mermaid diagrams, and syntax-highlighted code blocks in the preview.
- **React Native Reanimated** for smooth, 60fps animations.
- **Expo File System** for reading and writing vault files directly on the device.
- **AsyncStorage** for persisting settings, vault configuration, and workspace state across sessions.

## Available Features

The mobile app includes the following features, each adapted for touch interaction:

| Feature | Description |
|---|---|
| Markdown editor | Full-text editing with a formatting toolbar for bold, italic, headings, links, lists, code, highlights, and more |
| Markdown preview | Rendered HTML preview with syntax highlighting, KaTeX math, Mermaid diagrams, callouts, embeds, table of contents, and interactive checkboxes |
| Wiki-link navigation | Tap `[[wiki-links]]` in preview to jump to linked notes, with automatic note creation for links that do not exist yet |
| Swipe navigation | Swipe left and right to move between notes in the same folder |
| Board view | Kanban-style board for notes with a `board: true` frontmatter field |
| Graph view | Interactive network graph showing connections between notes via wiki-links and tags |
| Calendar view | View and create daily notes on a monthly calendar |
| Flashcards | Spaced repetition review of Q:/A: pairs and {{cloze}} deletions extracted from your notes |
| Trash | Soft-delete notes with restore capability; permanently delete when ready |
| Dataview | Query your notes like a database using TABLE, LIST, and TASK queries inside code blocks |
| Focus mode | Dim surrounding content and center the current line while editing |
| Markdown lint | Check your notes for formatting issues: heading hierarchy, broken wiki-links, trailing whitespace, and more |
| Publish HTML | Export any note as a standalone HTML page using your current theme colors |
| Note history | View the git commit history of a note and diff any two versions side by side |
| GitHub sync | Push and pull your vault to a GitHub repository using the GitHub REST API |
| Themes | Choose from 10 built-in themes and community themes, with 8 accent colors |
| Templates | Insert pre-built note templates into new or existing notes |
| Note composer | Merge multiple notes into one, or split a note at a heading |
| File recovery | Access automatic snapshots to restore previous versions of a note |
| Slide presentation | Present any note as a slideshow, split at horizontal rules or headings |
| Frontmatter editor | Visual editor for YAML frontmatter fields |
| Bookmarks | Pin frequently accessed notes for quick access |
| Outline panel | Navigate headings within the current note |
| Tag browser | Browse all tags in your vault and see which notes use each tag |
| Vault search | Full-text search across all notes in your vault |
| Vault switcher | Switch between multiple vaults without leaving the app |
| CSS snippets | Toggle custom CSS snippets on and off to fine-tune the interface |
| Plugins | Enable and manage community plugins per vault |
| Attachments | Browse and manage images, PDFs, and other files in your vault |

## Desktop-Only Features

A few features are available only on the desktop app due to platform constraints:

| Feature | Reason |
|---|---|
| Split editor | Mobile screens are too narrow for side-by-side editing |
| Vim mode | Touch keyboards do not support modal editing |
| Canvas / whiteboard | Requires precise mouse interaction for node layout |
| Drawing editor | Freehand drawing tools are desktop-optimized |
| PDF annotation viewer | Native PDF rendering requires desktop WebView APIs |
| Real-time collaboration | WebRTC peer-to-peer connections require desktop networking APIs |
| Audio recorder | Desktop microphone access via the OS portal |
| Folder sync (Dropbox/Drive) | File system watcher requires native OS integration |
| WebDAV sync | Desktop network stack handles authentication and large transfers |
| Web clipper | Browser extension communicates with the desktop app |

## Architecture

The mobile app follows a standard Expo Router structure:

```
phone/
  app/              # Screen routes (editor, settings, graph, etc.)
  components/       # Reusable UI components (MarkdownEditor, MarkdownPreview, etc.)
  context/          # React context providers (ThemeContext, AppContext)
  lib/              # Business logic (file system, sync, dataview, flashcards, etc.)
  constants/        # Color definitions and configuration constants
  hooks/            # Custom React hooks
  types/            # TypeScript type definitions
  assets/           # Fonts, icons, and static resources
```

State management is handled through React context providers. `AppContext` manages the current vault, file list, active file, editor content, and dirty state. `ThemeContext` provides the active theme colors to all components. Both persist their state to AsyncStorage so the app resumes exactly where you left off.

## File Storage

On mobile, vaults are stored in the app's document directory under a `vaults/` folder. Each vault is a regular directory containing your markdown files and a `.noteriv/` configuration directory. The file system layer uses Expo's File and Directory APIs for synchronous reads and writes, with async wrappers for operations that touch multiple files.

## Sync on Mobile

The mobile app supports GitHub sync using the GitHub REST API. Unlike the desktop app, which uses native git commands, the mobile app communicates directly with GitHub's API to push and pull changes. This means you do not need git installed on your phone.

To set up sync:

1. Open **Settings** > **Sync**.
2. Enter your GitHub repository URL (e.g., `https://github.com/username/my-notes`).
3. Enter a personal access token with `repo` scope.
4. Choose a sync interval (1, 5, 10, or 30 minutes) or sync manually.

The sync engine handles:

- **Pulling remote changes** and merging them with local files.
- **Pushing local changes** as commits to the remote repository.
- **Conflict detection** when the same file has been modified both locally and remotely.
- **Auto-sync** at the configured interval when the app is in the foreground.

Folder sync (Dropbox/Drive) and WebDAV sync are desktop-only features due to platform limitations.

## Getting Started

See [Setup](./setup.md) for instructions on running the mobile app locally, or download the latest release from the App Store or Google Play.
