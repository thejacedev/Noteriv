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

  // GitHub auth state
  const [enableGit, setEnableGit] = useState(false);
  const [token, setToken] = useState("");
  const [validating, setValidating] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [autoSync, setAutoSync] = useState(true);

  // Repo picker state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [createNewRepo, setCreateNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-fill repo name from vault name
  useEffect(() => {
    if (vaultName && !newRepoName) {
      setNewRepoName(vaultName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"));
    }
  }, [vaultName, newRepoName]);

  const handlePickFolder = async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.openFolder();
    if (folder) {
      setVaultPath(folder);
      setError("");
    }
  };

  const handleValidateToken = async () => {
    if (!window.electronAPI || !token.trim()) return;
    setValidating(true);
    setError("");

    try {
      const result = await window.electronAPI.authValidateToken(token.trim());
      if (result.valid) {
        setGhUser(result);
        // Load repos
        setLoadingRepos(true);
        const userRepos = await window.electronAPI.authListRepos(token.trim());
        setRepos(userRepos);
        setLoadingRepos(false);

        if (setupType === "clone") {
          setStep("github-repo");
        }
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

      // Handle repo creation/selection
      if (enableGit && ghUser?.valid && token) {
        if (createNewRepo && newRepoName) {
          // Create new repo on GitHub
          const repo = await window.electronAPI.authCreateRepo(
            token.trim(),
            newRepoName,
            newRepoPrivate,
            `Notes vault: ${vaultName}`
          );
          gitRemote = repo.cloneUrl;
        } else if (selectedRepo) {
          gitRemote = selectedRepo.cloneUrl;
        }
      }

      if (setupType === "clone" && gitRemote) {
        // Clone
        finalPath = vaultPath
          ? `${vaultPath}/${folderName}`
          : `${getDefaultBase()}/${folderName}`;

        // Create vault first to get an ID for the token
        const vault = await window.electronAPI.createVault({
          name: vaultName,
          vaultPath: finalPath,
          gitRemote,
          autoSync,
        });

        // Store token encrypted
        await window.electronAPI.authSaveToken(vault.id, token.trim());

        // Clone using the vault ID for auth
        await window.electronAPI.gitClone(gitRemote, finalPath, vault.id);

        onComplete(vault);
        return;
      }

      if (setupType === "new") {
        finalPath = vaultPath
          ? `${vaultPath}/${folderName}`
          : `${getDefaultBase()}/${folderName}`;
        await window.electronAPI.createDir(finalPath);
      }
      // setupType === "existing" uses vaultPath as-is

      // Create vault config
      const vault = await window.electronAPI.createVault({
        name: vaultName,
        vaultPath: finalPath,
        gitRemote,
        autoSync: enableGit ? autoSync : false,
      });

      // Store token if we have one
      if (enableGit && token.trim()) {
        await window.electronAPI.authSaveToken(vault.id, token.trim());
      }

      // Init git if enabled
      if (enableGit) {
        await window.electronAPI.gitInit(finalPath);
        if (gitRemote) {
          await window.electronAPI.gitSetRemote(finalPath, gitRemote);
          // Initial push
          try {
            await window.electronAPI.gitSync(finalPath, "Initial commit from Noteriv", vault.id);
          } catch {
            // May fail if repo is empty or has conflicts, that's ok
          }
        }
      }

      onComplete(vault);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create vault";
      setError(message);
      setStep("github-auth");
      setCreating(false);
    }
  };

  function getDefaultBase(): string {
    return process.platform === "win32"
      ? `${process.env.USERPROFILE || "C:\\Users\\user"}\\Noteriv`
      : `${process.env.HOME || "~"}/Noteriv`;
  }

  const canProceedFromName = vaultName.trim().length > 0;
  const canProceedFromLocation = setupType === "new" || setupType === "clone" || vaultPath.length > 0;

  const stepOrder: Step[] = ["welcome", "name", "location", "github-auth", "github-repo", "creating"];
  const currentStepIdx = stepOrder.indexOf(step);

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] flex items-center justify-center z-50">
      <div className="w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--accent)] mb-2">Noteriv</h1>
          <p className="text-[var(--text-muted)] text-sm">Your markdown notes, everywhere</p>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Progress bar */}
          <div className="flex">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-1 transition-colors ${
                  currentStepIdx >= i ? "bg-[var(--accent)]" : "bg-[var(--bg-surface)]"
                }`}
              />
            ))}
          </div>

          <div className="p-8">
            {/* ===================== WELCOME ===================== */}
            {step === "welcome" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Welcome</h2>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                    Set up your first vault — a folder where your notes live. You can create multiple vaults and switch between them.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { type: "new" as const, icon: "+", color: "accent", label: "Create new vault", desc: "Start fresh with an empty vault" },
                    { type: "existing" as const, icon: "F", color: "mauve", label: "Open existing folder", desc: "Use a folder you already have" },
                    { type: "clone" as const, icon: "G", color: "green", label: "Clone from GitHub", desc: "Pull notes from an existing repo" },
                  ].map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => {
                        setSetupType(opt.type);
                        if (opt.type === "clone") setEnableGit(true);
                        setStep("name");
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all text-left"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[var(--${opt.color})] bg-opacity-10 text-[var(--${opt.color})]`}>
                        <span className="text-lg font-bold">{opt.icon}</span>
                      </div>
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">{opt.label}</div>
                        <div className="text-xs text-[var(--text-muted)]">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ===================== NAME ===================== */}
            {step === "name" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Name your vault</h2>
                  <p className="text-[var(--text-secondary)] text-sm">
                    Something like "Personal", "Work", or "Research".
                  </p>
                </div>

                <input
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  placeholder="My Notes"
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceedFromName) setStep("location"); }}
                />

                <div className="flex justify-between">
                  <BackBtn onClick={() => setStep("welcome")} />
                  <NextBtn onClick={() => setStep("location")} disabled={!canProceedFromName} />
                </div>
              </div>
            )}

            {/* ===================== LOCATION ===================== */}
            {step === "location" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    {setupType === "existing" ? "Choose your folder" : "Where to store it?"}
                  </h2>
                  <p className="text-[var(--text-secondary)] text-sm">
                    {setupType === "existing"
                      ? "Select the folder with your notes."
                      : "Pick a parent folder, or use the default."}
                  </p>
                </div>

                <div
                  onClick={handlePickFolder}
                  className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--text-muted)] shrink-0">
                    <path d="M3 5h5l2 2h7v9H3V5z" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className={`text-sm truncate ${vaultPath ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                    {vaultPath || "Click to choose folder..."}
                  </span>
                </div>

                {setupType !== "existing" && !vaultPath && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Default: ~/Noteriv/{vaultName.replace(/\s+/g, "-")}
                  </p>
                )}

                <div className="flex justify-between">
                  <BackBtn onClick={() => setStep("name")} />
                  <NextBtn
                    onClick={() => setStep("github-auth")}
                    disabled={!canProceedFromLocation}
                  />
                </div>
              </div>
            )}

            {/* ===================== GITHUB AUTH ===================== */}
            {step === "github-auth" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    Connect GitHub
                  </h2>
                  <p className="text-[var(--text-secondary)] text-sm">
                    {setupType === "clone"
                      ? "Sign in to access your repos."
                      : "Optionally sync your notes to GitHub. You can skip this."}
                  </p>
                </div>

                {/* Skip option for non-clone */}
                {setupType !== "clone" && !enableGit && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setEnableGit(true)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[var(--text-primary)] bg-opacity-10">
                        <GitHubIcon />
                      </div>
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">Connect GitHub</div>
                        <div className="text-xs text-[var(--text-muted)]">Back up & sync notes to a repo</div>
                      </div>
                    </button>

                    <div className="flex justify-between pt-2">
                      <BackBtn onClick={() => setStep("location")} />
                      <button
                        onClick={handleCreate}
                        className="px-6 py-2 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity"
                      >
                        Skip — Create Vault
                      </button>
                    </div>
                  </div>
                )}

                {/* Token input */}
                {(enableGit || setupType === "clone") && (
                  <div className="space-y-4">
                    {/* Authenticated state */}
                    {ghUser?.valid ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--green)] bg-opacity-10 border border-[var(--green)] border-opacity-20">
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-surface)] overflow-hidden shrink-0">
                          {ghUser.avatar && (
                            <img src={ghUser.avatar} alt="" className="w-full h-full" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">
                            {ghUser.name || ghUser.username}
                          </div>
                          <div className="text-xs text-[var(--green)]">Connected as @{ghUser.username}</div>
                        </div>
                        <button
                          onClick={() => { setGhUser(null); setToken(""); }}
                          className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Step 1: Generate token */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">
                              Personal Access Token
                            </label>
                            <button
                              onClick={() => window.electronAPI?.authOpenTokenPage()}
                              className="text-xs text-[var(--accent)] hover:underline"
                            >
                              Generate on GitHub &rarr;
                            </button>
                          </div>
                          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                            Click "Generate on GitHub" above. Select the <strong>repo</strong> scope, generate the token, and paste it below. Your token is encrypted and stored locally using your OS keychain.
                          </p>
                        </div>

                        {/* Step 2: Paste token */}
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            className="flex-1 px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                            onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) handleValidateToken(); }}
                          />
                          <button
                            onClick={handleValidateToken}
                            disabled={!token.trim() || validating}
                            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
                          >
                            {validating ? (
                              <div className="w-4 h-4 border-2 border-[var(--bg-primary)] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              "Connect"
                            )}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Auto-sync toggle */}
                    {ghUser?.valid && (
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox checked={autoSync} onChange={setAutoSync} />
                        <div>
                          <span className="text-sm text-[var(--text-primary)]">Auto-sync on save</span>
                          <p className="text-xs text-[var(--text-muted)]">Automatically push when you save a file</p>
                        </div>
                      </label>
                    )}

                    {error && (
                      <div className="p-3 rounded-lg bg-[var(--red)] bg-opacity-10 border border-[var(--red)] border-opacity-30">
                        <p className="text-sm text-[var(--red)]">{error}</p>
                      </div>
                    )}

                    <div className="flex justify-between pt-2">
                      <BackBtn onClick={() => {
                        if (setupType !== "clone" && !ghUser?.valid) {
                          setEnableGit(false);
                        } else {
                          setStep("location");
                        }
                      }} />
                      {ghUser?.valid ? (
                        setupType === "clone" ? (
                          <NextBtn onClick={() => setStep("github-repo")} />
                        ) : (
                          <NextBtn
                            onClick={() => setStep("github-repo")}
                            label="Pick repo"
                          />
                        )
                      ) : setupType !== "clone" ? (
                        <button
                          onClick={handleCreate}
                          className="px-6 py-2 text-sm rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          Skip — No sync
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===================== REPO PICKER ===================== */}
            {step === "github-repo" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    {setupType === "clone" ? "Pick a repo to clone" : "Choose a repo"}
                  </h2>
                  <p className="text-[var(--text-secondary)] text-sm">
                    Select an existing repo or create a new one.
                  </p>
                </div>

                {/* Create new repo option */}
                <button
                  onClick={() => { setCreateNewRepo(true); setSelectedRepo(null); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                    createNewRepo
                      ? "border-[var(--accent)] bg-[var(--accent)] bg-opacity-5"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--accent)]">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--text-primary)]">Create new repo</span>
                </button>

                {createNewRepo && (
                  <div className="space-y-3 pl-7">
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value.replace(/[^a-zA-Z0-9-_.]/g, "-"))}
                      placeholder="my-notes"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={newRepoPrivate} onChange={setNewRepoPrivate} />
                      <span className="text-xs text-[var(--text-secondary)]">Private repo</span>
                    </label>
                  </div>
                )}

                {/* Existing repos */}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {loadingRepos ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    repos.map((repo) => (
                      <button
                        key={repo.fullName}
                        onClick={() => { setSelectedRepo(repo); setCreateNewRepo(false); }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                          selectedRepo?.fullName === repo.fullName
                            ? "border-[var(--accent)] bg-[var(--accent)] bg-opacity-5"
                            : "border-transparent hover:bg-[var(--bg-surface)]"
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--text-muted)]">
                          <path d="M2 3h12v10H2V3z" stroke="currentColor" strokeWidth="1.2" />
                          {repo.private && <circle cx="12" cy="5" r="1.5" fill="var(--yellow)" />}
                        </svg>
                        <div className="min-w-0">
                          <div className="text-sm text-[var(--text-primary)] truncate">{repo.name}</div>
                          {repo.description && (
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{repo.description}</div>
                          )}
                        </div>
                        {repo.private && (
                          <span className="ml-auto text-[10px] text-[var(--yellow)] shrink-0">private</span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-[var(--red)] bg-opacity-10 border border-[var(--red)] border-opacity-30">
                    <p className="text-sm text-[var(--red)]">{error}</p>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <BackBtn onClick={() => setStep("github-auth")} />
                  <button
                    onClick={handleCreate}
                    disabled={creating || (!createNewRepo && !selectedRepo) || (createNewRepo && !newRepoName)}
                    className="px-6 py-2 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {setupType === "clone" ? "Clone & Create" : "Create Vault"}
                  </button>
                </div>
              </div>
            )}

            {/* ===================== CREATING ===================== */}
            {step === "creating" && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--text-secondary)]">
                  {setupType === "clone"
                    ? "Cloning repository..."
                    : createNewRepo
                    ? "Creating repo and vault..."
                    : "Setting up your vault..."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Small reusable pieces ---

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
      Back
    </button>
  );
}

function NextBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-6 py-2 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
    >
      {label || "Continue"}
    </button>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
        checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--text-muted)]"
      }`}
      onClick={() => onChange(!checked)}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-6" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--text-primary)]">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
    </svg>
  );
}
