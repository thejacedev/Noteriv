use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::Path;
use tauri::Manager;

use crate::AppState;

/// True when the webview may use this path as a vault root. See `crate::scope`.
///
/// These commands take a directory from the renderer and read or write
/// `<dir>/.noteriv/workspace.json` inside it, so an unscoped version is a read
/// and write primitive for any directory on the machine. The renderer only ever
/// passes the active vault's path.
fn allowed(app: &tauri::AppHandle, path: &str) -> bool {
    let ok = app.state::<AppState>().scope.is_allowed(Path::new(path));
    if !ok {
        log::warn!("[workspace] refused access outside the permitted scope: {path}");
    }
    ok
}

#[tauri::command]
pub async fn workspace_load(app: tauri::AppHandle, vault_path: String) -> Option<Value> {
    if !allowed(&app, &vault_path) {
        return None;
    }
    let p = Path::new(&vault_path).join(".noteriv").join("workspace.json");
    let raw = fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceSaveInput {
    #[serde(rename = "vaultPath")]
    pub vault_path: String,
    pub state: Value,
}

#[tauri::command]
pub async fn workspace_save(app: tauri::AppHandle, args: WorkspaceSaveInput) -> bool {
    if !allowed(&app, &args.vault_path) {
        return false;
    }
    let dir = Path::new(&args.vault_path).join(".noteriv");
    if fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let path = dir.join("workspace.json");
    match serde_json::to_string_pretty(&args.state) {
        Ok(s) => fs::write(path, s).is_ok(),
        Err(_) => false,
    }
}
