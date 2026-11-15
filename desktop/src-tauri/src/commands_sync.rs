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

/// The vaults in the app's list, each with where it is set to sync to now.
/// The tests have no list of their own, and are not to read the user's.
fn listed_vaults() -> Vec<crate::sync_guard::ListedVault> {
    if cfg!(test) {
        return Vec::new();
    }
    let settings = crate::store::load_settings();
    crate::store::get_vaults()
        .into_iter()
        .map(|vault| crate::sync_guard::ListedVault {
            destination: vault_destination(&settings, &vault.id),
            vault,
        })
        .collect()
}

/// Where a vault's own sync settings say it syncs to. `None` when it has no
/// settings, no provider chosen, or a folder or address that cannot be read.
fn vault_destination(
    settings: &serde_json::Map<String, Value>,
    id: &str,
) -> Option<crate::sync_guard::Destination> {
    let entry = settings.get("vaultSync")?.as_object()?.get(id)?.as_object()?;
    shared_destination(entry.get("extraSyncProvider")?.as_str()?, entry)
}

/// Refuse a run that would put this vault into a folder another vault on this
/// computer syncs with: see `sync_guard`. A vault or a place to sync to that
/// cannot be worked out is left for the provider to report in its own words.
fn guard(
    vault_path: &str,
    destination: Result<crate::sync_guard::Destination, String>,
    record_dir: &std::path::Path,
    listed: &[crate::sync_guard::ListedVault],
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

// ============================================================
// Sync settings of each vault
// ============================================================

/// The settings that say where a vault syncs to and what it carries there.
const VAULT_SYNC_KEYS: [&str; 4] = ["extraSyncProvider", "folderSync", "webdavSync", "syncFilter"];

/// Where the shared settings synced to, when that can be worked out.
fn shared_destination(
    provider: &str,
    shared: &serde_json::Map<String, Value>,
) -> Option<crate::sync_guard::Destination> {
    match provider {
        "folder" => {
            let cfg: crate::sync_folder::FolderConfig =
                serde_json::from_value(shared.get("folderSync")?.clone()).ok()?;
            crate::sync_folder::destination(&cfg).ok()
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(shared.get("webdavSync")?.clone()).ok()?;
            crate::sync_webdav::destination(&cfg).ok()
        }
        _ => None,
    }
}

/// Each vault's own sync settings, made from the one set every vault shared
/// up to 3.0.0. The result is keyed by the vault's id.
///
/// - With no provider chosen nothing syncs, and every vault keeps what was
///   typed in.
/// - Otherwise the settings go to the vaults that have a record of syncing
///   with that place, and the other vaults get sync turned off. Those are
///   the vaults the shared settings would have dragged into a folder that is
///   not theirs the next time they were opened.
/// - When no vault has such a record (sync was set up and never ran, or the
///   records are gone), they go to the vault that is open: with one vault,
///   that is the vault they were set up for.
fn vault_sync_from_shared(
    settings: &serde_json::Map<String, Value>,
    vaults: &[crate::store::Vault],
    active: Option<&str>,
    records: &std::path::Path,
) -> serde_json::Map<String, Value> {
    let mut shared = serde_json::Map::new();
    for key in VAULT_SYNC_KEYS {
        if let Some(value) = settings.get(key) {
            shared.insert(key.to_string(), value.clone());
        }
    }
    let provider = shared
        .get("extraSyncProvider")
        .and_then(Value::as_str)
        .unwrap_or("none")
        .to_string();

    let mut entries = serde_json::Map::new();
    if provider != "folder" && provider != "webdav" {
        for vault in vaults {
            entries.insert(vault.id.clone(), Value::Object(shared.clone()));
        }
        return entries;
    }

    let mut users: Vec<&str> = match shared_destination(&provider, &shared) {
        Some(destination) => vaults
            .iter()
            .filter(|vault| {
                dunce::canonicalize(&vault.path)
                    .is_ok_and(|path| crate::sync_guard::has_synced(records, &path, &destination))
            })
            .map(|vault| vault.id.as_str())
            .collect(),
        None => Vec::new(),
    };
    if users.is_empty() {
        let open = active
            .and_then(|id| vaults.iter().find(|vault| vault.id == id))
            .or(vaults.first());
        users.extend(open.map(|vault| vault.id.as_str()));
    }

    let mut off = serde_json::Map::new();
    off.insert("extraSyncProvider".to_string(), Value::String("none".into()));
    for vault in vaults {
        let entry = if users.contains(&vault.id.as_str()) {
            shared.clone()
        } else {
            off.clone()
        };
        entries.insert(vault.id.clone(), Value::Object(entry));
    }
    entries
}

/// Give each vault its own sync settings, once. A settings file that has
/// `vaultSync` in it has been through this already. The shared settings are
/// left in the file as they were: nothing reads them after this.
pub fn migrate_vault_sync() {
    let mut settings = crate::store::load_settings();
    if settings.contains_key("vaultSync") {
        return;
    }
    let config = crate::store::get_config();
    // A new installation has nothing to hand out, and the frontend writes
    // the first vault's settings itself.
    if settings.is_empty() && config.vaults.is_empty() {
        return;
    }
    let entries = vault_sync_from_shared(
        &settings,
        &config.vaults,
        config.active_vault_id.as_deref(),
        &record_dir(),
    );
    settings.insert("vaultSync".to_string(), Value::Object(entries));
    if !crate::store::save_settings(&Value::Object(settings)) {
        log::warn!("[sync] the vaults' own sync settings could not be saved");
    }
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

/// What the status bar says when a run was refused before it began.
fn not_synced(reason: String) -> String {
    format!("Nothing was synced. {reason}")
}

/// `sync_run`, told where the records are kept and which vaults are listed.
async fn run(
    args: SyncRunInput,
    records: &std::path::Path,
    listed: &[crate::sync_guard::ListedVault],
) -> Result<SyncResult, String> {
    match args.provider_type.as_str() {
        "folder" => {
            let cfg: crate::sync_folder::FolderConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            guard(&args.vault_path, crate::sync_folder::destination(&cfg), records, listed)
                .map_err(not_synced)?;
            let outcome = crate::sync_folder::sync(&args.vault_path, cfg, records)?;
            Ok(finish(outcome, &args.vault_path))
        }
        "webdav" => {
            let cfg: crate::sync_webdav::WebDavConfig =
                serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            // Before the server is asked for anything, and before the remote folder is made.
            guard(&args.vault_path, crate::sync_webdav::destination(&cfg), records, listed)
                .map_err(not_synced)?;
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
    listed: &[crate::sync_guard::ListedVault],
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

    /// A vault in the list that is set to sync with the folder `place`.
    fn set_to(
        name: &str,
        path: &std::path::Path,
        place: Option<&std::path::Path>,
    ) -> crate::sync_guard::ListedVault {
        crate::sync_guard::ListedVault {
            vault: listed(name, path),
            destination: place.map(|p| crate::sync_guard::Destination::Folder(p.to_path_buf())),
        }
    }

    fn folder_run(
        vault: &std::path::Path,
        target: &std::path::Path,
        records: &std::path::Path,
        vaults: &[crate::sync_guard::ListedVault],
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
        // Where each vault ends up set to sync: Work with the folder, Home with one of its own.
        let own = base.join("cloud-home");
        let vaults = [set_to("Work", &work, Some(&cloud)), set_to("Home", &home, Some(&own))];

        // The first vault syncs with the folder, and goes on doing so.
        let first = folder_run(&work, &cloud, &records, &vaults).unwrap();
        assert_eq!((first.pushed, first.pulled), (1, 0));
        assert!(cloud.join("Work note.md").is_file());
        assert!(folder_run(&work, &cloud, &records, &vaults).is_ok());

        // The second vault, with the same folder set, is refused: by the
        // run, by the timer's run after it, and by the test in the settings.
        for _ in 0..2 {
            let refused = folder_run(&home, &cloud, &records, &vaults).unwrap_err();
            assert!(refused.starts_with("Nothing was synced. The vault \"Work\" on this computer"), "{refused}");
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
        // The test synced nothing either way, so it only gives the reason.
        assert!(tested.unwrap_err().starts_with("The vault \"Work\" on this computer"));
        // So is a folder inside the first vault's, and the test does not make it.
        let inside = cloud.join("Home");
        assert!(folder_run(&home, &inside, &records, &vaults).is_err());
        assert!(tauri::async_runtime::block_on(test(test_args(&inside), &records, &vaults)).is_err());
        assert!(!inside.exists(), "the refused folder was made anyway");

        // Nothing crossed over.
        assert!(!cloud.join("Diary.md").exists());
        assert!(!home.join("Work note.md").exists());

        // A folder of its own is fine, and then each vault keeps to its own.
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
    fn a_folder_a_vault_has_left_is_free_for_another() {
        let base = scratch("left-folder");
        let (work, home, cloud, records) =
            (base.join("work"), base.join("home"), base.join("cloud"), base.join("records"));
        fs::create_dir_all(&work).unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::write(work.join("Work note.md"), "for work").unwrap();
        fs::write(home.join("Diary.md"), "dear diary").unwrap();

        // The settings went to the wrong vault and it synced once before anyone noticed.
        let at_first = [set_to("Work", &work, Some(&cloud)), set_to("Home", &home, None)];
        folder_run(&work, &cloud, &records, &at_first).unwrap();
        assert!(folder_run(&home, &cloud, &records, &at_first).is_err());

        // Work's sync is turned off and the folder is given to Home: Home is
        // not turned away by a record of a sync Work no longer does.
        let put_right = [set_to("Work", &work, None), set_to("Home", &home, Some(&cloud))];
        let synced = folder_run(&home, &cloud, &records, &put_right).unwrap();
        assert_eq!(synced.error, None);
        assert!(cloud.join("Diary.md").is_file());
        // Work has synced with the folder before, so it is never locked out
        // of it: set to it again, it is let through, as it always was.
        let both_set = [set_to("Work", &work, Some(&cloud)), set_to("Home", &home, Some(&cloud))];
        assert!(folder_run(&work, &cloud, &records, &both_set).is_ok());
    }

    #[test]
    fn a_vaults_own_settings_say_where_it_syncs_to() {
        let base = scratch("vault-destination");
        let cloud = base.join("cloud");
        let settings = json!({
            "extraSyncProvider": "webdav",
            "webdavSync": { "url": "https://old.example.com", "username": "", "password": "", "remotePath": "/Shared" },
            "vaultSync": {
                "work": { "extraSyncProvider": "folder", "folderSync": { "targetPath": cloud.to_string_lossy(), "direction": "both" } },
                "home": { "extraSyncProvider": "webdav", "webdavSync": { "url": "https://dav.example.com/files/me/", "username": "me", "password": "x", "remotePath": "/Home" } },
                "off": { "extraSyncProvider": "none", "folderSync": { "targetPath": cloud.to_string_lossy(), "direction": "both" } },
                "empty": { "extraSyncProvider": "folder", "folderSync": { "targetPath": "", "direction": "both" } },
            },
        });
        let settings = settings.as_object().unwrap();
        use crate::sync_guard::Destination;
        assert_eq!(vault_destination(settings, "work"), Some(Destination::Folder(cloud.clone())));
        assert_eq!(
            vault_destination(settings, "home"),
            Some(Destination::webdav("https://dav.example.com/files/me/Home"))
        );
        // Sync off, nothing set, or no settings of its own: not the shared ones at the top.
        assert_eq!(vault_destination(settings, "off"), None);
        assert_eq!(vault_destination(settings, "empty"), None);
        assert_eq!(vault_destination(settings, "new"), None);
        assert_eq!(vault_destination(json!({ "extraSyncProvider": "folder" }).as_object().unwrap(), "work"), None);
    }

    #[test]
    fn the_shared_sync_settings_go_to_the_vaults_that_used_them() {
        let base = scratch("migrate");
        let (work, home, cloud, records) =
            (base.join("work"), base.join("home"), base.join("cloud"), base.join("records"));
        fs::create_dir_all(&work).unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::write(work.join("Work note.md"), "for work").unwrap();
        let (w, h) = (listed("Work", &work), listed("Home", &home));
        let both = [w.clone(), h.clone()];

        let folder_sync = json!({ "targetPath": cloud.to_string_lossy(), "direction": "both" });
        let filter = json!({ "images": true, "pdfs": false, "audio": false, "video": false, "settings": true, "excludeFolders": "Archive" });
        let settings = json!({
            "theme": "nord",
            "extraSyncProvider": "folder",
            "folderSync": folder_sync,
            "webdavSync": { "url": "", "username": "", "password": "", "remotePath": "/Noteriv", "encryptionPassword": "" },
            "syncFilter": filter,
        });
        let settings = settings.as_object().unwrap();
        let shared = json!({
            "extraSyncProvider": "folder",
            "folderSync": folder_sync,
            "webdavSync": settings["webdavSync"],
            "syncFilter": filter,
        });
        let off = json!({ "extraSyncProvider": "none" });
        let entries = |vaults: &[crate::store::Vault], active: Option<&str>| {
            Value::Object(vault_sync_from_shared(settings, vaults, active, &records))
        };

        // Set up and never run. One vault: it keeps the settings, whichever is "open".
        assert_eq!(entries(&[w.clone()], Some("work")), json!({ "work": shared }));
        assert_eq!(entries(&[w.clone()], None), json!({ "work": shared }));
        assert_eq!(entries(&[w.clone()], Some("gone")), json!({ "work": shared }));
        // Two vaults: the open one has them, the other does not sync.
        assert_eq!(entries(&both, Some("home")), json!({ "work": off, "home": shared }));
        assert_eq!(entries(&both, None), json!({ "work": shared, "home": off }));
        assert_eq!(entries(&[], Some("work")), json!({}));

        // Work has synced with the folder. It is Work's, whichever vault is open.
        folder_run(&work, &cloud, &records, &[]).unwrap();
        assert_eq!(entries(&both, Some("home")), json!({ "work": shared, "home": off }));
        assert_eq!(entries(&both, Some("work")), json!({ "work": shared, "home": off }));
        assert_eq!(entries(&[w.clone()], Some("work")), json!({ "work": shared }));

        // Both have synced with it already: both go on as they were.
        let cfg: crate::sync_folder::FolderConfig = serde_json::from_value(folder_sync.clone()).unwrap();
        crate::sync_folder::sync(home.to_str().unwrap(), cfg, &records).unwrap();
        assert_eq!(entries(&both, Some("home")), json!({ "work": shared, "home": shared }));

        // With no provider chosen nothing syncs, and what was typed stays with every vault.
        let mut none = settings.clone();
        none.insert("extraSyncProvider".into(), json!("none"));
        let typed = json!({
            "extraSyncProvider": "none",
            "folderSync": folder_sync,
            "webdavSync": settings["webdavSync"],
            "syncFilter": filter,
        });
        assert_eq!(
            Value::Object(vault_sync_from_shared(&none, &both, Some("home"), &records)),
            json!({ "work": typed, "home": typed })
        );
        // A settings file with no sync settings in it at all.
        let bare = json!({ "theme": "nord" });
        assert_eq!(
            Value::Object(vault_sync_from_shared(bare.as_object().unwrap(), &both, None, &records)),
            json!({ "work": {}, "home": {} })
        );
    }

    #[test]
    fn the_shared_webdav_settings_go_by_the_folder_on_the_server() {
        let base = scratch("migrate-webdav");
        let (work, home, records) = (base.join("work"), base.join("home"), base.join("records"));
        fs::create_dir_all(&work).unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&records).unwrap();
        let both = [listed("Work", &work), listed("Home", &home)];
        let webdav = json!({ "url": "https://dav.example.com/files/me/", "username": "me", "password": "secret", "remotePath": "/Noteriv", "encryptionPassword": "" });
        let settings = json!({ "extraSyncProvider": "webdav", "webdavSync": webdav });
        let settings = settings.as_object().unwrap();
        let shared = json!({ "extraSyncProvider": "webdav", "webdavSync": webdav });
        let off = json!({ "extraSyncProvider": "none" });

        // Home is the vault that has synced with that folder, encrypted.
        let record = json!({
            "version": 1,
            "vault": home.to_string_lossy(),
            "remote": "https://dav.example.com/files/me/Noteriv\nme\nencrypted",
            "files": {},
        });
        fs::write(records.join("webdav-1.json"), record.to_string()).unwrap();
        assert_eq!(
            Value::Object(vault_sync_from_shared(settings, &both, Some("work"), &records)),
            json!({ "work": off, "home": shared })
        );

        // Settings that say WebDAV and give no address that can be read: the open vault keeps them.
        let broken = json!({ "extraSyncProvider": "webdav", "webdavSync": { "url": "not an address" } });
        let kept = json!({ "extraSyncProvider": "webdav", "webdavSync": { "url": "not an address" } });
        assert_eq!(
            Value::Object(vault_sync_from_shared(broken.as_object().unwrap(), &both, Some("work"), &records)),
            json!({ "work": kept, "home": off })
        );
    }

    #[test]
    fn a_vault_that_was_moved_is_not_kept_out_of_its_own_folder() {
        let base = scratch("moved");
        let (old_place, new_place, cloud, records) =
            (base.join("notes"), base.join("notes-moved"), base.join("cloud"), base.join("records"));
        fs::create_dir_all(&old_place).unwrap();
        fs::write(old_place.join("Note.md"), "a note").unwrap();
        folder_run(&old_place, &cloud, &records, &[set_to("Notes", &old_place, Some(&cloud))]).unwrap();

        // The folder is moved and the app's list now has it at the new place.
        fs::rename(&old_place, &new_place).unwrap();
        let vaults = [set_to("Notes", &new_place, Some(&cloud))];
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
        let other = [set_to("Notes", &new_place, Some(&cloud)), set_to("Other", &base, None)];
        assert_eq!(guard(new_place.to_str().unwrap(), Err("no folder".into()), &records, &other), Ok(()));
        assert_eq!(guard("/no/such/vault", place(), &records, &other), Ok(()));
        // With another vault listed that has no record there, it still syncs.
        assert_eq!(guard(new_place.to_str().unwrap(), place(), &records, &other), Ok(()));
    }

    /// Against a real WebDAV server: see the top of the live tests in
    /// `sync_webdav.rs` for the server and the variables. Run with
    /// `cargo test --lib commands_sync::tests::live -- --ignored --test-threads=1`.
    mod live {
        use super::*;

        fn var(name: &str) -> String {
            std::env::var(name).unwrap_or_else(|_| panic!("{name} is not set"))
        }

        fn config(remote_path: &str) -> Value {
            json!({
                "url": var("NOTERIV_WEBDAV_URL"),
                "username": var("NOTERIV_WEBDAV_USER"),
                "password": var("NOTERIV_WEBDAV_PASS"),
                "remotePath": remote_path,
            })
        }

        fn webdav_run(
            vault: &std::path::Path,
            remote_path: &str,
            records: &std::path::Path,
            vaults: &[crate::sync_guard::ListedVault],
        ) -> Result<SyncResult, String> {
            let input: SyncRunInput = serde_json::from_value(json!({
                "vaultPath": vault.to_string_lossy(),
                "providerType": "webdav",
                "config": config(remote_path),
            }))
            .unwrap();
            tauri::async_runtime::block_on(run(input, records, vaults))
        }

        fn webdav_test(
            vault: &std::path::Path,
            remote_path: &str,
            records: &std::path::Path,
            vaults: &[crate::sync_guard::ListedVault],
        ) -> Result<(), String> {
            let input: SyncTestInput = serde_json::from_value(json!({
                "providerType": "webdav",
                "config": config(remote_path),
                "vaultPath": vault.to_string_lossy(),
            }))
            .unwrap();
            tauri::async_runtime::block_on(test(input, records, vaults))
        }

        #[test]
        #[ignore]
        fn a_second_vault_is_kept_out_of_the_first_vaults_webdav_folder() {
            let base = scratch("live-two-vaults");
            let (work, home, records) = (base.join("work"), base.join("home"), base.join("records"));
            fs::create_dir_all(&work).unwrap();
            fs::create_dir_all(&home).unwrap();
            fs::write(work.join("Work note.md"), "for work").unwrap();
            fs::write(home.join("Diary.md"), "dear diary").unwrap();
            let millis = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis();
            let top = format!("/noteriv-live-guard-{millis}");
            let shared = format!("{top}/Work");
            let own = format!("{top}/Home");
            // Where each vault ends up set to sync: its own folder on the server.
            let set_to = |name: &str, path: &std::path::Path, remote_path: &str| {
                let cfg: crate::sync_webdav::WebDavConfig = serde_json::from_value(config(remote_path)).unwrap();
                crate::sync_guard::ListedVault {
                    vault: listed(name, path),
                    destination: crate::sync_webdav::destination(&cfg).ok(),
                }
            };
            let vaults = [set_to("Work", &work, &shared), set_to("Home", &home, &own)];

            // The first vault syncs with the folder on the server.
            let first = webdav_run(&work, &shared, &records, &vaults).unwrap();
            assert_eq!((first.pushed, first.pulled, first.error), (1, 0, None));

            // The second vault is refused that folder, a folder inside it and
            // the folder that holds it, by a run and by the test.
            for place in [shared.clone(), format!("{shared}/"), format!("{shared}/Inner"), top.clone()] {
                let refused = webdav_run(&home, &place, &records, &vaults).unwrap_err();
                assert!(refused.starts_with("Nothing was synced. The vault \"Work\" on this computer"), "{place}: {refused}");
                let tested = webdav_test(&home, &place, &records, &vaults).unwrap_err();
                assert!(tested.starts_with("The vault \"Work\" on this computer"), "{place}: {tested}");
            }
            assert!(!home.join("Work note.md").exists());

            // The first vault syncs again and finds nothing new on the server:
            // none of the refused runs put anything there.
            let again = webdav_run(&work, &shared, &records, &vaults).unwrap();
            assert_eq!((again.pushed, again.pulled, again.deleted, again.error), (0, 0, 0, None));
            assert!(!work.join("Diary.md").exists());

            // A folder of its own, beside the first one, is fine.
            assert_eq!(webdav_test(&home, &own, &records, &vaults), Ok(()));
            let second = webdav_run(&home, &own, &records, &vaults).unwrap();
            assert_eq!((second.pushed, second.pulled, second.error), (1, 0, None));
            // And now it is the first vault that is refused the second one's.
            assert!(webdav_run(&work, &own, &records, &vaults).is_err());

            // Each vault still has only its own note.
            let again = webdav_run(&work, &shared, &records, &vaults).unwrap();
            assert_eq!((again.pushed, again.pulled), (0, 0));
            assert!(!work.join("Diary.md").exists());
            assert!(!home.join("Work note.md").exists());
        }
    }
}
