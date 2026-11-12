---
title: Installation
order: 2
---

# Installation

Noteriv is available for Linux, Windows, and macOS, plus a mobile app for Android and iOS. Desktop packages are published as GitHub releases, and Linux users can also install from a Flatpak repository that keeps the app up to date.

## Download

Go to the [latest GitHub release](https://github.com/thejacedev/Noteriv/releases/latest) and download the package for your operating system. Each release includes packages for all supported platforms.

| Platform | Formats |
|---|---|
| Linux | Flatpak, `.rpm`, `.deb`, AppImage |
| Windows | `.exe` installer, `.msi`, portable `.zip` |
| macOS | `.dmg` (universal: Apple silicon and Intel) |
| Android | [Google Play](https://play.google.com/store/apps/details?id=com.ironstacksoftware.noteriv), sideloadable `.apk` |
| iOS | [App Store](https://apps.apple.com/app/id6761115699) |

## Linux

Use Flatpak for automatic updates, or pick the release package that matches your distribution.

### Flatpak (any distribution)

```bash
flatpak remote-add --if-not-exists --no-gpg-verify noteriv https://flatpak.thejacedev.xyz/noteriv/repo
flatpak install noteriv com.noteriv.Noteriv
```

Run it from your application menu or with `flatpak run com.noteriv.Noteriv`. `flatpak update` keeps it current.

### AppImage (all distributions)

The AppImage is a self-contained executable that works on any Linux distribution without installation. This is the simplest option if you are not sure which format to use.

1. Download the `.AppImage` file from the releases page.
2. Make it executable:
   ```bash
   chmod +x Noteriv-*.AppImage
   ```
3. Run it:
   ```bash
   ./Noteriv-*.AppImage
   ```

You can move the AppImage to any directory you like, such as `~/Applications/` or `/opt/`. To integrate it with your desktop environment (application menu, file associations), consider using a tool like [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

### Debian / Ubuntu (.deb)

For Debian-based distributions (Debian, Ubuntu, Linux Mint, Pop!_OS, elementary OS, etc.):

1. Download the `.deb` file from the releases page.
2. Install it with `dpkg`:
   ```bash
   sudo dpkg -i noteriv_*.deb
   ```
3. If there are missing dependencies, fix them with:
   ```bash
   sudo apt-get install -f
   ```
4. Launch Noteriv from your application menu or run `noteriv` from the terminal.

To uninstall:
```bash
sudo apt-get remove noteriv
```

### Fedora / openSUSE (.rpm)

For RPM-based distributions (Fedora, openSUSE, CentOS, RHEL, etc.):

1. Download the `.rpm` file from the releases page.
2. Install it:
   ```bash
   # Fedora
   sudo dnf install noteriv-*.rpm

   # openSUSE
   sudo zypper install noteriv-*.rpm
   ```
3. Launch Noteriv from your application menu or run `noteriv` from the terminal.

To uninstall:
```bash
# Fedora
sudo dnf remove noteriv

# openSUSE
sudo zypper remove noteriv
```

## Windows

1. Download the `.exe` installer from the releases page.
2. Run the installer. Windows may show a SmartScreen warning because the app is not signed with a paid code-signing certificate. Click "More info" and then "Run anyway" to proceed.
3. Follow the NSIS installer steps. By default, Noteriv installs to `C:\Users\<your-username>\AppData\Local\Programs\Noteriv\`.
4. Once installed, Noteriv appears in your Start menu. You can also pin it to your taskbar.

To uninstall, use "Add or remove programs" in Windows Settings, or run the uninstaller from the Noteriv installation directory.

### MSI installer

An `.msi` package is also attached to each release, for deployment tools such as Group Policy or Intune that expect Windows Installer packages. It installs the same app as the `.exe`.

### Portable

The `Noteriv-<version>-windows-x64-portable.zip` build runs without installing. Unzip it anywhere, for example onto a USB drive, and run the EXE. A `portable.txt` file next to the EXE switches on portable mode: all settings, vaults, and cache stay in that folder instead of AppData. Delete `portable.txt` to switch back to standard mode.

Auto-updates are disabled in the portable build. Download a new zip to upgrade.

## macOS

1. Download the `.dmg` file from the releases page. It is a universal build that runs natively on both Apple silicon and Intel Macs.
2. Open the DMG and drag Noteriv to your Applications folder.
3. On first launch, macOS may block the app because it is not signed with an Apple Developer certificate. To open it:
   - Right-click (or Control-click) the Noteriv icon in Applications.
   - Select "Open" from the context menu.
   - Click "Open" in the dialog that appears.
   - macOS remembers this choice, so you only need to do it once.

To uninstall, drag Noteriv from Applications to the Trash.

## Auto-updater

Noteriv includes a built-in auto-updater powered by `tauri-plugin-updater`. When a new version is available on GitHub Releases, the app detects it and offers to download and install the update.

- **Checking for updates** happens automatically when the app starts, or you can trigger it manually from Settings.
- **Download and install** -- When an update is found, Noteriv downloads it in the background. Once the download completes, you are prompted to restart the app to apply the update.
- **Automatic updates** are enabled by default. You can disable them in Settings if you prefer to update manually.

The auto-updater covers the AppImage on Linux, the installers on Windows, and the DMG on macOS. If you installed through Flatpak, `flatpak update` handles updates instead. The portable Windows build does not auto-update.

## Mobile app

The mobile app for Android and iOS is a work in progress. Features land on desktop first, then come to mobile. See [Mobile App](../mobile/) for what it can do today.

- **iOS**: install from the [App Store](https://apps.apple.com/app/id6761115699).
- **Android**: install from [Google Play](https://play.google.com/store/apps/details?id=com.ironstacksoftware.noteriv), or sideload the APK. A prebuilt [`noteriv.apk`](https://github.com/thejacedev/Noteriv/raw/main/app-apk/noteriv.apk) is kept in the repository, and tagged releases attach one as `Noteriv-<version>-android.apk`. To sideload, open the APK on your phone and allow installs from that source when Android asks.

Mobile notes live in the app's document directory and sync through the GitHub REST API. See [Mobile Sync](../sync/mobile-sync.md) to connect a vault.

## Prerequisites for development

If you want to run Noteriv from source rather than using a pre-built package, you need:

- **Node.js** 20.19 or later
- **npm** (comes with Node.js)
- **Git** (required for GitHub sync features)

Clone the repository and start the development server:

```bash
git clone https://github.com/thejacedev/Noteriv.git
cd Noteriv/desktop
npm install
npm run dev
```

This starts both the Next.js dev server (on port 3456) and the Tauri window simultaneously.

## Building from source

To build distributable packages yourself:

```bash
cd Noteriv/desktop
npm run build
```

Build outputs go to `desktop/dist/`. The build process generates packages for your current platform:

| Platform | Output formats |
|---|---|
| Linux | AppImage, .deb, .rpm |
| Windows | .exe (NSIS installer) |
| macOS | .dmg |

## Running the mobile app from source

The mobile app (Android and iOS) is built with Expo and React Native. To run it in development:

```bash
cd Noteriv/phone
npm install
npx expo start
```

From the Expo dev server, you can open the app on an Android device or emulator (`npx expo start --android`) or an iOS simulator (`npx expo start --ios`).

## Verifying your installation

After installing, launch Noteriv. If this is your first time running the app, you will see the setup wizard, which walks you through creating your first vault. If the app starts and shows the wizard, your installation is working correctly.

If you run into issues, check the [GitHub Issues](https://github.com/thejacedev/Noteriv/issues) page or open a new issue with details about your platform and the error you encountered.

## Next steps

Once Noteriv is installed, head to the [Quickstart](quickstart.md) guide to create your first vault and start writing.
