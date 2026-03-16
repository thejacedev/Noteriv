# Noteriv MCP Server

MCP (Model Context Protocol) server that gives AI assistants full access to your Noteriv vault — read, write, search, organize, and manage notes.

Auto-discovers your vaults from the Noteriv app config. Works with Claude Code, Cursor, or any MCP-compatible AI.

## Setup

### Install
```bash
cd mcp && npm install
```

### Claude Code
Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "noteriv": {
      "command": "node",
      "args": ["/path/to/Noteriv/mcp/index.js"]
    }
  }
}
```

It auto-detects your active vault from the Noteriv config. Or specify one:
```json
{
  "mcpServers": {
    "noteriv": {
      "command": "node",
      "args": ["/path/to/Noteriv/mcp/index.js", "/path/to/vault"]
    }
  }
}
```

## Tools (22)

### Vault Management
| Tool | Description |
|------|-------------|
| `list_vaults` | List all vaults with names, paths, IDs |
| `get_active_vault` | Show the current vault |
| `switch_vault` | Switch to a vault by name or ID |
| `set_vault_path` | Use a custom vault path |

### Note CRUD
| Tool | Description |
|------|-------------|
| `read_note` | Read a note by relative path |
| `write_note` | Create or overwrite a note |
| `append_to_note` | Append text to a note |
| `delete_note` | Soft delete (moves to trash) |
| `rename_note` | Rename or move a note |

### Browsing & Search
| Tool | Description |
|------|-------------|
| `list_notes` | List markdown notes (optionally by folder) |
| `list_folders` | List all folders |
| `list_all_files` | List all files (images, PDFs, etc.) |
| `search_notes` | Full-text search with line numbers |

### Folder Management
| Tool | Description |
|------|-------------|
| `create_folder` | Create a folder |
| `delete_folder` | Delete a folder and contents |

### Knowledge Graph
| Tool | Description |
|------|-------------|
| `get_tags` | All #tags and their notes |
| `get_backlinks` | Notes linking to a given note |
| `get_outgoing_links` | Wiki-links in a note |

### Stats & Metadata
| Tool | Description |
|------|-------------|
| `get_vault_stats` | Note count, words, characters |
| `get_note_info` | Frontmatter, tags, links, word count |

### Daily Notes
| Tool | Description |
|------|-------------|
| `create_daily_note` | Create or get today's note |
| `get_recent_daily_notes` | Last N daily notes |

## Resources

All notes are exposed as MCP resources (`note:///path.md`) for direct browsing.
