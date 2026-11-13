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
    /// One entry per conflict, so the app can tell the user which notes now
    /// have a second copy.
    #[serde(rename = "conflictCopies")]
    conflict_copies: Vec<ConflictCopyInfo>,
    /// Set when some files could not be synced. The rest of the result still
    /// stands: those files' conflicts are already resolved on disk and will
    /// not be reported by a later run.
    error: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ConflictCopyInfo {
    /// The note, relative to the vault, with `/` between folders.
    note: String,
    /// The conflict copy, relative the same way.
    copy: String,
    /// The copy's full path, for opening it. `None` when the copy is not in
    /// the vault: push-only folder sync keeps it in the target folder.
    #[serde(rename = "copyPath")]
    copy_path: Option<String>,
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

/// What a finished run tells the frontend. A run that could not sync some
/// files carries an `error`, which the status bar shows; the files that did
/// sync are already recorded, and their conflicts are still reported.
///
/// The copy's path is built on the vault path as the frontend gave it, so it
/// matches the paths the frontend already uses for that vault's files.
fn finish(outcome: crate::sync_webdav::Outcome, vault_path: &str) -> SyncResult {
    let error = outcome.errors.first().map(|first| {
        let n = outcome.errors.len();
        let files = if n == 1 {
            "1 file".to_string()
        } else {
            format!("{n} files")
        };
        format!("{files} could not be synced. {first}")
    });
    let vault = std::path::Path::new(vault_path);
    let conflict_copies = outcome
        .conflict_copies
        .into_iter()
        .map(|c| ConflictCopyInfo {
            copy_path: c.in_vault.then(|| {
                crate::sync_webdav::local_path(vault, &c.copy)
                    .to_string_lossy()
                    .into_owned()
            }),
            note: c.note,
            copy: c.copy,
        })
        .collect();
    SyncResult {
        pushed: outcome.pushed,
        pulled: outcome.pulled,
        deleted: outcome.deleted,
        conflicts: outcome.conflicts,
        conflict_copies,
        error,
    }
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
            let outcome = crate::sync_folder::sync(&args.vault_path, cfg, &record_dir())?;
            Ok(finish(outcome, &args.vault_path))
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            let outcome = crate::sync_webdav::sync(&args.vault_path, cfg, &record_dir()).await?;
            Ok(finish(outcome, &args.vault_path))
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

    #[test]
    fn a_run_with_a_failed_file_still_reports_its_conflicts() {
        use crate::sync_webdav::{ConflictCopy, Outcome};
        let vault = scratch("finish");
        let outcome = Outcome {
            pushed: 2,
            conflicts: 2,
            conflict_copies: vec![
                ConflictCopy {
                    note: "Daily Notes/Today.md".into(),
                    copy: "Daily Notes/Today (conflict 2026-11-13 09-00-00).md".into(),
                    in_vault: true,
                },
                ConflictCopy {
                    note: "Inbox.md".into(),
                    copy: "Inbox (conflict 2026-11-13 09-00-00).md".into(),
                    in_vault: false,
                },
            ],
            errors: vec!["\"Locked.md\": permission denied".into(), "another".into()],
            ..Outcome::default()
        };
        let result = finish(outcome, vault.to_str().unwrap());
        assert_eq!(
            result.error.as_deref(),
            Some("2 files could not be synced. \"Locked.md\": permission denied")
        );
        assert_eq!(result.conflict_copies.len(), 2);
        // A copy in the vault comes with a path built from native separators.
        let expected = vault
            .join("Daily Notes")
            .join("Today (conflict 2026-11-13 09-00-00).md");
        assert_eq!(
            result.conflict_copies[0].copy_path.as_deref(),
            Some(expected.to_str().unwrap())
        );
        // A copy that is only in the target folder has none.
        assert_eq!(result.conflict_copies[1].copy_path, None);

        // The exact field names the frontend reads.
        let json = serde_json::to_value(&result).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            ["conflictCopies", "conflicts", "deleted", "error", "pulled", "pushed"]
        );
        let mut keys: Vec<&str> = json["conflictCopies"][0]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort();
        assert_eq!(keys, ["copy", "copyPath", "note"]);
        assert_eq!(json["conflictCopies"][1]["copyPath"], serde_json::Value::Null);

        let clean = finish(Outcome::default(), vault.to_str().unwrap());
        assert_eq!(serde_json::to_value(&clean).unwrap()["error"], serde_json::Value::Null);
        assert!(clean.conflict_copies.is_empty());
    }

    #[test]
    fn a_folder_sync_through_the_command_names_the_conflict_copy() {
        let base = scratch("run-conflict");
        let (vault, target) = (base.join("vault"), base.join("cloud"));
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&target).unwrap();
        // No record yet and the two sides differ: both versions are kept.
        fs::write(vault.join("Note.md"), "the vault's version").unwrap();
        fs::write(target.join("Note.md"), "the folder's").unwrap();

        // `sync_run` keeps its records in the user's data folder, so the
        // provider is called here with a scratch one, then `finish` as the
        // command does.
        let cfg: crate::sync_folder::FolderConfig = serde_json::from_value(json!({
            "targetPath": target.to_string_lossy(), "direction": "both",
        }))
        .unwrap();
        let vault_arg = vault.to_str().unwrap();
        let outcome = crate::sync_folder::sync(vault_arg, cfg, &base.join("records")).unwrap();
        let result = finish(outcome, vault_arg);

        assert_eq!(result.conflicts, 1);
        assert_eq!(result.error, None);
        let copy = &result.conflict_copies[0];
        assert_eq!(copy.note, "Note.md");
        assert!(copy.copy.starts_with("Note (conflict "), "{}", copy.copy);
        let path = std::path::Path::new(copy.copy_path.as_deref().expect("the copy is in the vault"));
        assert!(path.is_file(), "{} does not exist", path.display());
        assert_eq!(path.parent().unwrap(), vault);
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
