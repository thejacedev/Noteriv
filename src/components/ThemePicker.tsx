"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ThemeDefinition,
  BUILT_IN_THEMES,
  loadCustomThemes,
  deleteCustomTheme,
  importTheme,
  saveCustomTheme,
  exportTheme,
  CommunityThemeEntry,
  fetchCommunityManifest,
  fetchCommunityTheme,
} from "@/lib/theme-utils";
import "@/styles/themes.css";

type Tab = "installed" | "community";

interface ThemePickerProps {
  currentThemeId: string;
  vaultPath: string;
  onThemeSelect: (themeId: string) => void;
}

export default function ThemePicker({
  currentThemeId,
  vaultPath,
  onThemeSelect,
}: ThemePickerProps) {
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("installed");
  const [communityEntries, setCommunityEntries] = useState<CommunityThemeEntry[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState("");
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [communityFilter, setCommunityFilter] = useState<"all" | "dark" | "light">("all");
  const [communityPreviews, setCommunityPreviews] = useState<Record<string, ThemeDefinition>>({});

  useEffect(() => {
    if (vaultPath) {
      loadCustomThemes(vaultPath).then(setCustomThemes);
    }
  }, [vaultPath]);

  useEffect(() => {
    if (activeTab === "community" && !communityLoaded && !communityLoading) {
      loadCommunity();
    }
  }, [activeTab]);

  const loadCommunity = async () => {
    setCommunityLoading(true);
    setCommunityError("");
    const manifest = await fetchCommunityManifest();
    if (!manifest) {
      setCommunityError("Failed to load community themes. Check your connection.");
      setCommunityLoading(false);
      return;
    }
    setCommunityEntries(manifest.themes);
    setCommunityLoaded(true);
    const previews: Record<string, ThemeDefinition> = {};
    await Promise.allSettled(
      manifest.themes.map(async (entry) => {
        const theme = await fetchCommunityTheme(entry.file);
        if (theme) previews[entry.id] = theme;
      })
    );
    setCommunityPreviews(previews);
    setCommunityLoading(false);
  };

  const handleImport = useCallback(async () => {
    setImportError("");
    const theme = importTheme(importJson);
    if (!theme) {
      setImportError("Invalid theme JSON. Must have id, name, and colors.");
      return;
    }
    if (
      BUILT_IN_THEMES.some((t) => t.id === theme.id) ||
      customThemes.some((t) => t.id === theme.id)
    ) {
      setImportError(`Theme with id "${theme.id}" already exists.`);
      return;
    }
    await saveCustomTheme(vaultPath, theme);
    setCustomThemes((prev) => [...prev, theme]);
    setImportJson("");
    setShowImport(false);
  }, [importJson, vaultPath, customThemes]);

  const handleDelete = useCallback(
    async (themeId: string) => {
      await deleteCustomTheme(vaultPath, themeId);
      setCustomThemes((prev) => prev.filter((t) => t.id !== themeId));
      if (currentThemeId === themeId) {
        onThemeSelect("catppuccin-mocha");
      }
    },
    [vaultPath, currentThemeId, onThemeSelect]
  );

  const handleExport = useCallback((theme: ThemeDefinition) => {
    navigator.clipboard.writeText(exportTheme(theme));
    setCopiedId(theme.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleInstallCommunity = useCallback(
    async (entry: CommunityThemeEntry) => {
      setInstallingId(entry.id);
      const theme = communityPreviews[entry.id] || await fetchCommunityTheme(entry.file);
      if (!theme) {
        setInstallingId(null);
        return;
      }
      await saveCustomTheme(vaultPath, theme);
      setCustomThemes((prev) => {
        if (prev.some((t) => t.id === theme.id)) return prev;
        return [...prev, theme];
      });
      setInstallingId(null);
    },
    [vaultPath, communityPreviews]
  );

  const isInstalled = (id: string) =>
    BUILT_IN_THEMES.some((t) => t.id === id) || customThemes.some((t) => t.id === id);

  const filteredCommunity = communityEntries.filter(
    (e) => communityFilter === "all" || e.type === communityFilter
  );

  const renderThemeCard = (theme: ThemeDefinition, isCustom: boolean) => {
    const isActive = currentThemeId === theme.id;
    return (
      <div
        key={theme.id}
        className={`tp-card${isActive ? " tp-card-active" : ""}`}
        onClick={() => onThemeSelect(theme.id)}
      >
        <div className="tp-card-preview" style={{ background: theme.colors.bgPrimary }}>
          <div className="tp-card-sidebar" style={{ background: theme.colors.bgSecondary }} />
          <div className="tp-card-lines">
            <div className="tp-card-line" style={{ background: theme.colors.textPrimary, width: "60%" }} />
            <div className="tp-card-line" style={{ background: theme.colors.textMuted, width: "80%" }} />
            <div className="tp-card-line" style={{ background: theme.colors.accent, width: "40%" }} />
          </div>
        </div>
        <div className="tp-card-dots">
          {[theme.colors.accent, theme.colors.green, theme.colors.red, theme.colors.yellow, theme.colors.mauve].map((c, i) => (
            <span key={i} className="tp-dot" style={{ background: c }} />
          ))}
        </div>
        <div className="tp-card-bottom">
          <div className="tp-card-meta">
            <span className="tp-card-name">{theme.name}</span>
            <span className="tp-card-author">{theme.author}</span>
          </div>
          <div className="tp-card-btns" onClick={(e) => e.stopPropagation()}>
            <button className="tp-icon-btn" onClick={() => handleExport(theme)} title="Copy JSON">
              {copiedId === theme.id ? (
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="var(--green, #a6e3a1)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" /><path d="M8 4V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1" /></svg>
              )}
            </button>
            {isCustom && (
              <button className="tp-icon-btn tp-icon-btn-danger" onClick={() => handleDelete(theme.id)} title="Delete">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M4 3V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V3M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCommunityCard = (entry: CommunityThemeEntry) => {
    const preview = communityPreviews[entry.id];
    const installed = isInstalled(entry.id);
    const installing = installingId === entry.id;

    return (
      <div
        key={entry.id}
        className={`tp-card${installed ? " tp-card-installed" : " tp-card-browse"}`}
        onClick={installed ? () => onThemeSelect(entry.id) : undefined}
      >
        {preview ? (
          <>
            <div className="tp-card-preview" style={{ background: preview.colors.bgPrimary }}>
              <div className="tp-card-sidebar" style={{ background: preview.colors.bgSecondary }} />
              <div className="tp-card-lines">
                <div className="tp-card-line" style={{ background: preview.colors.textPrimary, width: "60%" }} />
                <div className="tp-card-line" style={{ background: preview.colors.textMuted, width: "80%" }} />
                <div className="tp-card-line" style={{ background: preview.colors.accent, width: "40%" }} />
              </div>
            </div>
            <div className="tp-card-dots">
              {[preview.colors.accent, preview.colors.green, preview.colors.red, preview.colors.yellow, preview.colors.mauve].map((c, i) => (
                <span key={i} className="tp-dot" style={{ background: c }} />
              ))}
            </div>
          </>
        ) : (
          <div className="tp-card-preview tp-skeleton" />
        )}
        <div className="tp-card-bottom">
          <div className="tp-card-meta">
            <span className="tp-card-name">{entry.name}</span>
            <span className="tp-card-author">
              {entry.author}
              <span className="tp-badge">{entry.type}</span>
            </span>
          </div>
          <div className="tp-card-btns" onClick={(e) => e.stopPropagation()}>
            {installed ? (
              <span className="tp-installed-tag">
                <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Installed
              </span>
            ) : (
              <button
                className="tp-install-btn"
                onClick={() => handleInstallCommunity(entry)}
                disabled={installing}
              >
                {installing ? "..." : "Install"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tp">
      {/* Segmented tab control */}
      <div className="tp-seg">
        <button
          className={`tp-seg-btn${activeTab === "installed" ? " tp-seg-active" : ""}`}
          onClick={() => setActiveTab("installed")}
        >
          Installed
        </button>
        <button
          className={`tp-seg-btn${activeTab === "community" ? " tp-seg-active" : ""}`}
          onClick={() => setActiveTab("community")}
        >
          Community
        </button>
      </div>

      {/* ── Installed tab ── */}
      {activeTab === "installed" && (
        <div className="tp-panel">
          <div className="tp-toolbar">
            <span className="tp-toolbar-label">Built-in</span>
            <button
              className="tp-toolbar-btn"
              onClick={() => setShowImport(!showImport)}
            >
              {showImport ? (
                <>Cancel</>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Import
                </>
              )}
            </button>
          </div>

          {showImport && (
            <div className="tp-import">
              <textarea
                className="tp-import-input"
                placeholder="Paste theme JSON here..."
                value={importJson}
                onChange={(e) => { setImportJson(e.target.value); setImportError(""); }}
                rows={5}
                spellCheck={false}
              />
              {importError && <span className="tp-import-err">{importError}</span>}
              <button className="tp-import-go" onClick={handleImport}>Import Theme</button>
            </div>
          )}

          <div className="tp-grid">
            {BUILT_IN_THEMES.map((theme) => renderThemeCard(theme, false))}
          </div>

          {customThemes.length > 0 && (
            <>
              <span className="tp-toolbar-label" style={{ marginTop: 8 }}>Custom</span>
              <div className="tp-grid">
                {customThemes.map((theme) => renderThemeCard(theme, true))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Community tab ── */}
      {activeTab === "community" && (
        <div className="tp-panel">
          <div className="tp-filters">
            {(["all", "dark", "light"] as const).map((f) => (
              <button
                key={f}
                className={`tp-filter${communityFilter === f ? " tp-filter-on" : ""}`}
                onClick={() => setCommunityFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {communityLoading ? (
            <div className="tp-status">
              <div className="tp-spinner" />
              Loading community themes...
            </div>
          ) : communityError ? (
            <div className="tp-status tp-status-err">
              <span>{communityError}</span>
              <button className="tp-toolbar-btn" onClick={loadCommunity}>Retry</button>
            </div>
          ) : filteredCommunity.length === 0 ? (
            <div className="tp-status">No {communityFilter !== "all" ? communityFilter + " " : ""}themes found.</div>
          ) : (
            <div className="tp-grid">
              {filteredCommunity.map(renderCommunityCard)}
            </div>
          )}

          <a
            className="tp-gh-link"
            href="https://github.com/thejacedev/NoterivThemes"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open("https://github.com/thejacedev/NoterivThemes", "_blank"); }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" fill="currentColor" />
            </svg>
            Submit your theme
          </a>
        </div>
      )}
    </div>
  );
}
