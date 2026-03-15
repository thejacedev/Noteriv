"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface GitSyncProps {
  vault: Vault;
  onVaultUpdate: (vault: Vault) => void;
}

export default function GitSync({ vault, onVaultUpdate }: GitSyncProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState(vault.gitRemote || "");
  const [autoSync, setAutoSync] = useState(vault.autoSync);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const s = await window.electronAPI.gitStatus(vault.path);
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, [vault.path]);

  // Poll status every 30s
  useEffect(() => {
    refreshStatus();
    pollRef.current = setInterval(refreshStatus, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  const handleSync = async () => {
    if (!window.electronAPI) return;
    setSyncing(true);
    setError("");
    try {
      await window.electronAPI.gitSync(vault.path, undefined, vault.id);
      await refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!window.electronAPI) return;
    setPulling(true);
    setError("");
    try {
      await window.electronAPI.gitPull(vault.path, vault.id);
      await refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Pull failed";
      setError(message);
    } finally {
      setPulling(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!window.electronAPI) return;
    setError("");
    try {
      // Init git if not already a repo
      if (!status?.isRepo) {
        await window.electronAPI.gitInit(vault.path);
      }

      // Set remote
      if (remoteUrl) {
        await window.electronAPI.gitSetRemote(vault.path, remoteUrl);
      }

      // Update vault config
      const updated = await window.electronAPI.updateVault(vault.id, {
        gitRemote: remoteUrl || null,
        autoSync,
      });
      if (updated) onVaultUpdate(updated);

      setShowSettings(false);
      await refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update settings";
      setError(message);
    }
  };

  if (!status) {
    return null;
  }

  // No git configured — show setup prompt
  if (!status.isRepo && !vault.gitRemote) {
    return (
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7v2a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Set up Git sync
        </button>

        {showSettings && (
          <GitSettingsModal
            remoteUrl={remoteUrl}
            autoSync={autoSync}
            error={error}
            onRemoteChange={setRemoteUrl}
            onAutoSyncChange={setAutoSync}
            onSave={handleSaveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border)]">
      {/* Compact sync bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Status indicator */}
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              status.changes > 0
                ? "bg-[var(--yellow)]"
                : status.ahead > 0
                ? "bg-[var(--accent)]"
                : "bg-[var(--green)]"
            }`}
            title={
              status.changes > 0
                ? `${status.changes} uncommitted changes`
                : status.ahead > 0
                ? `${status.ahead} commits ahead`
                : "Up to date"
            }
          />
          <span className="text-[10px] text-[var(--text-muted)] truncate">
            {status.branch || "main"}
            {status.changes > 0 && ` · ${status.changes} changes`}
            {status.ahead > 0 && ` · ${status.ahead} ahead`}
            {status.behind > 0 && ` · ${status.behind} behind`}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Pull button */}
          {status.remote && status.behind > 0 && (
            <button
              onClick={handlePull}
              disabled={pulling}
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              title="Pull changes"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={pulling ? "animate-spin" : ""}>
                <path d="M8 2v10M4 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing || (status.changes === 0 && status.ahead === 0)}
            className={`p-1 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 ${
              status.changes > 0 || status.ahead > 0
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)]"
            }`}
            title={status.changes > 0 ? "Commit & push" : status.ahead > 0 ? "Push" : "Nothing to sync"}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={syncing ? "animate-spin" : ""}>
              <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12.5 1v3h-3M3.5 15v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Git settings"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-3 mb-2 px-2 py-1.5 rounded bg-[var(--red)] bg-opacity-10 border border-[var(--red)] border-opacity-20">
          <p className="text-[10px] text-[var(--red)]">{error}</p>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <GitSettingsModal
          remoteUrl={remoteUrl}
          autoSync={autoSync}
          error={error}
          onRemoteChange={setRemoteUrl}
          onAutoSyncChange={setAutoSync}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function GitSettingsModal({
  remoteUrl,
  autoSync,
  error,
  onRemoteChange,
  onAutoSyncChange,
  onSave,
  onClose,
}: {
  remoteUrl: string;
  autoSync: boolean;
  error: string;
  onRemoteChange: (v: string) => void;
  onAutoSyncChange: (v: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Git Sync Settings</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Remote URL</label>
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => onRemoteChange(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                autoSync ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--text-muted)]"
              }`}
              onClick={() => onAutoSyncChange(!autoSync)}
            >
              {autoSync && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-6" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-[var(--text-primary)]">Auto-sync on save</span>
          </label>

          {error && (
            <p className="text-xs text-[var(--red)]">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
