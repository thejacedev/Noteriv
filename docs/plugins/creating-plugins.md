---
title: Creating Plugins
order: 2
---

# Creating Plugins

This guide walks you through creating a Noteriv plugin from scratch, covering the plugin structure, manifest format, API methods, event handling, and a complete example.

## Plugin Structure

A plugin is a folder inside `.noteriv/plugins/` containing at minimum two files:

```
.noteriv/plugins/my-plugin/
  manifest.json
  main.js
```

You can include additional files (utility modules, assets, etc.), but Noteriv only loads the entry file specified in the manifest.

## Manifest Format

The `manifest.json` file describes your plugin to Noteriv:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A brief description of what this plugin does.",
  "author": "Your Name",
  "minAppVersion": "1.0.0",
  "main": "main.js"
}
```

### Manifest Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique plugin identifier. Should match the folder name. Use lowercase with hyphens. |
| `name` | string | Yes | Human-readable display name shown in Settings. |
| `version` | string | Yes | Semantic version of your plugin (e.g., `1.0.0`). |
| `description` | string | Yes | Short description of what the plugin does. |
| `author` | string | Yes | Your name or handle. |
| `minAppVersion` | string | No | Minimum Noteriv version required. If set, the plugin will not load on older versions. |
| `main` | string | Yes | Path to the entry JavaScript file, relative to the plugin folder. |

## Entry File

The entry file (`main.js`) must export two functions using CommonJS `module.exports`:

```javascript
module.exports.onLoad = function(api) {
  // Called when the plugin is enabled.
  // Use the api object to register commands, read files, etc.
};

module.exports.onUnload = function() {
  // Called when the plugin is disabled.
  // Clean up any resources, intervals, or event listeners.
};
```

The `onLoad` function receives the Plugin API object as its only argument. The `onUnload` function receives no arguments and should clean up anything the plugin created.

Both functions can be synchronous or return a Promise (async).

## Plugin API Reference

The API object passed to `onLoad` has five namespaces: `vault`, `ui`, `events`, `editor`, and `app`.

### api.vault

File operations within the vault.

| Method | Signature | Description |
|---|---|---|
| `read` | `(path: string) => Promise<string \| null>` | Read a file's content by relative path. Returns `null` if not found. |
| `write` | `(path: string, content: string) => Promise<boolean>` | Write content to a file. Creates parent directories. Returns `true` on success. |
| `list` | `(dir?: string) => Promise<Array<{path, name, isDir}>>` | List entries in a directory. Omit `dir` to list vault root. |
| `exists` | `(path: string) => Promise<boolean>` | Check if a file exists. |
| `delete` | `(path: string) => Promise<boolean>` | Delete a file. Returns `true` on success. |

**Example -- read a file**:
```javascript
const content = await api.vault.read("Projects/roadmap.md");
if (content) {
  console.log("Roadmap has", content.split("\n").length, "lines");
}
```

### api.ui

Register UI elements and show notifications.

| Method | Signature | Description |
|---|---|---|
| `addCommand` | `(cmd: PluginCommand) => void` | Register a command in the command palette. |
| `removeCommand` | `(id: string) => void` | Remove a previously registered command. |
| `addStatusBarItem` | `(item: StatusBarItem) => void` | Add an item to the status bar. |
| `removeStatusBarItem` | `(id: string) => void` | Remove a status bar item. |
| `addSidebarPanel` | `(panel: SidebarPanel) => void` | Add a panel to the sidebar. |
| `removeSidebarPanel` | `(id: string) => void` | Remove a sidebar panel. |
| `addSettingsTab` | `(tab: SettingsTab) => void` | Add a tab to the settings modal. |
| `removeSettingsTab` | `(id: string) => void` | Remove a settings tab. |
| `showNotice` | `(message: string, duration?: number) => void` | Show a toast notification. Duration is in milliseconds (default: 4000). |

**PluginCommand object**:
```javascript
{
  id: "my-command",        // Unique within the plugin
  name: "Do Something",    // Shown in the command palette
  icon: "star",            // Optional Ionicons icon name
  hotkey: "Ctrl+Shift+X",  // Optional keyboard shortcut
  callback: () => { /* ... */ }
}
```

**StatusBarItem object**:
```javascript
{
  id: "my-status",
  text: "Ready",
  title: "Plugin status",    // Tooltip
  onClick: () => { /* ... */ }
}
```

**SidebarPanel object**:
```javascript
{
  id: "my-panel",
  title: "My Panel",
  icon: "list",
  render: (container) => {
    container.innerHTML = "<p>Panel content here.</p>";
    // Return a cleanup function (optional)
    return () => { container.innerHTML = ""; };
  }
}
```

**SettingsTab object**:
```javascript
{
  id: "my-settings",
  name: "My Plugin",
  render: (container) => {
    container.innerHTML = "<label>Setting: <input type='text' /></label>";
  }
}
```

### api.events

Subscribe to application events.

| Method | Signature | Description |
|---|---|---|
| `on` | `(event: string, handler: Function) => void` | Register an event listener. |
| `off` | `(event: string, handler: Function) => void` | Remove an event listener. |
| `emit` | `(event: string, ...args: any[]) => void` | Emit an event (for inter-plugin communication). |

**Available events**: `file-open`, `file-save`, `file-create`, `file-delete`, `editor-change`, `vault-change`, `layout-change`, `plugin-loaded`, `plugin-unloaded`.

**Example**:
```javascript
function onFileSave(filePath) {
  api.ui.showNotice(`Saved: ${filePath}`);
}
api.events.on("file-save", onFileSave);
```

### api.editor

Interact with the active editor.

| Method | Signature | Description |
|---|---|---|
| `getContent` | `() => string \| null` | Get the full content of the active editor. Returns `null` if no file is open. |
| `setContent` | `(content: string) => void` | Replace the entire editor content. |
| `insertAtCursor` | `(text: string) => void` | Insert text at the current cursor position. |
| `getSelection` | `() => string` | Get the currently selected text. Returns empty string if nothing is selected. |
| `replaceSelection` | `(text: string) => void` | Replace the current selection with new text. |
| `getCursorPosition` | `() => {line: number, ch: number}` | Get the cursor position (0-indexed line and character). |

**Example -- insert a timestamp**:
```javascript
api.ui.addCommand({
  id: "insert-timestamp",
  name: "Insert Timestamp",
  callback: () => {
    const now = new Date().toISOString();
    api.editor.insertAtCursor(now);
  }
});
```

### api.app

Read-only application state.

| Property | Type | Description |
|---|---|---|
| `version` | string | The current Noteriv app version. |
| `vaultPath` | string \| null | Absolute path to the active vault. |
| `currentFile` | string \| null | Relative path to the currently open file. |

## Complete Example: Word Count Plugin

Here is a full plugin that adds a word count to the status bar, updates it when the editor content changes, and adds a command to show a detailed word count notice.

**manifest.json**:
```json
{
  "id": "word-count",
  "name": "Word Count",
  "version": "1.0.0",
  "description": "Shows a live word count in the status bar.",
  "author": "Noteriv Community",
  "main": "main.js"
}
```

**main.js**:
```javascript
let api = null;
let changeHandler = null;

function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function updateCount() {
  const content = api.editor.getContent();
  const words = countWords(content);
  api.ui.addStatusBarItem({
    id: "word-count",
    text: words === 1 ? "1 word" : words + " words",
    title: "Word count for current note",
    onClick: () => {
      const chars = (content || "").length;
      const lines = (content || "").split("\n").length;
      api.ui.showNotice(
        "Words: " + words + " | Characters: " + chars + " | Lines: " + lines,
        5000
      );
    }
  });
}

module.exports.onLoad = function(pluginApi) {
  api = pluginApi;

  // Initial count
  updateCount();

  // Update on editor changes
  changeHandler = () => updateCount();
  api.events.on("editor-change", changeHandler);
  api.events.on("file-open", changeHandler);

  // Add a command for detailed stats
  api.ui.addCommand({
    id: "show-word-count",
    name: "Show Word Count",
    icon: "stats-chart",
    callback: () => {
      const content = api.editor.getContent() || "";
      const words = countWords(content);
      const chars = content.length;
      const lines = content.split("\n").length;
      const readTime = Math.ceil(words / 200);
      api.ui.showNotice(
        "Words: " + words +
        "\nCharacters: " + chars +
        "\nLines: " + lines +
        "\nReading time: ~" + readTime + " min",
        6000
      );
    }
  });
};

module.exports.onUnload = function() {
  if (changeHandler && api) {
    api.events.off("editor-change", changeHandler);
    api.events.off("file-open", changeHandler);
  }
  api = null;
  changeHandler = null;
};
```

## Plugin ID Namespacing

When you register commands, status bar items, sidebar panels, or settings tabs, Noteriv automatically prefixes their IDs with your plugin ID. For example, if your plugin ID is `word-count` and you register a command with ID `show-stats`, the internal ID becomes `word-count:show-stats`. This prevents conflicts between plugins.

You do not need to include the prefix yourself. Use short, descriptive IDs in your plugin code.

## Testing Your Plugin

1. Create your plugin folder in `.noteriv/plugins/`.
2. Write your `manifest.json` and `main.js`.
3. Open Settings > Plugins and toggle your plugin on.
4. Check the browser developer console (F12 on desktop) for errors.
5. Make changes to `main.js`, then disable and re-enable the plugin to reload.

## Publishing to the Community Repository

To share your plugin with the Noteriv community:

1. Fork the [NoterivPlugins](https://github.com/thejacedev/NoterivPlugins) repository.
2. Create a folder for your plugin with `manifest.json` and `main.js`.
3. Add an entry for your plugin in the repository's root `manifest.json`.
4. Submit a pull request.

After review and approval, your plugin will be available to all Noteriv users through the community plugin browser.
