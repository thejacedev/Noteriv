"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  HotkeyBinding,
  HotkeyAction,
  DEFAULT_HOTKEYS,
  eventToKeyString,
  formatHotkey,
} from "@/lib/hotkeys";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  ACCENT_COLORS,
  EDITOR_FONTS,
  AUTO_SAVE_OPTIONS,
  SYNC_OPTIONS,
} from "@/lib/settings";
import {
  SYNC_PROVIDERS,
  FOLDER_DIRECTIONS,
  type SyncProviderType,
} from "@/lib/sync-providers";
import ThemePicker from "@/components/ThemePicker";

type Section = "general" | "appearance" | "editor" | "shortcuts" | "sync" | "ecosystem";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "sync", label: "Sync" },
  { id: "ecosystem", label: "Ecosystem" },
];

interface SettingsModalProps {
  settings: AppSettings;
  hotkeys: HotkeyBinding[];
  platform: string;
  vaultPath: string;
  onSettingsChange: (settings: AppSettings) => void;
  onHotkeysChange: (hotkeys: HotkeyBinding[]) => void;
  onOpenPlugins: () => void;
  onOpenSnippets: () => void;
  onClose: () => void;
}

export default function SettingsModal({
  settings,
  hotkeys,
  platform,
  vaultPath,
  onSettingsChange,
  onHotkeysChange,
  onOpenPlugins,
  onOpenSnippets,
  onClose,
}: SettingsModalProps) {
  const [active, setActive] = useState<Section>("general");
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<AppSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  // Backdrop click
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  // Keyboard handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (recording) {
        e.preventDefault();
        e.stopPropagation();
        const combo = eventToKeyString(e);
        if (!combo) return;

        const conflict = hotkeys.find(
          (h) => h.keys === combo && h.action !== recording
        );
        onHotkeysChange(
          hotkeys.map((h) => {
            if (h.action === recording) return { ...h, keys: combo };
            if (conflict && h.action === conflict.action) {
              const def = DEFAULT_HOTKEYS.find((d) => d.action === h.action);
              return { ...h, keys: def?.keys ?? "" };
            }
            return h;
          })
        );
        setRecording(null);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [recording, hotkeys, onHotkeysChange, onClose]);

  // Hotkey helpers
  const resetAllHotkeys = () =>
    onHotkeysChange(DEFAULT_HOTKEYS.map((d) => ({ ...d })));

  const resetHotkey = (action: HotkeyAction) => {
    const def = DEFAULT_HOTKEYS.find((d) => d.action === action);
    if (!def) return;
    onHotkeysChange(
      hotkeys.map((h) => (h.action === action ? { ...h, keys: def.keys } : h))
    );
  };

  const categories = Array.from(new Set(hotkeys.map((h) => h.category)));

  // Render sections
  const renderGeneral = () => (
    <div className="st-section">
      <Row label="Auto-save" desc="Automatically save files at a regular interval.">
        <select
          className="st-select"
          value={settings.autoSaveInterval}
          onChange={(e) => update({ autoSaveInterval: Number(e.target.value) })}
        >
          {AUTO_SAVE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>
      <Row label="Spell check" desc="Underline misspelled words in the editor.">
        <Toggle checked={settings.spellCheck} onChange={(v) => update({ spellCheck: v })} />
      </Row>

      <div className="st-divider" />
      <div className="st-group-label">Updates</div>

      {appVersion && (
        <Row label="Version" desc="Currently installed version of Noteriv.">
          <span className="st-version-badge">v{appVersion}</span>
        </Row>
      )}

      <Row label="Automatic updates" desc="Check for updates on startup and notify when a new version is available.">
        <Toggle checked={settings.autoUpdate} onChange={(v) => update({ autoUpdate: v })} />
      </Row>

      <div className="st-update-row">
        {updateStatus === "idle" && (
          <button className="st-test-btn" onClick={handleCheckForUpdates}>
            Check for Updates
          </button>
        )}
        {updateStatus === "checking" && (
          <button className="st-test-btn" disabled>Checking...</button>
        )}
        {updateStatus === "up-to-date" && (
          <div className="st-update-status">
            <span className="st-test-result st-test-ok">Up to date</span>
            <button className="st-test-btn" onClick={handleCheckForUpdates}>Check Again</button>
          </div>
        )}
        {updateStatus === "available" && (
          <div className="st-update-status">
            <span className="st-update-version">v{updateInfo.version} available</span>
            <button className="st-test-btn st-update-download-btn" onClick={handleDownloadUpdate}>
              Download Update
            </button>
          </div>
        )}
        {updateStatus === "downloading" && (
          <div className="st-update-status">
            <div className="st-update-progress-bar">
              <div className="st-update-progress-fill" style={{ width: `${updateInfo.percent ?? 0}%` }} />
            </div>
            <span className="st-update-percent">{Math.round(updateInfo.percent ?? 0)}%</span>
          </div>
        )}
        {updateStatus === "downloaded" && (
          <div className="st-update-status">
            <span className="st-test-result st-test-ok">v{updateInfo.version} ready</span>
            <button className="st-test-btn st-update-install-btn" onClick={handleInstallUpdate}>
              Restart &amp; Install
            </button>
          </div>
        )}
        {updateStatus === "error" && (
          <div className="st-update-status">
            <span className="st-test-result st-test-fail">{updateInfo.error || "Update failed"}</span>
            <button className="st-test-btn" onClick={handleCheckForUpdates}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div className="st-section">
      <Row label="Accent color" desc="Primary color used for highlights, links, and active states.">
        <div className="st-colors">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`st-swatch${settings.accentColor === c.value ? " st-swatch-active" : ""}`}
              style={{ background: c.value }}
              onClick={() => update({ accentColor: c.value })}
              title={c.name}
            />
          ))}
        </div>
      </Row>
      <div className="st-divider" />
      <ThemePicker
        currentThemeId={settings.theme}
        vaultPath={vaultPath}
        onThemeSelect={(themeId) => update({ theme: themeId })}
      />
    </div>
  );

  const renderEditor = () => (
    <div className="st-section">
      <Row label="Font size" desc="Base font size for the editor (px).">
        <Stepper
          value={settings.fontSize}
          min={11}
          max={24}
          onChange={(v) => update({ fontSize: v })}
        />
      </Row>
      <Row label="Line height" desc="Vertical spacing between lines.">
        <Stepper
          value={settings.lineHeight}
          min={1.2}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update({ lineHeight: v })}
        />
      </Row>
      <Row label="Editor font" desc="Monospace font used in the editor.">
        <select
          className="st-select"
          value={settings.editorFont}
          onChange={(e) => update({ editorFont: e.target.value })}
        >
          {EDITOR_FONTS.map((f) => (
            <option key={f.value} value={f.value}>{f.name}</option>
          ))}
        </select>
      </Row>
      <Row label="Tab size" desc="Number of spaces per tab indentation.">
        <select
          className="st-select"
          value={settings.tabSize}
          onChange={(e) => update({ tabSize: Number(e.target.value) })}
        >
          {[2, 4, 8].map((n) => (
            <option key={n} value={n}>{n} spaces</option>
          ))}
        </select>
      </Row>
    </div>
  );

  const renderShortcuts = () => (
    <div className="st-section">
      <div className="st-shortcuts-header">
        <span className="st-hint">Click a shortcut to rebind it</span>
        <button onClick={resetAllHotkeys} className="st-reset-all">Reset All</button>
      </div>
      {categories.map((cat) => (
        <div key={cat} className="st-shortcut-group">
          <div className="st-shortcut-cat">{cat}</div>
          {hotkeys
            .filter((h) => h.category === cat)
            .map((h) => {
              const isRec = recording === h.action;
              const isDefault =
                DEFAULT_HOTKEYS.find((d) => d.action === h.action)?.keys === h.keys;

              return (
                <div key={h.action} className="st-shortcut-row">
                  <span className="st-shortcut-label">{h.label}</span>
                  <div className="st-shortcut-keys">
                    <button
                      onClick={() => setRecording(isRec ? null : h.action)}
                      className={`settings-key-btn${isRec ? " recording" : ""}`}
                    >
                      {isRec ? "Press keys..." : formatHotkey(h.keys, platform)}
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => resetHotkey(h.action)}
                        className="settings-key-reset"
                        title="Reset to default"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path
                            d="M2 4h3L2 1M2 4a5 5 0 105 5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );

  // Updater state
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "available" | "downloading" | "downloaded" | "error" | "up-to-date"
  >("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; percent?: number; error?: string }>({});

  useEffect(() => {
    if (!window.electronAPI?.updaterGetVersion) return;
    window.electronAPI.updaterGetVersion().then(setAppVersion);
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updaterCheck) return;
    setUpdateStatus("checking");
    setUpdateInfo({});
    const result = await window.electronAPI.updaterCheck();
    if (result.error) {
      setUpdateStatus("error");
      setUpdateInfo({ error: result.error });
    } else if (result.available) {
      setUpdateStatus("available");
      setUpdateInfo({ version: result.version });
    } else {
      setUpdateStatus("up-to-date");
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI?.updaterDownload) return;
    setUpdateStatus("downloading");
    setUpdateInfo((prev) => ({ ...prev, percent: 0 }));

    const cleanupProgress = window.electronAPI.onUpdaterDownloadProgress?.((data) => {
      setUpdateInfo((prev) => ({ ...prev, percent: data.percent }));
    });
    const cleanupDownloaded = window.electronAPI.onUpdaterUpdateDownloaded?.((data) => {
      setUpdateStatus("downloaded");
      setUpdateInfo({ version: data.version });
    });
    const cleanupError = window.electronAPI.onUpdaterError?.((data) => {
      setUpdateStatus("error");
      setUpdateInfo({ error: data.message });
    });

    const ok = await window.electronAPI.updaterDownload();
    if (!ok) {
      setUpdateStatus("error");
      setUpdateInfo({ error: "Download failed" });
    }

    // Cleanup listeners after a delay to catch events
    setTimeout(() => {
      cleanupProgress?.();
      cleanupDownloaded?.();
      cleanupError?.();
    }, 60000);
  };

  const handleInstallUpdate = () => {
    window.electronAPI?.updaterInstall?.();
  };

  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    if (!window.electronAPI) return;
    setTesting(true);
    setTestResult(null);
    try {
      const provider = settings.extraSyncProvider as SyncProviderType;
      const config =
        provider === "folder" ? settings.folderSync :
        provider === "webdav" ? settings.webdavSync : null;
      if (!config) return;
      const result = await window.electronAPI.syncProviderTest(provider, config);
      setTestResult(result);
    } catch (e: unknown) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTesting(false);
    }
  };

  const renderSync = () => (
    <div className="st-section">
      <div className="st-group-label">Git Sync</div>
      <Row label="Auto sync interval" desc="Periodically commit and push changes in the background.">
        <select
          className="st-select"
          value={settings.gitSyncInterval}
          onChange={(e) => update({ gitSyncInterval: Number(e.target.value) })}
        >
          {SYNC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>
      <Row label="Sync on save" desc="Commit and push every time you manually save a file.">
        <Toggle checked={settings.syncOnSave} onChange={(v) => update({ syncOnSave: v })} />
      </Row>
      <Row label="Pull on open" desc="Fetch the latest changes from remote when opening a vault.">
        <Toggle checked={settings.pullOnOpen} onChange={(v) => update({ pullOnOpen: v })} />
      </Row>
      <Row label="Commit message" desc="Template for sync commits. Use {date}, {time}, {count}.">
        <input
          type="text"
          className="st-text-input"
          value={settings.commitMessageFormat}
          onChange={(e) => update({ commitMessageFormat: e.target.value })}
          placeholder="Sync {date} {time}"
        />
      </Row>

      <div className="st-divider" />
      <div className="st-group-label">Additional Sync Provider</div>
      <Row label="Provider" desc="Sync your vault to a second destination alongside Git.">
        <select
          className="st-select"
          value={settings.extraSyncProvider}
          onChange={(e) => {
            update({ extraSyncProvider: e.target.value as SyncProviderType });
            setTestResult(null);
          }}
        >
          {SYNC_PROVIDERS.map((p) => (
            <option key={p.type} value={p.type}>{p.name}</option>
          ))}
        </select>
      </Row>
      {settings.extraSyncProvider !== "none" && (
        <div className="st-provider-desc">
          {SYNC_PROVIDERS.find((p) => p.type === settings.extraSyncProvider)?.description}
        </div>
      )}

      {/* Folder config */}
      {settings.extraSyncProvider === "folder" && (
        <>
          <Row label="Target folder" desc="Path to the cloud drive sync folder on your system.">
            <input
              type="text"
              className="st-text-input"
              value={settings.folderSync.targetPath}
              onChange={(e) => update({ folderSync: { ...settings.folderSync, targetPath: e.target.value } })}
              placeholder="/home/user/Google Drive/Notes"
            />
          </Row>
          <Row label="Direction" desc="Which way files should sync.">
            <select
              className="st-select"
              value={settings.folderSync.direction}
              onChange={(e) => update({ folderSync: { ...settings.folderSync, direction: e.target.value as "push" | "pull" | "both" } })}
            >
              {FOLDER_DIRECTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </Row>
        </>
      )}

      {/* WebDAV config */}
      {settings.extraSyncProvider === "webdav" && (
        <>
          <Row label="Server URL" desc="WebDAV server address (e.g. https://cloud.example.com/remote.php/dav/files/user).">
            <input
              type="text"
              className="st-text-input"
              value={settings.webdavSync.url}
              onChange={(e) => update({ webdavSync: { ...settings.webdavSync, url: e.target.value } })}
              placeholder="https://cloud.example.com/remote.php/dav"
            />
          </Row>
          <Row label="Username" desc="WebDAV account username.">
            <input
              type="text"
              className="st-text-input"
              value={settings.webdavSync.username}
              onChange={(e) => update({ webdavSync: { ...settings.webdavSync, username: e.target.value } })}
            />
          </Row>
          <Row label="Password" desc="WebDAV account password or app token.">
            <input
              type="password"
              className="st-text-input"
              value={settings.webdavSync.password}
              onChange={(e) => update({ webdavSync: { ...settings.webdavSync, password: e.target.value } })}
            />
          </Row>
          <Row label="Remote path" desc="Folder path on the server to sync to.">
            <input
              type="text"
              className="st-text-input"
              value={settings.webdavSync.remotePath}
              onChange={(e) => update({ webdavSync: { ...settings.webdavSync, remotePath: e.target.value } })}
              placeholder="/Noteriv"
            />
          </Row>
        </>
      )}

      {/* Test connection button */}
      {settings.extraSyncProvider !== "none" && (
        <div className="st-test-row">
          <button
            className="st-test-btn"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <span className={`st-test-result ${testResult.ok ? "st-test-ok" : "st-test-fail"}`}>
              {testResult.ok ? "Connected" : testResult.error || "Failed"}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderEcosystem = () => (
    <div className="st-section">
      <div className="st-ecosystem-card" onClick={() => { onClose(); onOpenPlugins(); }}>
        <div className="st-ecosystem-icon">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5L2 4.5v4l6 3 6-3v-4L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M2 4.5L8 7.5l6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M8 7.5v4.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
        <div className="st-ecosystem-info">
          <span className="st-ecosystem-title">Community Plugins</span>
          <span className="st-ecosystem-desc">Extend Noteriv with plugins. Install, enable, and manage third-party plugins.</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="st-ecosystem-arrow">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="st-ecosystem-card" onClick={() => { onClose(); onOpenSnippets(); }}>
        <div className="st-ecosystem-icon">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M4 4h8v8H4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M6 7h4M6 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="st-ecosystem-info">
          <span className="st-ecosystem-title">CSS Snippets</span>
          <span className="st-ecosystem-desc">Customize the appearance with custom CSS snippets that override default styles.</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="st-ecosystem-arrow">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="st-ecosystem-card" onClick={() => setActive("appearance")}>
        <div className="st-ecosystem-icon">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 8h12M8 2a10 10 0 013 6 10 10 0 01-3 6 10 10 0 01-3-6 10 10 0 013-6z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
        <div className="st-ecosystem-info">
          <span className="st-ecosystem-title">Community Themes</span>
          <span className="st-ecosystem-desc">Browse and install community themes. Available in Appearance &gt; Theme.</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="st-ecosystem-arrow">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );

  const sectionContent: Record<Section, () => React.JSX.Element> = {
    general: renderGeneral,
    appearance: renderAppearance,
    editor: renderEditor,
    shortcuts: renderShortcuts,
    sync: renderSync,
    ecosystem: renderEcosystem,
  };

  return (
    <div ref={overlayRef} className="settings-overlay" onClick={handleBackdrop}>
      <div className="settings-modal">
        {/* Sidebar navigation */}
        <div className="st-nav">
          <div className="st-nav-title">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`st-nav-item${active === s.id ? " st-nav-active" : ""}`}
              onClick={() => setActive(s.id)}
            >
              <SectionIcon section={s.id} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="st-main">
          <div className="st-header">
            <h2 className="st-title">
              {SECTIONS.find((s) => s.id === active)?.label}
            </h2>
            <button onClick={onClose} className="settings-close-btn">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="st-content">{sectionContent[active]()}</div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable controls ──

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="st-row">
      <div className="st-row-info">
        <span className="st-row-label">{label}</span>
        <span className="st-row-desc">{desc}</span>
      </div>
      <div className="st-row-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`st-toggle${checked ? " st-toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="st-toggle-thumb" />
    </button>
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(4)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(4)));
  return (
    <div className="st-stepper">
      <button onClick={dec} disabled={value <= min}>-</button>
      <span>{format ? format(value) : value}</span>
      <button onClick={inc} disabled={value >= max}>+</button>
    </div>
  );
}

function SectionIcon({ section }: { section: Section }) {
  const icons: Record<Section, React.JSX.Element> = {
    general: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    appearance: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="10" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    editor: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    shortcuts: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 6h1M7 6h2M11 6h1M5 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    sync: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M12 2v3h-3M4 14v-3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    ecosystem: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L2 4.5v4l6 3 6-3v-4L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M2 4.5L8 7.5l6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 7.5v4.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  };
  return icons[section];
}
