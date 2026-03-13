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
} from "@/lib/theme-utils";

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

  useEffect(() => {
    if (vaultPath) {
      loadCustomThemes(vaultPath).then(setCustomThemes);
    }
  }, [vaultPath]);

  const handleImport = useCallback(async () => {
    setImportError("");
    const theme = importTheme(importJson);
    if (!theme) {
      setImportError("Invalid theme JSON. Must have id, name, and colors.");
      return;
    }
    // Check for duplicate IDs
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
      // If the deleted theme was active, switch to default
      if (currentThemeId === themeId) {
        onThemeSelect("catppuccin-mocha");
      }
    },
    [vaultPath, currentThemeId, onThemeSelect]
  );

  const handleExport = useCallback(
    (theme: ThemeDefinition) => {
      navigator.clipboard.writeText(exportTheme(theme));
      setCopiedId(theme.id);
      setTimeout(() => setCopiedId(null), 2000);
    },
    []
  );

  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  const renderThemeCard = (theme: ThemeDefinition, isCustom: boolean) => {
    const isActive = currentThemeId === theme.id;
    return (
      <div
        key={theme.id}
        className={`theme-card${isActive ? " theme-card-active" : ""}`}
        onClick={() => onThemeSelect(theme.id)}
      >
        <div className="theme-preview">
          <div
            className="theme-preview-bg"
            style={{ background: theme.colors.bgPrimary }}
          >
            <div
              className="theme-preview-sidebar"
              style={{ background: theme.colors.bgSecondary }}
            />
            <div className="theme-preview-content">
              <div
                className="theme-preview-line"
                style={{ background: theme.colors.textPrimary, width: "60%" }}
              />
              <div
                className="theme-preview-line"
                style={{ background: theme.colors.textMuted, width: "80%" }}
              />
              <div
                className="theme-preview-line"
                style={{ background: theme.colors.accent, width: "40%" }}
              />
            </div>
          </div>
          <div className="theme-preview-colors">
            <span
              className="theme-preview-dot"
              style={{ background: theme.colors.accent }}
            />
            <span
              className="theme-preview-dot"
              style={{ background: theme.colors.green }}
            />
            <span
              className="theme-preview-dot"
              style={{ background: theme.colors.red }}
            />
            <span
              className="theme-preview-dot"
              style={{ background: theme.colors.yellow }}
            />
            <span
              className="theme-preview-dot"
              style={{ background: theme.colors.mauve }}
            />
          </div>
        </div>
        <div className="theme-card-footer">
          <div className="theme-card-info">
            <span className="theme-name">{theme.name}</span>
            <span className="theme-author">{theme.author}</span>
          </div>
          <div className="theme-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="theme-action-btn"
              onClick={() => handleExport(theme)}
              title="Copy theme JSON"
            >
              {copiedId === theme.id ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M2 6l3 3 5-6"
                    stroke="var(--green, #a6e3a1)"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect
                    x="4"
                    y="4"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <path
                    d="M8 4V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5a1 1 0 001 1h2"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>
              )}
            </button>
            {isCustom && (
              <button
                className="theme-action-btn theme-delete-btn"
                onClick={() => handleDelete(theme.id)}
                title="Delete theme"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 3h8M4 3V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V3M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="theme-picker">
      <div className="theme-section">
        <div className="theme-section-header">
          <span className="theme-section-label">Built-in Themes</span>
          <button
            className="theme-import-btn"
            onClick={() => setShowImport(!showImport)}
          >
            {showImport ? "Cancel" : "Import Theme"}
          </button>
        </div>

        {showImport && (
          <div className="theme-import-area">
            <textarea
              className="theme-import-textarea"
              placeholder="Paste theme JSON here..."
              value={importJson}
              onChange={(e) => {
                setImportJson(e.target.value);
                setImportError("");
              }}
              rows={6}
              spellCheck={false}
            />
            {importError && (
              <span className="theme-import-error">{importError}</span>
            )}
            <button className="theme-import-save" onClick={handleImport}>
              Import
            </button>
          </div>
        )}

        <div className="theme-grid">
          {BUILT_IN_THEMES.map((theme) => renderThemeCard(theme, false))}
        </div>
      </div>

      {customThemes.length > 0 && (
        <div className="theme-section">
          <span className="theme-section-label">Custom Themes</span>
          <div className="theme-grid">
            {customThemes.map((theme) => renderThemeCard(theme, true))}
          </div>
        </div>
      )}
    </div>
  );
}
