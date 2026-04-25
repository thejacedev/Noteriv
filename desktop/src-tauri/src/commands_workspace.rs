use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn workspace_load(vault_path: String) -> Option<Value> {
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
pub async fn workspace_save(args: WorkspaceSaveInput) -> bool {
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
