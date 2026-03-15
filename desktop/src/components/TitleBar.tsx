"use client";

import { useState, useEffect } from "react";
import VaultSwitcher from "./VaultSwitcher";

interface Tab {
  filePath: string;
  name: string;
  isDirty: boolean;
}

interface TitleBarProps {
  tabs: Tab[];
  activeTab: string | null;
  vaults: Vault[];
  activeVault: Vault | null;
  sidebarCollapsed: boolean;
  viewMode: "live" | "source" | "view";
  onTabSelect: (filePath: string) => void;
  onTabClose: (filePath: string) => void;
  onTabReorder: (from: number, to: number) => void;
  onToggleSidebar: () => void;
  onViewModeChange: (mode: "live" | "source" | "view") => void;
  onNewFile: () => void;
  onSave: () => void;
  onOpenSettings: () => void;
  onSwitchVault: (id: string) => void;
  onCreateVault: () => void;
  onDeleteVault: (id: string) => void;
}

export default function TitleBar({
  tabs,
  activeTab,
  vaults,
  activeVault,
  sidebarCollapsed,
  viewMode,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onToggleSidebar,
  onViewModeChange,
  onNewFile,
  onSave,
  onOpenSettings,
  onSwitchVault,
  onCreateVault,
  onDeleteVault,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState("linux");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.windowIsMaximized().then(setIsMaximized);
    window.electronAPI.getPlatform().then(setPlatform);
  }, []);

  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = async () => {
    const maximized = await window.electronAPI?.windowMaximize();
    setIsMaximized(!!maximized);
  };
  const handleClose = () => window.electronAPI?.windowClose();

  // Tab drag and drop
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      onTabReorder(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const isMac = platform === "darwin";

  return (
    <div className="titlebar">
      {/* Top row: controls */}
      <div className="titlebar-controls">
        {/* macOS traffic lights */}
        {isMac && (
          <div className="mac-controls">
            <button onClick={handleClose} className="mac-dot mac-close" title="Close" />
            <button onClick={handleMinimize} className="mac-dot mac-min" title="Minimize" />
            <button onClick={handleMaximize} className="mac-dot mac-max" title="Maximize" />
          </div>
        )}

        {/* Left: sidebar toggle + vault switcher */}
        <div className="titlebar-section" style={{ paddingLeft: isMac ? 0 : 8 }}>
          <button onClick={onToggleSidebar} className="titlebar-btn" title="Toggle Sidebar (Ctrl+B)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill={sidebarCollapsed ? "none" : "rgba(137,180,250,0.12)"} />
              <rect x="7" y="2" width="8" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>

          <div className="titlebar-divider" />

          <VaultSwitcher
            vaults={vaults}
            activeVault={activeVault}
            onSwitch={onSwitchVault}
            onCreateNew={onCreateVault}
            onDelete={onDeleteVault}
            onManageGit={() => {}}
          />
        </div>

        {/* Center: drag area */}
        <div style={{ flex: 1 }} />

        {/* Right: view toggle + window controls */}
        <div className="titlebar-section" style={{ paddingRight: 8 }}>
          <div className="view-toggle">
            <button
              onClick={() => onViewModeChange("live")}
              className={`view-toggle-btn ${viewMode === "live" ? "vt-active" : ""}`}
            >
              Edit
            </button>
            <button
              onClick={() => onViewModeChange("view")}
              className={`view-toggle-btn ${viewMode === "view" ? "vt-active" : ""}`}
            >
              View
            </button>
            <button
              onClick={() => onViewModeChange("source")}
              className={`view-toggle-btn ${viewMode === "source" ? "vt-active" : ""}`}
            >
              Source
            </button>
          </div>

          <button onClick={onOpenSettings} className="titlebar-btn" title="Settings (Ctrl+,)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Windows/Linux window controls */}
          {!isMac && (
            <div className="win-controls">
              <button onClick={handleMinimize} className="win-btn" title="Minimize">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" /></svg>
              </button>
              <button onClick={handleMaximize} className="win-btn" title="Maximize">
                {isMaximized ? (
                  <svg width="12" height="12" viewBox="0 0 12 12"><rect x="3" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /><rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="var(--bg-secondary)" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
                )}
              </button>
              <button onClick={handleClose} className="win-btn win-btn-close" title="Close">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map((tab, idx) => {
          const isActive = tab.filePath === activeTab;
          const isDragging = dragIdx === idx;
          const isDragOver = dragOverIdx === idx && dragIdx !== idx;

          return (
            <div
              key={tab.filePath}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onTabSelect(tab.filePath)}
              className={`tab${isActive ? " tab-active" : ""}${isDragging ? " tab-dragging" : ""}${isDragOver ? " tab-dragover" : ""}`}
            >
              <span className="tab-label">{tab.name}</span>
              {tab.isDirty && <span className="tab-dirty" />}
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.filePath); }}
                className="tab-close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              </button>
            </div>
          );
        })}

        {/* New tab */}
        <button onClick={onNewFile} className="tab-new" title="New File">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}
