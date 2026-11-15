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

/// The vaults in the app's list. The tests have no list of their own, and are
/// not to read the user's.
fn listed_vaults() -> Vec<crate::store::Vault> {
    if cfg!(test) {
        Vec::new()
    } else {
        crate::store::get_vaults()
    }
}

/// Refuse a run that would put this vault into a folder another vault on this
/// computer syncs with: see `sync_guard`. A vault or a place to sync to that
/// cannot be worked out is left for the provider to report in its own words.
fn guard(
    vault_path: &str,
    destination: Result<crate::sync_guard::Destination, String>,
    record_dir: &std::path::Path,
    listed: &[crate::store::Vault],
) -> Result<(), String> {
    let (Ok(vault), Ok(destination)) = (dunce::canonicalize(vault_path), destination) else {
        return Ok(());
    };
    let others = crate::sync_guard::other_vaults(&vault, listed);
    // With no other vault there is nobody to share a folder with.
    if others.is_empty() {
        return Ok(());
    }
    crate::sync_guard::check(record_dir, &vault, &destination, &others)
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
    run(args, &record_dir(), &listed_vaults()).await
}

/// `sync_run`, told where the records are kept and which vaults are listed.
async fn run(
    args: SyncRunInput,
    records: &std::path::Path,
    listed: &[crate::store::Vault],
) -> Result<SyncResult, String> {
    match args.provider_type.as_str() {
        "folder" => {
            let cfg: crate::sync_folder::FolderConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            guard(&args.vault_path, crate::sync_folder::destination(&cfg), records, listed)?;
            let outcome = crate::sync_folder::sync(&args.vault_path, cfg, records)?;
            Ok(finish(outcome, &args.vault_path))
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            // Before the server is asked for anything, and before the remote folder is made.
            guard(&args.vault_path, crate::sync_webdav::destination(&cfg), records, listed)?;
            let outcome = crate::sync_webdav::sync(&args.vault_path, cfg, records).await?;
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
    /// The open vault, when there is one. The test refuses what sync would
    /// refuse for this vault: a target folder inside it, and a folder that
    /// another vault on this computer syncs with.
    #[serde(rename = "vaultPath", default)]
    pub vault_path: Option<String>,
}

#[tauri::command]
pub async fn sync_test(args: SyncTestInput) -> ConnectionResult {
    ConnectionResult::from(test(args, &record_dir(), &listed_vaults()).await)
}

/// `sync_test`, told where the records are kept and which vaults are listed.
async fn test(
    args: SyncTestInput,
    record_dir: &std::path::Path,
    listed: &[crate::store::Vault],
) -> Result<(), String> {
    let vault = args.vault_path.as_deref();
    match args.provider_type.as_str() {
        "folder" => {
            let cfg: crate::sync_folder::FolderConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            // Before the test makes the folder.
            if let Some(vault) = vault {
                guard(vault, crate::sync_folder::destination(&cfg), record_dir, listed)?;
            }
            crate::sync_folder::test_connection(&cfg, vault)
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            if let Some(vault) = vault {
                guard(vault, crate::sync_webdav::destination(&cfg), record_dir, listed)?;
            }
            crate::sync_webdav::test_connection(cfg).await
        }
        other => Err(format!("Unknown provider: {other}")),
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

    fn listed(name: &str, path: &std::path::Path) -> crate::store::Vault {
        crate::store::Vault {
            id: name.to_lowercase(),
            name: name.into(),
            path: path.to_string_lossy().into_owned(),
            git_remote: None,
            git_branch: "main".into(),
            auto_sync: false,
            last_opened: 0,
        }
    }

    fn folder_run(
        vault: &std::path::Path,
        target: &std::path::Path,
        records: &std::path::Path,
        vaults: &[crate::store::Vault],
    ) -> Result<SyncResult, String> {
        let input: SyncRunInput = serde_json::from_value(json!({
            "vaultPath": vault.to_string_lossy(),
            "providerType": "folder",
            "config": { "targetPath": target.to_string_lossy(), "direction": "both" },
        }))
        .expect("the arguments are read");
        tauri::async_runtime::block_on(run(input, records, vaults))
    }

    #[test]
    fn a_second_vault_is_kept_out_of_the_first_vaults_folder() {
        let base = scratch("two-vaults");
        let (work, home, cloud, records) =
            (base.join("work"), base.join("home"), base.join("cloud"), base.join("records"));
        fs::create_dir_all(&work).unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::write(work.join("Work note.md"), "for work").unwrap();
        fs::write(home.join("Diary.md"), "dear diary").unwrap();
        let vaults = [listed("Work", &work), listed("Home", &home)];

        // The first vault syncs with the folder, and goes on doing so.
        let first = folder_run(&work, &cloud, &records, &vaults).unwrap();
        assert_eq!((first.pushed, first.pulled), (1, 0));
        assert!(cloud.join("Work note.md").is_file());
        assert!(folder_run(&work, &cloud, &records, &vaults).is_ok());

        // The second vault, with the same folder set, is refused: by the
        // run, by the timer's run after it, and by the test in the settings.
        for _ in 0..2 {
            let refused = folder_run(&home, &cloud, &records, &vaults).unwrap_err();
            assert!(refused.contains("the vault \"Work\""), "{refused}");
        }
        let test_args = |target: &std::path::Path| -> SyncTestInput {
            serde_json::from_value(json!({
                "providerType": "folder",
                "config": { "targetPath": target.to_string_lossy(), "direction": "both" },
                "vaultPath": home.to_string_lossy(),
            }))
            .unwrap()
        };
        let tested = tauri::async_runtime::block_on(test(test_args(&cloud), &records, &vaults));
        assert!(tested.unwrap_err().contains("the vault \"Work\""));
        // So is a folder inside the first vault's, and the test does not make it.
        let inside = cloud.join("Home");
        assert!(folder_run(&home, &inside, &records, &vaults).is_err());
        assert!(tauri::async_runtime::block_on(test(test_args(&inside), &records, &vaults)).is_err());
        assert!(!inside.exists(), "the refused folder was made anyway");

        // Nothing crossed over.
        assert!(!cloud.join("Diary.md").exists());
        assert!(!home.join("Work note.md").exists());

        // A folder of its own is fine, and then each vault keeps to its own.
        let own = base.join("cloud-home");
        assert!(tauri::async_runtime::block_on(test(test_args(&own), &records, &vaults)).is_ok());
        let second = folder_run(&home, &own, &records, &vaults).unwrap();
        assert_eq!((second.pushed, second.pulled), (1, 0));
        assert!(own.join("Diary.md").is_file());
        assert!(!own.join("Work note.md").exists());
        assert!(folder_run(&work, &own, &records, &vaults).is_err());

        // What the refusal prevents: run past it, and the two vaults are
        // mixed in one go.
        let cfg: crate::sync_folder::FolderConfig = serde_json::from_value(json!({
            "targetPath": cloud.to_string_lossy(), "direction": "both",
        }))
        .unwrap();
        crate::sync_folder::sync(home.to_str().unwrap(), cfg, &records).unwrap();
        assert!(home.join("Work note.md").is_file());
        assert!(cloud.join("Diary.md").is_file());
        // Now that it has happened, the vault is not locked out of the folder.
        assert!(folder_run(&home, &cloud, &records, &vaults).is_ok());
    }

    #[test]
    fn a_vault_that_was_moved_is_not_kept_out_of_its_own_folder() {
        let base = scratch("moved");
        let (old_place, new_place, cloud, records) =
            (base.join("notes"), base.join("notes-moved"), base.join("cloud"), base.join("records"));
        fs::create_dir_all(&old_place).unwrap();
        fs::write(old_place.join("Note.md"), "a note").unwrap();
        folder_run(&old_place, &cloud, &records, &[listed("Notes", &old_place)]).unwrap();

        // The folder is moved and the app's list now has it at the new place.
        fs::rename(&old_place, &new_place).unwrap();
        let vaults = [listed("Notes", &new_place)];
        let again = folder_run(&new_place, &cloud, &records, &vaults).unwrap();
        assert_eq!(again.error, None);
        assert_eq!(again.conflicts, 0);

        // A place to sync to, or a vault, that cannot be worked out is left
        // for the provider to report.
        let cfg: crate::sync_folder::FolderConfig = serde_json::from_value(json!({
            "targetPath": cloud.to_string_lossy(), "direction": "both",
        }))
        .unwrap();
        let place = || crate::sync_folder::destination(&cfg);
        let other = [listed("Notes", &new_place), listed("Other", &base)];
        assert_eq!(guard(new_place.to_str().unwrap(), Err("no folder".into()), &records, &other), Ok(()));
        assert_eq!(guard("/no/such/vault", place(), &records, &other), Ok(()));
        // With another vault listed that has no record there, it still syncs.
        assert_eq!(guard(new_place.to_str().unwrap(), place(), &records, &other), Ok(()));
    }
}
