//! Keeps two vaults out of one sync folder.
//!
//! A sync folder holds one vault. When a second vault on this computer syncs
//! with the same folder, or with a folder inside it, its first run finds no
//! record of an earlier sync, takes every file on the other side for a new
//! one, and copies everything both ways: each vault ends up with the other's
//! notes, and so does every other device that syncs with the folder.
//!
//! So a vault's first sync with a folder is refused when another vault on
//! this computer already syncs with it. The records of earlier syncs are what
//! is looked at: each one names its vault and where it synced to.
//!
//! - A vault that has synced with the folder before is let through, whatever
//!   else syncs there. Refusing it would lock out the vault the folder
//!   belongs to, and it cannot be told from one that got there by mistake.
//! - A record whose vault is no longer in the app's list of vaults, or whose
//!   folder is gone, counts for nothing: a vault that was moved or removed
//!   does not stand in the way of the one that took its place.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Where a vault syncs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Destination {
    /// A folder on this computer, resolved through links.
    Folder(PathBuf),
    /// A folder on a WebDAV server: its address, with no `/` at the end.
    WebDav(String),
}

impl Destination {
    pub(crate) fn webdav(root: &str) -> Destination {
        Destination::WebDav(root.trim_end_matches('/').to_string())
    }

    /// What a record's `remote` says. The folder provider writes
    /// "folder", the target and the direction on three lines; the WebDAV
    /// provider writes the address on the first line.
    fn of_record(remote: &str) -> Option<Destination> {
        if let Some(rest) = remote.strip_prefix("folder\n") {
            let target = rest.rsplit_once('\n').map_or(rest, |(target, _direction)| target);
            return (!target.is_empty()).then(|| Destination::Folder(PathBuf::from(target)));
        }
        let root = remote.split('\n').next().unwrap_or("");
        (root.starts_with("http://") || root.starts_with("https://")).then(|| Destination::webdav(root))
    }

    /// The same place, or one inside the other. Either way the two vaults
    /// would meet each other's files.
    fn overlaps(&self, other: &Destination) -> bool {
        match (self, other) {
            (Destination::Folder(a), Destination::Folder(b)) => a.starts_with(b) || b.starts_with(a),
            (Destination::WebDav(a), Destination::WebDav(b)) => {
                let inside = |inner: &str, outer: &str| {
                    inner.strip_prefix(outer).is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
                };
                inside(a, b) || inside(b, a)
            }
            _ => false,
        }
    }
}

/// A vault in the app's list, other than the one that is syncing.
#[derive(Debug, Clone)]
pub(crate) struct OtherVault {
    pub name: String,
    /// Its folder, resolved through links.
    pub path: PathBuf,
}

/// The vaults in the app's list whose folders exist, without `vault`.
pub(crate) fn other_vaults(vault: &Path, listed: &[crate::store::Vault]) -> Vec<OtherVault> {
    listed
        .iter()
        .filter_map(|entry| {
            let path = dunce::canonicalize(&entry.path).ok()?;
            (path.is_dir() && path != vault).then(|| OtherVault {
                name: entry.name.clone(),
                path,
            })
        })
        .collect()
}

/// The two lines of a record this module reads. The files it lists are
/// skipped, so a large record costs little.
#[derive(Deserialize)]
struct Head {
    #[serde(default)]
    vault: String,
    #[serde(default)]
    remote: String,
}

/// Every record in the folder as its vault and where it synced to. A file
/// that cannot be read as a record is passed over.
fn records(record_dir: &Path) -> Vec<(PathBuf, Destination)> {
    let Ok(entries) = fs::read_dir(record_dir) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(head) = serde_json::from_str::<Head>(&text) else {
            continue;
        };
        let Some(destination) = Destination::of_record(&head.remote) else {
            continue;
        };
        // The WebDAV provider names its vault the way the system does, which
        // on Windows is the long form (`\\?\C:\...`).
        let vault = dunce::simplified(Path::new(&head.vault)).to_path_buf();
        found.push((vault, destination));
    }
    found
}

/// Whether `vault` has a record of syncing with exactly this place.
pub(crate) fn has_synced(record_dir: &Path, vault: &Path, destination: &Destination) -> bool {
    records(record_dir)
        .iter()
        .any(|(owner, theirs)| owner == vault && theirs == destination)
}

/// Refuse a vault's first sync with a place another vault already syncs
/// with. `vault` is the vault's folder, resolved through links.
pub(crate) fn check(
    record_dir: &Path,
    vault: &Path,
    destination: &Destination,
    others: &[OtherVault],
) -> Result<(), String> {
    let mut sharing: Option<&OtherVault> = None;
    for (owner, theirs) in records(record_dir) {
        if owner == vault {
            if theirs == *destination {
                return Ok(());
            }
            continue;
        }
        if sharing.is_none() && theirs.overlaps(destination) {
            sharing = others.iter().find(|other| other.path == owner);
        }
    }
    match sharing {
        None => Ok(()),
        Some(other) => Err(format!(
            "The vault \"{}\" on this computer already syncs with this folder, or with one that holds it or is inside it. Two vaults in one sync folder would have their notes mixed together. Give this vault a folder of its own in Settings > Sync.",
            other.name
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("noteriv-sync-guard-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dunce::canonicalize(dir).unwrap()
    }

    fn record(dir: &Path, name: &str, vault: &Path, remote: &str) {
        let text = serde_json::json!({
            "version": 1,
            "vault": vault.to_string_lossy(),
            "remote": remote,
            "files": { "Note.md": { "local_mtime_ms": 1, "local_size": 2, "remote_sig": "x", "hash": "" } },
        });
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(name), text.to_string()).unwrap();
    }

    fn other(name: &str, path: &Path) -> OtherVault {
        OtherVault {
            name: name.into(),
            path: path.to_path_buf(),
        }
    }

    #[test]
    fn a_record_says_where_it_synced_to() {
        assert_eq!(
            Destination::of_record("folder\n/home/me/Dropbox/Noteriv\nboth"),
            Some(Destination::Folder(PathBuf::from("/home/me/Dropbox/Noteriv")))
        );
        assert_eq!(
            Destination::of_record("https://dav.example.com/files/me/Noteriv\nme"),
            Some(Destination::WebDav("https://dav.example.com/files/me/Noteriv".into()))
        );
        assert_eq!(
            Destination::of_record("https://dav.example.com/files/me/Noteriv/\nme\nencrypted"),
            Some(Destination::WebDav("https://dav.example.com/files/me/Noteriv".into()))
        );
        assert_eq!(Destination::of_record(""), None);
        assert_eq!(Destination::of_record("folder\n"), None);
        assert_eq!(Destination::of_record("something else"), None);
    }

    #[test]
    fn places_overlap_when_one_is_the_other_or_inside_it() {
        let folder = |p: &str| Destination::Folder(PathBuf::from(p));
        assert!(folder("/cloud/Noteriv").overlaps(&folder("/cloud/Noteriv")));
        assert!(folder("/cloud/Noteriv/Work").overlaps(&folder("/cloud/Noteriv")));
        assert!(folder("/cloud/Noteriv").overlaps(&folder("/cloud/Noteriv/Work")));
        assert!(!folder("/cloud/Noteriv").overlaps(&folder("/cloud/Noteriv2")));
        assert!(!folder("/cloud/Work").overlaps(&folder("/cloud/Home")));

        let dav = Destination::webdav;
        assert!(dav("https://d.example/dav/Noteriv").overlaps(&dav("https://d.example/dav/Noteriv/")));
        assert!(dav("https://d.example/dav/Noteriv/Work").overlaps(&dav("https://d.example/dav/Noteriv")));
        assert!(dav("https://d.example/dav").overlaps(&dav("https://d.example/dav/Noteriv")));
        assert!(!dav("https://d.example/dav/Noteriv").overlaps(&dav("https://d.example/dav/Noteriv2")));
        assert!(!dav("https://d.example/dav/Noteriv").overlaps(&dav("https://other.example/dav/Noteriv")));

        assert!(!folder("/cloud/Noteriv").overlaps(&dav("https://d.example/cloud/Noteriv")));
    }

    #[test]
    fn a_first_sync_into_another_vaults_folder_is_refused() {
        let base = scratch("refused");
        let (work, home, cloud, records) =
            (base.join("work"), base.join("home"), base.join("cloud"), base.join("records"));
        for dir in [&work, &home, &cloud] {
            fs::create_dir_all(dir).unwrap();
        }
        let target = Destination::Folder(cloud.clone());
        let listed = [other("Work", &work)];

        // Nobody has synced with it yet.
        assert_eq!(check(&records, &home, &target, &listed), Ok(()));

        record(&records, "folder-1.json", &work, &format!("folder\n{}\nboth", cloud.display()));
        let refused = check(&records, &home, &target, &listed).unwrap_err();
        assert!(refused.starts_with("The vault \"Work\" on this computer already syncs"), "{refused}");

        // A folder inside the other vault's, and one that holds it.
        let inside = Destination::Folder(cloud.join("Home"));
        assert!(check(&records, &home, &inside, &listed).is_err());
        let around = Destination::Folder(base.clone());
        assert!(check(&records, &home, &around, &listed).is_err());
        // A folder beside it is the vault's own.
        let beside = Destination::Folder(base.join("cloud-home"));
        assert_eq!(check(&records, &home, &beside, &listed), Ok(()));

        // The vault the folder belongs to goes on syncing with it.
        assert_eq!(check(&records, &work, &target, &[other("Home", &home)]), Ok(()));
        assert!(has_synced(&records, &work, &target));
        assert!(!has_synced(&records, &home, &target));
        assert!(!has_synced(&records, &work, &inside));
    }

    #[test]
    fn a_vault_that_synced_there_before_is_let_through() {
        let base = scratch("before");
        let (work, home, cloud, records) =
            (base.join("work"), base.join("home"), base.join("cloud"), base.join("records"));
        let target = Destination::Folder(cloud.clone());
        record(&records, "folder-1.json", &work, &format!("folder\n{}\nboth", cloud.display()));
        // Its own record, kept when the direction was another one.
        record(&records, "folder-2.json", &home, &format!("folder\n{}\npush", cloud.display()));
        assert_eq!(check(&records, &home, &target, &[other("Work", &work)]), Ok(()));
        assert_eq!(check(&records, &work, &target, &[other("Home", &home)]), Ok(()));
    }

    #[test]
    fn a_record_of_a_vault_that_is_not_listed_counts_for_nothing() {
        let base = scratch("unlisted");
        let (old, home, cloud, records) =
            (base.join("old place"), base.join("home"), base.join("cloud"), base.join("records"));
        let target = Destination::Folder(cloud.clone());
        record(&records, "folder-1.json", &old, &format!("folder\n{}\nboth", cloud.display()));
        // The vault was moved or removed: nothing in the list is at that path.
        assert_eq!(check(&records, &home, &target, &[]), Ok(()));
        assert_eq!(check(&records, &home, &target, &[other("Elsewhere", &base.join("elsewhere"))]), Ok(()));

        // Files that are not records are passed over.
        fs::write(records.join("notes.txt"), "folder").unwrap();
        fs::write(records.join("broken.json"), "{ not json").unwrap();
        fs::write(records.join("other.json"), "[1, 2, 3]").unwrap();
        fs::write(records.join("empty.json"), "{}").unwrap();
        assert_eq!(check(&records, &home, &target, &[other("Old", &old)]).is_err(), true);
        assert_eq!(check(&base.join("no such folder"), &home, &target, &[other("Old", &old)]), Ok(()));
    }

    #[test]
    fn a_webdav_folder_is_one_place_whoever_signs_in_and_encrypted_or_not() {
        let base = scratch("webdav");
        let (work, home, records) = (base.join("work"), base.join("home"), base.join("records"));
        let listed = [other("Work", &work)];
        record(&records, "webdav-1.json", &work, "https://dav.example.com/files/me/Noteriv\nme\nencrypted");

        let same = Destination::webdav("https://dav.example.com/files/me/Noteriv/");
        assert!(check(&records, &home, &same, &listed).is_err());
        let inside = Destination::webdav("https://dav.example.com/files/me/Noteriv/Home");
        assert!(check(&records, &home, &inside, &listed).is_err());
        let whole_account = Destination::webdav("https://dav.example.com/files/me");
        assert!(check(&records, &home, &whole_account, &listed).is_err());

        let own = Destination::webdav("https://dav.example.com/files/me/Noteriv-Home");
        assert_eq!(check(&records, &home, &own, &listed), Ok(()));
        // A folder on this computer is never the same place as one on a server.
        let folder = Destination::Folder(base.join("cloud"));
        assert_eq!(check(&records, &home, &folder, &listed), Ok(()));

        // The vault's own record is for the folder as it was before it was encrypted.
        assert_eq!(check(&records, &work, &same, &[other("Home", &home)]), Ok(()));
    }

    #[test]
    fn the_other_vaults_are_the_listed_ones_that_exist() {
        let base = scratch("listed");
        let (work, home) = (base.join("work"), base.join("home"));
        fs::create_dir_all(&work).unwrap();
        fs::create_dir_all(&home).unwrap();
        let vault = |name: &str, path: &Path| crate::store::Vault {
            id: name.to_lowercase(),
            name: name.into(),
            path: path.to_string_lossy().into_owned(),
            git_remote: None,
            git_branch: "main".into(),
            auto_sync: false,
            last_opened: 0,
        };
        let listed = [vault("Work", &work), vault("Home", &home), vault("Gone", &base.join("gone"))];
        let others = other_vaults(&home, &listed);
        assert_eq!(others.len(), 1);
        assert_eq!(others[0].name, "Work");
        assert_eq!(others[0].path, work);
    }
}
