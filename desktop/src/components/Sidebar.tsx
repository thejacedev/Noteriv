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
  onTrashFile?: (filePath: string) => void;
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
  selectedFiles,
  onFileClick,
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
  selectedFiles?: Set<string>;
  onFileClick?: (e: React.MouseEvent, entry: FileEntry) => boolean;
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

  const toggle = useCallback((e?: React.MouseEvent) => {
    if (entry.isDirectory) {
      onToggleFolder(entry.path);
    } else {
      if (e && onFileClick && onFileClick(e, entry)) return;
      onFileSelect(entry.path);
    }
  }, [entry, onFileSelect, onToggleFolder, onFileClick]);

  const isActive = currentFile === entry.path;
  const isSelected = selectedFiles?.has(entry.path) ?? false;
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
          onClick={(e) => toggle(e)}
          onContextMenu={(e) => onContextMenu(e, entry, parentDir)}
          className={`${rowClass}${isSelected ? " sb-selected" : ""}`}
          style={{ paddingLeft: `${indent}px` }}
          data-filepath={entry.isDirectory ? undefined : entry.path}
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
              selectedFiles={selectedFiles}
              onFileClick={onFileClick}
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
  onTrashFile,
}: SidebarProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const lastClickedFile = useRef<string | null>(null);

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

    // Collect all files to move: selected files + dragged file
    const filesToMove = new Set(selectedFiles);
    filesToMove.add(source.entry.path);

    for (const filePath of filesToMove) {
      const parent = filePath.substring(0, filePath.lastIndexOf("/"));
      if (parent === folderPath) continue;
      onMoveFile(filePath, folderPath);
    }

    if (!expandedFolders.includes(folderPath)) {
      onExpandedFoldersChange([...expandedFolders, folderPath]);
    }
    setDropIndicator(null);
    dragSourceRef.current = null;
    setSelectedFiles(new Set());
    setTimeout(() => { refreshEntries(); setRefreshKey((k) => k + 1); }, 100);
  }, [onMoveFile, expandedFolders, onExpandedFoldersChange, refreshEntries, selectedFiles]);

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

    // Collect all files to move: selected files + dragged file
    const filesToMove = new Set(selectedFiles);
    filesToMove.add(source.entry.path);

    if (sourceParent !== dirPath) {
      // Moving to a different directory — move all selected
      for (const filePath of filesToMove) {
        const parent = filePath.substring(0, filePath.lastIndexOf("/"));
        if (parent === dirPath) continue;
        onMoveFile(filePath, dirPath);
      }
      setSelectedFiles(new Set());
      setTimeout(async () => {
        refreshEntries();
        setRefreshKey((k) => k + 1);
      }, 100);
    } else {
      // Reorder within same directory (only single file reorder makes sense)
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
  }, [dropIndicator, onMoveFile, fileOrder, onFileOrderChange, refreshEntries, selectedFiles]);

  // Build flat list of visible files from DOM order for shift-select
  const getAllVisibleFiles = useCallback((): string[] => {
    const container = document.querySelector(".sidebar-root .flex-1.overflow-y-auto");
    if (!container) return [];
    const buttons = container.querySelectorAll<HTMLElement>(".sb-row:not(.sb-folder)");
    const paths: string[] = [];
    buttons.forEach((btn) => {
      const path = btn.getAttribute("data-filepath");
      if (path) paths.push(path);
    });
    return paths;
  }, []);

  const handleFileClick = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    if (entry.isDirectory) return false;

    // Ctrl/Cmd+Click: toggle individual file
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
      lastClickedFile.current = entry.path;
      return true;
    }

    // Shift+Click: select range from last clicked to this one
    if (e.shiftKey && lastClickedFile.current) {
      e.preventDefault();
      e.stopPropagation();
      const allFiles = getAllVisibleFiles();
      const startIdx = allFiles.indexOf(lastClickedFile.current);
      const endIdx = allFiles.indexOf(entry.path);
      if (startIdx !== -1 && endIdx !== -1) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            next.add(allFiles[i]);
          }
          return next;
        });
      }
      return true;
    }

    // Normal click: clear selection
    setSelectedFiles(new Set());
    lastClickedFile.current = entry.path;
    return false;
  }, [getAllVisibleFiles]);

  const handleMergeNotes = useCallback(async () => {
    if (!window.electronAPI || selectedFiles.size < 2) return;
    const paths = Array.from(selectedFiles).sort();
    const contents: string[] = [];
    const names: string[] = [];
    for (const p of paths) {
      const c = await window.electronAPI.readFile(p);
      if (c !== null) {
        contents.push(c);
        names.push(p.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "");
      }
    }
    if (contents.length < 2) return;

    const merged = contents.join("\n\n---\n\n");
    const mergedName = `Merged - ${names[0]} + ${names.length - 1} more.md`;
    const dir = paths[0].substring(0, paths[0].lastIndexOf("/"));
    const mergedPath = `${dir}/${mergedName}`;
    await window.electronAPI.writeFile(mergedPath, merged);
    await refreshEntries();
    setSelectedFiles(new Set());
    onFileSelect(mergedPath);
  }, [selectedFiles, refreshEntries, onFileSelect]);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry, parentDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Add to selection if ctrl-clicking
    if ((e.ctrlKey || e.metaKey) && !entry.isDirectory) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        next.add(entry.path);
        return next;
      });
    }
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
    if (!entry.isDirectory && onTrashFile) {
      onTrashFile(entry.path);
      await refreshEntries();
      setRefreshKey((k) => k + 1);
      return;
    }
    const success = entry.isDirectory
      ? await window.electronAPI.deleteDir(entry.path)
      : await window.electronAPI.deleteFile(entry.path);
    if (success) { onFileDelete(entry.path); await refreshEntries(); setRefreshKey((k) => k + 1); }
  }, [onFileDelete, refreshEntries, onTrashFile]);

  const handleDeleteSelected = useCallback(async () => {
    if (!window.electronAPI || selectedFiles.size === 0) return;
    for (const path of selectedFiles) {
      if (onTrashFile) {
        onTrashFile(path);
      } else {
        await window.electronAPI.deleteFile(path);
        onFileDelete(path);
      }
    }
    setSelectedFiles(new Set());
    await refreshEntries();
    setRefreshKey((k) => k + 1);
  }, [selectedFiles, onTrashFile, onFileDelete, refreshEntries]);

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

    // Count selection (include right-clicked file)
    const selectionIncludesEntry = selectedFiles.has(entry.path);
    const totalSelected = selectedFiles.size + (!entry.isDirectory && !selectionIncludesEntry ? 1 : 0);
    const hasMultiSelect = totalSelected >= 2;

    // Ensure right-clicked file is in selection for multi-ops
    if (!entry.isDirectory && !selectionIncludesEntry && selectedFiles.size > 0) {
      setSelectedFiles((prev) => new Set([...prev, entry.path]));
    }

    items.push({ label: "New File", onClick: () => handleNewFileIn(targetDir) });
    items.push({ label: "New Folder", onClick: () => handleNewFolderIn(targetDir) });

    if (hasMultiSelect) {
      items.push({ label: "", separator: true, onClick: () => {} });
      items.push({
        label: `Merge ${totalSelected} Notes`,
        onClick: handleMergeNotes,
      });
      items.push({
        label: `Delete ${totalSelected} Files`,
        danger: true,
        onClick: handleDeleteSelected,
      });
    }

    if (!isVaultRoot) {
      items.push({ label: "", separator: true, onClick: () => {} });
      if (!hasMultiSelect) {
        items.push({ label: "Rename", onClick: () => startRename(entry) });
      }
      if (!hasMultiSelect) {
        items.push({
          label: "Delete",
          danger: true,
          onClick: () => handleDelete(entry),
        });
      }
    }
    return items;
  }, [contextMenu, vault, handleNewFileIn, handleNewFolderIn, startRename, handleDelete, selectedFiles, handleMergeNotes, handleDeleteSelected]);

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
                  selectedFiles={selectedFiles}
                  onFileClick={handleFileClick}
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
