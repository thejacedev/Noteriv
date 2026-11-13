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
    /// The open vault, when there is one. The folder provider uses it to
    /// refuse a target that sync would refuse for this vault.
    #[serde(rename = "vaultPath", default)]
    pub vault_path: Option<String>,
}

#[tauri::command]
pub async fn sync_test(args: SyncTestInput) -> ConnectionResult {
    match args.provider_type.as_str() {
        "folder" => match serde_json::from_value::<crate::sync_folder::FolderConfig>(args.config) {
            Ok(cfg) => ConnectionResult::from(crate::sync_folder::test_connection(
                &cfg,
                args.vault_path.as_deref(),
            )),
            Err(e) => ConnectionResult::from(Err(e.to_string())),
        },
        "webdav" => match serde_json::from_value::<crate::sync_webdav::WebDavConfig>(args.config) {
            Ok(cfg) => ConnectionResult::from(crate::sync_webdav::test_connection(cfg).await),
            Err(e) => ConnectionResult::from(Err(e.to_string())),
        },
        other => ConnectionResult::from(Err(format!("Unknown provider: {other}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "noteriv-sync-commands-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dunce::canonicalize(dir).unwrap()
    }

    /// The arguments exactly as the frontend sends them.
    fn folder_test(vault: Option<&std::path::Path>, target: &std::path::Path) -> ConnectionResult {
        let mut args = json!({
            "providerType": "folder",
            "config": { "targetPath": target.to_string_lossy(), "direction": "both" },
        });
        if let Some(vault) = vault {
            args["vaultPath"] = json!(vault.to_string_lossy());
        }
        let input: SyncTestInput = serde_json::from_value(args).expect("the arguments are read");
        tauri::async_runtime::block_on(sync_test(input))
    }

    #[test]
    fn the_folder_test_is_told_which_vault_is_open() {
        let base = scratch("vault-path");
        let vault = base.join("vault");
        fs::create_dir_all(&vault).unwrap();

        let inside = vault.join("Backup");
        let refused = folder_test(Some(&vault), &inside);
        assert!(!refused.ok);
        assert!(
            refused.error.as_deref().unwrap_or("").contains("inside the vault"),
            "{:?}",
            refused.error
        );
        assert!(!inside.exists(), "the refused folder was created anyway");

        let outside = base.join("cloud").join("Noteriv");
        let accepted = folder_test(Some(&vault), &outside);
        assert!(accepted.ok, "{:?}", accepted.error);
        assert!(outside.is_dir());

        // An older frontend, or no vault open: only the folder is tested.
        let no_vault = folder_test(None, &base.join("cloud").join("Other"));
        assert!(no_vault.ok, "{:?}", no_vault.error);
    }
}
