//! Runtime path scope for the file-system IPC commands.
//!
//! The webview is not a trusted caller. Note content, themes, CSS snippets and
//! plugins all execute inside it, so any absolute path the renderer can pass to
//! an `fs_*` command is a path an attacker-controlled script can pass too.
//!
//! A path is reachable only when the user has opted into it, either by
//!   * registering the vault it lives in, or
//!   * selecting it (or its parent directory) in a native file dialog.
//!
//! Paths are resolved before comparison, so `..` segments and symlinks cannot
//! be used to step outside a permitted root. Resolution also covers paths that
//! do not exist yet, which is the common case for a file about to be written.
//!
//! Reading and writing is one authority; handing a path to the OS opener is
//! another, because the opener starts a process. They are tracked separately —
//! see [`PathScope::is_allowed`] and [`PathScope::is_openable`].

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use crate::{paths, store};

#[derive(Default)]
pub struct PathScope {
    /// Paths the user picked in a native dialog during this session. A picked
    /// directory covers everything under it: choosing a folder is how the user
    /// points the app at a set of files it may read and write.
    readable: Mutex<HashSet<PathBuf>>,
    /// Exactly the paths the user picked — never their children. See
    /// [`PathScope::is_openable`] for why this set is not the one above.
    openable: Mutex<HashSet<PathBuf>>,
}

impl PathScope {
    /// Record a path the user explicitly chose in a native file dialog.
    ///
    /// The choice grants file access to the path and anything below it, but
    /// opener access only to the path itself.
    pub fn grant(&self, path: &str) {
        if path.is_empty() {
            return;
        }
        let resolved = resolve(Path::new(path));
        if let Ok(mut set) = self.readable.lock() {
            set.insert(resolved.clone());
        }
        if let Ok(mut set) = self.openable.lock() {
            set.insert(resolved);
        }
    }

    /// True when the user picked this exact path in a native dialog this
    /// session.
    ///
    /// Deliberately narrower than [`is_allowed`](Self::is_allowed) in two ways.
    /// Vault membership is not sufficient authority, because note content and
    /// attachments arrive from sync, the web clipper and the MCP server without
    /// the user ever choosing them. Nor is membership in a picked *directory*:
    /// the vault folder itself is picked in a dialog, so descendants would
    /// otherwise let a compromised renderer write an executable into the vault
    /// and hand it to the opener. Only the exact path the user named counts.
    pub fn is_openable(&self, path: &Path) -> bool {
        let target = resolve(path);
        if !is_comparable(&target) {
            return false;
        }
        self.openable
            .lock()
            .map(|set| set.contains(&target))
            .unwrap_or(false)
    }

    /// True when a directory entry reached by a recursive walk may be visited.
    ///
    /// The walking commands check the scope once, for the root they are given,
    /// and then read whatever they find below it. A symlink inside that root can
    /// point anywhere — a vault synchronizes from a Git remote, and Git carries
    /// symlinks — so a linked entry has to clear the scope on its own. Ordinary
    /// entries are already covered by the root's check.
    pub fn may_visit(&self, file_type: &std::fs::FileType, path: &Path) -> bool {
        !file_type.is_symlink() || self.is_allowed(path)
    }

    /// True when the path lies inside a registered vault or has been granted by
    /// a dialog. The application's own data directory is always refused so the
    /// credential store cannot be read back through the file commands, even if
    /// a user points a vault at it.
    pub fn is_allowed(&self, path: &Path) -> bool {
        let target = resolve(path);
        if !is_comparable(&target) {
            return false;
        }

        if let Ok(data_dir) = dunce::canonicalize(paths::user_data_dir()) {
            if target.starts_with(&data_dir) {
                return false;
            }
        }

        let granted = self
            .readable
            .lock()
            .map(|set| set.iter().any(|g| target.starts_with(g)))
            .unwrap_or(false);
        if granted {
            return true;
        }

        vault_roots().iter().any(|root| target.starts_with(root))
    }
}

/// True when a resolved path can be compared against a permitted root.
///
/// `Path::starts_with` matches component by component, so it reports
/// `<vault>/a/../../escaped.md` as living inside `<vault>`. Containment is only
/// meaningful once every `.` and `..` is gone and the path is absolute;
/// anything else is refused rather than compared.
fn is_comparable(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
}

/// Canonicalized paths of every vault the user has registered.
fn vault_roots() -> Vec<PathBuf> {
    store::get_vaults()
        .into_iter()
        .filter_map(|v| dunce::canonicalize(&v.path).ok())
        .collect()
}

/// Resolve `.`, `..` and symlinks, including for paths that do not exist yet.
///
/// A path that does not exist still has to be resolved, or a write to
/// `<vault>/../../.bashrc` would slip through simply because the target file is
/// absent — and `<vault>/missing/../../escaped.md` has to resolve too, since a
/// missing directory in the middle is enough to stop `canonicalize` outright.
///
/// Each `..` is applied to the *real* directory reached so far, not to the
/// textual one. Collapsing `..` textually would be wrong: with `link` pointing
/// at `/elsewhere`, `<vault>/link/../secret` names `/secret`, not
/// `<vault>/secret`. Components that do not exist cannot be symlinks, so
/// stepping up from them textually is sound.
fn resolve(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => out.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if let Ok(real) = dunce::canonicalize(&out) {
                    out = real;
                }
                out.pop();
            }
            Component::Normal(name) => out.push(name),
        }
    }

    canonicalize_existing_prefix(&out)
}

/// Canonicalize the longest prefix of `path` that exists on disk and re-append
/// the components that do not, so a file about to be created still resolves
/// through the symlinks above it.
///
/// `path` is expected to be free of `.` and `..` — [`resolve`] consumes those
/// before calling here.
fn canonicalize_existing_prefix(path: &Path) -> PathBuf {
    if let Ok(p) = dunce::canonicalize(path) {
        return p;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if !parent.as_os_str().is_empty() => {
            let mut base = canonicalize_existing_prefix(parent);
            base.push(name);
            base
        }
        _ => path.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A directory of its own for each test: they run in parallel and several
    /// of them create and remove the same names.
    fn tmp(case: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("noteriv-scope-{}", std::process::id()))
            .join(case);
        let _ = fs::create_dir_all(&dir);
        dunce::canonicalize(&dir).unwrap_or(dir)
    }

    #[test]
    fn grant_allows_exact_path() {
        let root = tmp("exact");
        let file = root.join("granted.md");
        let _ = fs::write(&file, "x");
        let scope = PathScope::default();
        scope.grant(&file.to_string_lossy());
        assert!(scope.is_allowed(&file));
        assert!(scope.is_openable(&file));
    }

    #[test]
    fn granted_directory_covers_its_children() {
        let root = tmp("children");
        let sub = root.join("picked");
        let _ = fs::create_dir_all(&sub);
        let scope = PathScope::default();
        scope.grant(&sub.to_string_lossy());
        assert!(scope.is_allowed(&sub.join("child.md")));
    }

    #[test]
    fn ungranted_sibling_is_refused() {
        let root = tmp("sibling");
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());
        assert!(!scope.is_allowed(&root.join("other.md")));
    }

    #[test]
    fn traversal_out_of_a_grant_is_refused() {
        let root = tmp("traversal");
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());
        // Escapes `picked` even though the target does not exist.
        assert!(!scope.is_allowed(&picked.join("..").join("escaped.md")));
    }

    #[test]
    fn traversal_through_a_missing_directory_is_refused() {
        let root = tmp("missing-dir");
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());

        // `new` does not exist, so the whole path cannot be canonicalized. The
        // `..` segments still have to be applied, or the path keeps a `picked`
        // prefix while naming a file two levels above it.
        let escape = picked.join("new").join("..").join("..").join("escaped.md");
        assert_eq!(resolve(&escape), root.join("escaped.md"));
        assert!(!scope.is_allowed(&escape));
    }

    #[test]
    fn opener_grant_does_not_cover_children() {
        let root = tmp("opener");
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());

        // Picking a folder is authority to read and write inside it, but not to
        // start whatever the renderer chooses to drop there.
        let payload = picked.join("payload.sh");
        assert!(scope.is_allowed(&payload));
        assert!(!scope.is_openable(&payload));
        assert!(scope.is_openable(&picked));
    }

    #[test]
    fn resolve_handles_nonexistent_targets() {
        let root = tmp("nonexistent");
        let resolved = resolve(&root.join("does-not-exist-yet.md"));
        assert!(resolved.starts_with(&root));
        assert!(resolved.ends_with("does-not-exist-yet.md"));
    }

    #[cfg(unix)]
    #[test]
    fn a_walk_follows_a_symlink_only_when_its_target_is_in_scope() {
        let root = tmp("walk");
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let outside = root.join("outside.md");
        let _ = fs::write(&outside, "secret");
        let inside = picked.join("real.md");
        let _ = fs::write(&inside, "note");

        let escaping = picked.join("escaping.md");
        let contained = picked.join("contained.md");
        let _ = fs::remove_file(&escaping);
        let _ = fs::remove_file(&contained);
        let _ = std::os::unix::fs::symlink(&outside, &escaping);
        let _ = std::os::unix::fs::symlink(&inside, &contained);

        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());

        let kind = |p: &PathBuf| fs::symlink_metadata(p).unwrap().file_type();
        assert!(scope.may_visit(&kind(&inside), &inside));
        assert!(scope.may_visit(&kind(&contained), &contained));
        // Reading this one would hand out a file the walk was never scoped for.
        assert!(!scope.may_visit(&kind(&escaping), &escaping));
    }

    #[cfg(unix)]
    #[test]
    fn parent_of_a_symlink_is_its_real_parent() {
        let root = tmp("symlink");
        let picked = root.join("picked");
        let outside = root.join("outside");
        let _ = fs::create_dir_all(&picked);
        let _ = fs::create_dir_all(&outside);
        let link = picked.join("link");
        let _ = fs::remove_file(&link);
        let _ = std::os::unix::fs::symlink(&outside, &link);

        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());

        // `link` resolves to `outside`, so `link/..` is `root`, not `picked`.
        let escape = link.join("..").join("escaped.md");
        assert_eq!(resolve(&escape), root.join("escaped.md"));
        assert!(!scope.is_allowed(&escape));
    }
}
