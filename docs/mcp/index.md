---
title: MCP Server
order: 1
---

# MCP Server

Noteriv includes an MCP (Model Context Protocol) server that gives AI assistants full access to your notes. The server exposes 22 tools for reading, writing, searching, and managing your vault, allowing AI agents like Claude, ChatGPT, and others to interact with your knowledge base directly.

The MCP server is published on npm as [`noteriv-mcp`](https://www.npmjs.com/package/noteriv-mcp) and can be run with a single command. It auto-discovers your vaults from the Noteriv desktop app's configuration, so there is no manual setup required in most cases.

## What is MCP?

The Model Context Protocol is an open standard created by Anthropic for connecting AI assistants to external data sources and tools. Instead of copying and pasting notes into a chat window, MCP lets an AI assistant read your notes, search your vault, create new notes, and manage your knowledge base programmatically.

When you connect Noteriv's MCP server to an AI assistant, the assistant can:

- Read any note in your vault by path
- Write new notes or update existing ones
- Search across all notes by content or filename
- Browse your folder structure
- Query tags, backlinks, and outgoing links
- Get vault statistics (note count, word count, character count)
- Create and retrieve daily notes
- Manage folders
- Access note metadata (frontmatter, word count, tags, links)

## How It Works

The MCP server runs as a Node.js process that communicates over standard input/output (stdio). When an AI assistant wants to use a tool, it sends a JSON request to the server, and the server responds with the result.

The server reads the Noteriv desktop app's configuration file to discover your vaults:

- **macOS**: `~/Library/Application Support/Noteriv/config.json`
- **Windows**: `%APPDATA%/Noteriv/config.json`
- **Linux**: `~/.config/noteriv/config.json` (or `~/.config/Noteriv/config.json`)

The configuration file contains a list of vault paths and an active vault ID. The server uses the active vault by default, and you can switch vaults at runtime using the `switch_vault` or `set_vault_path` tools.

## Available Tools

The server exposes 22 tools organized into six categories:

| Category | Tools | Description |
|---|---|---|
| Vault Management | `list_vaults`, `get_active_vault`, `switch_vault`, `set_vault_path` | Discover and switch between vaults |
| Note CRUD | `read_note`, `write_note`, `append_to_note`, `delete_note`, `rename_note` | Create, read, update, and delete notes |
| Browsing | `list_notes`, `list_folders`, `list_all_files`, `search_notes` | Browse and search the vault |
| Folders | `create_folder`, `delete_folder` | Manage the folder structure |
| Knowledge Graph | `get_tags`, `get_backlinks`, `get_outgoing_links` | Explore connections between notes |
| Stats & Meta | `get_vault_stats`, `get_note_info` | Get statistics and note metadata |
| Daily Notes | `create_daily_note`, `get_recent_daily_notes` | Work with daily notes |

See [Tools](./tools.md) for detailed documentation of each tool with parameters and examples.

## Use Cases

Here are some things you can do when an AI assistant is connected to your vault via MCP:

- **Ask questions about your notes**: "What did I write about React Server Components last week?"
- **Create structured content**: "Create a new note in Projects/ summarizing these requirements."
- **Build a knowledge base**: "Read all my meeting notes and create a summary note with action items."
- **Organize your vault**: "Find all notes tagged #inbox and move them to the appropriate project folders."
- **Daily journaling**: "Create today's daily note with a summary of what I worked on."
- **Research assistance**: "Search my notes for everything related to machine learning and compile a reading list."
- **Vault maintenance**: "Find all broken wiki-links in my vault and list them."

## Security Considerations

The MCP server has full read and write access to your vault files. It can create, modify, and delete notes. Keep the following in mind:

- The server only accesses files within your vault directories. It cannot read or write files outside your vaults.
- The `delete_note` tool performs a soft delete by moving notes to `.noteriv/trash/`, not a permanent deletion. Notes can be restored.
- The `delete_folder` tool performs a permanent deletion. Use it with caution.
- The server runs locally on your machine. No data is sent to external servers by the MCP server itself. The AI assistant you connect it to may send data to its own servers as part of its normal operation.
- Treat your vault path and MCP configuration as you would any sensitive local data.

## Architecture

The MCP server is implemented as a single JavaScript file (`mcp/index.js`) using ES modules. It depends only on the `@modelcontextprotocol/sdk` package from Anthropic.

Key implementation details:

- **Config discovery**: The server reads the Noteriv config file from the platform-appropriate location (macOS: `~/Library/Application Support/Noteriv/`, Windows: `%APPDATA%/Noteriv/`, Linux: `~/.config/noteriv/`).
- **Vault resolution**: If a vault path is passed as a command-line argument, it is used directly. Otherwise, the server reads the config file and uses the active vault, falling back to the first configured vault.
- **File walking**: The `walkDir` function recursively lists files and folders, skipping hidden directories (`.git`, `.noteriv`) and `node_modules`.
- **Search**: Full-text search is case-insensitive and checks both filenames and file content. Results are capped at 20 files with up to 5 matching lines per file.
- **Soft delete**: The `delete_note` tool moves files to `.noteriv/trash/` with a timestamped ID and a metadata file recording the original path and deletion time.
- **Daily notes**: Stored in a `Daily/` folder with `YYYY-MM-DD.md` filenames. The `create_daily_note` tool creates the folder if it does not exist.

The server also exposes MCP resources, listing up to 200 notes as readable resources with `note:///` URIs.

## Compatibility

The MCP server works with any AI assistant that supports the Model Context Protocol:

| Assistant | Supported | Configuration |
|---|---|---|
| Claude Code | Yes | `claude mcp add` command |
| Claude Desktop | Yes | JSON config file |
| Cursor | Yes | MCP settings or `.cursor/mcp.json` |
| Windsurf | Yes | MCP config file |
| Continue | Yes | MCP config |
| Other MCP clients | Yes | Any client supporting stdio transport |

The server requires Node.js 18 or later. It runs on macOS, Windows, and Linux.

## Getting Started

See [Setup](./setup.md) for installation and configuration instructions for Claude Code, Cursor, and other MCP-compatible AI assistants.
