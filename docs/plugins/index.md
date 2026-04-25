---
title: Plugins
order: 1
---

# Plugins

Noteriv has a community plugin system that lets you extend the app with new commands, sidebar panels, status bar items, settings tabs, and custom behavior. Plugins are JavaScript files that run inside the app and interact with your notes through a sandboxed API.

## How Plugins Work

Each plugin is a folder inside your vault's `.noteriv/plugins/` directory. The folder contains a `manifest.json` that describes the plugin and a `main.js` (or other entry file) that contains the plugin code. When a plugin is enabled, Noteriv loads its entry file, executes it in a sandboxed environment, and calls the plugin's `onLoad` function with an API object.

Plugins can:

- Register new commands in the command palette
- Add items to the status bar
- Add panels to the sidebar
- Add tabs to the settings modal
- Read and write files in the vault
- Listen for events (file open, file save, editor change, etc.)
- Insert text into the editor
- Show notification messages

## Installing Plugins

### From the Community Repository

The easiest way to install plugins is through the built-in community browser:

1. Open **Settings** > **Plugins**.
2. Click **Browse Community Plugins**.
3. Find a plugin you want and click **Install**.
4. Toggle the plugin **On** to enable it.

Community plugins are hosted in the [NoterivPlugins](https://github.com/thejacedev/NoterivPlugins) GitHub repository. The app downloads the plugin's `manifest.json` and `main.js` files and saves them to `.noteriv/plugins/{plugin-id}/` in your vault.

### From a Local Folder

If you have a plugin folder on your computer (from a developer or downloaded manually):

1. Open **Settings** > **Plugins**.
2. Click **Install from Folder**.
3. Select the folder containing the plugin's `manifest.json` and `main.js`.
4. The plugin is copied to `.noteriv/plugins/` and appears in the plugin list.

### Manual Installation

Copy the plugin folder directly into your vault:

```
your-vault/
  .noteriv/
    plugins/
      my-plugin/
        manifest.json
        main.js
```

The plugin will appear in Settings > Plugins the next time you open the settings panel.

## Enabling and Disabling Plugins

Each plugin can be toggled on or off individually from **Settings** > **Plugins**. The enabled/disabled state is stored in `.noteriv/plugin-config.json`:

```json
{
  "enabled": ["daily-stats", "word-count"]
}
```

When a plugin is disabled, its `onUnload` function is called, and all of its registered commands, status bar items, sidebar panels, and event handlers are removed. The plugin files remain on disk.

## Plugin Isolation

Plugins are per-vault. Each vault has its own `.noteriv/plugins/` directory and its own `plugin-config.json`. A plugin installed in one vault is not visible in another vault. This means you can have different plugins enabled for different projects.

## Uninstalling Plugins

To remove a plugin entirely:

1. Open **Settings** > **Plugins**.
2. Find the plugin and click **Uninstall**.
3. Confirm the removal.

This calls the plugin's `onUnload` function, removes it from the enabled list, and deletes the plugin's folder from `.noteriv/plugins/`.

## Plugin Events

Plugins can listen for the following events:

| Event | Fired When |
|---|---|
| `file-open` | A file is opened in the editor |
| `file-save` | A file is saved to disk |
| `file-create` | A new file is created |
| `file-delete` | A file is deleted or trashed |
| `editor-change` | The editor content changes |
| `vault-change` | The active vault changes |
| `layout-change` | The window layout changes (sidebar toggle, split pane, etc.) |
| `plugin-loaded` | A plugin finishes loading |
| `plugin-unloaded` | A plugin is unloaded |

## Security

Plugins run in the same WebView as the application. While they are sandboxed through the `Function` constructor (they cannot directly invoke Tauri commands or reach the Rust backend), they do have access to the Plugin API, which includes reading and writing vault files.

Only install plugins from sources you trust. Review a plugin's code before enabling it if you are unsure. The community repository is curated, but third-party plugins may not be reviewed.

## Creating Your Own Plugin

If you want to build a plugin, see [Creating Plugins](./creating-plugins.md) for the full API reference and a step-by-step tutorial.

## Troubleshooting

### Plugin fails to load

Check the plugin list in Settings for an error message. Common causes:

- **Missing manifest.json**: The plugin folder must contain a valid `manifest.json`.
- **Invalid main.js**: The entry file has a syntax error. Check the browser console for details.
- **Missing exports**: The entry file must export `onLoad` (and optionally `onUnload`).

### Plugin commands not appearing

Make sure the plugin is enabled (toggled on) in Settings. Commands are only registered when the plugin's `onLoad` function runs successfully.

### Plugin causes errors

Disable the plugin in Settings. If you cannot access Settings, edit `.noteriv/plugin-config.json` and remove the plugin ID from the `enabled` array, then restart the app.
