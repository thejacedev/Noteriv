"use client";

import { useState, useEffect, useRef } from "react";

interface VaultSwitcherProps {
  vaults: Vault[];
  activeVault: Vault | null;
  onSwitch: (id: string) => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
  onManageGit: (vault: Vault) => void;
}

export default function VaultSwitcher({
  vaults,
  activeVault,
  onSwitch,
  onCreateNew,
  onDelete,
  onManageGit,
}: VaultSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const displayName = activeVault?.name || "No Vault";

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button onClick={() => setOpen(!open)} className="vault-trigger">
        <span className="vault-name">{displayName}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          className={`vault-chevron${open ? " vault-chevron-open" : ""}`}
        >
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="vault-dropdown">
          <div className="vault-dropdown-header">Vaults</div>

          <div className="vault-list">
            {vaults.map((vault) => {
              const isActive = vault.id === activeVault?.id;
              return (
                <div
                  key={vault.id}
                  className={`vault-item${isActive ? " vault-item-active" : ""}`}
                  onClick={() => { onSwitch(vault.id); setOpen(false); }}
                >
                  <div className="vault-item-info">
                    <span className="vault-item-name">{vault.name}</span>
                    <span className="vault-item-path">{vault.path}</span>
                  </div>

                  <div className="vault-item-actions">
                    {vault.gitRemote && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onManageGit(vault); }}
                        className="vault-action-btn"
                        title="Git settings"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
                          <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M5 7v2a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.3" />
                        </svg>
                      </button>
                    )}
                    {vaults.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete vault "${vault.name}"? This won't delete your files.`)) {
                            onDelete(vault.id);
                          }
                        }}
                        className="vault-action-btn vault-delete"
                        title="Remove vault"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="vault-dropdown-footer">
            <button onClick={() => { onCreateNew(); setOpen(false); }} className="vault-create-btn">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              New vault
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
