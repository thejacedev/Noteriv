// Sync providers. The folder provider lives here; WebDAV is in `sync_webdav`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const SYNC_EXTS: &[&str] = &[".md", ".markdown", ".txt", ".css", ".json", ".yaml", ".yml"];
const SKIP_DIRS: &[&str] = &[".git", ".noteriv", "node_modules", ".obsidian", ".trash"];

#[derive(Debug, Clone)]
struct LocalFile {
    rel: String,  // forward-slash relative path
    full: PathBuf,
    mtime_ms: u128,
}

fn skip_dirs() -> HashSet<&'static str> {
    SKIP_DIRS.iter().copied().collect()
}

fn sync_exts() -> HashSet<&'static str> {
    SYNC_EXTS.iter().copied().collect()
}

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default()
}

fn walk_files(base: &Path) -> Vec<LocalFile> {
    let mut out = Vec::new();
    let exts = sync_exts();
    let skip = skip_dirs();

    fn recurse(
        cur: &Path,
        base: &Path,
        exts: &HashSet<&'static str>,
        skip: &HashSet<&'static str>,
        out: &mut Vec<LocalFile>,
    ) {
        let entries = match fs::read_dir(cur) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if skip.contains(name_s.as_ref()) {
                continue;
            }
            let path = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                recurse(&path, base, exts, skip, out);
            } else {
                let ext = ext_lower(&path);
                if exts.contains(ext.as_str()) {
                    let mtime = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let rel = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));
                    out.push(LocalFile {
                        rel,
                        full: path,
                        mtime_ms: mtime,
                    });
                }
            }
        }
    }

    recurse(base, base, &exts, &skip, &mut out);
    out
}

fn ensure_parent(p: &Path) {
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

#[derive(Debug, Default, Serialize)]
pub struct SyncResult {
    pushed: usize,
    pulled: usize,
    /// Files removed on one side because they were deleted on the other (WebDAV only).
    deleted: usize,
    /// Files that had changed on both sides and were kept as two copies (WebDAV only).
    conflicts: usize,
}

#[derive(Debug, Serialize)]
pub struct ConnectionResult {
    ok: bool,
    error: Option<String>,
}

// ============================================================
// Folder provider
// ============================================================

#[derive(Debug, Deserialize)]
struct FolderConfig {
    #[serde(rename = "targetPath")]
    target_path: String,
    #[serde(default = "default_direction")]
    direction: String,
}

fn default_direction() -> String {
    "both".into()
}

fn folder_sync(vault_path: &str, cfg: FolderConfig) -> Result<SyncResult, String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    if cfg.target_path.is_empty() {
        return Err("Invalid target path".into());
    }
    if !Path::new(vault_path).exists() {
        return Err("Invalid vault path".into());
    }
    let target = Path::new(&cfg.target_path);
    if !target.exists() {
        fs::create_dir_all(target).map_err(|e| e.to_string())?;
    }

    let local = walk_files(Path::new(vault_path));
    let remote = walk_files(target);

    let local_map: HashMap<String, LocalFile> =
        local.iter().cloned().map(|f| (f.rel.clone(), f)).collect();
    let remote_map: HashMap<String, LocalFile> =
        remote.iter().cloned().map(|f| (f.rel.clone(), f)).collect();

    let mut pushed = 0usize;
    let mut pulled = 0usize;

    if cfg.direction == "push" || cfg.direction == "both" {
        for (rel, lf) in &local_map {
            let needs = match remote_map.get(rel) {
                Some(rf) => lf.mtime_ms > rf.mtime_ms,
                None => true,
            };
            if needs {
                let dest = target.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                ensure_parent(&dest);
                fs::copy(&lf.full, &dest).map_err(|e| e.to_string())?;
                pushed += 1;
            }
        }
    }

    if cfg.direction == "pull" || cfg.direction == "both" {
        for (rel, rf) in &remote_map {
            let needs = match local_map.get(rel) {
                Some(lf) => rf.mtime_ms > lf.mtime_ms,
                None => true,
            };
            if needs {
                let dest = Path::new(vault_path)
                    .join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                ensure_parent(&dest);
                fs::copy(&rf.full, &dest).map_err(|e| e.to_string())?;
                pulled += 1;
            }
        }
    }

    Ok(SyncResult { pushed, pulled, ..Default::default() })
}

fn folder_test(cfg: &FolderConfig) -> ConnectionResult {
    if cfg.target_path.is_empty() {
        return ConnectionResult { ok: false, error: Some("No target path".into()) };
    }
    let target = Path::new(&cfg.target_path);
    if !target.exists() {
        if let Err(e) = fs::create_dir_all(target) {
            return ConnectionResult { ok: false, error: Some(e.to_string()) };
        }
    }
    let probe = target.join(".noteriv-test");
    if let Err(e) = fs::write(&probe, "test") {
        return ConnectionResult { ok: false, error: Some(e.to_string()) };
    }
    let _ = fs::remove_file(&probe);
    ConnectionResult { ok: true, error: None }
}

// ============================================================
// Public commands
// ============================================================

#[derive(Debug, Deserialize)]
pub struct SyncRunInput {
    #[serde(rename = "vaultPath")]
    pub vault_path: String,
    #[serde(rename = "providerType")]
    pub provider_type: String,
    pub config: Value,
}

#[tauri::command]
pub async fn sync_run(args: SyncRunInput) -> Result<SyncResult, String> {
    match args.provider_type.as_str() {
        "folder" => {
            let cfg: FolderConfig = serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            folder_sync(&args.vault_path, cfg)
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            // Per machine, outside the vault: see the note at the top of `sync_webdav`.
            let record_dir = crate::paths::user_data_dir().join("sync");
            let outcome = crate::sync_webdav::sync(&args.vault_path, cfg, &record_dir).await?;
            if let Some(first) = outcome.errors.first() {
                let n = outcome.errors.len();
                let files = if n == 1 { "1 file".to_string() } else { format!("{n} files") };
                return Err(format!("{files} could not be synced. {first}"));
            }
            Ok(SyncResult {
                pushed: outcome.pushed,
                pulled: outcome.pulled,
                deleted: outcome.deleted,
                conflicts: outcome.conflicts,
            })
        }
        other => Err(format!("Unknown sync provider: {other}")),
    }
}

#[derive(Debug, Deserialize)]
pub struct SyncTestInput {
    #[serde(rename = "providerType")]
    pub provider_type: String,
    pub config: Value,
}

#[tauri::command]
pub async fn sync_test(args: SyncTestInput) -> ConnectionResult {
    match args.provider_type.as_str() {
        "folder" => match serde_json::from_value::<FolderConfig>(args.config) {
            Ok(cfg) => folder_test(&cfg),
            Err(e) => ConnectionResult { ok: false, error: Some(e.to_string()) },
        },
        "webdav" => match serde_json::from_value::<crate::sync_webdav::WebDavConfig>(args.config) {
            Ok(cfg) => match crate::sync_webdav::test_connection(cfg).await {
                Ok(()) => ConnectionResult { ok: true, error: None },
                Err(e) => ConnectionResult { ok: false, error: Some(e) },
            },
            Err(e) => ConnectionResult { ok: false, error: Some(e.to_string()) },
        },
        other => ConnectionResult { ok: false, error: Some(format!("Unknown provider: {other}")) },
    }
}
