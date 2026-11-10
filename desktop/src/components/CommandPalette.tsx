"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { HotkeyBinding, HotkeyAction, formatHotkey } from "@/lib/hotkeys";
import type { PluginCommand } from "@/lib/plugin-api";

interface CommandPaletteProps {
  hotkeys: HotkeyBinding[];
  platform: string;
  recentActions?: HotkeyAction[];
  pluginCommands?: PluginCommand[];
  onExecute: (action: HotkeyAction) => void;
  onRecent?: (action: HotkeyAction) => void;
  onRunPluginCommand?: (cmd: PluginCommand) => void;
  onClose: () => void;
}

/** A built-in action or a plugin command, as listed in the palette. */
interface PaletteItem {
  id: string;
  label: string;
  category: string;
  keys: string;
  action?: HotkeyAction;
  plugin?: PluginCommand;
}

export default function CommandPalette({ hotkeys, platform, recentActions = [], pluginCommands = [], onExecute, onRecent, onRunPluginCommand, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<PaletteItem[]>(() => [
    ...hotkeys.map((h) => ({ id: h.action, label: h.label, category: h.category, keys: h.keys, action: h.action })),
    ...pluginCommands.map((c) => ({ id: c.id, label: c.name, category: "Plugins", keys: c.hotkey ?? "", plugin: c })),
  ], [hotkeys, pluginCommands]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower) ||
        item.id.toLowerCase().includes(lower)
    );
  }, [query, items]);

  // Recent items (only shown when query is empty)
  const recentItems = useMemo(() => {
    if (query.trim()) return [];
    return recentActions
      .map((action) => items.find((item) => item.action === action))
      .filter((item): item is PaletteItem => item !== undefined);
  }, [query, recentActions, items]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: string; items: PaletteItem[] }[] = [];
    const seen = new Set<string>();
    for (const item of filtered) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        groups.push({ category: item.category, items: [] });
      }
      groups.find((g) => g.category === item.category)!.items.push(item);
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation (recent items first when no query)
  const flatItems = useMemo(() => {
    return [...recentItems, ...filtered];
  }, [recentItems, filtered]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-cmd-idx="${selectedIdx}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const executeCommand = useCallback((item: PaletteItem) => {
    if (item.plugin) {
      onRunPluginCommand?.(item.plugin);
    } else if (item.action) {
      onRecent?.(item.action);
      onExecute(item.action);
    }
    onClose();
  }, [onExecute, onRecent, onRunPluginCommand, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIdx]) {
          executeCommand(flatItems[selectedIdx]);
        }
      }
    },
    [flatItems, selectedIdx, executeCommand, onClose]
  );

  let flatIdx = 0;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette palette-wide" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <svg width="14" height="14" viewBox="0 0 16 16" className="palette-icon">
            <path d="M1 3h14M1 8h14M1 13h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="palette-input"
          />
        </div>

        <div className="palette-list" ref={listRef}>
          {/* Recent commands section (only when query is empty) */}
          {recentItems.length > 0 && (
            <div>
              <div className="cmd-category cmd-category-recent">Recent</div>
              {recentItems.map((item) => {
                const idx = flatIdx++;
                const isActive = idx === selectedIdx;
                return (
                  <button
                    key={`recent-${item.id}`}
                    data-cmd-idx={idx}
                    className={`palette-item${isActive ? " palette-item-active" : ""}`}
                    onClick={() => executeCommand(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <span className="palette-item-name">{item.label}</span>
                    {item.keys && (
                      <span className="cmd-keys">
                        {formatHotkey(item.keys, platform)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="cmd-category">{group.category}</div>
              {group.items.map((item) => {
                const idx = flatIdx++;
                const isActive = idx === selectedIdx;
                return (
                  <button
                    key={item.id}
                    data-cmd-idx={idx}
                    className={`palette-item${isActive ? " palette-item-active" : ""}`}
                    onClick={() => executeCommand(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <span className="palette-item-name">{item.label}</span>
                    {item.keys && (
                      <span className="cmd-keys">
                        {formatHotkey(item.keys, platform)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <div className="palette-empty">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
