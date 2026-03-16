#!/usr/bin/env node

/**
 * Noteriv MCP Server
 *
 * Full vault management for AI assistants.
 * Reads the Noteriv config to discover vaults automatically.
 *
 * Usage:
 *   node index.js                    # auto-detect vaults from Noteriv config
 *   node index.js /path/to/vault     # use a specific vault
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import os from "os";

// --- Config discovery ---

function findConfigDir() {
  const platform = os.platform();
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Noteriv");
  if (platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Noteriv");
  // Linux: ~/.config/noteriv (Electron uses lowercase app name)
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  // Try lowercase first (how Electron names it on Linux), fall back to capitalized
  const lower = path.join(base, "noteriv");
  if (fs.existsSync(lower)) return lower;
  return path.join(base, "Noteriv");
}

function loadNoterivConfig() {
  const configPath = path.join(findConfigDir(), "config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {}
  return { vaults: [], activeVaultId: null };
}

function saveNoterivConfig(config) {
  const configDir = findConfigDir();
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(config, null, 2));
}

// --- Vault resolution ---

let activeVaultPath = process.argv[2] || null;

function getActiveVault() {
  if (activeVaultPath) return activeVaultPath;
  const config = loadNoterivConfig();
  if (config.activeVaultId) {
    const vault = config.vaults.find(v => v.id === config.activeVaultId);
    if (vault) return vault.path;
  }
  if (config.vaults.length > 0) return config.vaults[0].path;
  return null;
}

function requireVault() {
  const vp = getActiveVault();
  if (!vp || !fs.existsSync(vp)) throw new Error("No active vault. Use switch_vault or set_vault_path first.");
  return vp;
}

// --- File helpers ---

function walkDir(dir, base = "", filter = null) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push({ type: "folder", path: relPath, fullPath });
      results.push(...walkDir(fullPath, relPath, filter));
    } else {
      if (!filter || filter(entry.name)) {
        results.push({ type: "file", path: relPath, fullPath, name: entry.name });
      }
    }
  }
  return results;
}

function listNotes(vaultPath, folder) {
  const base = folder ? path.join(vaultPath, folder) : vaultPath;
  return walkDir(base, folder || "").filter(
    f => f.type === "file" && /\.(md|markdown)$/i.test(f.name)
  );
}

function readNote(vaultPath, relPath) {
  try { return fs.readFileSync(path.join(vaultPath, relPath), "utf-8"); } catch { return null; }
}

function writeNote(vaultPath, relPath, content) {
  const full = path.join(vaultPath, relPath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function searchNotes(vaultPath, query) {
  const notes = listNotes(vaultPath);
  const q = query.toLowerCase();
  const results = [];
  for (const note of notes) {
    const content = readNote(vaultPath, note.path);
    if (!content) continue;
    if (content.toLowerCase().includes(q) || note.name.toLowerCase().includes(q)) {
      const lines = content.split("\n");
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) matches.push({ line: i + 1, text: lines[i].trim() });
      }
      results.push({ file: note.path, matches: matches.slice(0, 5) });
    }
    if (results.length >= 20) break;
  }
  return results;
}

// --- MCP Server ---

const server = new Server(
  { name: "noteriv", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // --- Vault management ---
    { name: "list_vaults", description: "List all Noteriv vaults with their names, paths, and IDs", inputSchema: { type: "object", properties: {} } },
    { name: "get_active_vault", description: "Get the currently active vault name and path", inputSchema: { type: "object", properties: {} } },
    { name: "switch_vault", description: "Switch to a different vault by name or ID", inputSchema: { type: "object", properties: { name_or_id: { type: "string", description: "Vault name or ID" } }, required: ["name_or_id"] } },
    { name: "set_vault_path", description: "Set a custom vault path (for vaults not in Noteriv config)", inputSchema: { type: "object", properties: { path: { type: "string", description: "Absolute path to vault directory" } }, required: ["path"] } },

    // --- Note CRUD ---
    { name: "read_note", description: "Read a note's full content by relative path", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path (e.g. 'Projects/todo.md')" } }, required: ["path"] } },
    { name: "write_note", description: "Create or overwrite a note", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path" }, content: { type: "string", description: "Full markdown content" } }, required: ["path", "content"] } },
    { name: "append_to_note", description: "Append text to the end of an existing note", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path" }, content: { type: "string", description: "Text to append" } }, required: ["path", "content"] } },
    { name: "delete_note", description: "Move a note to trash (soft delete, restorable)", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path" } }, required: ["path"] } },
    { name: "rename_note", description: "Rename or move a note to a new path", inputSchema: { type: "object", properties: { old_path: { type: "string" }, new_path: { type: "string" } }, required: ["old_path", "new_path"] } },

    // --- Browsing ---
    { name: "list_notes", description: "List all markdown notes in the vault (or a subfolder)", inputSchema: { type: "object", properties: { folder: { type: "string", description: "Optional subfolder" } } } },
    { name: "list_folders", description: "List all folders in the vault", inputSchema: { type: "object", properties: {} } },
    { name: "list_all_files", description: "List ALL files (not just markdown) in the vault", inputSchema: { type: "object", properties: { folder: { type: "string", description: "Optional subfolder" } } } },
    { name: "search_notes", description: "Full-text search across notes, returns files and matching lines", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },

    // --- Folder management ---
    { name: "create_folder", description: "Create a new folder in the vault", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative folder path" } }, required: ["path"] } },
    { name: "delete_folder", description: "Delete a folder and all its contents (permanent!)", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },

    // --- Knowledge graph ---
    { name: "get_tags", description: "List all #tags and which notes use them", inputSchema: { type: "object", properties: {} } },
    { name: "get_backlinks", description: "Find all notes that [[link]] to a given note", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "get_outgoing_links", description: "List all [[wiki-links]] in a given note", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },

    // --- Stats & meta ---
    { name: "get_vault_stats", description: "Get vault statistics (note count, words, characters)", inputSchema: { type: "object", properties: {} } },
    { name: "get_note_info", description: "Get metadata about a note (frontmatter, word count, tags, links)", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },

    // --- Daily notes ---
    { name: "create_daily_note", description: "Create or get today's daily note", inputSchema: { type: "object", properties: { content: { type: "string", description: "Optional initial content" } } } },
    { name: "get_recent_daily_notes", description: "List the last N daily notes", inputSchema: { type: "object", properties: { count: { type: "number", description: "How many (default 7)" } } } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // --- Vault management ---
      case "list_vaults": {
        const config = loadNoterivConfig();
        const text = config.vaults.map(v => `${v.name} (${v.id})\n  Path: ${v.path}${v.id === config.activeVaultId ? "\n  [ACTIVE]" : ""}`).join("\n\n");
        return ok(text || "No vaults configured");
      }
      case "get_active_vault": {
        const config = loadNoterivConfig();
        const vault = config.vaults.find(v => v.id === config.activeVaultId);
        if (activeVaultPath) return ok(`Active vault (manual): ${activeVaultPath}`);
        if (vault) return ok(`${vault.name}\nPath: ${vault.path}\nID: ${vault.id}`);
        return ok("No active vault");
      }
      case "switch_vault": {
        const config = loadNoterivConfig();
        const vault = config.vaults.find(v => v.id === args.name_or_id || v.name.toLowerCase() === args.name_or_id.toLowerCase());
        if (!vault) return err(`Vault not found: ${args.name_or_id}\nAvailable: ${config.vaults.map(v => v.name).join(", ")}`);
        activeVaultPath = vault.path;
        return ok(`Switched to: ${vault.name} (${vault.path})`);
      }
      case "set_vault_path": {
        if (!fs.existsSync(args.path)) return err(`Path does not exist: ${args.path}`);
        activeVaultPath = args.path;
        return ok(`Vault path set to: ${args.path}`);
      }

      // --- Note CRUD ---
      case "read_note": {
        const vp = requireVault();
        const content = readNote(vp, args.path);
        if (content === null) return err(`Not found: ${args.path}`);
        return ok(content);
      }
      case "write_note": {
        const vp = requireVault();
        writeNote(vp, args.path, args.content);
        return ok(`Written: ${args.path}`);
      }
      case "append_to_note": {
        const vp = requireVault();
        const existing = readNote(vp, args.path);
        if (existing === null) return err(`Not found: ${args.path}`);
        const sep = existing.endsWith("\n") ? "" : "\n";
        writeNote(vp, args.path, existing + sep + args.content);
        return ok(`Appended to: ${args.path}`);
      }
      case "delete_note": {
        const vp = requireVault();
        const full = path.join(vp, args.path);
        if (!fs.existsSync(full)) return err(`Not found: ${args.path}`);
        const trashDir = path.join(vp, ".noteriv", "trash");
        if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        fs.renameSync(full, path.join(trashDir, `${id}.md`));
        fs.writeFileSync(path.join(trashDir, `${id}.meta.json`), JSON.stringify({ originalPath: args.path, fileName: path.basename(args.path), deletedAt: new Date().toISOString() }));
        return ok(`Trashed: ${args.path}`);
      }
      case "rename_note": {
        const vp = requireVault();
        const oldFull = path.join(vp, args.old_path);
        const newFull = path.join(vp, args.new_path);
        if (!fs.existsSync(oldFull)) return err(`Not found: ${args.old_path}`);
        const newDir = path.dirname(newFull);
        if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
        fs.renameSync(oldFull, newFull);
        return ok(`Renamed: ${args.old_path} → ${args.new_path}`);
      }

      // --- Browsing ---
      case "list_notes": {
        const vp = requireVault();
        const notes = listNotes(vp, args.folder);
        return ok(notes.map(n => n.path).join("\n") || "No notes found");
      }
      case "list_folders": {
        const vp = requireVault();
        const all = walkDir(vp);
        const folders = all.filter(f => f.type === "folder").map(f => f.path);
        return ok(folders.join("\n") || "No folders");
      }
      case "list_all_files": {
        const vp = requireVault();
        const base = args.folder ? path.join(vp, args.folder) : vp;
        const all = walkDir(base, args.folder || "").filter(f => f.type === "file");
        return ok(all.map(f => f.path).join("\n") || "No files");
      }
      case "search_notes": {
        const vp = requireVault();
        const results = searchNotes(vp, args.query);
        if (results.length === 0) return ok("No results");
        const text = results.map(r => `${r.file}\n${r.matches.map(m => `  L${m.line}: ${m.text}`).join("\n")}`).join("\n\n");
        return ok(text);
      }

      // --- Folder management ---
      case "create_folder": {
        const vp = requireVault();
        const full = path.join(vp, args.path);
        fs.mkdirSync(full, { recursive: true });
        return ok(`Created: ${args.path}`);
      }
      case "delete_folder": {
        const vp = requireVault();
        const full = path.join(vp, args.path);
        if (!fs.existsSync(full)) return err(`Not found: ${args.path}`);
        fs.rmSync(full, { recursive: true, force: true });
        return ok(`Deleted: ${args.path}`);
      }

      // --- Knowledge graph ---
      case "get_tags": {
        const vp = requireVault();
        const notes = listNotes(vp);
        const tagMap = {};
        for (const note of notes) {
          const content = readNote(vp, note.path);
          if (!content) continue;
          const tags = content.match(/#[\w/-]+/g) || [];
          for (const tag of tags) {
            if (!tagMap[tag]) tagMap[tag] = [];
            tagMap[tag].push(note.path);
          }
        }
        const entries = Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length);
        return ok(entries.map(([tag, files]) => `${tag} (${files.length}): ${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}`).join("\n") || "No tags");
      }
      case "get_backlinks": {
        const vp = requireVault();
        const targetName = path.basename(args.path).replace(/\.(md|markdown)$/i, "");
        const notes = listNotes(vp);
        const links = [];
        for (const note of notes) {
          if (note.path === args.path) continue;
          const content = readNote(vp, note.path);
          if (!content) continue;
          if (content.includes(`[[${targetName}]]`) || content.includes(`[[${targetName}|`)) links.push(note.path);
        }
        return ok(links.join("\n") || "No backlinks");
      }
      case "get_outgoing_links": {
        const vp = requireVault();
        const content = readNote(vp, args.path);
        if (!content) return err(`Not found: ${args.path}`);
        const links = [];
        const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let m;
        while ((m = regex.exec(content)) !== null) {
          if (!links.includes(m[1])) links.push(m[1]);
        }
        return ok(links.join("\n") || "No outgoing links");
      }

      // --- Stats & meta ---
      case "get_vault_stats": {
        const vp = requireVault();
        const notes = listNotes(vp);
        let words = 0, chars = 0;
        for (const note of notes) {
          const content = readNote(vp, note.path);
          if (!content) continue;
          words += content.split(/\s+/).filter(Boolean).length;
          chars += content.length;
        }
        return ok(`Vault: ${vp}\nNotes: ${notes.length}\nWords: ${words.toLocaleString()}\nCharacters: ${chars.toLocaleString()}`);
      }
      case "get_note_info": {
        const vp = requireVault();
        const content = readNote(vp, args.path);
        if (!content) return err(`Not found: ${args.path}`);
        const words = content.split(/\s+/).filter(Boolean).length;
        const lines = content.split("\n").length;
        const tags = [...new Set(content.match(/#[\w/-]+/g) || [])];
        const wikilinks = [];
        const linkRegex = /\[\[([^\]|]+)/g;
        let m;
        while ((m = linkRegex.exec(content)) !== null) { if (!wikilinks.includes(m[1])) wikilinks.push(m[1]); }
        // Frontmatter
        let fm = {};
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          for (const line of fmMatch[1].split("\n")) {
            const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
            if (kv) fm[kv[1]] = kv[2].trim();
          }
        }
        const fmStr = Object.keys(fm).length > 0 ? Object.entries(fm).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "  (none)";
        return ok(`Path: ${args.path}\nWords: ${words}\nLines: ${lines}\nTags: ${tags.join(", ") || "(none)"}\nLinks: ${wikilinks.join(", ") || "(none)"}\nFrontmatter:\n${fmStr}`);
      }

      // --- Daily notes ---
      case "create_daily_note": {
        const vp = requireVault();
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const dailyDir = path.join(vp, "Daily");
        if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
        const filePath = path.join(dailyDir, `${dateStr}.md`);
        if (!fs.existsSync(filePath)) {
          const content = args.content || `# ${dateStr}\n\n`;
          fs.writeFileSync(filePath, content, "utf-8");
          return ok(`Created: Daily/${dateStr}.md`);
        }
        return ok(`Exists: Daily/${dateStr}.md\n\n${fs.readFileSync(filePath, "utf-8")}`);
      }
      case "get_recent_daily_notes": {
        const vp = requireVault();
        const dailyDir = path.join(vp, "Daily");
        if (!fs.existsSync(dailyDir)) return ok("No daily notes");
        const files = fs.readdirSync(dailyDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse().slice(0, args.count || 7);
        return ok(files.map(f => `Daily/${f}`).join("\n") || "No daily notes");
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(String(e));
  }
});

// --- Resources ---

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const vp = getActiveVault();
    if (!vp) return { resources: [] };
    const notes = listNotes(vp);
    return {
      resources: notes.slice(0, 200).map(f => ({
        uri: `note:///${f.path}`,
        name: f.name.replace(/\.(md|markdown)$/i, ""),
        description: f.path,
        mimeType: "text/markdown",
      })),
    };
  } catch {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const relPath = request.params.uri.replace("note:///", "");
  const vp = requireVault();
  const content = readNote(vp, relPath);
  if (!content) throw new Error(`Not found: ${relPath}`);
  return { contents: [{ uri: request.params.uri, mimeType: "text/markdown", text: content }] };
});

// --- Helpers ---
function ok(text) { return { content: [{ type: "text", text }] }; }
function err(text) { return { content: [{ type: "text", text: `Error: ${text}` }], isError: true }; }

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const vp = getActiveVault();
  console.error(`Noteriv MCP server running${vp ? ` — vault: ${vp}` : " — no vault (use switch_vault)"}`);
}
main().catch(e => { console.error("MCP server error:", e); process.exit(1); });
