---
title: Mobile Setup
order: 2
---

# Mobile App Setup

This guide walks you through setting up the Noteriv mobile app for local development. If you just want to use the app, download it from the App Store (iOS) or Google Play (Android). This page is for contributors and developers who want to run the app from source.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js 18+** -- Download from [nodejs.org](https://nodejs.org/) or install via your package manager.
- **npm** -- Comes bundled with Node.js.
- **Expo Go** -- Install the Expo Go app on your phone from the App Store or Google Play. This lets you run the development build without compiling native code.
- **Git** -- For cloning the repository.

Optional but recommended:

- **Android Studio** -- If you want to run on an Android emulator or build a production APK/AAB.
- **Xcode** (macOS only) -- If you want to run on an iOS simulator or build for the App Store.

## Clone the Repository

```bash
git clone https://github.com/thejacedev/Noteriv.git
cd Noteriv
```

The repository contains both the desktop and mobile apps. The mobile app lives in the `phone/` directory.

## Install Dependencies

```bash
cd phone
npm install
```

This installs all React Native, Expo, and library dependencies. The install typically takes one to two minutes depending on your network speed.

If you run into peer dependency warnings, they are usually safe to ignore. The Expo SDK manages compatibility between its packages internally.

## Start the Development Server

```bash
npx expo start
```

This launches the Expo development server and prints a QR code in your terminal. You will also see a menu with several options:

```
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
› Press r │ reload app
› Press m │ toggle menu
› Press j │ open debugger
```

## Run on Your Phone

1. Open the **Expo Go** app on your phone.
2. Scan the QR code displayed in your terminal.
3. The app will load over your local network.

Make sure your phone and development machine are on the same Wi-Fi network. If the connection fails, try pressing `s` in the terminal to switch to tunnel mode, which routes traffic through Expo's servers instead of your local network.

## Run on an Emulator

### Android

1. Open Android Studio and start an Android Virtual Device (AVD).
2. In the Expo terminal, press `a` to open the app on the running emulator.
3. Expo Go will be installed automatically if it is not already present.

### iOS (macOS only)

1. Open Xcode and start the iOS Simulator.
2. In the Expo terminal, press `i` to open the app on the simulator.

## Build a Production Binary

For production builds, Noteriv uses EAS Build (Expo Application Services).

### Android APK or AAB

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account
eas login

# Build an Android APK for testing
eas build --platform android --profile preview

# Build an Android AAB for Play Store submission
eas build --platform android --profile production
```

### iOS IPA

```bash
# Build for iOS (requires an Apple Developer account)
eas build --platform ios --profile production
```

Build configuration is defined in `eas.json` at the root of the `phone/` directory.

## Project Structure

Here is a quick overview of the directories inside `phone/`:

```
phone/
  app/                # Expo Router screens
    _layout.tsx       # Root layout with navigation structure
    index.tsx         # Home screen (file browser)
    editor.tsx        # Note editor and preview
    settings.tsx      # App settings
    graph.tsx         # Graph view
    calendar.tsx      # Calendar view
    flashcards.tsx    # Flashcard review
    trash.tsx         # Trash management
    ...               # Additional screens
  components/         # Shared UI components
    MarkdownEditor.tsx    # Text editor with formatting toolbar
    MarkdownPreview.tsx   # Rendered markdown preview
    NotesList.tsx         # File browser list
    BoardView.tsx         # Kanban board
    SearchModal.tsx       # Vault search overlay
    VaultSwitcher.tsx     # Vault selection modal
    ...
  context/            # React context providers
    AppContext.tsx     # Global app state (vault, files, editor)
    ThemeContext.tsx   # Theme colors and accent
  lib/                # Business logic modules
    file-system.ts    # File read/write/delete/rename operations
    github-sync.ts    # GitHub REST API sync
    dataview.ts       # Dataview query engine
    flashcard-utils.ts  # Flashcard extraction and SM-2 scheduling
    markdown-lint.ts  # Markdown linting rules
    wiki-links.ts     # Wiki-link resolution
    board-utils.ts    # Board view parsing
    ...
  types/              # TypeScript interfaces
  constants/          # Color palettes and config values
  hooks/              # Custom React hooks
  assets/             # Fonts and static images
  app.json            # Expo configuration
  eas.json            # EAS Build profiles
  package.json        # Dependencies and scripts
  tsconfig.json       # TypeScript configuration
```

## Common Issues

### "Network request failed" when scanning QR code

Your phone and computer are on different networks, or a firewall is blocking the connection. Switch to tunnel mode by pressing `s` in the Expo terminal, or connect both devices to the same Wi-Fi network.

### "Unable to resolve module" errors

Run `npm install` again. If that does not fix it, delete `node_modules` and reinstall:

```bash
rm -rf node_modules
npm install
```

### Metro bundler cache issues

Clear the Metro cache and restart:

```bash
npx expo start --clear
```

### Build fails with "SDK version mismatch"

Make sure you are using a compatible version of Expo Go. The app currently targets Expo SDK 54. Update Expo Go on your phone to the latest version.

## Next Steps

- Read the [Features](./features.md) guide for a walkthrough of everything the mobile app can do.
- See [Swipe Navigation](./swipe-navigation.md) for details on navigating between notes with touch gestures.
