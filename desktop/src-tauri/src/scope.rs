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

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::{paths, store};

#[derive(Default)]
pub struct PathScope {
    /// Paths the user picked in a native dialog during this session.
    granted: Mutex<HashSet<PathBuf>>,
}

impl PathScope {
    /// Record a path the user explicitly chose in a native file dialog.
    pub fn grant(&self, path: &str) {
        if path.is_empty() {
            return;
        }
        if let Ok(mut set) = self.granted.lock() {
            set.insert(resolve(Path::new(path)));
        }
    }

    /// True when the user picked this exact path, or a directory containing it,
    /// in a native dialog this session. Deliberately narrower than
    /// [`is_allowed`]: handing a path to the OS opener can start a process, so
    /// vault membership alone is not sufficient authority.
    pub fn is_granted(&self, path: &Path) -> bool {
        let target = resolve(path);
        self.granted
            .lock()
            .map(|set| set.iter().any(|g| target == *g || target.starts_with(g)))
            .unwrap_or(false)
    }

    /// True when the path lies inside a registered vault or has been granted by
    /// a dialog. The application's own data directory is always refused so the
    /// credential store cannot be read back through the file commands, even if
    /// a user points a vault at it.
    pub fn is_allowed(&self, path: &Path) -> bool {
        let target = resolve(path);

        if let Ok(data_dir) = dunce::canonicalize(paths::user_data_dir()) {
            if target.starts_with(&data_dir) {
                return false;
            }
        }

        if self.is_granted(&target) {
            return true;
        }

        vault_roots().iter().any(|root| target.starts_with(root))
    }
}

/// Canonicalized paths of every vault the user has registered.
fn vault_roots() -> Vec<PathBuf> {
    store::get_vaults()
        .into_iter()
        .filter_map(|v| dunce::canonicalize(&v.path).ok())
        .collect()
}

/// Resolve `.`, `..` and symlinks as far as the path exists on disk.
///
/// A path that does not exist yet still has to be resolved, or a write to
/// `<vault>/../../.bashrc` would slip through simply because the target file is
/// absent. We canonicalize the nearest existing ancestor and re-append the
/// remaining components to it.
fn resolve(path: &Path) -> PathBuf {
    if let Ok(p) = dunce::canonicalize(path) {
        return p;
    }

    let mut trailing: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path.to_path_buf();

    loop {
        let Some(name) = cursor.file_name().map(|n| n.to_os_string()) else {
            // A component we cannot name (a bare `..` or a root). Fail closed:
            // return the path unchanged so it matches no permitted root.
            return path.to_path_buf();
        };
        let Some(parent) = cursor.parent().map(|p| p.to_path_buf()) else {
            return path.to_path_buf();
        };

        trailing.push(name);

        if let Ok(base) = dunce::canonicalize(&parent) {
            let mut out = base;
            for component in trailing.iter().rev() {
                out.push(component);
            }
            return out;
        }

        if parent.as_os_str().is_empty() {
            return path.to_path_buf();
        }
        cursor = parent;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("noteriv-scope-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        dunce::canonicalize(&dir).unwrap_or(dir)
    }

    #[test]
    fn grant_allows_exact_path() {
        let root = tmp();
        let file = root.join("granted.md");
        let _ = fs::write(&file, "x");
        let scope = PathScope::default();
        scope.grant(&file.to_string_lossy());
        assert!(scope.is_granted(&file));
    }

    #[test]
    fn granted_directory_covers_its_children() {
        let root = tmp();
        let sub = root.join("picked");
        let _ = fs::create_dir_all(&sub);
        let scope = PathScope::default();
        scope.grant(&sub.to_string_lossy());
        assert!(scope.is_granted(&sub.join("child.md")));
    }

    #[test]
    fn ungranted_sibling_is_refused() {
        let root = tmp();
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());
        assert!(!scope.is_granted(&root.join("other.md")));
    }

    #[test]
    fn traversal_out_of_a_grant_is_refused() {
        let root = tmp();
        let picked = root.join("picked");
        let _ = fs::create_dir_all(&picked);
        let scope = PathScope::default();
        scope.grant(&picked.to_string_lossy());
        // Escapes `picked` even though the target does not exist.
        assert!(!scope.is_granted(&picked.join("..").join("escaped.md")));
    }

    #[test]
    fn resolve_handles_nonexistent_targets() {
        let root = tmp();
        let resolved = resolve(&root.join("does-not-exist-yet.md"));
        assert!(resolved.starts_with(&root));
        assert!(resolved.ends_with("does-not-exist-yet.md"));
    }
}
