// GitHub auth: token storage (OS keyring, falls back to encrypted-on-disk),
// validate, list repos, create repo, open token page.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use tauri_plugin_opener::OpenerExt;

use crate::paths;

// ============================================================
// Token storage — disk only.
//
// We deliberately do NOT use the OS keyring. The Linux secret-service
// implementations (gnome-keyring, kwallet) routinely pop a modal
// keyring-unlock dialog the first time a new app reads or writes — which
// fires for *every* git sync until unlocked. Disk-only matches Electron's
// safeStorage fallback path (base64 on disk) and never prompts.
// ============================================================

fn fallback_load() -> HashMap<String, String> {
    let path = paths::token_file();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<HashMap<String, String>>(&s).ok())
        .unwrap_or_default()
}

/// One-time importer: legacy Electron tokens.enc had values either as Electron
/// safeStorage envelopes (unreadable from Rust) or as plain base64 (the JS
/// fallback). For each entry that's plain base64, re-store via keyring and mark
/// it migrated. Entries that look like safeStorage blobs are dropped — the user
/// will need to re-paste their token. We write a marker file so we only run
/// once per machine.
pub fn migrate_legacy_tokens() {
    let marker = paths::user_data_dir().join(".tokens-migrated");
    if marker.exists() {
        return;
    }
    let path = paths::token_file();
    if !path.exists() {
        let _ = fs::write(&marker, "");
        return;
    }
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => {
            let _ = fs::write(&marker, "");
            return;
        }
    };
    let map: HashMap<String, String> = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(_) => {
            let _ = fs::write(&marker, "");
            return;
        }
    };

    let mut migrated = HashMap::new();
    let mut count = 0usize;
    for (vault_id, value) in map.iter() {
        // Plain base64 of an ASCII-printable token is recoverable. safeStorage
        // envelopes start with v10/v11 prefixes (Linux/Mac) or DPAPI bytes
        // (Windows) — those decode to non-ASCII and fail to parse as a token.
        if let Ok(decoded) = B64.decode(value.as_bytes()) {
            if let Ok(s) = String::from_utf8(decoded) {
                let looks_like_token = !s.is_empty()
                    && s.chars().all(|c| c.is_ascii_graphic())
                    && (s.starts_with("ghp_")
                        || s.starts_with("github_pat_")
                        || s.starts_with("gho_")
                        || s.starts_with("ghu_")
                        || s.starts_with("ghs_")
                        || s.len() >= 30);
                if looks_like_token {
                    save_token_internal(vault_id, &s);
                    count += 1;
                    continue;
                }
            }
        }
        // Couldn't migrate — keep the raw (unreadable) entry so we know one
        // existed but the user must re-paste.
        migrated.insert(vault_id.clone(), value.clone());
    }
    if count > 0 {
        log::info!("[auth] migrated {count} legacy token(s) to disk store");
    }
    let _ = fs::write(&marker, "");
}

fn fallback_save(map: &HashMap<String, String>) {
    let path = paths::token_file();
    if let Ok(s) = serde_json::to_string(map) {
        let _ = fs::write(path, s);
    }
}

pub fn save_token_internal(vault_id: &str, token: &str) {
    let mut map = fallback_load();
    map.insert(vault_id.into(), B64.encode(token));
    fallback_save(&map);
}

pub fn get_token(vault_id: &str) -> Option<String> {
    let map = fallback_load();
    let raw = map.get(vault_id)?;
    if raw.is_empty() {
        return None;
    }
    let decoded = B64.decode(raw.as_bytes()).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    if s.is_empty() { None } else { Some(s) }
}

pub fn remove_token(vault_id: &str) -> bool {
    let mut map = fallback_load();
    map.remove(vault_id);
    fallback_save(&map);
    true
}

// ============================================================
// IPC commands
// ============================================================

#[derive(Debug, Deserialize)]
pub struct SaveTokenInput {
    #[serde(rename = "vaultId")]
    pub vault_id: String,
    pub token: String,
}

#[tauri::command]
pub async fn auth_save_token(args: SaveTokenInput) -> bool {
    save_token_internal(&args.vault_id, &args.token);
    true
}

#[tauri::command]
pub async fn auth_has_token(vault_id: String) -> bool {
    get_token(&vault_id).is_some()
}

#[tauri::command]
pub async fn auth_remove_token(vault_id: String) -> bool {
    remove_token(&vault_id)
}

#[derive(Debug, Serialize)]
pub struct GitHubUser {
    pub valid: bool,
    pub username: Option<String>,
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub error: Option<String>,
}

async fn gh_request(
    method: &str,
    url_path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = format!("https://api.github.com{}", url_path);
    let client = reqwest::Client::builder()
        .user_agent("Noteriv")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("unsupported method {method}")),
    };
    req = req.header("Accept", "application/vnd.github+json");
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if let Some(b) = body {
        req = req.json(&b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if status.is_client_error() || status.is_server_error() {
        let msg = serde_json::from_str::<Map<String, Value>>(&text)
            .ok()
            .and_then(|m| m.get("message").and_then(|v| v.as_str().map(String::from)))
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        return Err(msg);
    }

    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn auth_validate_token(token: String) -> GitHubUser {
    match gh_request("GET", "/user", Some(&token), None).await {
        Ok(v) => GitHubUser {
            valid: true,
            username: v.get("login").and_then(|s| s.as_str()).map(String::from),
            name: v
                .get("name")
                .and_then(|s| s.as_str())
                .or_else(|| v.get("login").and_then(|s| s.as_str()))
                .map(String::from),
            avatar: v.get("avatar_url").and_then(|s| s.as_str()).map(String::from),
            error: None,
        },
        Err(e) => GitHubUser {
            valid: false,
            username: None,
            name: None,
            avatar: None,
            error: Some(e),
        },
    }
}

#[derive(Debug, Deserialize)]
pub struct ListReposInput {
    pub token: String,
    #[serde(default)]
    pub page: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct GitHubRepo {
    pub name: String,
    #[serde(rename = "fullName")]
    pub full_name: String,
    pub private: bool,
    #[serde(rename = "cloneUrl")]
    pub clone_url: String,
    #[serde(rename = "sshUrl")]
    pub ssh_url: String,
    pub description: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn auth_list_repos(args: ListReposInput) -> Result<Vec<GitHubRepo>, String> {
    let page = args.page.unwrap_or(1);
    let path = format!(
        "/user/repos?sort=updated&per_page=30&page={page}&affiliation=owner,collaborator"
    );
    let v = gh_request("GET", &path, Some(&args.token), None).await?;
    let arr = v.as_array().cloned().unwrap_or_default();
    Ok(arr
        .into_iter()
        .map(|r| GitHubRepo {
            name: str_field(&r, "name"),
            full_name: str_field(&r, "full_name"),
            private: r.get("private").and_then(|b| b.as_bool()).unwrap_or(false),
            clone_url: str_field(&r, "clone_url"),
            ssh_url: str_field(&r, "ssh_url"),
            description: r.get("description").and_then(|s| s.as_str()).map(String::from),
            updated_at: r.get("updated_at").and_then(|s| s.as_str()).map(String::from),
        })
        .collect())
}

fn str_field(v: &Value, k: &str) -> String {
    v.get(k)
        .and_then(|s| s.as_str())
        .map(String::from)
        .unwrap_or_default()
}

#[derive(Debug, Deserialize)]
pub struct CreateRepoInput {
    pub token: String,
    pub name: String,
    #[serde(rename = "isPrivate", default)]
    pub is_private: Option<bool>,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn auth_create_repo(args: CreateRepoInput) -> Result<GitHubRepo, String> {
    let body = serde_json::json!({
        "name": args.name,
        "private": args.is_private.unwrap_or(true),
        "description": args.description.unwrap_or_else(|| "Notes vault managed by Noteriv".into()),
        "auto_init": true,
    });
    let v = gh_request("POST", "/user/repos", Some(&args.token), Some(body)).await?;
    Ok(GitHubRepo {
        name: str_field(&v, "name"),
        full_name: str_field(&v, "full_name"),
        private: v.get("private").and_then(|b| b.as_bool()).unwrap_or(false),
        clone_url: str_field(&v, "clone_url"),
        ssh_url: str_field(&v, "ssh_url"),
        description: v.get("description").and_then(|s| s.as_str()).map(String::from),
        updated_at: v.get("updated_at").and_then(|s| s.as_str()).map(String::from),
    })
}

#[tauri::command]
pub async fn auth_open_token_page(app: tauri::AppHandle) -> bool {
    let _ = app.opener().open_url(
        "https://github.com/settings/tokens/new?scopes=repo&description=Noteriv",
        None::<&str>,
    );
    true
}

#[tauri::command]
pub async fn auth_get_user(vault_id: String) -> Option<GitHubUser> {
    let token = get_token(&vault_id)?;
    let user = auth_validate_token(token).await;
    if user.valid {
        Some(user)
    } else {
        None
    }
}

/// Convert a git SSH URL to its HTTPS equivalent.
///   git@github.com:user/repo.git      -> https://github.com/user/repo.git
///   ssh://git@github.com/user/repo.git -> https://github.com/user/repo.git
fn ssh_to_https(remote: &str) -> Option<String> {
    if let Some(rest) = remote.strip_prefix("git@") {
        if let Some(idx) = rest.find(':') {
            let host = &rest[..idx];
            let path = &rest[idx + 1..];
            return Some(format!("https://{host}/{path}"));
        }
    }
    if let Some(rest) = remote.strip_prefix("ssh://git@") {
        return Some(format!("https://{rest}"));
    }
    None
}

/// Build an authenticated git URL (`https://oauth2:TOKEN@github.com/...`).
/// If `remote_url` is SSH, rewrite to HTTPS first — PATs can't auth SSH.
pub fn make_auth_url(remote_url: &str, token: &str) -> String {
    if token.is_empty() {
        return remote_url.to_string();
    }
    let working = ssh_to_https(remote_url).unwrap_or_else(|| remote_url.to_string());
    if let Ok(mut url) = url::Url::parse(&working) {
        if url.scheme() == "https" {
            let _ = url.set_username("oauth2");
            let _ = url.set_password(Some(token));
            return url.to_string();
        }
    }
    remote_url.to_string()
}

pub fn token_for_vault(vault_id: Option<&str>) -> Option<String> {
    vault_id.and_then(get_token)
}
