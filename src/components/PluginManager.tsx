"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PluginInstance } from "@/lib/plugin-api";
import {
  CommunityPluginEntry,
  fetchCommunityPluginManifest,
  installCommunityPlugin,
} from "@/lib/plugin-api";
import "@/styles/plugins.css";

type Tab = "installed" | "community";

interface PluginManagerProps {
  vaultPath: string;
  plugins: PluginInstance[];
  onTogglePlugin: (id: string, enabled: boolean) => void;
  onInstallPlugin: () => void;
  onUninstallPlugin: (id: string) => void;
  onClose: () => void;
}

export default function PluginManagerModal({
  vaultPath,
  plugins,
  onTogglePlugin,
  onInstallPlugin,
  onUninstallPlugin,
  onClose,
}: PluginManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("installed");
  const [search, setSearch] = useState("");
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Community state
  const [communityEntries, setCommunityEntries] = useState<CommunityPluginEntry[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState("");
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [communitySearch, setCommunitySearch] = useState("");

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmUninstall) {
          setConfirmUninstall(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, confirmUninstall]);

  // Load community when tab first activated
  useEffect(() => {
    if (activeTab === "community" && !communityLoaded && !communityLoading) {
      loadCommunity();
    }
  }, [activeTab]);

  // Backdrop click
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const loadCommunity = async () => {
    setCommunityLoading(true);
    setCommunityError("");
    const manifest = await fetchCommunityPluginManifest();
    if (!manifest) {
      setCommunityError("Failed to load community plugins. Check your connection.");
      setCommunityLoading(false);
      return;
    }
    setCommunityEntries(manifest.plugins);
    setCommunityLoaded(true);
    setCommunityLoading(false);
  };

  const handleInstallCommunity = useCallback(
    async (entry: CommunityPluginEntry) => {
      setInstallingId(entry.id);
      const ok = await installCommunityPlugin(vaultPath, entry);
      setInstallingId(null);
      if (ok) {
        // Reload the page's plugin list — toggle it on
        onTogglePlugin(entry.id, true);
      }
    },
    [vaultPath, onTogglePlugin]
  );

  const isInstalled = (id: string) => plugins.some((p) => p.manifest.id === id);

  // Filter plugins by search query
  const filteredPlugins = plugins.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      p.manifest.description.toLowerCase().includes(q) ||
      p.manifest.author.toLowerCase().includes(q) ||
      p.manifest.id.toLowerCase().includes(q)
    );
  });

  const filteredCommunity = communityEntries.filter((e) =>
    !communitySearch ||
    e.name.toLowerCase().includes(communitySearch.toLowerCase()) ||
    e.description.toLowerCase().includes(communitySearch.toLowerCase()) ||
    e.author.toLowerCase().includes(communitySearch.toLowerCase())
  );

  const handleUninstall = (id: string) => {
    if (confirmUninstall === id) {
      onUninstallPlugin(id);
      setConfirmUninstall(null);
    } else {
      setConfirmUninstall(id);
    }
  };

  return (
    <div ref={overlayRef} className="plugin-manager-overlay" onClick={handleBackdrop}>
      <div className="plugin-manager-modal">
        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-left">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="pm-header-icon">
              <path
                d="M8 1.5L2 4.5v4l6 3 6-3v-4L8 1.5z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path d="M2 4.5L8 7.5l6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M8 7.5v4.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <h2 className="pm-title">Plugins</h2>
          </div>
          <button onClick={onClose} className="pm-close-btn">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="pm-tabs">
          <button
            className={`pm-tab${activeTab === "installed" ? " pm-tab-active" : ""}`}
            onClick={() => setActiveTab("installed")}
          >
            Installed
            {plugins.length > 0 && (
              <span className="pm-tab-count">{plugins.length}</span>
            )}
          </button>
          <button
            className={`pm-tab${activeTab === "community" ? " pm-tab-active" : ""}`}
            onClick={() => setActiveTab("community")}
          >
            Community
          </button>
        </div>

        {/* Content */}
        <div className="pm-content">
          {activeTab === "installed" ? (
            <>
              {/* Search + Install row */}
              <div className="pm-toolbar">
                <div className="pm-search-wrap">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="pm-search-icon">
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    className="pm-search-input"
                    placeholder="Search installed plugins..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button className="pm-search-clear" onClick={() => setSearch("")}>
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <button className="pm-install-btn" onClick={onInstallPlugin}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Install
                </button>
              </div>

              {/* Plugin list */}
              {filteredPlugins.length === 0 ? (
                <div className="pm-empty">
                  {plugins.length === 0 ? (
                    <>
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="pm-empty-icon">
                        <rect x="4" y="8" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M20 15v10M15 20h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <p className="pm-empty-title">No plugins installed</p>
                      <p className="pm-empty-desc">
                        Browse the <button className="pm-inline-link" onClick={() => setActiveTab("community")}>Community</button> tab or click &ldquo;Install&rdquo; to add a plugin from a local folder.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="pm-empty-title">No matching plugins</p>
                      <p className="pm-empty-desc">
                        No installed plugins match &ldquo;{search}&rdquo;.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="pm-plugin-list">
                  {filteredPlugins.map((plugin) => (
                    <div
                      key={plugin.manifest.id}
                      className={`pm-plugin-card${plugin.error ? " pm-plugin-error-card" : ""}`}
                    >
                      <div className="pm-plugin-info">
                        <div className="pm-plugin-header">
                          <span className="pm-plugin-name">{plugin.manifest.name}</span>
                          <span className="pm-plugin-version">v{plugin.manifest.version}</span>
                        </div>
                        <p className="pm-plugin-desc">{plugin.manifest.description}</p>
                        <div className="pm-plugin-meta">
                          <span className="pm-plugin-author">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1" />
                              <path d="M1.5 11c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                            </svg>
                            {plugin.manifest.author}
                          </span>
                          <span className="pm-plugin-id">{plugin.manifest.id}</span>
                        </div>
                        {plugin.error && (
                          <div className="pm-plugin-error">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
                              <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                              <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
                            </svg>
                            <span>{plugin.error}</span>
                          </div>
                        )}
                      </div>

                      <div className="pm-plugin-actions">
                        <button
                          className={`st-toggle${plugin.enabled ? " st-toggle-on" : ""}`}
                          onClick={() => onTogglePlugin(plugin.manifest.id, !plugin.enabled)}
                          role="switch"
                          aria-checked={plugin.enabled}
                          title={plugin.enabled ? "Disable plugin" : "Enable plugin"}
                        >
                          <span className="st-toggle-thumb" />
                        </button>

                        <button
                          className={`pm-uninstall-btn${confirmUninstall === plugin.manifest.id ? " pm-uninstall-confirm" : ""}`}
                          onClick={() => handleUninstall(plugin.manifest.id)}
                          title={confirmUninstall === plugin.manifest.id ? "Click again to confirm" : "Uninstall plugin"}
                        >
                          {confirmUninstall === plugin.manifest.id ? (
                            "Confirm?"
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path d="M3 4h8l-.75 8.25a1 1 0 01-1 .75H4.75a1 1 0 01-1-.75L3 4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                              <path d="M2 4h10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                              <path d="M5.5 2h3a1 1 0 011 1H4.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1" />
                              <path d="M6 6.5v3.5M8 6.5v3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Community tab */
            <div className="pm-community-tab">
              <div className="pm-toolbar">
                <div className="pm-search-wrap">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="pm-search-icon">
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    className="pm-search-input"
                    placeholder="Search community plugins..."
                    value={communitySearch}
                    onChange={(e) => setCommunitySearch(e.target.value)}
                  />
                  {communitySearch && (
                    <button className="pm-search-clear" onClick={() => setCommunitySearch("")}>
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="pm-community-list">
                {communityLoading ? (
                  <div className="pm-community-status">
                    <div className="pm-community-spinner" />
                    Loading community plugins...
                  </div>
                ) : communityError ? (
                  <div className="pm-community-status pm-community-status-err">
                    <span>{communityError}</span>
                    <button className="pm-community-retry" onClick={loadCommunity}>Retry</button>
                  </div>
                ) : filteredCommunity.length === 0 ? (
                  <div className="pm-community-status">No plugins found.</div>
                ) : (
                  filteredCommunity.map((entry) => {
                    const installed = isInstalled(entry.id);
                    const installing = installingId === entry.id;
                    return (
                      <div key={entry.id} className="pm-community-card">
                        <div className="pm-plugin-info">
                          <div className="pm-plugin-header">
                            <span className="pm-plugin-name">{entry.name}</span>
                            <span className="pm-plugin-version">v{entry.version}</span>
                          </div>
                          <p className="pm-plugin-desc">{entry.description}</p>
                          <div className="pm-plugin-meta">
                            <span className="pm-plugin-author">
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1" />
                                <path d="M1.5 11c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                              </svg>
                              {entry.author}
                            </span>
                            <span className="pm-plugin-id">{entry.id}</span>
                          </div>
                        </div>
                        <div className="pm-plugin-actions">
                          {installed ? (
                            <span className="pm-community-installed">
                              <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              Installed
                            </span>
                          ) : (
                            <button
                              className="pm-community-install-btn"
                              onClick={() => handleInstallCommunity(entry)}
                              disabled={installing}
                            >
                              {installing ? "Installing..." : "Install"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <a
                className="pm-community-gh"
                href="https://github.com/thejacedev/NoterivPlugins"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open("https://github.com/thejacedev/NoterivPlugins", "_blank"); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" fill="currentColor" />
                </svg>
                Submit your plugin
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
