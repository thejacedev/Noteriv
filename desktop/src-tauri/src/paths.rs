use std::path::PathBuf;

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

/// User data dir — matches Electron's app.getPath("userData") layout per platform.
/// Linux:   ~/.config/Noteriv
/// macOS:   ~/Library/Application Support/Noteriv
/// Windows: %APPDATA%/Noteriv
pub fn user_data_dir() -> PathBuf {
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
