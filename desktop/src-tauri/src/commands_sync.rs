// Sync providers (folder, webdav) — 1:1 port of desktop/main/sync/*.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const SYNC_EXTS: &[&str] = &[".md", ".markdown", ".txt", ".css", ".json", ".yaml", ".yml"];
const SKIP_DIRS: &[&str] = &[".git", ".noteriv", "node_modules", ".obsidian", ".trash"];

#[derive(Debug, Clone)]
struct LocalFile {
    rel: String,  // forward-slash relative path
    full: PathBuf,
    mtime_ms: u128,
}

fn skip_dirs() -> HashSet<&'static str> {
    SKIP_DIRS.iter().copied().collect()
}

fn sync_exts() -> HashSet<&'static str> {
    SYNC_EXTS.iter().copied().collect()
}

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default()
}

fn walk_files(base: &Path) -> Vec<LocalFile> {
    let mut out = Vec::new();
    let exts = sync_exts();
    let skip = skip_dirs();

    fn recurse(
        cur: &Path,
        base: &Path,
        exts: &HashSet<&'static str>,
        skip: &HashSet<&'static str>,
        out: &mut Vec<LocalFile>,
    ) {
        let entries = match fs::read_dir(cur) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if skip.contains(name_s.as_ref()) {
                continue;
            }
            let path = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                recurse(&path, base, exts, skip, out);
            } else {
                let ext = ext_lower(&path);
                if exts.contains(ext.as_str()) {
                    let mtime = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let rel = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));
                    out.push(LocalFile {
                        rel,
                        full: path,
                        mtime_ms: mtime,
                    });
                }
            }
        }
    }

    recurse(base, base, &exts, &skip, &mut out);
    out
}

fn ensure_parent(p: &Path) {
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pushed: usize,
    pulled: usize,
}

#[derive(Debug, Serialize)]
pub struct ConnectionResult {
    ok: bool,
    error: Option<String>,
}

// ============================================================
// Folder provider
// ============================================================

#[derive(Debug, Deserialize)]
struct FolderConfig {
    #[serde(rename = "targetPath")]
    target_path: String,
    #[serde(default = "default_direction")]
    direction: String,
}

fn default_direction() -> String {
    "both".into()
}

fn folder_sync(vault_path: &str, cfg: FolderConfig) -> Result<SyncResult, String> {
    if cfg.target_path.is_empty() {
        return Err("Invalid target path".into());
    }
    if !Path::new(vault_path).exists() {
        return Err("Invalid vault path".into());
    }
    let target = Path::new(&cfg.target_path);
    if !target.exists() {
        fs::create_dir_all(target).map_err(|e| e.to_string())?;
    }

    let local = walk_files(Path::new(vault_path));
    let remote = walk_files(target);

    let local_map: HashMap<String, LocalFile> =
        local.iter().cloned().map(|f| (f.rel.clone(), f)).collect();
    let remote_map: HashMap<String, LocalFile> =
        remote.iter().cloned().map(|f| (f.rel.clone(), f)).collect();

    let mut pushed = 0usize;
    let mut pulled = 0usize;

    if cfg.direction == "push" || cfg.direction == "both" {
        for (rel, lf) in &local_map {
            let needs = match remote_map.get(rel) {
                Some(rf) => lf.mtime_ms > rf.mtime_ms,
                None => true,
            };
            if needs {
                let dest = target.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                ensure_parent(&dest);
                fs::copy(&lf.full, &dest).map_err(|e| e.to_string())?;
                pushed += 1;
            }
        }
    }

    if cfg.direction == "pull" || cfg.direction == "both" {
        for (rel, rf) in &remote_map {
            let needs = match local_map.get(rel) {
                Some(lf) => rf.mtime_ms > lf.mtime_ms,
                None => true,
            };
            if needs {
                let dest = Path::new(vault_path)
                    .join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                ensure_parent(&dest);
                fs::copy(&rf.full, &dest).map_err(|e| e.to_string())?;
                pulled += 1;
            }
        }
    }

    Ok(SyncResult { pushed, pulled })
}

fn folder_test(cfg: &FolderConfig) -> ConnectionResult {
    if cfg.target_path.is_empty() {
        return ConnectionResult { ok: false, error: Some("No target path".into()) };
    }
    let target = Path::new(&cfg.target_path);
    if !target.exists() {
        if let Err(e) = fs::create_dir_all(target) {
            return ConnectionResult { ok: false, error: Some(e.to_string()) };
        }
    }
    let probe = target.join(".noteriv-test");
    if let Err(e) = fs::write(&probe, "test") {
        return ConnectionResult { ok: false, error: Some(e.to_string()) };
    }
    let _ = fs::remove_file(&probe);
    ConnectionResult { ok: true, error: None }
}

// ============================================================
// WebDAV provider
// ============================================================

#[derive(Debug, Deserialize)]
struct WebDavConfig {
    url: String,
    username: String,
    password: String,
    #[serde(rename = "remotePath", default = "default_root")]
    remote_path: String,
}

fn default_root() -> String {
    "/".into()
}

#[derive(Debug, Clone)]
struct WebDavEntry {
    rel: String,         // relative to base_path
    href: String,        // absolute href on the server (path)
    is_dir: bool,
    mtime_ms: u128,
}

fn build_webdav_client(cfg: &WebDavConfig) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", cfg.username, cfg.password))
    );
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&auth_value).map_err(|e| e.to_string())?,
    );
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("Noteriv"),
    );
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

fn join_url(base: &str, path: &str) -> String {
    let b = base.trim_end_matches('/');
    let p = path.trim_start_matches('/');
    format!("{b}/{p}")
}

fn parse_webdav_date(s: &str) -> Option<u128> {
    // RFC 2822 (most servers): "Tue, 01 Apr 2025 12:00:00 GMT"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(s) {
        return Some(dt.timestamp_millis() as u128);
    }
    // RFC 3339 / ISO 8601: "2025-04-01T12:00:00Z"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis() as u128);
    }
    None
}

fn parse_propfind(xml: &str, base_path: &str) -> Vec<WebDavEntry> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut out = Vec::new();
    let mut buf = Vec::new();

    let mut current_href: Option<String> = None;
    let mut current_is_dir = false;
    let mut current_mtime: Option<String> = None;

    enum Capture {
        None,
        Href,
        LastMod,
    }
    let mut capture = Capture::None;
    let mut in_response = false;
    let mut in_resourcetype = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name();
                let local = name.local_name();
                let tag = std::str::from_utf8(local.as_ref()).unwrap_or("");
                match tag.to_lowercase().as_str() {
                    "response" => {
                        in_response = true;
                        current_href = None;
                        current_is_dir = false;
                        current_mtime = None;
                    }
                    "href" if in_response => capture = Capture::Href,
                    "getlastmodified" if in_response => capture = Capture::LastMod,
                    "resourcetype" if in_response => in_resourcetype = true,
                    "collection" if in_resourcetype => current_is_dir = true,
                    _ => {}
                }
            }
            Ok(Event::Text(t)) => {
                if let Ok(s) = t.unescape() {
                    match capture {
                        Capture::Href => current_href = Some(s.into_owned()),
                        Capture::LastMod => current_mtime = Some(s.into_owned()),
                        Capture::None => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = e.name();
                let local = name.local_name();
                let tag = std::str::from_utf8(local.as_ref()).unwrap_or("");
                match tag.to_lowercase().as_str() {
                    "href" | "getlastmodified" => capture = Capture::None,
                    "resourcetype" => in_resourcetype = false,
                    "response" => {
                        if let Some(href_raw) = current_href.take() {
                            // href may be absolute URL or absolute path; normalize to path
                            let href_path = href_raw
                                .strip_prefix("http://")
                                .or_else(|| href_raw.strip_prefix("https://"))
                                .map(|rest| match rest.find('/') {
                                    Some(i) => rest[i..].to_string(),
                                    None => "/".into(),
                                })
                                .unwrap_or(href_raw);
                            let decoded = urlencoding::decode(&href_path)
                                .map(|c| c.into_owned())
                                .unwrap_or(href_path);

                            // Compute rel path from base_path
                            let base = base_path.trim_end_matches('/');
                            let trimmed = decoded.trim_start_matches(base);
                            let rel = trimmed.trim_start_matches('/').trim_end_matches('/').to_string();

                            let mtime_ms = current_mtime
                                .take()
                                .and_then(|s| parse_webdav_date(&s))
                                .unwrap_or(0);

                            // Skip the base itself (empty rel)
                            if !rel.is_empty() {
                                out.push(WebDavEntry {
                                    rel,
                                    href: decoded,
                                    is_dir: current_is_dir,
                                    mtime_ms,
                                });
                            }
                        }
                        in_response = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

async fn webdav_propfind(
    client: &reqwest::Client,
    url: &str,
    depth: u8,
) -> Result<Vec<WebDavEntry>, String> {
    let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getlastmodified/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>"#;
    let resp = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), url)
        .header("Depth", depth.to_string())
        .header("Content-Type", "application/xml")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() && status.as_u16() != 207 {
        return Err(format!("PROPFIND failed: HTTP {}", status.as_u16()));
    }
    let base_path = url::Url::parse(url)
        .ok()
        .map(|u| u.path().to_string())
        .unwrap_or_else(|| "/".into());
    Ok(parse_propfind(&text, &base_path))
}

async fn webdav_mkcol(client: &reqwest::Client, url: &str) -> Result<(), String> {
    let resp = client
        .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let s = resp.status().as_u16();
    if s == 201 || s == 405 {
        // 405 = already exists
        Ok(())
    } else {
        Err(format!("MKCOL HTTP {s}"))
    }
}

async fn webdav_ensure_dir(
    client: &reqwest::Client,
    base_url: &str,
    rel_dir: &str,
) -> Result<(), String> {
    if rel_dir.is_empty() || rel_dir == "/" {
        return Ok(());
    }
    let mut acc = String::new();
    for part in rel_dir.split('/').filter(|p| !p.is_empty()) {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(part);
        let dir_url = format!("{}/", join_url(base_url, &acc));
        let _ = webdav_mkcol(client, &dir_url).await;
    }
    Ok(())
}

async fn webdav_put(
    client: &reqwest::Client,
    url: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let resp = client
        .put(url)
        .body(bytes)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("PUT HTTP {}", resp.status().as_u16()));
    }
    Ok(())
}

async fn webdav_get(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GET HTTP {}", resp.status().as_u16()));
    }
    Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

async fn webdav_sync(vault_path: &str, cfg: WebDavConfig) -> Result<SyncResult, String> {
    let client = build_webdav_client(&cfg)?;
    let base_url = format!(
        "{}{}",
        cfg.url.trim_end_matches('/'),
        if cfg.remote_path.starts_with('/') {
            cfg.remote_path.clone()
        } else {
            format!("/{}", cfg.remote_path)
        }
    );
    // Ensure remote root exists.
    let _ = webdav_mkcol(&client, &format!("{}/", base_url.trim_end_matches('/'))).await;

    // Collect remote entries (recursive PROPFIND with depth 1, then descend).
    let mut remote_entries: HashMap<String, WebDavEntry> = HashMap::new();
    let exts = sync_exts();

    let mut stack = vec![("".to_string(), base_url.clone())];
    while let Some((prefix, url)) = stack.pop() {
        let listed = webdav_propfind(&client, &format!("{}/", url.trim_end_matches('/')), 1).await?;
        for e in listed {
            // rel from base_path; we want rel from base_url's path
            let combined = if prefix.is_empty() {
                e.rel.clone()
            } else {
                format!("{}/{}", prefix.trim_end_matches('/'), e.rel)
            };
            if e.is_dir {
                stack.push((combined.clone(), format!("{}/{}", url.trim_end_matches('/'), e.rel)));
            } else {
                let ext = Path::new(&combined)
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| format!(".{}", x.to_lowercase()))
                    .unwrap_or_default();
                if exts.contains(ext.as_str()) {
                    remote_entries.insert(combined, e);
                }
            }
        }
    }

    let local = walk_files(Path::new(vault_path));
    let local_map: HashMap<String, LocalFile> =
        local.iter().cloned().map(|f| (f.rel.clone(), f)).collect();

    let mut pushed = 0usize;
    let mut pulled = 0usize;

    // Push: local → remote
    for (rel, lf) in &local_map {
        let needs = match remote_entries.get(rel) {
            Some(rf) => lf.mtime_ms > rf.mtime_ms,
            None => true,
        };
        if needs {
            let parent = Path::new(rel)
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or("");
            let _ = webdav_ensure_dir(&client, &base_url, parent).await;
            let dest_url = join_url(&base_url, rel);
            let bytes = fs::read(&lf.full).map_err(|e| e.to_string())?;
            webdav_put(&client, &dest_url, bytes).await?;
            pushed += 1;
        }
    }

    // Pull: remote → local
    for (rel, rf) in &remote_entries {
        let needs = match local_map.get(rel) {
            Some(lf) => rf.mtime_ms > lf.mtime_ms,
            None => true,
        };
        if needs {
            let dest = Path::new(vault_path).join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            ensure_parent(&dest);
            // Build remote URL from base_url + href path tail
            let server_root = url::Url::parse(&cfg.url)
                .ok()
                .map(|u| {
                    let mut clone = u.clone();
                    clone.set_path("/");
                    clone.to_string()
                })
                .unwrap_or_else(|| cfg.url.clone());
            let remote_url = format!("{}{}", server_root.trim_end_matches('/'), rf.href);
            let body = webdav_get(&client, &remote_url).await?;
            fs::write(&dest, body).map_err(|e| e.to_string())?;
            pulled += 1;
        }
    }

    Ok(SyncResult { pushed, pulled })
}

async fn webdav_test(cfg: WebDavConfig) -> ConnectionResult {
    let client = match build_webdav_client(&cfg) {
        Ok(c) => c,
        Err(e) => return ConnectionResult { ok: false, error: Some(e) },
    };
    let base_url = format!(
        "{}{}",
        cfg.url.trim_end_matches('/'),
        if cfg.remote_path.starts_with('/') {
            cfg.remote_path.clone()
        } else {
            format!("/{}", cfg.remote_path)
        }
    );
    match webdav_propfind(&client, &format!("{}/", base_url.trim_end_matches('/')), 0).await {
        Ok(_) => ConnectionResult { ok: true, error: None },
        Err(e) => ConnectionResult { ok: false, error: Some(e) },
    }
}

// ============================================================
// Public commands
// ============================================================

#[derive(Debug, Deserialize)]
pub struct SyncRunInput {
    #[serde(rename = "vaultPath")]
    pub vault_path: String,
    #[serde(rename = "providerType")]
    pub provider_type: String,
    pub config: Value,
}

#[tauri::command]
pub async fn sync_run(args: SyncRunInput) -> Result<SyncResult, String> {
    match args.provider_type.as_str() {
        "folder" => {
            let cfg: FolderConfig = serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            folder_sync(&args.vault_path, cfg)
        }
        "webdav" => {
            let cfg: WebDavConfig = serde_json::from_value(args.config).map_err(|e| e.to_string())?;
            webdav_sync(&args.vault_path, cfg).await
        }
        other => Err(format!("Unknown sync provider: {other}")),
    }
}

#[derive(Debug, Deserialize)]
pub struct SyncTestInput {
    #[serde(rename = "providerType")]
    pub provider_type: String,
    pub config: Value,
}

#[tauri::command]
pub async fn sync_test(args: SyncTestInput) -> ConnectionResult {
    match args.provider_type.as_str() {
        "folder" => match serde_json::from_value::<FolderConfig>(args.config) {
            Ok(cfg) => folder_test(&cfg),
            Err(e) => ConnectionResult { ok: false, error: Some(e.to_string()) },
        },
        "webdav" => match serde_json::from_value::<WebDavConfig>(args.config) {
            Ok(cfg) => webdav_test(cfg).await,
            Err(e) => ConnectionResult { ok: false, error: Some(e.to_string()) },
        },
        other => ConnectionResult { ok: false, error: Some(format!("Unknown provider: {other}")) },
    }
}

// Pull base64 import in scope (used by build_webdav_client).
use base64::Engine as _;
