// The sync commands the frontend calls. The providers themselves live in
// `sync_folder` and `sync_webdav`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Default, Serialize)]
pub struct SyncResult {
    pushed: usize,
    pulled: usize,
    /// Files removed on one side because they were deleted on the other.
    deleted: usize,
    /// Files that had changed on both sides and were kept as two copies.
    conflicts: usize,
}

#[derive(Debug, Serialize)]
pub struct ConnectionResult {
    ok: bool,
    error: Option<String>,
}

impl ConnectionResult {
    fn from(result: Result<(), String>) -> ConnectionResult {
        match result {
            Ok(()) => ConnectionResult {
                ok: true,
                error: None,
            },
            Err(e) => ConnectionResult {
                ok: false,
                error: Some(e),
            },
        }
    }
}

/// Where this machine keeps its records of earlier syncs. Per machine and
/// outside the vault: see the note at the top of `sync_webdav`.
fn record_dir() -> std::path::PathBuf {
    crate::paths::user_data_dir().join("sync")
}

/// A run that finished but could not sync some files is reported as an error,
/// so the status bar shows it. The files that did sync are already recorded.
fn finish(outcome: crate::sync_webdav::Outcome) -> Result<SyncResult, String> {
    if let Some(first) = outcome.errors.first() {
        let n = outcome.errors.len();
        let files = if n == 1 {
            "1 file".to_string()
        } else {
            format!("{n} files")
        };
        return Err(format!("{files} could not be synced. {first}"));
    }
    Ok(SyncResult {
        pushed: outcome.pushed,
        pulled: outcome.pulled,
        deleted: outcome.deleted,
        conflicts: outcome.conflicts,
    })
}

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
            let cfg: crate::sync_folder::FolderConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            finish(crate::sync_folder::sync(
                &args.vault_path,
                cfg,
                &record_dir(),
            )?)
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            finish(crate::sync_webdav::sync(&args.vault_path, cfg, &record_dir()).await?)
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
        "folder" => match serde_json::from_value::<crate::sync_folder::FolderConfig>(args.config) {
            Ok(cfg) => ConnectionResult::from(crate::sync_folder::test_connection(&cfg)),
            Err(e) => ConnectionResult::from(Err(e.to_string())),
        },
        "webdav" => match serde_json::from_value::<crate::sync_webdav::WebDavConfig>(args.config) {
            Ok(cfg) => ConnectionResult::from(crate::sync_webdav::test_connection(cfg).await),
            Err(e) => ConnectionResult::from(Err(e.to_string())),
        },
        other => ConnectionResult::from(Err(format!("Unknown provider: {other}"))),
    }
}
