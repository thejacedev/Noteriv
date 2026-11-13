//! Folder sync.
//!
//! Keeps a vault in step with another folder on this machine. That folder is
//! usually one a cloud-drive client (Dropbox, Google Drive, OneDrive, iCloud)
//! syncs on its own, so another program reads and writes it at the same time.
//!
//! It works the way WebDAV sync does and shares its planner and record (see
//! `sync_webdav`): a record of what each file looked like on both sides when
//! they last matched tells a real change from a copy this app made itself,
//! and a deleted file from one that was never synced. File times on the two
//! sides are only compared to pick which version keeps the name in a conflict.
//!
//! Three things are specific to a folder:
//!
//! - It has a direction. Two-way syncs changes and deletions both ways.
//!   Push-only and pull-only copy one way and never delete anything.
//! - Deletions go to a trash on the side they are made on, never straight to
//!   nothing, because the target may be a plain folder with no trash of its
//!   own.
//! - Nothing is written when the other side already holds the same bytes.
//!   Without that rule two folders copy the same file back and forth.

use crate::sync_webdav::{
    action_rel, conflict_rel, content_hash, is_synced_file, list_local, load_record, local_path,
    move_to_trash_if_unchanged, plan, safe_rel, save_record, settle_touched_files, stat_local,
    write_local_if_unchanged, Action, FileRecord, LocalFile, Outcome, RemoteFile, SyncRecord,
    RECORD_VERSION, SAVE_EVERY, SKIP_DIRS,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================
// Configuration
// ============================================================

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct FolderConfig {
    #[serde(rename = "targetPath")]
    pub target_path: String,
    #[serde(default = "default_direction")]
    pub direction: String,
}

fn default_direction() -> String {
    "both".into()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction {
    /// Changes and deletions travel both ways.
    Both,
    /// Vault to folder only. The vault is never changed.
    Push,
    /// Folder to vault only. The folder is never changed.
    Pull,
}

fn parse_direction(direction: &str) -> Result<Direction, String> {
    match direction {
        "both" => Ok(Direction::Both),
        "push" => Ok(Direction::Push),
        "pull" => Ok(Direction::Pull),
        other => Err(format!("Unknown sync direction: {other}")),
    }
}

// ============================================================
// The two folders
// ============================================================

/// Where the target is, whether or not it exists yet: the part of the path
/// that exists is resolved through links, and the rest is added back.
fn resolve_target(configured: &str) -> Result<PathBuf, String> {
    let configured = configured.trim();
    if configured.is_empty() {
        return Err("No target folder is set.".into());
    }
    let path = crate::paths::expand_tilde(configured);
    if !path.is_absolute() {
        return Err(
            "The target folder must be a full path, such as /home/you/Dropbox/Noteriv.".into(),
        );
    }
    let mut existing = path.as_path();
    let mut missing: Vec<OsString> = Vec::new();
    loop {
        if let Ok(mut resolved) = dunce::canonicalize(existing) {
            for part in missing.iter().rev() {
                resolved.push(part);
            }
            return Ok(resolved);
        }
        match (existing.parent(), existing.file_name()) {
            (Some(parent), Some(name)) => {
                missing.push(name.to_os_string());
                existing = parent;
            }
            _ => return Err("The target folder path could not be resolved.".into()),
        }
    }
}

/// A target inside the vault, or a vault inside the target, would copy into
/// itself on every run.
fn check_separate(vault: &Path, target: &Path) -> Result<(), String> {
    if vault == target {
        Err("The target folder is the vault itself. Choose a different folder.".into())
    } else if target.starts_with(vault) {
        Err("The target folder is inside the vault. Choose a folder outside it.".into())
    } else if vault.starts_with(target) {
        Err("The vault is inside the target folder. Choose a folder that does not contain the vault.".into())
    } else {
        Ok(())
    }
}

/// What tells two versions of a file in the target apart.
fn sig_of(file: &LocalFile) -> String {
    format!("{}|{}", file.mtime_ms, file.size)
}

/// Files a cloud client has swapped for a placeholder to free disk space.
/// iCloud Drive on older versions of macOS does this by renaming: `Note.md`
/// becomes `.Note.md.icloud`. The note still exists in the cloud, so it must
/// not be taken for deleted. Returns the real names of such files.
fn evicted_files(base: &Path) -> Result<BTreeSet<String>, String> {
    fn walk(cur: &Path, prefix: &str, out: &mut BTreeSet<String>) -> Result<(), String> {
        let unreadable = |e: std::io::Error| {
            format!(
                "\"{}\" could not be read ({e}), so nothing was synced.",
                cur.display()
            )
        };
        for entry in fs::read_dir(cur).map_err(unreadable)? {
            let entry = entry.map_err(unreadable)?;
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if !SKIP_DIRS.contains(&name.as_str()) {
                    let rel = if prefix.is_empty() {
                        name
                    } else {
                        format!("{prefix}/{name}")
                    };
                    walk(&entry.path(), &rel, out)?;
                }
                continue;
            }
            if let Some(real) = placeholder_target(&name) {
                let rel = if prefix.is_empty() {
                    real.to_string()
                } else {
                    format!("{prefix}/{real}")
                };
                if is_synced_file(&rel) && safe_rel(&rel) {
                    out.insert(rel);
                }
            }
        }
        Ok(())
    }
    let mut out = BTreeSet::new();
    walk(base, "", &mut out)?;
    Ok(out)
}

/// `.Note.md.icloud` stands in for `Note.md`.
fn placeholder_target(name: &str) -> Option<&str> {
    let real = name.strip_prefix('.')?.strip_suffix(".icloud")?;
    (!real.is_empty()).then_some(real)
}

/// Whether the file at `path` already holds exactly `bytes`.
fn holds(path: &Path, bytes: &[u8]) -> bool {
    match stat_local(path) {
        Some(file) if file.size == bytes.len() as u64 => {
            fs::read(path).map(|have| have == bytes).unwrap_or(false)
        }
        _ => false,
    }
}

// ============================================================
// The record of the last sync
// ============================================================

fn record_file(record_dir: &Path, vault: &str, remote: &str) -> PathBuf {
    let digest = Sha256::digest(format!("{vault}\n{remote}").as_bytes());
    let hex: String = digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
    record_dir.join(format!("folder-{hex}.json"))
}

/// A file in the target whose time changed but whose size did not may only
/// have been touched: cloud clients rewrite file times. Compare its content
/// with what was synced, and if it is the same, note the new time and move on.
fn settle_touched_target(
    target: &Path,
    listing: &BTreeMap<String, LocalFile>,
    record: &mut SyncRecord,
) {
    for (rel, file) in listing {
        let Some(entry) = record.files.get_mut(rel) else {
            continue;
        };
        let sig = sig_of(file);
        if sig == entry.remote_sig || file.size != entry.local_size || entry.hash.is_empty() {
            continue;
        }
        if let Ok(bytes) = fs::read(local_path(target, rel)) {
            if content_hash(&bytes) == entry.hash {
                entry.remote_sig = sig;
            }
        }
    }
}

// ============================================================
// Doing it
// ============================================================

struct Run<'a> {
    vault: &'a Path,
    target: &'a Path,
    direction: Direction,
    /// Both sides as listed at the start of the run.
    local: &'a BTreeMap<String, LocalFile>,
    remote: &'a BTreeMap<String, LocalFile>,
    record: SyncRecord,
    outcome: Outcome,
}

impl Run<'_> {
    fn note(&mut self, rel: &str, local: &LocalFile, remote: &LocalFile, bytes: &[u8]) {
        self.record.files.insert(
            rel.to_string(),
            FileRecord {
                local_mtime_ms: local.mtime_ms,
                local_size: local.size,
                remote_sig: sig_of(remote),
                hash: content_hash(bytes),
            },
        );
    }

    /// Copy one file from the vault to the target, or the other way, and note
    /// what both sides look like afterwards.
    fn copy(&mut self, rel: &str, to_target: bool) -> Result<(), String> {
        let (from, to, listed) = if to_target {
            (self.vault, self.target, self.remote.get(rel))
        } else {
            (self.target, self.vault, self.local.get(rel))
        };
        let source = local_path(from, rel);
        // Taken before reading: if the file changes mid-copy, the next run sees it as changed.
        let source_state = stat_local(&source).ok_or("The file is no longer there.")?;
        let bytes = fs::read(&source).map_err(|e| e.to_string())?;

        let destination = local_path(to, rel);
        let (destination_state, wrote) = if holds(&destination, &bytes) {
            // Same bytes already: writing would only make the other side look changed.
            (
                stat_local(&destination).ok_or("The file is no longer there.")?,
                false,
            )
        } else {
            match write_local_if_unchanged(to, rel, &bytes, listed)? {
                Some(now) => (now, true),
                // It changed while this run was working. Leave it; the next run decides.
                None => return Ok(()),
            }
        };

        if to_target {
            self.note(rel, &source_state, &destination_state, &bytes);
            self.outcome.pushed += usize::from(wrote);
        } else {
            self.note(rel, &destination_state, &source_state, &bytes);
            self.outcome.pulled += usize::from(wrote);
        }
        Ok(())
    }

    /// Both sides have the file and it is not known which is right. Identical
    /// contents are simply noted as in step. If they differ, one version keeps
    /// the name and the other is saved beside it as a conflict copy:
    ///
    /// - two-way: the newer one keeps the name, and the copy goes to both sides
    /// - push-only: the vault's keeps the name, and the copy stays in the target
    /// - pull-only: the target's keeps the name, and the copy stays in the vault
    fn reconcile(&mut self, rel: &str) -> Result<(), String> {
        let local = self
            .local
            .get(rel)
            .ok_or("The file is no longer in the vault.")?
            .clone();
        let remote = self
            .remote
            .get(rel)
            .ok_or("The file is no longer in the target folder.")?
            .clone();
        let local_bytes = fs::read(local_path(self.vault, rel)).map_err(|e| e.to_string())?;
        let remote_bytes = fs::read(local_path(self.target, rel)).map_err(|e| e.to_string())?;

        if local_bytes == remote_bytes {
            self.note(rel, &local, &remote, &local_bytes);
            return Ok(());
        }

        let vault_wins = match self.direction {
            Direction::Push => true,
            Direction::Pull => false,
            Direction::Both => remote.mtime_ms <= local.mtime_ms,
        };
        let losing_bytes = if vault_wins {
            &remote_bytes
        } else {
            &local_bytes
        };
        let stamp = chrono::Local::now().format("%Y-%m-%d %H-%M-%S").to_string();
        let copy_rel = {
            let (vault, target) = (self.vault, self.target);
            conflict_rel(rel, &stamp, &|candidate: &str| {
                local_path(vault, candidate).exists() || local_path(target, candidate).exists()
            })
        };

        // Save the version that will lose its name first, so it exists before anything is replaced.
        let failed = "A conflict copy could not be written.";
        let in_vault = match self.direction {
            Direction::Push => None,
            _ => Some(
                write_local_if_unchanged(self.vault, &copy_rel, losing_bytes, None)?
                    .ok_or(failed)?,
            ),
        };
        let in_target = match self.direction {
            Direction::Pull => None,
            _ => Some(
                write_local_if_unchanged(self.target, &copy_rel, losing_bytes, None)?
                    .ok_or(failed)?,
            ),
        };
        if let (Some(local_copy), Some(remote_copy)) = (&in_vault, &in_target) {
            self.note(&copy_rel, local_copy, remote_copy, losing_bytes);
        }

        self.copy(rel, vault_wins)?;
        self.outcome.conflicts += 1;
        Ok(())
    }

    /// Move a file that was deleted on the other side into this side's trash.
    fn trash(&mut self, rel: &str, in_target: bool) -> Result<(), String> {
        let (base, listed) = if in_target {
            (self.target, self.remote.get(rel))
        } else {
            (self.vault, self.local.get(rel))
        };
        let listed = listed.ok_or("The file is no longer there.")?;
        if move_to_trash_if_unchanged(base, rel, listed)? {
            self.record.files.remove(rel);
            self.outcome.deleted += 1;
        }
        Ok(())
    }

    fn apply(&mut self, action: &Action) -> Result<(), String> {
        use Direction::{Both, Pull, Push};
        match (action, self.direction) {
            (Action::Upload(rel), Both | Push) => self.copy(rel, true),
            (Action::Download(rel), Both | Pull) => self.copy(rel, false),
            // One-way modes leave changes on the receiving side where they are.
            (Action::Upload(_), Pull) | (Action::Download(_), Push) => Ok(()),

            (Action::Compare(rel) | Action::Conflict(rel), _) => self.reconcile(rel),

            // Deleted in the vault.
            (Action::DeleteRemote(rel), Both) => self.trash(rel, true),
            (Action::DeleteRemote(_), Push) => Ok(()),
            (Action::DeleteRemote(rel), Pull) => self.copy(rel, false),

            // Deleted in the target. One-way modes never delete: a file that
            // is missing where copies go is simply copied again.
            (Action::TrashLocal(rel), Both) => self.trash(rel, false),
            (Action::TrashLocal(rel), Push) => self.copy(rel, true),
            (Action::TrashLocal(_), Pull) => Ok(()),

            (Action::Forget(rel), _) => {
                self.record.files.remove(rel);
                Ok(())
            }
        }
    }
}

/// Sync a vault with its target folder. `record_dir` is where this machine
/// keeps its records of earlier syncs.
///
/// Both folders have to be listed completely or nothing is changed. After
/// that each file stands alone: one that fails is reported in `errors` and
/// does not stop the rest.
pub(crate) fn sync(
    vault_path: &str,
    cfg: FolderConfig,
    record_dir: &Path,
) -> Result<Outcome, String> {
    let direction = parse_direction(&cfg.direction)?;
    let vault = dunce::canonicalize(vault_path)
        .ok()
        .filter(|path| path.is_dir())
        .ok_or("The vault folder is missing, so nothing was synced.")?;
    let target = resolve_target(&cfg.target_path)?;
    check_separate(&vault, &target)?;

    // The direction is part of the record's identity. A record kept in a
    // one-way mode has skipped deletions in it, and they must not all be
    // carried out the moment the direction changes: a new direction starts
    // from scratch, like a first sync.
    let vault_id = vault.to_string_lossy().into_owned();
    let remote_id = format!("folder\n{}\n{}", target.to_string_lossy(), cfg.direction);
    let record_path = record_file(record_dir, &vault_id, &remote_id);
    let mut loaded = load_record(&record_path, &vault_id, &remote_id);

    if !target.is_dir() {
        if loaded.is_some() {
            // It was there before. Creating an empty one in its place (on the
            // disk under an unmounted drive, say) would record a sync that
            // never reached the real folder.
            return Err(
                "The target folder is missing, so nothing was synced. If it is on another drive, check that the drive is connected."
                    .into(),
            );
        }
        fs::create_dir_all(&target)
            .map_err(|e| format!("The target folder could not be created: {e}"))?;
    }

    let local = list_local(&vault)?;
    let remote = list_local(&target)?;
    let evicted = evicted_files(&target)?;

    if let Some(record) = loaded.as_mut() {
        settle_touched_files(&vault, &local, record);
        settle_touched_target(&target, &remote, record);
    }
    let remote_view: BTreeMap<String, RemoteFile> = remote
        .iter()
        .map(|(rel, file)| {
            (
                rel.clone(),
                RemoteFile {
                    sig: sig_of(file),
                    mtime_ms: file.mtime_ms,
                    etag: None,
                },
            )
        })
        .collect();
    let mut actions = plan(&local, &remote_view, loaded.as_ref());
    // A file the cloud client has put away is neither deleted nor ready to be compared.
    actions.retain(|action| !evicted.contains(action_rel(action)));

    let record = loaded.unwrap_or_else(|| SyncRecord {
        version: RECORD_VERSION,
        vault: vault_id,
        remote: remote_id,
        files: BTreeMap::new(),
    });
    let mut run = Run {
        vault: &vault,
        target: &target,
        direction,
        local: &local,
        remote: &remote,
        record,
        outcome: Outcome::default(),
    };

    let mut since_save = 0usize;
    for action in &actions {
        match run.apply(action) {
            Ok(()) => {
                since_save += 1;
                if since_save >= SAVE_EVERY {
                    since_save = 0;
                    let _ = save_record(&record_path, &run.record);
                }
            }
            Err(e) => run
                .outcome
                .errors
                .push(format!("{}: {e}", action_rel(action))),
        }
    }
    save_record(&record_path, &run.record)
        .map_err(|e| format!("The record of this sync could not be saved: {e}"))?;
    Ok(run.outcome)
}

/// Check that the target folder can be created and written to.
pub(crate) fn test_connection(cfg: &FolderConfig) -> Result<(), String> {
    parse_direction(&cfg.direction)?;
    let target = resolve_target(&cfg.target_path)?;
    fs::create_dir_all(&target)
        .map_err(|e| format!("The target folder could not be created: {e}"))?;
    let probe = target.join(".noteriv-test");
    fs::write(&probe, "test")
        .map_err(|e| format!("The target folder cannot be written to: {e}"))?;
    let _ = fs::remove_file(&probe);
    Ok(())
}

// ============================================================
// Tests
// ============================================================
//
// Each test plays one or two devices, each with its own vault and its own
// records, syncing through a target folder the way two computers share a
// cloud-drive folder.

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::{Duration, SystemTime};

    fn scratch(name: &str) -> PathBuf {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "noteriv-folder-sync-{}-{n}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dunce::canonicalize(dir).unwrap()
    }

    fn write(base: &Path, rel: &str, content: &[u8]) {
        let path = local_path(base, rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn text(base: &Path, rel: &str) -> String {
        fs::read_to_string(local_path(base, rel)).unwrap_or_else(|_| panic!("{rel} is missing"))
    }

    fn remove(base: &Path, rel: &str) {
        fs::remove_file(local_path(base, rel)).unwrap();
    }

    fn tree(base: &Path) -> Vec<String> {
        list_local(base).unwrap().keys().cloned().collect()
    }

    /// Every synced file with its time and size, to show that nothing was rewritten.
    fn snapshot(base: &Path) -> Vec<(String, u64, u64)> {
        list_local(base)
            .unwrap()
            .into_iter()
            .map(|(rel, f)| (rel, f.mtime_ms, f.size))
            .collect()
    }

    fn set_time(base: &Path, rel: &str, seconds_from_now: i64) {
        let now = SystemTime::now();
        let when = if seconds_from_now >= 0 {
            now + Duration::from_secs(seconds_from_now as u64)
        } else {
            now - Duration::from_secs((-seconds_from_now) as u64)
        };
        fs::File::options()
            .write(true)
            .open(local_path(base, rel))
            .unwrap()
            .set_modified(when)
            .unwrap();
    }

    /// The names in a side's trash, without the timestamp prefix.
    fn trashed(base: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(base.join(".noteriv").join("trash"))
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.file_name().into_string().unwrap())
                    .filter(|name| !name.ends_with(".meta.json"))
                    .map(|name| {
                        name.split_once('-')
                            .map(|(_, rest)| rest.to_string())
                            .unwrap_or(name)
                    })
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    fn counts(o: &Outcome) -> (usize, usize, usize, usize) {
        (o.pushed, o.pulled, o.deleted, o.conflicts)
    }

    /// One device: a vault and this machine's records.
    struct Device {
        vault: PathBuf,
        records: PathBuf,
    }

    impl Device {
        fn new(name: &str) -> Device {
            let base = scratch(name);
            let device = Device {
                vault: base.join("vault"),
                records: base.join("records"),
            };
            fs::create_dir_all(&device.vault).unwrap();
            device
        }

        fn try_sync(&self, target: &Path, direction: &str) -> Result<Outcome, String> {
            let cfg = FolderConfig {
                target_path: target.to_string_lossy().into_owned(),
                direction: direction.into(),
            };
            sync(self.vault.to_str().unwrap(), cfg, &self.records)
        }

        fn sync(&self, target: &Path, direction: &str) -> Outcome {
            let outcome = self.try_sync(target, direction).expect("the sync runs");
            assert!(
                outcome.errors.is_empty(),
                "unexpected errors: {:?}",
                outcome.errors
            );
            outcome
        }

        /// Two more runs with nothing to do, and no file touched on either side.
        fn assert_idle(&self, target: &Path, direction: &str) {
            let before = (snapshot(&self.vault), snapshot(target));
            for _ in 0..2 {
                assert_eq!(
                    counts(&self.sync(target, direction)),
                    (0, 0, 0, 0),
                    "an idle run did something"
                );
            }
            assert_eq!(
                (snapshot(&self.vault), snapshot(target)),
                before,
                "an idle run rewrote a file"
            );
        }
    }

    // ── Two-way ──

    #[test]
    fn two_way_brings_both_sides_together_and_then_stays_quiet() {
        let a = Device::new("union");
        let target = scratch("union-target");
        let picture: Vec<u8> = (0..=255u8).cycle().take(40_000).collect();
        write(&a.vault, "Inbox.md", b"inbox");
        write(&a.vault, "Projects/Deep/Plan.md", b"plan");
        write(&a.vault, "img/pic.png", &picture);
        write(&a.vault, "movie.mp4", &picture);
        write(&target, "From folder.md", b"made elsewhere");
        write(&target, "Projects/Other.md", b"other");

        assert_eq!(counts(&a.sync(&target, "both")), (3, 2, 0, 0));
        let everything = [
            "From folder.md",
            "Inbox.md",
            "Projects/Deep/Plan.md",
            "Projects/Other.md",
            "img/pic.png",
        ];
        assert_eq!(tree(&a.vault), everything);
        assert_eq!(tree(&target), everything);
        assert_eq!(
            fs::read(local_path(&target, "img/pic.png")).unwrap(),
            picture
        );
        // Not a type the vault syncs: it stays where it is.
        assert!(!target.join("movie.mp4").exists());
        a.assert_idle(&target, "both");
    }

    #[test]
    fn edits_travel_between_two_devices_sharing_a_folder() {
        let a = Device::new("edits-a");
        let b = Device::new("edits-b");
        let target = scratch("edits-target");
        write(&a.vault, "Note.md", b"v1");
        write(&a.vault, "Sub/Second.md", b"one");
        assert_eq!(counts(&a.sync(&target, "both")), (2, 0, 0, 0));
        assert_eq!(counts(&b.sync(&target, "both")), (0, 2, 0, 0));
        assert_eq!(tree(&b.vault), tree(&a.vault));

        write(&a.vault, "Note.md", b"version two, from a");
        assert_eq!(counts(&a.sync(&target, "both")), (1, 0, 0, 0));
        assert_eq!(counts(&b.sync(&target, "both")), (0, 1, 0, 0));
        assert_eq!(text(&b.vault, "Note.md"), "version two, from a");

        write(&b.vault, "Sub/Second.md", b"second, edited on b");
        write(&b.vault, "Sub/New here.md", b"made on b");
        assert_eq!(counts(&b.sync(&target, "both")), (2, 0, 0, 0));
        assert_eq!(counts(&a.sync(&target, "both")), (0, 2, 0, 0));
        assert_eq!(text(&a.vault, "Sub/Second.md"), "second, edited on b");
        assert_eq!(text(&a.vault, "Sub/New here.md"), "made on b");
        a.assert_idle(&target, "both");
        b.assert_idle(&target, "both");
    }

    #[test]
    fn a_deleted_note_stays_deleted_and_lands_in_a_trash_on_each_side() {
        let a = Device::new("delete-a");
        let b = Device::new("delete-b");
        let target = scratch("delete-target");
        write(&a.vault, "Keep.md", b"keep");
        write(&a.vault, "Gone.md", b"gone");
        a.sync(&target, "both");
        b.sync(&target, "both");

        remove(&a.vault, "Gone.md");
        assert_eq!(counts(&a.sync(&target, "both")), (0, 0, 1, 0));
        assert_eq!(tree(&target), ["Keep.md"]);
        // The folder may have no trash of its own, so the copy is kept in one there.
        assert_eq!(trashed(&target), ["Gone.md"]);
        a.assert_idle(&target, "both");
        assert_eq!(tree(&a.vault), ["Keep.md"], "the deleted note came back");

        assert_eq!(counts(&b.sync(&target, "both")), (0, 0, 1, 0));
        assert_eq!(tree(&b.vault), ["Keep.md"]);
        assert_eq!(trashed(&b.vault), ["Gone.md"]);
        b.assert_idle(&target, "both");
    }

    #[test]
    fn an_edit_on_one_device_survives_a_deletion_on_another() {
        let a = Device::new("edit-wins-a");
        let b = Device::new("edit-wins-b");
        let target = scratch("edit-wins-target");
        write(&a.vault, "X.md", b"v1");
        write(&a.vault, "Keep.md", b"keep");
        a.sync(&target, "both");
        b.sync(&target, "both");

        remove(&a.vault, "X.md");
        write(&b.vault, "X.md", b"edited on b");
        assert_eq!(counts(&a.sync(&target, "both")), (0, 0, 1, 0));
        assert_eq!(counts(&b.sync(&target, "both")), (1, 0, 0, 0));
        assert_eq!(counts(&a.sync(&target, "both")), (0, 1, 0, 0));
        assert_eq!(text(&a.vault, "X.md"), "edited on b");
        a.assert_idle(&target, "both");
        b.assert_idle(&target, "both");
    }

    #[test]
    fn the_same_note_edited_on_two_devices_keeps_both_versions() {
        let a = Device::new("conflict-a");
        let b = Device::new("conflict-b");
        let target = scratch("conflict-target");
        write(&a.vault, "Both.md", b"original");
        a.sync(&target, "both");
        b.sync(&target, "both");

        write(&a.vault, "Both.md", b"edit from device a");
        write(&b.vault, "Both.md", b"edit from b");
        set_time(&b.vault, "Both.md", -600);
        assert_eq!(counts(&a.sync(&target, "both")), (1, 0, 0, 0));

        let outcome = b.sync(&target, "both");
        assert_eq!(outcome.conflicts, 1);
        let files = tree(&b.vault);
        assert_eq!(files.len(), 2, "{files:?}");
        // The newer edit keeps the name; the older one becomes the copy.
        assert_eq!(text(&b.vault, "Both.md"), "edit from device a");
        let copy = files
            .iter()
            .find(|f| f.contains("(conflict "))
            .expect("a conflict copy");
        assert_eq!(text(&b.vault, copy), "edit from b");
        assert_eq!(tree(&target), files);
        b.assert_idle(&target, "both");

        a.sync(&target, "both");
        assert_eq!(tree(&a.vault), files);
        assert_eq!(text(&a.vault, copy), "edit from b");
        a.assert_idle(&target, "both");
    }

    // ── The first sync, and syncs after something went missing ──

    #[test]
    fn a_first_sync_adopts_identical_files_without_rewriting_them() {
        // What an existing folder-sync setup looks like after updating: the same
        // files on both sides, with different times, and no record.
        let a = Device::new("adopt");
        let target = scratch("adopt-target");
        for rel in ["One.md", "Sub/Two.md"] {
            write(&a.vault, rel, rel.as_bytes());
            write(&target, rel, rel.as_bytes());
            set_time(&target, rel, -3600);
        }
        let before = (snapshot(&a.vault), snapshot(&target));
        assert_eq!(counts(&a.sync(&target, "both")), (0, 0, 0, 0));
        assert_eq!((snapshot(&a.vault), snapshot(&target)), before);
        a.assert_idle(&target, "both");
    }

    #[test]
    fn a_first_sync_keeps_both_versions_of_a_file_that_differs() {
        let a = Device::new("first-differs");
        let target = scratch("first-differs-target");
        write(&a.vault, "Same.md", b"same");
        write(&target, "Same.md", b"same");
        write(&a.vault, "Diff.md", b"vault version");
        write(&target, "Diff.md", b"folder version, older");
        set_time(&target, "Diff.md", -3600);

        let outcome = a.sync(&target, "both");
        assert_eq!(outcome.conflicts, 1);
        let files = tree(&a.vault);
        assert_eq!(files.len(), 3, "{files:?}");
        assert_eq!(text(&a.vault, "Diff.md"), "vault version");
        let copy = files.iter().find(|f| f.contains("(conflict ")).unwrap();
        assert_eq!(text(&a.vault, copy), "folder version, older");
        assert_eq!(tree(&target), files);
        assert!(trashed(&a.vault).is_empty() && trashed(&target).is_empty());
        a.assert_idle(&target, "both");
    }

    #[test]
    fn an_emptied_vault_gets_its_notes_back_instead_of_emptying_the_folder() {
        let a = Device::new("empty-vault");
        let target = scratch("empty-vault-target");
        for rel in ["One.md", "Two.md", "Sub/Three.md"] {
            write(&a.vault, rel, rel.as_bytes());
        }
        a.sync(&target, "both");
        for rel in ["One.md", "Two.md", "Sub/Three.md"] {
            remove(&a.vault, rel);
        }
        assert_eq!(counts(&a.sync(&target, "both")), (0, 3, 0, 0));
        assert_eq!(tree(&target).len(), 3);
        assert_eq!(tree(&a.vault).len(), 3);
        assert!(trashed(&target).is_empty());
    }

    #[test]
    fn an_emptied_folder_gets_everything_again_and_nothing_is_trashed() {
        let a = Device::new("empty-target");
        let target = scratch("empty-target-target");
        for rel in ["One.md", "Sub/Two.md"] {
            write(&a.vault, rel, rel.as_bytes());
        }
        a.sync(&target, "both");
        remove(&target, "One.md");
        remove(&target, "Sub/Two.md");
        assert_eq!(counts(&a.sync(&target, "both")), (2, 0, 0, 0));
        assert_eq!(tree(&a.vault).len(), 2);
        assert!(trashed(&a.vault).is_empty());
    }

    #[test]
    fn a_missing_folder_is_created_once_but_never_recreated_after_a_sync() {
        let a = Device::new("missing-target");
        let parent = scratch("missing-target-parent");
        let target = parent.join("Cloud").join("Noteriv");
        write(&a.vault, "Note.md", b"note");
        assert_eq!(counts(&a.sync(&target, "both")), (1, 0, 0, 0));
        assert!(target.join("Note.md").exists());

        // As when the drive it lives on is not connected.
        fs::remove_dir_all(parent.join("Cloud")).unwrap();
        write(
            &a.vault,
            "Note.md",
            b"note, edited while the drive was away",
        );
        let err = a.try_sync(&target, "both").unwrap_err();
        assert!(err.contains("target folder is missing"), "{err}");
        assert!(
            !target.exists(),
            "an empty folder was created in place of the missing one"
        );
        assert_eq!(
            text(&a.vault, "Note.md"),
            "note, edited while the drive was away"
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_folder_stops_the_sync_instead_of_deleting_its_notes() {
        use std::os::unix::fs::PermissionsExt;
        let a = Device::new("unreadable");
        let target = scratch("unreadable-target");
        write(&a.vault, "Open.md", b"open");
        write(&a.vault, "Locked/Inside.md", b"inside");
        a.sync(&target, "both");

        let locked = a.vault.join("Locked");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = a.try_sync(&target, "both");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();

        let err = result.expect_err("the sync should refuse to run");
        assert!(err.contains("nothing was synced"), "{err}");
        assert_eq!(tree(&target), ["Locked/Inside.md", "Open.md"]);
        assert!(trashed(&target).is_empty());
        a.assert_idle(&target, "both");
    }

    // ── What a cloud client does to the folder ──

    #[test]
    fn a_file_the_cloud_client_only_touched_is_not_copied_again() {
        let a = Device::new("touched");
        let target = scratch("touched-target");
        write(&a.vault, "Note.md", b"unchanged");
        a.sync(&target, "both");

        set_time(&target, "Note.md", 120);
        set_time(&a.vault, "Note.md", -120);
        let before = (snapshot(&a.vault), snapshot(&target));
        assert_eq!(counts(&a.sync(&target, "both")), (0, 0, 0, 0));
        assert_eq!((snapshot(&a.vault), snapshot(&target)), before);
        a.assert_idle(&target, "both");
    }

    #[test]
    fn a_file_the_cloud_client_put_away_is_not_taken_for_deleted() {
        let a = Device::new("evicted");
        let target = scratch("evicted-target");
        write(&a.vault, "Sub/Note.md", b"note");
        write(&a.vault, "Other.md", b"other");
        a.sync(&target, "both");

        // iCloud frees disk space by swapping the file for a placeholder.
        remove(&target, "Sub/Note.md");
        fs::write(target.join("Sub").join(".Note.md.icloud"), b"placeholder").unwrap();
        assert_eq!(counts(&a.sync(&target, "both")), (0, 0, 0, 0));
        assert_eq!(text(&a.vault, "Sub/Note.md"), "note");
        assert!(trashed(&a.vault).is_empty());
        assert!(
            !target.join("Sub").join("Note.md").exists(),
            "the real file was written over the placeholder"
        );

        // When the client brings the file back, nothing needs doing.
        fs::remove_file(target.join("Sub").join(".Note.md.icloud")).unwrap();
        write(&target, "Sub/Note.md", b"note");
        a.assert_idle(&target, "both");

        assert_eq!(placeholder_target(".Note.md.icloud"), Some("Note.md"));
        assert_eq!(placeholder_target("Note.md.icloud"), None);
        assert_eq!(placeholder_target("..icloud"), None);
        assert_eq!(placeholder_target(".hidden"), None);
    }

    #[test]
    fn nothing_is_written_over_a_file_that_already_holds_the_same_bytes() {
        let dir = scratch("holds");
        write(&dir, "a.md", b"same bytes");
        assert!(holds(&dir.join("a.md"), b"same bytes"));
        assert!(!holds(&dir.join("a.md"), b"same size!"));
        assert!(!holds(&dir.join("a.md"), b"different length"));
        assert!(!holds(&dir.join("missing.md"), b"same bytes"));
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_file_is_synced_and_a_linked_folder_is_not_followed() {
        let a = Device::new("links");
        let target = scratch("links-target");
        let outside = scratch("links-outside");
        write(&outside, "Elsewhere.md", b"lives outside the vault");
        write(&outside, "Folder/Inside.md", b"inside a linked folder");
        write(&a.vault, "Plain.md", b"plain");
        std::os::unix::fs::symlink(outside.join("Elsewhere.md"), a.vault.join("Linked note.md"))
            .unwrap();
        std::os::unix::fs::symlink(outside.join("Folder"), a.vault.join("Linked folder")).unwrap();

        assert_eq!(counts(&a.sync(&target, "both")), (2, 0, 0, 0));
        assert_eq!(tree(&target), ["Linked note.md", "Plain.md"]);
        assert_eq!(text(&target, "Linked note.md"), "lives outside the vault");
        a.assert_idle(&target, "both");
    }

    // ── One-way modes ──

    #[test]
    fn push_only_copies_out_and_never_changes_the_vault_or_deletes() {
        let a = Device::new("push");
        let target = scratch("push-target");
        write(&a.vault, "Mine.md", b"mine");
        write(&a.vault, "Shared.md", b"shared");
        write(&a.vault, "Removed here.md", b"to be removed from the vault");
        write(&target, "Only in folder.md", b"only in the folder");
        assert_eq!(counts(&a.sync(&target, "push")), (3, 0, 0, 0));
        assert_eq!(tree(&a.vault), ["Mine.md", "Removed here.md", "Shared.md"]);
        a.assert_idle(&target, "push");

        // Changes made in the folder are left alone.
        write(&target, "Shared.md", b"shared, edited in the folder");
        // A copy that goes missing from the folder is made again.
        remove(&target, "Mine.md");
        // Deleting in the vault does not delete the copy.
        remove(&a.vault, "Removed here.md");
        assert_eq!(counts(&a.sync(&target, "push")), (1, 0, 0, 0));
        assert_eq!(text(&target, "Mine.md"), "mine");
        assert_eq!(text(&target, "Shared.md"), "shared, edited in the folder");
        assert_eq!(text(&a.vault, "Shared.md"), "shared");
        assert_eq!(
            text(&target, "Removed here.md"),
            "to be removed from the vault"
        );
        assert_eq!(tree(&a.vault), ["Mine.md", "Shared.md"]);
        assert!(trashed(&target).is_empty() && trashed(&a.vault).is_empty());
        a.assert_idle(&target, "push");

        // Changed on both sides: the vault's version goes out, and the folder's
        // is kept beside it. The vault itself is not touched.
        write(
            &a.vault,
            "Shared.md",
            b"shared, now edited in the vault as well",
        );
        let outcome = a.sync(&target, "push");
        assert_eq!((outcome.pushed, outcome.conflicts), (1, 1));
        assert_eq!(
            text(&target, "Shared.md"),
            "shared, now edited in the vault as well"
        );
        let copy = tree(&target)
            .into_iter()
            .find(|f| f.contains("(conflict "))
            .expect("a conflict copy in the folder");
        assert_eq!(text(&target, &copy), "shared, edited in the folder");
        assert_eq!(tree(&a.vault), ["Mine.md", "Shared.md"]);
        a.assert_idle(&target, "push");
    }

    #[test]
    fn pull_only_copies_in_and_never_changes_the_folder_or_deletes() {
        let a = Device::new("pull");
        let target = scratch("pull-target");
        write(&target, "Theirs.md", b"theirs");
        write(&target, "Shared.md", b"shared");
        write(
            &target,
            "Removed there.md",
            b"to be removed from the folder",
        );
        write(&a.vault, "Only in vault.md", b"only in the vault");
        assert_eq!(counts(&a.sync(&target, "pull")), (0, 3, 0, 0));
        assert_eq!(
            tree(&target),
            ["Removed there.md", "Shared.md", "Theirs.md"]
        );
        a.assert_idle(&target, "pull");

        write(&a.vault, "Shared.md", b"shared, edited in the vault");
        remove(&a.vault, "Theirs.md");
        remove(&target, "Removed there.md");
        assert_eq!(counts(&a.sync(&target, "pull")), (0, 1, 0, 0));
        assert_eq!(text(&a.vault, "Theirs.md"), "theirs");
        assert_eq!(text(&a.vault, "Shared.md"), "shared, edited in the vault");
        assert_eq!(text(&target, "Shared.md"), "shared");
        assert_eq!(
            text(&a.vault, "Removed there.md"),
            "to be removed from the folder"
        );
        assert_eq!(tree(&target), ["Shared.md", "Theirs.md"]);
        assert!(trashed(&target).is_empty() && trashed(&a.vault).is_empty());
        a.assert_idle(&target, "pull");

        write(
            &target,
            "Shared.md",
            b"shared, now edited in the folder as well",
        );
        let outcome = a.sync(&target, "pull");
        assert_eq!((outcome.pulled, outcome.conflicts), (1, 1));
        assert_eq!(
            text(&a.vault, "Shared.md"),
            "shared, now edited in the folder as well"
        );
        let copy = tree(&a.vault)
            .into_iter()
            .find(|f| f.contains("(conflict "))
            .expect("a conflict copy in the vault");
        assert_eq!(text(&a.vault, &copy), "shared, edited in the vault");
        assert_eq!(tree(&target), ["Shared.md", "Theirs.md"]);
        a.assert_idle(&target, "pull");
    }

    #[test]
    fn changing_the_direction_starts_again_and_deletes_nothing() {
        let a = Device::new("direction");
        let target = scratch("direction-target");
        write(&a.vault, "Keep.md", b"keep");
        write(&a.vault, "Deleted in push mode.md", b"still in the folder");
        a.sync(&target, "push");
        remove(&a.vault, "Deleted in push mode.md");
        a.sync(&target, "push");
        assert_eq!(tree(&target).len(), 2);

        // Push-only skipped that deletion. Two-way must not carry it out now.
        assert_eq!(counts(&a.sync(&target, "both")), (0, 1, 0, 0));
        assert_eq!(tree(&target).len(), 2);
        assert_eq!(
            text(&a.vault, "Deleted in push mode.md"),
            "still in the folder"
        );
        assert!(trashed(&target).is_empty());
        a.assert_idle(&target, "both");
    }

    // ── Settings that cannot work ──

    #[test]
    fn a_folder_inside_the_vault_or_around_it_is_refused() {
        let a = Device::new("nested");
        write(&a.vault, "Note.md", b"note");
        let before = snapshot(&a.vault);

        let inside = a.vault.join("Backup");
        let err = a.try_sync(&inside, "both").unwrap_err();
        assert!(err.contains("inside the vault"), "{err}");
        assert!(!inside.exists(), "the refused folder was created anyway");

        let err = a.try_sync(&a.vault, "both").unwrap_err();
        assert!(err.contains("the vault itself"), "{err}");

        let around = a.vault.parent().unwrap().to_path_buf();
        let err = a.try_sync(&around, "push").unwrap_err();
        assert!(err.contains("vault is inside the target"), "{err}");
        assert_eq!(snapshot(&a.vault), before);
    }

    #[test]
    fn a_folder_setting_that_is_not_a_full_path_is_refused() {
        let a = Device::new("bad-settings");
        write(&a.vault, "Note.md", b"note");
        for (path, direction, expected) in [
            ("", "both", "No target folder"),
            ("   ", "both", "No target folder"),
            ("Dropbox/Noteriv", "both", "full path"),
            (
                "/tmp/noteriv-never-created",
                "sideways",
                "Unknown sync direction",
            ),
        ] {
            let cfg = FolderConfig {
                target_path: path.into(),
                direction: direction.into(),
            };
            let err = sync(a.vault.to_str().unwrap(), cfg, &a.records).unwrap_err();
            assert!(err.contains(expected), "{path:?} {direction:?}: {err}");
        }
        assert!(!Path::new("/tmp/noteriv-never-created").exists());
    }

    #[test]
    fn the_connection_test_creates_the_folder_and_leaves_nothing_behind() {
        let parent = scratch("connection");
        let target = parent.join("New").join("Folder");
        let cfg = FolderConfig {
            target_path: target.to_string_lossy().into_owned(),
            direction: "both".into(),
        };
        test_connection(&cfg).expect("a writable folder passes");
        assert!(target.is_dir());
        assert_eq!(fs::read_dir(&target).unwrap().count(), 0);

        let bad = FolderConfig {
            target_path: "relative/path".into(),
            direction: "both".into(),
        };
        assert!(test_connection(&bad).is_err());
    }

    #[test]
    fn records_for_different_folders_and_directions_are_kept_apart() {
        let dir = Path::new("/records");
        let both = record_file(dir, "/vault", "folder\n/target\nboth");
        assert_ne!(both, record_file(dir, "/vault", "folder\n/target\npush"));
        assert_ne!(both, record_file(dir, "/vault", "folder\n/other\nboth"));
        assert_ne!(
            both,
            record_file(dir, "/other-vault", "folder\n/target\nboth")
        );
        assert!(both
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("folder-"));
    }
}
