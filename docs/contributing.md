---
title: Contributing
order: 91
---

# Contributing to Noteriv

Noteriv is an open-source project, and contributions of all kinds are welcome. Whether you are fixing a typo, reporting a bug, suggesting a feature, building a plugin, or submitting a pull request with a new feature, your contribution helps make Noteriv better for everyone.

## Ways to Contribute

### Report Bugs

Found a bug? Open an issue on the [GitHub repository](https://github.com/thejacedev/Noteriv/issues) with:

- A clear, descriptive title.
- Steps to reproduce the bug.
- What you expected to happen vs. what actually happened.
- Your operating system and Noteriv version.
- Screenshots or screen recordings if applicable.

Check existing issues first to avoid duplicates. If someone has already reported the same bug, add a thumbs-up reaction or a comment with additional details.

### Suggest Features

Have an idea for a new feature or improvement? Open a feature request issue with:

- A description of the problem or use case.
- Your proposed solution.
- Any alternatives you have considered.

Feature discussions happen in the issue thread. Upvoted requests are more likely to be implemented.

### Submit Pull Requests

Code contributions are welcome for bug fixes, new features, performance improvements, and refactors. Follow the development setup below to get started.

### Create Plugins

Plugins extend Noteriv without modifying the core codebase. If you build a useful plugin, consider publishing it to the [NoterivPlugins](https://github.com/thejacedev/NoterivPlugins) repository so others can install it from the community browser. See [Creating Plugins](./plugins/creating-plugins.md) for the API guide.

### Create Themes

Design a color scheme and share it via the [NoterivThemes](https://github.com/thejacedev/NoterivThemes) repository. Custom themes are JSON files with 18 color properties. See [Custom Themes](./themes/custom-themes.md) for the format.

### Create CSS Snippets

Build useful CSS snippets and share them via the [NoterivSnippets](https://github.com/thejacedev/NoterivSnippets) repository. See [CSS Snippets](./themes/css-snippets.md) for details.

### Improve Documentation

Documentation improvements are valuable contributions. Fix typos, add missing details, improve examples, or write new guides. The documentation source files are in the `docs/` directory of the repository.

## Development Setup

### Prerequisites

- **Node.js 18+** with npm
- **Git**
- A code editor (VS Code, Cursor, or any editor you prefer)

### Clone the Repository

```bash
git clone https://github.com/thejacedev/Noteriv.git
cd Noteriv
```

### Desktop App

The desktop app is an Electron + Next.js application.

```bash
cd desktop
npm install
npm run dev
```

This starts the Next.js development server and opens the Electron window. Hot reload is enabled, so changes to source files are reflected immediately.

To build a production binary:

```bash
npm run build
```

### Mobile App

The mobile app is a React Native + Expo application.

```bash
cd phone
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `a` for Android emulator / `i` for iOS simulator.

### MCP Server

The MCP server is a standalone Node.js script.

```bash
cd mcp
npm install
node index.js
```

Or test with a specific vault path:

```bash
node index.js /path/to/test-vault
```

### Browser Extension

The web clipper browser extension is in the `extension/` directory.

```bash
cd extension
npm install
npm run build
```

Load the built extension in Chrome via `chrome://extensions` (developer mode) or in Firefox via `about:debugging`.

## Architecture Overview

The Noteriv repository is a monorepo with four main packages:

```
Noteriv/
  desktop/          # Electron + Next.js desktop app
    src/
      app/          # Next.js pages and API routes
      components/   # React components (Editor, Sidebar, Canvas, etc.)
      lib/          # Business logic (sync, dataview, flashcards, etc.)
      styles/       # CSS modules
      types/        # TypeScript type definitions
  phone/            # React Native + Expo mobile app
    app/            # Expo Router screens
    components/     # React Native components
    lib/            # Mobile business logic
    context/        # React context providers
  mcp/              # MCP server (Node.js)
    index.js        # Single-file MCP server
  extension/        # Web clipper browser extension
  docs/             # Documentation (you are here)
```

### Desktop Architecture

The desktop app uses:

- **Electron** for the native window, file system access, git operations, and system integration.
- **Next.js** for the React-based UI, server-side rendering is not used since everything runs in Electron.
- **CodeMirror 6** for the text editor with custom plugins for markdown rendering, syntax highlighting, and vim mode.
- **Yjs + WebRTC** for real-time collaborative editing.

Key abstractions:

- **Settings** (`lib/settings.ts`): Application settings with defaults and persistence.
- **Themes** (`lib/theme-utils.ts`): 10 built-in themes, custom theme loading, and CSS variable application.
- **Sync** (`lib/sync-providers.ts`): Git, folder sync, and WebDAV providers with a unified interface.
- **Plugins** (`lib/plugin-api.ts`): Plugin manager with sandboxed execution, lifecycle hooks, and a rich API surface.
- **Dataview** (`lib/dataview.ts`): Query parser and execution engine for TABLE, LIST, and TASK queries.
- **Flashcards** (`lib/flashcard-utils.ts`): Card extraction (Q/A and cloze), SM-2 algorithm, and review data persistence.

### Mobile Architecture

The mobile app uses:

- **Expo SDK 54** for build tooling and device APIs.
- **Expo Router** for file-based navigation.
- **React Native Gesture Handler** for touch interactions.
- **React Native WebView** for rendering math, Mermaid diagrams, and syntax-highlighted code.
- **Expo File System** for direct file operations.

State management uses React context (`AppContext` for vault/file state, `ThemeContext` for appearance). The mobile app reimplements much of the desktop business logic (dataview, flashcards, wiki-links, markdown preview) in a mobile-appropriate way.

### MCP Server Architecture

The MCP server is a single `index.js` file that implements the Model Context Protocol using the `@modelcontextprotocol/sdk`. It communicates over stdio, auto-discovers vaults from the Noteriv config, and provides 22 tools for vault management, note CRUD, browsing, knowledge graph queries, statistics, and daily notes.

## Code Style

- **TypeScript** is used throughout the desktop and mobile apps. The MCP server uses plain JavaScript (ES modules).
- **Functional components** with hooks in React. No class components.
- **Descriptive naming**: functions and variables should be self-documenting.
- **No external state management libraries**: React context and local state only.
- **Minimal dependencies**: prefer implementing features directly over adding npm packages.

## Pull Request Guidelines

1. **Create a branch** from `main` for your changes.
2. **Keep PRs focused**. One feature or fix per PR. Large PRs are harder to review.
3. **Write descriptive commit messages** that explain what changed and why.
4. **Test your changes** on the relevant platform (desktop, mobile, or MCP server).
5. **Update documentation** if your change affects user-facing behavior.
6. **Do not include unrelated formatting changes** in the same PR.

### PR Checklist

- [ ] Code compiles without errors (`npm run build`)
- [ ] Existing functionality is not broken
- [ ] New features include documentation updates
- [ ] Commit messages are clear and descriptive
- [ ] No unrelated changes are included

## Community Repositories

Noteriv has three community repositories for user-created content:

### NoterivPlugins

- **Repository**: [github.com/thejacedev/NoterivPlugins](https://github.com/thejacedev/NoterivPlugins)
- **Purpose**: Community plugins installable from the app
- **To contribute**: Fork, add your plugin folder with `manifest.json` and `main.js`, update the root `manifest.json`, and submit a PR.

### NoterivThemes

- **Repository**: [github.com/thejacedev/NoterivThemes](https://github.com/thejacedev/NoterivThemes)
- **Purpose**: Community color themes
- **To contribute**: Fork, add your theme JSON file, update the root `manifest.json`, and submit a PR.

### NoterivSnippets

- **Repository**: [github.com/thejacedev/NoterivSnippets](https://github.com/thejacedev/NoterivSnippets)
- **Purpose**: Community CSS snippets
- **To contribute**: Fork, add your snippet CSS file, update the root `manifest.json`, and submit a PR.

## Getting Help

If you need help with your contribution:

- Open a draft PR and ask questions in the PR description.
- Open a discussion on GitHub Discussions.
- Check existing issues and PRs for similar work.

## License

By contributing to Noteriv, you agree that your contributions will be licensed under the MIT License, the same license as the project itself.
