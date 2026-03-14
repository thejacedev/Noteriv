"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface SidebarProps {
  vault: Vault | null;
  currentFile: string | null;
  onFileSelect: (filePath: string) => void;
  onFileDelete: (filePath: string) => void;
  onFileRename: (oldPath: string, newPath: string) => void;
  onMoveFile: (sourcePath: string, destDir: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  collapsed: boolean;
  expandedFolders: string[];
  onExpandedFoldersChange: (folders: string[]) => void;
  fileOrder: Record<string, string[]>;
  onFileOrderChange: (order: Record<string, string[]>) => void;
  refreshTrigger?: number;
}

interface ContextMenuData {
  x: number;
  y: number;
  entry: FileEntry;
  parentDir: string;
}

type ContextMenuState = ContextMenuData | null;

type DropIndicator = {
  type: "between";
  dirPath: string;
  index: number;
} | {
  type: "into";
  dirPath: string;
};

function sortEntries(entries: FileEntry[], order: string[] | undefined): FileEntry[] {
  if (!order || order.length === 0) return entries;
  const orderMap = new Map(order.map((name, i) => [name, i]));
  return [...entries].sort((a, b) => {
    const ai = orderMap.get(a.name);
    const bi = orderMap.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
}

function FolderItem({
  entry,
  index,
  depth,
  parentDir,
  currentFile,
  onFileSelect,
  expandedFolders,
  onToggleFolder,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  fileOrder,
  dropIndicator,
  refreshKey,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onFolderDragOver,
  onFolderDrop,
}: {
  entry: FileEntry;
  index: number;
  depth: number;
  parentDir: string;
  currentFile: string | null;
  onFileSelect: (path: string) => void;
  expandedFolders: string[];
  onToggleFolder: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry, parentDir: string) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (val: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  fileOrder: Record<string, string[]>;
  dropIndicator: DropIndicator | null;
  refreshKey: number;
  onDragStart: (e: React.DragEvent, entry: FileEntry, parentDir: string) => void;
  onDragOver: (e: React.DragEvent, parentDir: string, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onFolderDragOver: (e: React.DragEvent, folderPath: string) => void;
  onFolderDrop: (e: React.DragEvent, folderPath: string) => void;
}) {
  const expanded = expandedFolders.includes(entry.path);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && !loaded && entry.isDirectory && window.electronAPI) {
      window.electronAPI.readDir(entry.path).then((entries) => {
        setChildren(entries);
        setLoaded(true);
      });
    }
  }, [expanded, loaded, entry.isDirectory, entry.path]);

  useEffect(() => {
    if (expanded && loaded && entry.isDirectory && window.electronAPI) {
      window.electronAPI.readDir(entry.path).then(setChildren);
    }
  }, [expanded, loaded, entry.isDirectory, entry.path, renamingPath, refreshKey]);

  const toggle = useCallback(() => {
    if (entry.isDirectory) {
      onToggleFolder(entry.path);
    } else {
      onFileSelect(entry.path);
    }
  }, [entry, onFileSelect, onToggleFolder]);

  const isActive = currentFile === entry.path;
  const isRenaming = renamingPath === entry.path;

  const didFocusRef = useRef(false);
  useEffect(() => {
    if (isRenaming && renameInputRef.current && !didFocusRef.current) {
      didFocusRef.current = true;
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
    if (!isRenaming) didFocusRef.current = false;
  }, [isRenaming, renameValue]);

  const sorted = sortEntries(children, fileOrder[entry.path]);

  const isFolderDropTarget = entry.isDirectory && dropIndicator?.type === "into" && dropIndicator.dirPath === entry.path;
  const showDropLineBefore = dropIndicator?.type === "between" && dropIndicator.dirPath === parentDir && dropIndicator.index === index;

  const indent = depth * 12 + 12;

  // Build class for the row
  let rowClass = "sb-row";
  if (isActive) rowClass += " sb-active";
  if (isFolderDropTarget) rowClass += " sb-drop-target";
  if (entry.isDirectory) rowClass += " sb-folder";

  return (
    <div>
      {showDropLineBefore && (
        <div className="sb-drop-line" style={{ marginLeft: `${indent}px` }} />
      )}
      <div
        draggable={!isRenaming}
        onDragStart={(e) => onDragStart(e, entry, parentDir)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (entry.isDirectory) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const h = rect.height;
            if (y < h * 0.25) onDragOver(e, parentDir, index);
            else if (y > h * 0.75) onDragOver(e, parentDir, index + 1);
            else onFolderDragOver(e, entry.path);
          } else {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            if (y < rect.height / 2) onDragOver(e, parentDir, index);
            else onDragOver(e, parentDir, index + 1);
          }
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (entry.isDirectory && dropIndicator?.type === "into" && dropIndicator.dirPath === entry.path) {
            onFolderDrop(e, entry.path);
          } else {
            onDrop(e);
          }
        }}
      >
        <button
          onClick={toggle}
          onContextMenu={(e) => onContextMenu(e, entry, parentDir)}
          className={rowClass}
          style={{ paddingLeft: `${indent}px` }}
        >
          {/* Indent guides */}
          {Array.from({ length: depth }, (_, i) => (
            <span key={i} className="sb-guide" style={{ left: `${i * 12 + 19}px` }} />
          ))}

          {/* Active indicator pill */}
          {isActive && <span className="sb-indicator" />}

          {entry.isDirectory && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className={`sb-chevron ${expanded ? "sb-chevron-open" : ""}`}
            >
              <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}

          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              onBlur={onRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="sb-rename"
            />
          ) : (
            <span className="sb-label">{entry.name.replace(/\.(md|markdown)$/i, "")}</span>
          )}
        </button>
      </div>

      {expanded && loaded && sorted.length > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragOver(e, entry.path, sorted.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDrop(e);
          }}
        >
          {sorted.map((child, ci) => (
            <FolderItem
              key={child.path}
              entry={child}
              index={ci}
              depth={depth + 1}
              parentDir={entry.path}
              currentFile={currentFile}
              onFileSelect={onFileSelect}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              fileOrder={fileOrder}
              dropIndicator={dropIndicator}
              refreshKey={refreshKey}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onFolderDragOver={onFolderDragOver}
              onFolderDrop={onFolderDrop}
            />
          ))}
          {dropIndicator?.type === "between" && dropIndicator.dirPath === entry.path && dropIndicator.index === sorted.length && (
            <div className="sb-drop-line" style={{ marginLeft: `${(depth + 1) * 12 + 12}px` }} />
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  vault,
  currentFile,
  onFileSelect,
  onFileDelete,
  onFileRename,
  onMoveFile,
  onNewFile,
  onNewFolder,
  collapsed,
  expandedFolders,
  onExpandedFoldersChange,
  fileOrder,
  onFileOrderChange,
  refreshTrigger,
}: SidebarProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const dragSourceRef = useRef<{ entry: FileEntry; parentDir: string } | null>(null);

  const refreshEntries = useCallback(async () => {
    if (vault && window.electronAPI) {
      const e = await window.electronAPI.readDir(vault.path);
      setEntries(e);
    }
  }, [vault]);

  useEffect(() => {
    refreshEntries();
    setRefreshKey((k) => k + 1);
  }, [refreshEntries, refreshTrigger]);

  const toggleFolder = useCallback((folderPath: string) => {
    onExpandedFoldersChange(
      expandedFolders.includes(folderPath)
        ? expandedFolders.filter((f) => f !== folderPath)
        : [...expandedFolders, folderPath]
    );
  }, [expandedFolders, onExpandedFoldersChange]);

  // Drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, entry: FileEntry, parentDir: string) => {
    dragSourceRef.current = { entry, parentDir };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", entry.path);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "0.4";
  }, []);

  const handleDragEnd = useCallback(() => {
    dragSourceRef.current = null;
    setDropIndicator(null);
    document.querySelectorAll("[draggable]").forEach((el) => {
      (el as HTMLElement).style.opacity = "";
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dirPath: string, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndicator({ type: "between", dirPath, index });
  }, []);

  const handleDragLeave = useCallback(() => {}, []);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragSourceRef.current?.entry.path === folderPath) return;
    setDropIndicator({ type: "into", dirPath: folderPath });
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    const source = dragSourceRef.current;
    if (!source) return;
    if (source.entry.path === folderPath) return;
    const sourceParent = source.entry.path.substring(0, source.entry.path.lastIndexOf("/"));
    if (sourceParent === folderPath) {
      setDropIndicator(null);
      dragSourceRef.current = null;
      return;
    }
    onMoveFile(source.entry.path, folderPath);
    if (!expandedFolders.includes(folderPath)) {
      onExpandedFoldersChange([...expandedFolders, folderPath]);
    }
    setDropIndicator(null);
    dragSourceRef.current = null;
    setTimeout(() => { refreshEntries(); setRefreshKey((k) => k + 1); }, 100);
  }, [onMoveFile, expandedFolders, onExpandedFoldersChange, refreshEntries]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const source = dragSourceRef.current;
    const indicator = dropIndicator;
    if (!source || !indicator || indicator.type !== "between") {
      setDropIndicator(null);
      dragSourceRef.current = null;
      return;
    }
    const { dirPath, index } = indicator;
    const sourceParent = source.entry.path.substring(0, source.entry.path.lastIndexOf("/"));

    if (sourceParent !== dirPath) {
      onMoveFile(source.entry.path, dirPath);
      setTimeout(async () => {
        if (window.electronAPI) {
          const dirEntries = await window.electronAPI.readDir(dirPath);
          const sorted = sortEntries(dirEntries, fileOrder[dirPath]);
          const names = sorted.map((e) => e.name);
          const movedName = source.entry.name;
          const filtered = names.filter((n) => n !== movedName);
          const insertIdx = Math.min(index, filtered.length);
          filtered.splice(insertIdx, 0, movedName);
          onFileOrderChange({ ...fileOrder, [dirPath]: filtered });
        }
        refreshEntries();
        setRefreshKey((k) => k + 1);
      }, 100);
    } else {
      let currentEntries: FileEntry[] = [];
      if (window.electronAPI) currentEntries = await window.electronAPI.readDir(dirPath);
      const sorted = sortEntries(currentEntries, fileOrder[dirPath]);
      const names = sorted.map((e) => e.name);
      const fromIdx = names.indexOf(source.entry.name);
      if (fromIdx === -1) return;
      names.splice(fromIdx, 1);
      let targetIdx = index;
      if (fromIdx < index) targetIdx--;
      targetIdx = Math.max(0, Math.min(targetIdx, names.length));
      names.splice(targetIdx, 0, source.entry.name);
      onFileOrderChange({ ...fileOrder, [dirPath]: names });
      setRefreshKey((k) => k + 1);
    }
    setDropIndicator(null);
    dragSourceRef.current = null;
  }, [dropIndicator, onMoveFile, fileOrder, onFileOrderChange, refreshEntries]);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry, parentDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry, parentDir });
  }, []);

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    if (!vault) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      entry: { name: "", path: vault.path, isDirectory: true },
      parentDir: vault.path,
    });
  }, [vault]);

  const startRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.isDirectory ? entry.name : entry.name.replace(/\.(md|markdown)$/i, ""));
  }, []);

  const submitRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim() || !window.electronAPI) {
      setRenamingPath(null);
      return;
    }
    const dir = renamingPath.substring(0, renamingPath.lastIndexOf("/"));
    const oldName = renamingPath.split("/").pop() || "";
    const ext = oldName.match(/\.(md|markdown)$/i)?.[0] || "";
    const newFileName = renameValue.trim() + ext;
    const newPath = `${dir}/${newFileName}`;
    if (newPath !== renamingPath) {
      const success = await window.electronAPI.rename(renamingPath, newPath);
      if (success) {
        onFileRename(renamingPath, newPath);
        if (fileOrder[dir]) {
          const updated = fileOrder[dir].map((n) => n === oldName ? newFileName : n);
          onFileOrderChange({ ...fileOrder, [dir]: updated });
        }
        await refreshEntries();
      }
    }
    setRenamingPath(null);
  }, [renamingPath, renameValue, onFileRename, refreshEntries, fileOrder, onFileOrderChange]);

  const cancelRename = useCallback(() => { setRenamingPath(null); }, []);

  const handleDelete = useCallback(async (entry: FileEntry) => {
    if (!window.electronAPI) return;
    const success = entry.isDirectory
      ? await window.electronAPI.deleteDir(entry.path)
      : await window.electronAPI.deleteFile(entry.path);
    if (success) { onFileDelete(entry.path); await refreshEntries(); setRefreshKey((k) => k + 1); }
  }, [onFileDelete, refreshEntries]);

  const handleNewFileIn = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return;
    let name = "Untitled.md";
    let counter = 1;
    const existing = await window.electronAPI.readDir(dirPath);
    const existingNames = existing.map((e) => e.name);
    while (existingNames.includes(name)) { counter++; name = `Untitled ${counter}.md`; }
    const filePath = `${dirPath}/${name}`;
    await window.electronAPI.createFile(filePath);
    if (vault && dirPath !== vault.path && !expandedFolders.includes(dirPath)) {
      onExpandedFoldersChange([...expandedFolders, dirPath]);
    }
    await refreshEntries();
    onFileSelect(filePath);
    setRenamingPath(filePath);
    setRenameValue(name.replace(/\.(md|markdown)$/i, ""));
  }, [vault, expandedFolders, onExpandedFoldersChange, refreshEntries, onFileSelect]);

  const handleNewFolderIn = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return;
    let name = "New Folder";
    let counter = 1;
    const existing = await window.electronAPI.readDir(dirPath);
    const existingNames = existing.map((e) => e.name);
    while (existingNames.includes(name)) { counter++; name = `New Folder ${counter}`; }
    const folderPath = `${dirPath}/${name}`;
    await window.electronAPI.createDir(folderPath);
    if (vault && dirPath !== vault.path && !expandedFolders.includes(dirPath)) {
      onExpandedFoldersChange([...expandedFolders, dirPath]);
    }
    await refreshEntries();
    setRenamingPath(folderPath);
    setRenameValue(name);
  }, [vault, expandedFolders, onExpandedFoldersChange, refreshEntries]);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { entry } = contextMenu;
    const isVaultRoot = vault && entry.path === vault.path;
    const targetDir = entry.isDirectory ? entry.path : contextMenu.parentDir;
    const items: ContextMenuItem[] = [];
    items.push({ label: "New File", onClick: () => handleNewFileIn(targetDir) });
    items.push({ label: "New Folder", onClick: () => handleNewFolderIn(targetDir) });
    if (!isVaultRoot) {
      items.push({ label: "", separator: true, onClick: () => {} });
      items.push({ label: "Rename", onClick: () => startRename(entry) });
      items.push({
        label: "Delete",
        danger: true,
        onClick: () => handleDelete(entry),
      });
    }
    return items;
  }, [contextMenu, vault, handleNewFileIn, handleNewFolderIn, startRename, handleDelete]);

  if (collapsed) return null;

  const sorted = sortEntries(entries, vault ? fileOrder[vault.path] : undefined);

  return (
    <div
      className="sidebar-root"
    >
      {vault ? (
        <>
          {/* Header */}
          <div className="sidebar-header">
            <span className="sidebar-title">{vault.name}</span>
            <button onClick={onNewFile} className="sidebar-btn" title="New file">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* File tree */}
          <div
            className="flex-1 overflow-y-auto py-1"
            onContextMenu={handleEmptyContextMenu}
            onDragOver={(e) => {
              e.preventDefault();
              if (vault) handleDragOver(e, vault.path, sorted.length);
            }}
            onDrop={(e) => { e.preventDefault(); handleDrop(e); }}
          >
            {sorted.length > 0 ? (
              sorted.map((entry, i) => (
                <FolderItem
                  key={entry.path}
                  entry={entry}
                  index={i}
                  depth={0}
                  parentDir={vault.path}
                  currentFile={currentFile}
                  onFileSelect={onFileSelect}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  onContextMenu={handleContextMenu}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameSubmit={submitRename}
                  onRenameCancel={cancelRename}
                  fileOrder={fileOrder}
                  dropIndicator={dropIndicator}
                  refreshKey={refreshKey}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onFolderDragOver={handleFolderDragOver}
                  onFolderDrop={handleFolderDrop}
                />
              ))
            ) : (
              <div className="sidebar-empty">
                <p>No notes yet</p>
                <button onClick={onNewFile}>Create a note</button>
              </div>
            )}
            {dropIndicator?.type === "between" && vault && dropIndicator.dirPath === vault.path && dropIndicator.index === sorted.length && (
              <div className="sb-drop-line" />
            )}
          </div>

        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-[var(--text-muted)] text-center">No vault selected</p>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
