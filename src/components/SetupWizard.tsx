"use client";

import { useState, useEffect } from "react";

interface SetupWizardProps {
  onComplete: (vault: Vault) => void;
}

type Step = "welcome" | "name" | "location" | "github-auth" | "github-repo" | "creating";

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [vaultName, setVaultName] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [setupType, setSetupType] = useState<"new" | "existing" | "clone">("new");

  const [enableGit, setEnableGit] = useState(false);
  const [token, setToken] = useState("");
  const [validating, setValidating] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [autoSync, setAutoSync] = useState(true);

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [createNewRepo, setCreateNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (vaultName && !newRepoName) {
      setNewRepoName(vaultName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"));
    }
  }, [vaultName, newRepoName]);

  const handlePickFolder = async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.openFolder();
    if (folder) { setVaultPath(folder); setError(""); }
  };

  const handleValidateToken = async () => {
    if (!window.electronAPI || !token.trim()) return;
    setValidating(true);
    setError("");
    try {
      const result = await window.electronAPI.authValidateToken(token.trim());
      if (result.valid) {
        setGhUser(result);
        setLoadingRepos(true);
        const userRepos = await window.electronAPI.authListRepos(token.trim());
        setRepos(userRepos);
        setLoadingRepos(false);
        if (setupType === "clone") setStep("github-repo");
      } else {
        setError(result.error || "Invalid token");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to validate token");
    } finally {
      setValidating(false);
    }
  };

  const handleCreate = async () => {
    if (!window.electronAPI) return;
    setCreating(true);
    setStep("creating");
    setError("");
    try {
      let finalPath = vaultPath;
      let gitRemote: string | undefined;
      const folderName = vaultName.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
      if (enableGit && ghUser?.valid && token) {
        if (createNewRepo && newRepoName) {
          const repo = await window.electronAPI.authCreateRepo(token.trim(), newRepoName, newRepoPrivate, `Notes vault: ${vaultName}`);
          gitRemote = repo.cloneUrl;
        } else if (selectedRepo) {
          gitRemote = selectedRepo.cloneUrl;
        }
      }
      if (setupType === "clone" && gitRemote) {
        finalPath = vaultPath ? `${vaultPath}/${folderName}` : `${getDefaultBase()}/${folderName}`;
        const vault = await window.electronAPI.createVault({ name: vaultName, vaultPath: finalPath, gitRemote, autoSync });
        await window.electronAPI.authSaveToken(vault.id, token.trim());
        await window.electronAPI.gitClone(gitRemote, finalPath, vault.id);
        onComplete(vault);
        return;
      }
      if (setupType === "new") {
        finalPath = vaultPath ? `${vaultPath}/${folderName}` : `${getDefaultBase()}/${folderName}`;
        await window.electronAPI.createDir(finalPath);
      }
      const vault = await window.electronAPI.createVault({ name: vaultName, vaultPath: finalPath, gitRemote, autoSync: enableGit ? autoSync : false });
      if (enableGit && token.trim()) await window.electronAPI.authSaveToken(vault.id, token.trim());
      if (enableGit) {
        await window.electronAPI.gitInit(finalPath);
        if (gitRemote) {
          await window.electronAPI.gitSetRemote(finalPath, gitRemote);
          try { await window.electronAPI.gitSync(finalPath, "Initial commit from Noteriv", vault.id); } catch { /* ok */ }
        }
      }
      onComplete(vault);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create vault");
      setStep("github-auth");
      setCreating(false);
    }
  };

  function getDefaultBase(): string {
    return process.platform === "win32" ? `${process.env.USERPROFILE || "C:\\Users\\user"}\\Noteriv` : `${process.env.HOME || "~"}/Noteriv`;
  }

  const canProceedFromName = vaultName.trim().length > 0;
  const canProceedFromLocation = setupType === "new" || setupType === "clone" || vaultPath.length > 0;
  const stepOrder: Step[] = ["welcome", "name", "location", "github-auth", "github-repo", "creating"];
  const currentStepIdx = stepOrder.indexOf(step);

  // Shared inline style objects
  const S = {
    overlay: { position: "fixed" as const, inset: 0, background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, overflow: "hidden" },
    // Subtle radial glow behind the card
    glow: { position: "absolute" as const, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" as const },
    container: { position: "relative" as const, width: "100%", maxWidth: 460, padding: "0 20px", zIndex: 1 },
    card: { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 20, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,0.1), 0 20px 60px rgba(0,0,0,0.35), 0 0 120px color-mix(in srgb, var(--accent) 5%, transparent)" },
    body: { padding: "32px 32px 28px" },
    h2: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.3 },
    p: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.6 },
    input: { width: "100%", padding: "14px 16px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-primary)", fontSize: 15, outline: "none", transition: "border-color 0.2s", letterSpacing: "-0.01em" },
    nav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    back: { background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: "10px 14px", borderRadius: 10, transition: "color 0.15s" },
    next: { padding: "10px 28px", background: "var(--accent)", color: "var(--bg-primary)", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s", letterSpacing: "-0.01em" },
    nextDisabled: { opacity: 0.3, cursor: "not-allowed" },
    skip: { padding: "10px 22px", background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 0.15s" },
    error: { padding: "10px 14px", background: "color-mix(in srgb, var(--red) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)", borderRadius: 10, fontSize: 13, color: "var(--red)" },
  };

  const optionStyle = (color: string, hover = false) => ({
    display: "flex", alignItems: "center", gap: 16, width: "100%", padding: "16px 18px",
    background: hover ? `color-mix(in srgb, ${color} 6%, transparent)` : "transparent",
    border: `1px solid var(--border)`, borderRadius: 14, cursor: "pointer", textAlign: "left" as const,
    transition: "all 0.2s ease",
  });

  const iconBox = (color: string) => ({
    width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
  });

  return (
    <div style={S.overlay}>
      {/* Ambient glow */}
      <div style={S.glow} />

      <div style={S.container}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="4" width="24" height="20" rx="3" stroke="var(--accent)" strokeWidth="1.8" />
              <path d="M8 10h12M8 14h8M8 18h10" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.03em" }}>Noteriv</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, letterSpacing: "0.02em", textTransform: "uppercase" as const }}>Markdown notes, everywhere</p>
        </div>

        <div style={S.card}>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 3, padding: "18px 32px 0", justifyContent: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 2, borderRadius: 1, transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                width: currentStepIdx >= i ? 32 : 16,
                background: currentStepIdx >= i ? "var(--accent)" : "var(--bg-surface)",
              }} />
            ))}
          </div>

          <div style={S.body}>
            {/* ═══════ WELCOME ═══════ */}
            {step === "welcome" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <h2 style={S.h2}>Create your workspace</h2>
                  <p style={S.p}>A vault is where your notes live. Pick how you want to start.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button style={optionStyle("var(--accent)")} onClick={() => { setSetupType("new"); setStep("name"); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent) 5%, transparent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <div style={iconBox("var(--accent)")}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 560, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>New vault</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Start fresh with an empty folder</div>
                    </div>
                  </button>

                  <button style={optionStyle("var(--mauve)")} onClick={() => { setSetupType("existing"); setStep("name"); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--mauve)"; (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--mauve) 5%, transparent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <div style={iconBox("var(--mauve)")}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7h5l1.5 1.5H17v8H3V7z" stroke="var(--mauve)" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 560, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Open folder</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Use an existing notes folder</div>
                    </div>
                  </button>

                  <button style={optionStyle("var(--green)")} onClick={() => { setSetupType("clone"); setEnableGit(true); setStep("name"); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--green)"; (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--green) 5%, transparent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <div style={iconBox("var(--green)")}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1C5.58 1 2 4.58 2 9c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0018 9c0-4.42-3.58-8-8-8z" fill="var(--green)" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 560, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Clone from GitHub</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Pull notes from a repository</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ═══════ NAME ═══════ */}
            {step === "name" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <h2 style={S.h2}>Name your vault</h2>
                  <p style={S.p}>Something like &ldquo;Personal&rdquo;, &ldquo;Work&rdquo;, or &ldquo;Research&rdquo;.</p>
                </div>
                <input type="text" value={vaultName} onChange={(e) => setVaultName(e.target.value)} placeholder="My Notes" autoFocus
                  style={S.input} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceedFromName) setStep("location"); }} />
                <div style={S.nav}>
                  <button style={S.back} onClick={() => setStep("welcome")}>Back</button>
                  <button style={{ ...S.next, ...(canProceedFromName ? {} : S.nextDisabled) }} onClick={() => setStep("location")} disabled={!canProceedFromName}>Continue</button>
                </div>
              </div>
            )}

            {/* ═══════ LOCATION ═══════ */}
            {step === "location" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <h2 style={S.h2}>{setupType === "existing" ? "Choose your folder" : "Where to store it?"}</h2>
                  <p style={S.p}>{setupType === "existing" ? "Select the folder with your notes." : "Pick a parent folder, or use the default."}</p>
                </div>
                <button onClick={handlePickFolder} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "transparent", border: "1px dashed var(--border)", borderRadius: 12, color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textAlign: "left" as const, transition: "border-color 0.2s", width: "100%" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 5h5l1.5 1.5H16v8H2V5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                  <span style={{ color: vaultPath ? "var(--text-primary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{vaultPath || "Click to choose folder..."}</span>
                </button>
                {setupType !== "existing" && !vaultPath && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Default: ~/Noteriv/{vaultName.replace(/\s+/g, "-")}</p>
                )}
                <div style={S.nav}>
                  <button style={S.back} onClick={() => setStep("name")}>Back</button>
                  <button style={{ ...S.next, ...(canProceedFromLocation ? {} : S.nextDisabled) }} onClick={() => setStep("github-auth")} disabled={!canProceedFromLocation}>Continue</button>
                </div>
              </div>
            )}

            {/* ═══════ GITHUB AUTH ═══════ */}
            {step === "github-auth" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <h2 style={S.h2}>Connect GitHub</h2>
                  <p style={S.p}>{setupType === "clone" ? "Sign in to access your repos." : "Optional. You can also set up Folder or WebDAV sync later in Settings."}</p>
                </div>

                {setupType !== "clone" && !enableGit && (
                  <>
                    <button style={optionStyle("var(--text-primary)")} onClick={() => setEnableGit(true)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--text-primary) 3%, transparent)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <div style={iconBox("var(--text-primary)")}>
                        <GitHubIcon />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 560, color: "var(--text-primary)" }}>Connect GitHub</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Back up &amp; sync notes to a repo</div>
                      </div>
                    </button>
                    <div style={S.nav}>
                      <button style={S.back} onClick={() => setStep("location")}>Back</button>
                      <button style={S.next} onClick={handleCreate}>Create Vault</button>
                    </div>
                  </>
                )}

                {(enableGit || setupType === "clone") && (
                  <>
                    {ghUser?.valid ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "color-mix(in srgb, var(--green) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--green) 20%, transparent)", borderRadius: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-tertiary)", overflow: "hidden", flexShrink: 0 }}>
                          {ghUser.avatar && <img src={ghUser.avatar} alt="" style={{ width: "100%", height: "100%" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{ghUser.name || ghUser.username}</div>
                          <div style={{ fontSize: 11, color: "var(--green)" }}>@{ghUser.username}</div>
                        </div>
                        <button style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }} onClick={() => { setGhUser(null); setToken(""); }}>Disconnect</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Personal Access Token</span>
                          <button style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", padding: 0 }} onClick={() => window.electronAPI?.authOpenTokenPage()}>Generate on GitHub &rarr;</button>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>Select the <strong style={{ color: "var(--text-secondary)" }}>repo</strong> scope. Your token is encrypted locally.</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_xxxx..." style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, flex: 1 }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                            onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) handleValidateToken(); }} />
                          <button style={{ ...S.next, padding: "12px 20px", flexShrink: 0, ...((!token.trim() || validating) ? S.nextDisabled : {}) }} onClick={handleValidateToken} disabled={!token.trim() || validating}>
                            {validating ? <div style={{ width: 14, height: 14, border: "2px solid var(--bg-primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> : "Connect"}
                          </button>
                        </div>
                      </>
                    )}

                    {ghUser?.valid && (
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <Checkbox checked={autoSync} onChange={setAutoSync} />
                        <div>
                          <span style={{ fontSize: 13, color: "var(--text-primary)", display: "block" }}>Auto-sync on save</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Push when you save a file</span>
                        </div>
                      </label>
                    )}

                    {error && <div style={S.error}>{error}</div>}

                    <div style={S.nav}>
                      <button style={S.back} onClick={() => { if (setupType !== "clone" && !ghUser?.valid) setEnableGit(false); else setStep("location"); }}>Back</button>
                      {ghUser?.valid ? (
                        <button style={S.next} onClick={() => setStep("github-repo")}>{setupType === "clone" ? "Continue" : "Pick repo"}</button>
                      ) : setupType !== "clone" ? (
                        <button style={S.skip} onClick={handleCreate}>Skip</button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══════ REPO PICKER ═══════ */}
            {step === "github-repo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <h2 style={S.h2}>{setupType === "clone" ? "Pick a repo" : "Choose a repo"}</h2>
                  <p style={S.p}>Select an existing repo or create a new one.</p>
                </div>

                <button style={{ ...optionStyle("var(--accent)"), ...(createNewRepo ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" } : {}) }}
                  onClick={() => { setCreateNewRepo(true); setSelectedRepo(null); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <span style={{ fontSize: 13, fontWeight: 560, color: "var(--text-primary)" }}>Create new repo</span>
                </button>

                {createNewRepo && (
                  <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                    <input type="text" value={newRepoName} onChange={(e) => setNewRepoName(e.target.value.replace(/[^a-zA-Z0-9-_.]/g, "-"))} placeholder="my-notes"
                      style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: "10px 14px" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <Checkbox checked={newRepoPrivate} onChange={setNewRepoPrivate} />
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Private repo</span>
                    </label>
                  </div>
                )}

                <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {loadingRepos ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><div style={{ width: 18, height: 18, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /></div>
                  ) : repos.map((repo) => (
                    <button key={repo.fullName} onClick={() => { setSelectedRepo(repo); setCreateNewRepo(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", background: selectedRepo?.fullName === repo.fullName ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent", border: selectedRepo?.fullName === repo.fullName ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "1px solid transparent", borderRadius: 10, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s" }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}><path d="M2 3h12v10H2V3z" stroke="currentColor" strokeWidth="1.2" /></svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{repo.name}</div>
                        {repo.description && <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{repo.description}</div>}
                      </div>
                      {repo.private && <span style={{ fontSize: 10, color: "var(--yellow)", flexShrink: 0 }}>private</span>}
                    </button>
                  ))}
                </div>

                {error && <div style={S.error}>{error}</div>}

                <div style={S.nav}>
                  <button style={S.back} onClick={() => setStep("github-auth")}>Back</button>
                  <button style={{ ...S.next, ...(creating || (!createNewRepo && !selectedRepo) || (createNewRepo && !newRepoName) ? S.nextDisabled : {}) }}
                    onClick={handleCreate} disabled={creating || (!createNewRepo && !selectedRepo) || (createNewRepo && !newRepoName)}>
                    {setupType === "clone" ? "Clone & Create" : "Create Vault"}
                  </button>
                </div>
              </div>
            )}

            {/* ═══════ CREATING ═══════ */}
            {step === "creating" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 18 }}>
                <div style={{ width: 32, height: 32, border: "2.5px solid color-mix(in srgb, var(--accent) 20%, transparent)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                  {setupType === "clone" ? "Cloning repository..." : createNewRepo ? "Creating repo and vault..." : "Setting up your vault..."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Keyframe for spinner */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)}
      style={{ width: 16, height: 16, borderRadius: 4, border: checked ? "none" : "2px solid var(--text-muted)", background: checked ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
      {checked && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--text-primary)">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
    </svg>
  );
}
