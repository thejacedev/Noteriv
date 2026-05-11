use std::path::PathBuf;
use std::sync::OnceLock;

/// Cached portable-mode root. `Some(dir)` = portable, data lives in `<dir>/data`.
/// `None` = standard install, data lives in the platform-default user data dir.
static PORTABLE_ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Detect portable mode once at first call. Two triggers, checked in order:
///   1. `NOTERIV_PORTABLE` env var set to a non-empty value.
///   2. A `portable.txt` marker file in the same directory as the running EXE.
/// Returns the directory containing the EXE if portable, else `None`.
pub fn portable_root() -> Option<PathBuf> {
    PORTABLE_ROOT
        .get_or_init(|| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))?;
            let env_on = std::env::var_os("NOTERIV_PORTABLE")
                .map(|v| !v.is_empty())
                .unwrap_or(false);
            if env_on || exe_dir.join("portable.txt").is_file() {
                Some(exe_dir)
            } else {
                None
            }
        })
        .clone()
}

pub fn is_portable() -> bool {
    portable_root().is_some()
}

/// Expand a leading `~` to the user's home directory. Bare paths and
/// already-absolute paths pass through unchanged.
pub fn expand_tilde(input: &str) -> PathBuf {
    if input == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from("."));
    }
    if let Some(rest) = input.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(input)
}

fn home_dir() -> Option<PathBuf> {
    if let Some(h) = std::env::var_os("HOME") {
        return Some(PathBuf::from(h));
    }
    #[cfg(target_os = "windows")]
    if let Some(h) = std::env::var_os("USERPROFILE") {
        return Some(PathBuf::from(h));
    }
    None
}

/// User data dir.
/// Portable mode: `<exe_dir>/data` (overrides all platform defaults).
/// Otherwise matches Electron's app.getPath("userData") layout per platform:
/// Linux:   ~/.config/Noteriv
/// macOS:   ~/Library/Application Support/Noteriv
/// Windows: %APPDATA%/Noteriv
pub fn user_data_dir() -> PathBuf {
    if let Some(root) = portable_root() {
        return root.join("data");
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(d) = dirs_config_dir() {
            return d.join("Noteriv");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let mut p = PathBuf::from(home);
            p.push("Library");
            p.push("Application Support");
            p.push("Noteriv");
            return p;
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(d) = std::env::var_os("APPDATA") {
            return PathBuf::from(d).join("Noteriv");
        }
    }
    PathBuf::from(".")
}

#[cfg(target_os = "linux")]
fn dirs_config_dir() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("XDG_CONFIG_HOME") {
        return Some(PathBuf::from(p));
    }
    std::env::var_os("HOME").map(|h| {
        let mut p = PathBuf::from(h);
        p.push(".config");
        p
    })
}

pub fn ensure_user_data_dir() -> PathBuf {
    let dir = user_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn config_file() -> PathBuf {
    ensure_user_data_dir().join("config.json")
}

pub fn settings_file() -> PathBuf {
    ensure_user_data_dir().join("settings.json")
}

pub fn token_file() -> PathBuf {
    ensure_user_data_dir().join("tokens.enc")
}
