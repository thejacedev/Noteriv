use crate::paths;
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vault {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "gitRemote")]
    pub git_remote: Option<String>,
    #[serde(rename = "gitBranch")]
    pub git_branch: String,
    #[serde(rename = "autoSync")]
    pub auto_sync: bool,
    #[serde(rename = "lastOpened")]
    pub last_opened: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub vaults: Vec<Vault>,
    #[serde(rename = "activeVaultId", default)]
    pub active_vault_id: Option<String>,
    #[serde(rename = "setupComplete", default)]
    pub setup_complete: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vaults: vec![],
            active_vault_id: None,
            setup_complete: false,
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Matches the JS store.js generateId():
///   Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
fn generate_id() -> String {
    let now = now_ms();
    let mut rng = rand::thread_rng();
    let suffix: String = (0..6)
        .map(|_| {
            let n: u32 = rng.gen_range(0..36);
            char::from_digit(n, 36).unwrap_or('0')
        })
        .collect();
    format!("{}{}", to_base36(now), suffix)
}

fn to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut buf = Vec::new();
    while n > 0 {
        let r = (n % 36) as u32;
        buf.push(char::from_digit(r, 36).unwrap());
        n /= 36;
    }
    buf.iter().rev().collect()
}

pub fn read_config() -> AppConfig {
    let path = paths::config_file();
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<AppConfig>(&raw) {
            return parsed;
        }
    }
    AppConfig::default()
}

pub fn write_config(cfg: &AppConfig) {
    let path = paths::config_file();
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, s);
    }
}

pub fn get_config() -> AppConfig {
    read_config()
}

pub fn is_setup_complete() -> bool {
    read_config().setup_complete
}

pub fn get_vaults() -> Vec<Vault> {
    read_config().vaults
}

pub fn get_active_vault() -> Option<Vault> {
    let cfg = read_config();
    let id = cfg.active_vault_id?;
    cfg.vaults.into_iter().find(|v| v.id == id)
}

#[derive(Debug, Deserialize)]
pub struct CreateVaultInput {
    pub name: String,
    #[serde(rename = "vaultPath")]
    pub vault_path: String,
    #[serde(rename = "gitRemote", default)]
    pub git_remote: Option<String>,
    #[serde(rename = "gitBranch", default)]
    pub git_branch: Option<String>,
    #[serde(rename = "autoSync", default)]
    pub auto_sync: Option<bool>,
}

pub fn create_vault(input: CreateVaultInput) -> Vault {
    let mut cfg = read_config();
    let id = generate_id();

    // Expand `~` to the home directory before persisting. Storing literal
    // tilde paths is a footgun: every fs op below us treats `~` as a regular
    // directory name and creates `cwd/~/...`.
    let resolved = paths::expand_tilde(&input.vault_path)
        .to_string_lossy()
        .into_owned();

    let _ = fs::create_dir_all(&resolved);

    let vault = Vault {
        id: id.clone(),
        name: input.name,
        path: resolved,
        git_remote: input.git_remote.filter(|s| !s.is_empty()),
        git_branch: input.git_branch.unwrap_or_else(|| "main".into()),
        auto_sync: input.auto_sync.unwrap_or(false),
        last_opened: now_ms(),
    };

    cfg.vaults.push(vault.clone());
    cfg.active_vault_id = Some(id);
    cfg.setup_complete = true;
    write_config(&cfg);

    vault
}

pub fn update_vault(id: &str, updates: &Value) -> Option<Vault> {
    let mut cfg = read_config();
    let idx = cfg.vaults.iter().position(|v| v.id == id)?;

    // Apply patch by serializing → merging → deserializing.
    let mut current = serde_json::to_value(&cfg.vaults[idx]).ok()?;
    if let (Value::Object(cur), Value::Object(patch)) = (&mut current, updates) {
        for (k, v) in patch {
            cur.insert(k.clone(), v.clone());
        }
    }
    let merged: Vault = serde_json::from_value(current).ok()?;
    cfg.vaults[idx] = merged.clone();
    write_config(&cfg);
    Some(merged)
}

pub fn delete_vault(id: &str) -> bool {
    let mut cfg = read_config();
    cfg.vaults.retain(|v| v.id != id);
    if cfg.active_vault_id.as_deref() == Some(id) {
        cfg.active_vault_id = cfg.vaults.first().map(|v| v.id.clone());
    }
    if cfg.vaults.is_empty() {
        cfg.setup_complete = false;
    }
    write_config(&cfg);
    true
}

pub fn set_active_vault(id: &str) -> Option<Vault> {
    let mut cfg = read_config();
    let idx = cfg.vaults.iter().position(|v| v.id == id)?;
    cfg.vaults[idx].last_opened = now_ms();
    cfg.active_vault_id = Some(id.into());
    let v = cfg.vaults[idx].clone();
    write_config(&cfg);
    Some(v)
}

pub fn load_settings() -> Map<String, Value> {
    let path = paths::settings_file();
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&raw) {
            return map;
        }
    }
    Map::new()
}

pub fn save_settings(settings: &Value) -> bool {
    let path = paths::settings_file();
    serde_json::to_string_pretty(settings)
        .ok()
        .and_then(|s| fs::write(path, s).ok())
        .is_some()
}
