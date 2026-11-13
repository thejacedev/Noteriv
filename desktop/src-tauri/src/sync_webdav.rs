//! WebDAV sync.
//!
//! Two-way sync between a vault folder and a folder on a WebDAV server.
//!
//! The app keeps a small record, per vault and per server, of what each file
//! looked like on both sides the last time they matched. Comparing the current
//! state with that record is what tells a real change from a file this app
//! uploaded itself, and a deleted file from one that was never synced.
//!
//! The server's clock is never compared with this machine's to decide whether
//! something changed. The two times are compared only to pick which version
//! stays in place when the same file changed on both sides, and then the other
//! version is kept next to it as a conflict copy, so no edit is thrown away.
//!
//! The record lives in the app's own data folder, not in the vault: the
//! vault's `.noteriv/` folder travels with Git sync, and a record from another
//! machine would describe the wrong files.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// File types that are always synced. Anything not listed here or in one
/// of the kinds below stays local.
const NOTE_EXTS: &[&str] = &[
    "md", "markdown", "txt", "canvas", "drawing", "base", "json", "csv", "css", "yaml", "yml",
];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"];
const PDF_EXTS: &[&str] = &["pdf"];
const AUDIO_EXTS: &[&str] = &["mp3", "wav", "m4a", "ogg", "flac"];
const VIDEO_EXTS: &[&str] = &["mp4", "mov", "mkv"];
/// Sound or video: the app's own recordings are sound in a `.webm` file.
const EITHER_EXTS: &[&str] = &["webm"];

/// Folders that are never synced, on either side.
pub(crate) const SKIP_DIRS: &[&str] = &[".git", ".noteriv", "node_modules", ".obsidian", ".trash"];

/// The app's own folder in a vault, and the files in it that hold settings
/// worth having on every device: bookmarks, property types and saved
/// layouts. The rest of the folder (the open tabs of this machine, the
/// trash, plugins) stays where it is.
const SETTINGS_DIR: &str = ".noteriv";
const SETTINGS_FILES: &[&str] = &["bookmarks.json", "types.json", "workspaces.json"];

/// Whether a file is one of the vault's settings files rather than a note.
pub(crate) fn is_settings_file(rel: &str) -> bool {
    rel.strip_prefix(SETTINGS_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .is_some_and(|name| SETTINGS_FILES.contains(&name))
}

/// The encryption key file on the server. Its ending is one no kind of
/// synced file has, so it is never listed, downloaded into a vault or
/// deleted as a note.
pub(crate) const KEY_FILE: &str = "noteriv-encryption.key";

/// What the user has chosen to sync. The same choice is applied to the
/// vault and to the other side, which is what makes leaving something out
/// safe: a file that is left out is invisible on both sides, so it is never
/// taken for one that was deleted.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct SyncFilter {
    pub images: bool,
    pub pdfs: bool,
    pub audio: bool,
    pub video: bool,
    /// Bookmarks, property types and saved layouts.
    pub settings: bool,
    /// Folders left out, as paths inside the vault with `/`.
    pub exclude_folders: Vec<String>,
}

impl Default for SyncFilter {
    /// What was synced before there was a choice: notes, images and PDFs.
    fn default() -> SyncFilter {
        SyncFilter {
            images: true,
            pdfs: true,
            audio: false,
            video: false,
            settings: false,
            exclude_folders: Vec::new(),
        }
    }
}

impl SyncFilter {
    fn excluded(&self, rel: &str) -> bool {
        self.exclude_folders.iter().any(|folder| {
            let folder = folder.trim().trim_matches('/');
            !folder.is_empty()
                && rel
                    .strip_prefix(folder)
                    .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        })
    }

    /// Whether a file is synced.
    pub(crate) fn allows(&self, rel: &str) -> bool {
        if rel == SETTINGS_DIR || rel.starts_with(".noteriv/") {
            return self.settings && is_settings_file(rel);
        }
        if self.excluded(rel) {
            return false;
        }
        let Some(ext) = Path::new(rel).extension().and_then(|e| e.to_str()) else {
            return false;
        };
        let ext = ext.to_lowercase();
        let is = |kinds: &[&str]| kinds.contains(&ext.as_str());
        is(NOTE_EXTS)
            || (self.images && is(IMAGE_EXTS))
            || (self.pdfs && is(PDF_EXTS))
            || (self.audio && is(AUDIO_EXTS))
            || (self.video && is(VIDEO_EXTS))
            || ((self.audio || self.video) && is(EITHER_EXTS))
    }

    /// Whether a folder is looked into at all. `rel` is its path inside the
    /// vault and `name` its own name.
    pub(crate) fn enters(&self, rel: &str, name: &str) -> bool {
        if rel == SETTINGS_DIR {
            return self.settings;
        }
        !SKIP_DIRS.contains(&name) && !rel.starts_with(".noteriv/") && !self.excluded(rel)
    }
}

/// Bumped when the record's meaning changes; an older record is then ignored.
pub(crate) const RECORD_VERSION: u32 = 1;

/// The record is written out after this many changes, and at the end of a run.
pub(crate) const SAVE_EVERY: usize = 20;

// ============================================================
// Configuration
// ============================================================

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "remotePath", default = "default_root")]
    pub remote_path: String,
    /// What to sync. Left out, it is notes, images and PDFs.
    #[serde(default)]
    pub filter: SyncFilter,
    /// When set, file contents are encrypted before they leave this machine.
    /// File and folder names are not: they stay readable on the server.
    #[serde(rename = "encryptionPassword", default)]
    pub encryption_password: Option<String>,
}

fn default_root() -> String {
    "/".into()
}

// ============================================================
// Paths and addresses
// ============================================================

/// Whether a file is synced when nothing has been chosen otherwise.
#[cfg(test)]
pub(crate) fn is_synced_file(rel: &str) -> bool {
    SyncFilter::default().allows(rel)
}

/// A relative path is only used if it cannot point outside the vault. The
/// names come from the server as well as from disk, so this is checked.
pub(crate) fn safe_rel(rel: &str) -> bool {
    if rel.is_empty() || rel.contains('\\') || rel.contains('\0') {
        return false;
    }
    rel.split('/').all(|seg| {
        !seg.is_empty()
            && seg != "."
            && seg != ".."
            && !(cfg!(windows)
                && seg
                    .chars()
                    .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*')))
    })
}

pub(crate) fn local_path(vault: &Path, rel: &str) -> PathBuf {
    let mut p = vault.to_path_buf();
    for seg in rel.split('/') {
        p.push(seg);
    }
    p
}

/// Percent-encode each part of a path, so `#`, `?`, `%`, spaces and accented
/// letters in a note's name reach the server as part of the name.
fn encode_rel(rel: &str) -> String {
    rel.split('/')
        .filter(|seg| !seg.is_empty())
        .map(|seg| urlencoding::encode(seg).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// The address of the remote folder, without a trailing slash.
pub(crate) fn root_url(cfg: &WebDavConfig) -> Result<String, String> {
    let mut base = url::Url::parse(cfg.url.trim())
        .map_err(|_| "The server URL is not a valid address.".to_string())?;
    if base.scheme() != "http" && base.scheme() != "https" {
        return Err("The server URL must start with http:// or https://.".into());
    }
    base.set_query(None);
    base.set_fragment(None);
    let base = base.as_str().trim_end_matches('/').to_string();
    let path = encode_rel(&cfg.remote_path);
    Ok(if path.is_empty() {
        base
    } else {
        format!("{base}/{path}")
    })
}

fn file_url(root: &str, rel: &str) -> String {
    format!("{root}/{}", encode_rel(rel))
}

fn dir_url(root: &str, rel: &str) -> String {
    let encoded = encode_rel(rel);
    if encoded.is_empty() {
        format!("{root}/")
    } else {
        format!("{root}/{encoded}/")
    }
}

/// The decoded path part of an address the server gave or was asked for.
fn decoded_path(href: &str) -> String {
    let h = href.trim();
    let path = match h
        .strip_prefix("http://")
        .or_else(|| h.strip_prefix("https://"))
    {
        Some(rest) => match rest.find('/') {
            Some(i) => &rest[i..],
            None => "/",
        },
        None => h,
    };
    urlencoding::decode(path)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| path.to_string())
}

/// `path` relative to `base`: empty for the folder itself, `None` if it is not inside it.
fn rel_under(path: &str, base: &str) -> Option<String> {
    let base = base.trim_end_matches('/');
    let path = path.trim_end_matches('/');
    if path == base {
        return Some(String::new());
    }
    let rest = path.strip_prefix(base)?.strip_prefix('/')?;
    Some(rest.to_string())
}

pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ============================================================
// The local side
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalFile {
    pub mtime_ms: u64,
    pub size: u64,
}

pub(crate) fn stat_local(path: &Path) -> Option<LocalFile> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let mtime_ms = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(LocalFile {
        mtime_ms,
        size: meta.len(),
    })
}

/// List every synced file in the vault.
///
/// A folder or file that cannot be read stops the listing with an error. It
/// must never be skipped: a note that is merely unreadable right now, on a
/// drive that hiccuped or a folder whose permissions changed, would otherwise
/// look like one the user deleted, and be deleted from the server.
#[cfg(test)]
pub(crate) fn list_local(vault: &Path) -> Result<BTreeMap<String, LocalFile>, String> {
    list_local_with(vault, &SyncFilter::default())
}

/// `list_local`, for what the user has chosen to sync.
pub(crate) fn list_local_with(
    vault: &Path,
    filter: &SyncFilter,
) -> Result<BTreeMap<String, LocalFile>, String> {
    fn unreadable(path: &Path, e: std::io::Error) -> String {
        format!(
            "\"{}\" could not be read ({e}), so nothing was synced.",
            path.display()
        )
    }

    fn walk(
        cur: &Path,
        prefix: &str,
        filter: &SyncFilter,
        out: &mut BTreeMap<String, LocalFile>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(cur).map_err(|e| unreadable(cur, e))? {
            let entry = entry.map_err(|e| unreadable(cur, e))?;
            // A name that is not valid text cannot be sent as a path; leave it local.
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let rel = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            let path = entry.path();
            let file_type = entry.file_type().map_err(|e| unreadable(&path, e))?;
            if file_type.is_dir() {
                if filter.enters(&rel, &name) {
                    walk(&path, &rel, filter, out)?;
                }
                continue;
            }
            if !filter.allows(&rel) || !safe_rel(&rel) {
                continue;
            }
            let meta = match fs::metadata(&path) {
                Ok(meta) => meta,
                // A plain file that vanished since the folder was read was deleted
                // just now. A link whose target is missing is not a deletion.
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !file_type.is_symlink() => {
                    continue
                }
                Err(e) => return Err(unreadable(&path, e)),
            };
            if !meta.is_file() {
                continue;
            }
            let mtime_ms = meta
                .modified()
                .map_err(|e| unreadable(&path, e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.insert(
                rel,
                LocalFile {
                    mtime_ms,
                    size: meta.len(),
                },
            );
        }
        Ok(())
    }

    let mut out = BTreeMap::new();
    walk(vault, "", filter, &mut out)?;
    Ok(out)
}

/// Write `bytes` to `rel`, unless the file on disk no longer looks the way it
/// did when this run listed it (`expected`; `None` means it was not there).
/// Returns the file's new state, or `None` if it was left alone.
pub(crate) fn write_local_if_unchanged(
    vault: &Path,
    rel: &str,
    bytes: &[u8],
    expected: Option<&LocalFile>,
) -> Result<Option<LocalFile>, String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    let dest = local_path(vault, rel);
    if stat_local(&dest).as_ref() != expected {
        return Ok(None);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = dest
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    let part = dest.with_file_name(format!("{name}.noteriv-part"));
    fs::write(&part, bytes).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&part, &dest) {
        let _ = fs::remove_file(&part);
        return Err(e.to_string());
    }
    stat_local(&dest)
        .map(Some)
        .ok_or_else(|| "The downloaded file could not be read back.".to_string())
}

/// Move a file into the vault's trash, in the layout the app's Trash view
/// reads, so a note removed on another device can still be restored here.
/// Returns false if the file changed since this run listed it and was kept.
pub(crate) fn move_to_trash_if_unchanged(
    vault: &Path,
    rel: &str,
    expected: &LocalFile,
) -> Result<bool, String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    let src = local_path(vault, rel);
    if stat_local(&src).as_ref() != Some(expected) {
        return Ok(false);
    }
    let trash = vault.join(".noteriv").join("trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let id = format!("{}-{}", now_ms(), file_name);
    let dest = trash.join(&id);
    if fs::rename(&src, &dest).is_err() {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        fs::remove_file(&src).map_err(|e| e.to_string())?;
    }
    let meta = serde_json::json!({
        "originalPath": src.to_string_lossy(),
        "deletedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "fileName": file_name,
    });
    let meta_text = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(trash.join(format!("{id}.meta.json")), meta_text).map_err(|e| e.to_string())?;
    Ok(true)
}

/// "Folder/Note.md" becomes "Folder/Note (conflict 2026-11-12 14-30-05).md",
/// with a number added if that name is taken too.
pub(crate) fn conflict_rel(rel: &str, stamp: &str, taken: &dyn Fn(&str) -> bool) -> String {
    let (dir, name) = match rel.rfind('/') {
        Some(i) => (&rel[..=i], &rel[i + 1..]),
        None => ("", rel),
    };
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut candidate = format!("{dir}{stem} (conflict {stamp}){ext}");
    let mut n = 2;
    while taken(&candidate) {
        candidate = format!("{dir}{stem} (conflict {stamp} {n}){ext}");
        n += 1;
    }
    candidate
}

// ============================================================
// The server side
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RemoteFile {
    /// Changes whenever the file's content on the server changes.
    pub sig: String,
    /// The server's own modification time. Only used to pick a conflict winner.
    pub mtime_ms: u64,
    /// The server's tag for this version, when it gives a usable one. Sent
    /// back with an upload so the server refuses it if the file has changed.
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
struct PropEntry {
    /// Decoded path on the server.
    path: String,
    is_dir: bool,
    last_modified: String,
    etag: String,
    size: String,
}

impl PropEntry {
    fn to_remote_file(&self) -> RemoteFile {
        let sig = if self.etag.is_empty() {
            format!("lm:{}|{}", self.last_modified, self.size)
        } else {
            format!("etag:{}", self.etag)
        };
        RemoteFile {
            sig,
            mtime_ms: parse_webdav_date(&self.last_modified).unwrap_or(0),
            etag: strong_etag(&self.etag),
        }
    }
}

/// The tag in the form an `If-Match` header takes. A weak tag (`W/...`) can
/// never match there, so it is not used.
fn strong_etag(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.starts_with("W/") {
        return None;
    }
    Some(if raw.starts_with('"') {
        raw.to_string()
    } else {
        format!("\"{raw}\"")
    })
}

fn parse_webdav_date(s: &str) -> Option<u64> {
    // RFC 2822 (most servers): "Tue, 01 Apr 2025 12:00:00 GMT"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(s) {
        return u64::try_from(dt.timestamp_millis()).ok();
    }
    // RFC 3339 / ISO 8601: "2025-04-01T12:00:00Z"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return u64::try_from(dt.timestamp_millis()).ok();
    }
    None
}

/// Read the entries out of a PROPFIND answer.
fn parse_propfind(xml: &str) -> Vec<PropEntry> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    #[derive(Clone, Copy, PartialEq)]
    enum Capture {
        None,
        Href,
        LastModified,
        Etag,
        Size,
    }

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut out = Vec::new();
    let mut buf = Vec::new();
    let mut current = PropEntry::default();
    let mut have_href = false;
    let mut in_response = false;
    let mut in_resourcetype = false;
    let mut capture = Capture::None;

    loop {
        let event = match reader.read_event_into(&mut buf) {
            Ok(event) => event,
            Err(_) => break,
        };
        match event {
            // Servers write the folder marker as `<collection/>`, which arrives as
            // an empty element rather than a start tag. Both mean the same thing.
            Event::Start(ref e) | Event::Empty(ref e) => {
                let is_start = matches!(event, Event::Start(_));
                let name = e.name();
                let local = name.local_name();
                let tag = std::str::from_utf8(local.as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                match tag.as_str() {
                    "response" if is_start => {
                        in_response = true;
                        current = PropEntry::default();
                        have_href = false;
                    }
                    // Only the first address in a response names the entry itself.
                    "href" if in_response && is_start && !have_href => capture = Capture::Href,
                    "getlastmodified" if in_response && is_start => capture = Capture::LastModified,
                    "getetag" if in_response && is_start => capture = Capture::Etag,
                    "getcontentlength" if in_response && is_start => capture = Capture::Size,
                    "resourcetype" if in_response && is_start => in_resourcetype = true,
                    "collection" if in_resourcetype => current.is_dir = true,
                    _ => {}
                }
            }
            Event::Text(ref t) => {
                if let Ok(text) = t.unescape() {
                    match capture {
                        Capture::Href => current.path.push_str(&text),
                        Capture::LastModified => current.last_modified.push_str(&text),
                        Capture::Etag => current.etag.push_str(&text),
                        Capture::Size => current.size.push_str(&text),
                        Capture::None => {}
                    }
                }
            }
            Event::End(ref e) => {
                let name = e.name();
                let local = name.local_name();
                let tag = std::str::from_utf8(local.as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                match tag.as_str() {
                    "href" => {
                        if capture == Capture::Href {
                            have_href = true;
                        }
                        capture = Capture::None;
                    }
                    "getlastmodified" | "getetag" | "getcontentlength" => capture = Capture::None,
                    "resourcetype" => in_resourcetype = false,
                    "response" => {
                        if in_response && have_href {
                            let mut entry = std::mem::take(&mut current);
                            entry.path = decoded_path(&entry.path);
                            out.push(entry);
                        }
                        in_response = false;
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

fn build_client(cfg: &WebDavConfig) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", cfg.username, cfg.password))
    );
    let mut auth = reqwest::header::HeaderValue::from_str(&auth).map_err(|e| e.to_string())?;
    auth.set_sensitive(true);
    headers.insert(reqwest::header::AUTHORIZATION, auth);
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("Noteriv"),
    );
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        // Long enough for a large attachment on a slow connection.
        .timeout(std::time::Duration::from_secs(300))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

/// A message for a request the server turned down. `doing` reads like "Uploading".
fn explain_status(status: u16, doing: &str) -> String {
    match status {
        401 => "The server rejected the username or password (HTTP 401).".to_string(),
        403 => format!("{doing} was refused (HTTP 403). The account may not have permission."),
        507 => "The server is out of storage space (HTTP 507).".to_string(),
        _ => format!("{doing} failed: the server answered HTTP {status}."),
    }
}

const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getlastmodified/>
    <D:getetag/>
    <D:getcontentlength/>
  </D:prop>
</D:propfind>"#;

/// Returns the HTTP status and, for a successful answer, the entries.
async fn propfind(
    client: &reqwest::Client,
    url: &str,
    depth: u8,
) -> Result<(u16, Vec<PropEntry>), String> {
    let resp = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), url)
        .header("Depth", depth.to_string())
        .header("Content-Type", "application/xml")
        .body(PROPFIND_BODY)
        .send()
        .await
        .map_err(|e| format!("Could not reach the server: {e}"))?;
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        return Ok((status, Vec::new()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok((status, parse_propfind(&text)))
}

async fn mkcol(client: &reqwest::Client, url: &str) -> Result<(), String> {
    let resp = client
        .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    // 405: the folder is already there.
    if (200..300).contains(&status) || status == 405 {
        Ok(())
    } else {
        Err(explain_status(status, "Creating a folder"))
    }
}

/// Create the remote folder and every folder above it that the remote path names.
async fn ensure_root(client: &reqwest::Client, cfg: &WebDavConfig) -> Result<(), String> {
    let mut base_cfg = cfg.clone();
    base_cfg.remote_path = String::new();
    let base = root_url(&base_cfg)?;
    let mut so_far = String::new();
    for seg in cfg.remote_path.split('/').filter(|s| !s.is_empty()) {
        if !so_far.is_empty() {
            so_far.push('/');
        }
        so_far.push_str(seg);
        // A folder above may be one this account cannot create but can use.
        let _ = mkcol(client, &dir_url(&base, &so_far)).await;
    }
    Ok(())
}

struct RemoteListing {
    files: BTreeMap<String, RemoteFile>,
    dirs: HashSet<String>,
    /// Whether the folder holds any file at all, synced kind or not, other
    /// than the encryption key file.
    any_files: bool,
}

/// List every synced file under the remote folder. Any failure aborts: a
/// partial listing would make files that are merely unlisted look deleted.
async fn list_remote(
    client: &reqwest::Client,
    root: &str,
    filter: &SyncFilter,
) -> Result<RemoteListing, String> {
    let mut any_files = false;
    let mut files = BTreeMap::new();
    let mut dirs: HashSet<String> = HashSet::new();
    let mut queue = vec![String::new()];

    while let Some(dir) = queue.pop() {
        let url = dir_url(root, &dir);
        let (status, entries) = propfind(client, &url, 1).await?;
        if status == 404 {
            return Err("The remote folder was not found on the server (HTTP 404).".into());
        }
        if !(200..300).contains(&status) {
            return Err(explain_status(status, "Listing the remote folder"));
        }
        let base = decoded_path(&url);
        let mut matched = 0usize;
        for entry in &entries {
            let Some(child) = rel_under(&entry.path, &base) else {
                continue;
            };
            matched += 1;
            if child.is_empty() || child.contains('/') {
                continue;
            }
            let rel = if dir.is_empty() {
                child.clone()
            } else {
                format!("{dir}/{child}")
            };
            if !safe_rel(&rel) {
                continue;
            }
            if entry.is_dir {
                if filter.enters(&rel, &child) && dirs.insert(rel.clone()) {
                    queue.push(rel);
                }
            } else {
                any_files |= rel != KEY_FILE;
                if filter.allows(&rel) {
                    files.insert(rel, entry.to_remote_file());
                }
            }
        }
        if !entries.is_empty() && matched == 0 {
            return Err("The server listed a different folder than the one asked for, so nothing was synced.".into());
        }
    }
    Ok(RemoteListing { files, dirs, any_files })
}

async fn stat_remote(
    client: &reqwest::Client,
    root: &str,
    rel: &str,
) -> Result<Option<RemoteFile>, String> {
    let url = file_url(root, rel);
    let (status, entries) = propfind(client, &url, 0).await?;
    if status == 404 {
        return Ok(None);
    }
    if !(200..300).contains(&status) {
        return Err(explain_status(status, "Checking an uploaded file"));
    }
    Ok(entries.first().map(|e| e.to_remote_file()))
}

/// What the server must still hold for an upload to go ahead.
#[derive(Debug, Clone, PartialEq)]
enum Expect {
    /// No condition.
    Anything,
    /// No file under this name yet.
    Absent,
    /// The version with this tag.
    Version(String),
}

/// Upload a file. `Ok(false)` means the server turned it down because the
/// condition no longer holds: someone else got there first.
async fn put(
    client: &reqwest::Client,
    url: &str,
    bytes: Vec<u8>,
    expect: &Expect,
) -> Result<bool, String> {
    let mut req = client.put(url).body(bytes);
    req = match expect {
        Expect::Anything => req,
        Expect::Absent => req.header("If-None-Match", "*"),
        Expect::Version(tag) => req.header("If-Match", tag.as_str()),
    };
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if (200..300).contains(&status) {
        Ok(true)
    } else if status == 412 && *expect != Expect::Anything {
        Ok(false)
    } else {
        Err(explain_status(status, "Uploading"))
    }
}

async fn get(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(explain_status(status, "Downloading"));
    }
    Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

async fn delete(client: &reqwest::Client, url: &str) -> Result<(), String> {
    let resp = client.delete(url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    // 404: it is already gone, which is what was wanted.
    if (200..300).contains(&status) || status == 404 {
        Ok(())
    } else {
        Err(explain_status(status, "Deleting"))
    }
}

// ============================================================
// Encryption
// ============================================================

/// Fetch the encryption key file. `None` when the folder has none.
async fn get_key_file(client: &reqwest::Client, root: &str) -> Result<Option<String>, String> {
    let resp = client
        .get(file_url(root, KEY_FILE))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if status == 404 {
        return Ok(None);
    }
    if !(200..300).contains(&status) {
        return Err(explain_status(status, "Reading the encryption key file"));
    }
    let not_ours = "The encryption key file on the server is not one this app wrote, so nothing was synced.";
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    // A real one is a few hundred bytes.
    if bytes.len() > 64 * 1024 {
        return Err(not_ours.into());
    }
    String::from_utf8(bytes.to_vec())
        .map(Some)
        .map_err(|_| not_ours.to_string())
}

/// Whether the remote folder is encrypted and, if it is, the key to it.
///
/// This runs before a single note is read or written, and every way it can
/// fail stops the run there:
///
/// - the folder is encrypted and no password is set: syncing would fill the
///   vault with encrypted bytes and the folder with readable notes
/// - the password is not the folder's
/// - a password is set but the folder already holds readable files: they
///   would stay readable beside the encrypted ones, so encryption is only
///   ever started on an empty folder
///
/// `set_up` allows the one change this makes: writing the key file on the
/// first encrypted sync into an empty folder.
async fn unlock(
    client: &reqwest::Client,
    root: &str,
    cfg: &WebDavConfig,
    any_files: bool,
    set_up: bool,
) -> Result<Option<crate::sync_crypto::Key>, String> {
    use crate::sync_crypto::{CryptoError, KeyFile};

    let password = cfg
        .encryption_password
        .as_deref()
        .filter(|password| !password.is_empty());
    // Twice at most: the second time only when another device wrote the
    // key file between our looking for it and our writing one.
    for _ in 0..2 {
        let existing = get_key_file(client, root).await?;
        match (password, existing) {
            (None, None) => return Ok(None),
            (None, Some(_)) => {
                return Err("This remote folder is encrypted. Turn on encryption in the sync settings and enter its password. Nothing was synced.".into())
            }
            (Some(password), Some(json)) => {
                let password = password.to_string();
                // Working the key out is slow on purpose; keep it off the async threads.
                let unlocked = tokio::task::spawn_blocking(move || {
                    KeyFile::from_json(&json).and_then(|file| file.unlock(&password))
                })
                .await
                .map_err(|e| e.to_string())?;
                return match unlocked {
                    Ok(key) => Ok(Some(key)),
                    Err(CryptoError::WrongPassword) => Err("The encryption password is not the one this remote folder was set up with. Nothing was synced.".into()),
                    Err(e) => Err(format!("The encryption key file on the server could not be used. {e} Nothing was synced.")),
                };
            }
            (Some(password), None) => {
                if any_files {
                    return Err("The remote folder already holds files that are not encrypted. Encryption can only be started on an empty remote folder: choose a new one, or empty this one first. Nothing was synced.".into());
                }
                if !set_up {
                    return Ok(None);
                }
                let password = password.to_string();
                let (file, key) = tokio::task::spawn_blocking(move || KeyFile::create(&password))
                    .await
                    .map_err(|e| e.to_string())?
                    .map_err(|e| format!("Encryption could not be set up. {e}"))?;
                let url = file_url(root, KEY_FILE);
                if put(client, &url, file.to_json().into_bytes(), &Expect::Absent).await? {
                    return Ok(Some(key));
                }
                // Someone else's key file is there now. Go round again and use it.
            }
        }
    }
    Err("The encryption key file on the server changed while it was being read. Nothing was synced; try again.".into())
}

// ============================================================
// The record of the last sync
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct FileRecord {
    /// The local file's modification time and size when it last matched the server.
    pub local_mtime_ms: u64,
    pub local_size: u64,
    /// The server's signature for the file at that moment.
    pub remote_sig: String,
    /// A fingerprint of the content, so a file that was only touched (same
    /// content, new time) is not mistaken for an edit.
    #[serde(default)]
    pub hash: String,
}

pub(crate) fn content_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A file whose time changed but whose size did not may only have been
/// touched, by a backup tool or a Git checkout. Read those and compare
/// fingerprints: if the content is what was synced, note the new time and move
/// on, so it is neither uploaded again nor counted as one side of a conflict.
pub(crate) fn settle_touched_files(
    vault: &Path,
    local: &BTreeMap<String, LocalFile>,
    record: &mut SyncRecord,
) {
    for (rel, file) in local {
        let Some(entry) = record.files.get_mut(rel) else {
            continue;
        };
        if file.mtime_ms == entry.local_mtime_ms
            || file.size != entry.local_size
            || entry.hash.is_empty()
        {
            continue;
        }
        if let Ok(bytes) = fs::read(local_path(vault, rel)) {
            if content_hash(&bytes) == entry.hash {
                entry.local_mtime_ms = file.mtime_ms;
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct SyncRecord {
    pub version: u32,
    pub vault: String,
    pub remote: String,
    pub files: BTreeMap<String, FileRecord>,
}

fn record_path(record_dir: &Path, vault: &str, remote: &str) -> PathBuf {
    let digest = Sha256::digest(format!("{vault}\n{remote}").as_bytes());
    let hex: String = digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
    record_dir.join(format!("webdav-{hex}.json"))
}

/// A record that is missing, unreadable, from an older version, or written for
/// another vault or server counts as no record at all.
pub(crate) fn load_record(path: &Path, vault: &str, remote: &str) -> Option<SyncRecord> {
    let text = fs::read_to_string(path).ok()?;
    let record: SyncRecord = serde_json::from_str(&text).ok()?;
    if record.version != RECORD_VERSION || record.vault != vault || record.remote != remote {
        return None;
    }
    Some(record)
}

pub(crate) fn save_record(path: &Path, record: &SyncRecord) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string(record).map_err(|e| e.to_string())?;
    let part = path.with_extension("json.part");
    fs::write(&part, text).map_err(|e| e.to_string())?;
    fs::rename(&part, path).map_err(|e| e.to_string())
}

// ============================================================
// Deciding what to do
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Action {
    /// Send the local file to the server.
    Upload(String),
    /// Fetch the server's file.
    Download(String),
    /// The file was deleted here: remove it from the server.
    DeleteRemote(String),
    /// The file was deleted on the server: move the local copy to the trash.
    TrashLocal(String),
    /// On both sides with no record: fetch it and compare the contents.
    Compare(String),
    /// Changed on both sides since the last sync.
    Conflict(String),
    /// Gone from both sides: drop it from the record.
    Forget(String),
}

/// Work out what to do with every file, from what is on disk, what is on the
/// server, and what both looked like after the last sync. Touches nothing.
///
/// Deletions are only ever planned from a record. When one side is completely
/// empty the record is not trusted: an empty vault is more likely an
/// unmounted drive than a user who deleted every note, and an empty server is
/// more likely a wiped or replaced one. Both cases copy files back instead.
pub(crate) fn plan(
    local: &BTreeMap<String, LocalFile>,
    remote: &BTreeMap<String, RemoteFile>,
    record: Option<&SyncRecord>,
) -> Vec<Action> {
    let record = record.filter(|_| !local.is_empty() && !remote.is_empty());
    let empty = BTreeMap::new();
    let recorded = record.map(|r| &r.files).unwrap_or(&empty);

    let mut names: BTreeSet<&String> = BTreeSet::new();
    names.extend(local.keys());
    names.extend(remote.keys());
    names.extend(recorded.keys());

    let mut actions = Vec::new();
    for name in names {
        let rel = name.clone();
        let l = local.get(name);
        let r = remote.get(name);
        let s = recorded.get(name);
        let local_changed = |l: &LocalFile, s: &FileRecord| {
            l.mtime_ms != s.local_mtime_ms || l.size != s.local_size
        };
        let remote_changed = |r: &RemoteFile, s: &FileRecord| r.sig != s.remote_sig;

        match (l, r, s) {
            (Some(l), Some(r), Some(s)) => match (local_changed(l, s), remote_changed(r, s)) {
                (false, false) => {}
                (true, false) => actions.push(Action::Upload(rel)),
                (false, true) => actions.push(Action::Download(rel)),
                (true, true) => actions.push(Action::Conflict(rel)),
            },
            (Some(_), Some(_), None) => actions.push(Action::Compare(rel)),
            // Deleted on the server. An edit made here since then outranks the deletion.
            (Some(l), None, Some(s)) => {
                if local_changed(l, s) {
                    actions.push(Action::Upload(rel));
                } else {
                    actions.push(Action::TrashLocal(rel));
                }
            }
            (Some(_), None, None) => actions.push(Action::Upload(rel)),
            // Deleted here. An edit made on the server since then outranks the deletion.
            (None, Some(r), Some(s)) => {
                if remote_changed(r, s) {
                    actions.push(Action::Download(rel));
                } else {
                    actions.push(Action::DeleteRemote(rel));
                }
            }
            (None, Some(_), None) => actions.push(Action::Download(rel)),
            (None, None, Some(_)) => actions.push(Action::Forget(rel)),
            (None, None, None) => {}
        }
    }
    actions
}

// ============================================================
// Doing it
// ============================================================

/// A note that had changed on both sides, and where the version that did
/// not keep its name went. Paths are relative to the vault, with `/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConflictCopy {
    pub note: String,
    pub copy: String,
    /// Whether the copy was written into the vault. Push-only folder sync
    /// leaves the vault alone, so there the copy is only in the target folder.
    pub in_vault: bool,
}

#[derive(Debug, Default)]
pub(crate) struct Outcome {
    pub pushed: usize,
    pub pulled: usize,
    pub deleted: usize,
    pub conflicts: usize,
    /// One entry per conflict counted in `conflicts`, for the notice in the app.
    pub conflict_copies: Vec<ConflictCopy>,
    /// One line per file that could not be synced this run.
    pub errors: Vec<String>,
}

struct Run<'a> {
    client: &'a reqwest::Client,
    root: &'a str,
    vault: &'a Path,
    local: &'a BTreeMap<String, LocalFile>,
    remote: &'a BTreeMap<String, RemoteFile>,
    /// Remote folders known to exist, so each is created at most once.
    remote_dirs: HashSet<String>,
    /// Set when the remote folder is encrypted.
    key: Option<crate::sync_crypto::Key>,
    record: SyncRecord,
    outcome: Outcome,
}

impl Run<'_> {
    /// A file's contents as they are stored on the server.
    fn seal(&self, bytes: &[u8]) -> Result<Vec<u8>, String> {
        match &self.key {
            Some(key) => crate::sync_crypto::encrypt(key, bytes).map_err(|e| e.to_string()),
            None => Ok(bytes.to_vec()),
        }
    }

    /// The contents of a file fetched from the server. In an encrypted
    /// folder a file that is not encrypted, or that this key does not open,
    /// is refused rather than written into the vault: whoever can write to
    /// the server could otherwise plant notes, or the vault would fill with
    /// unreadable bytes.
    fn unseal(&self, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
        use crate::sync_crypto::CryptoError;
        let Some(key) = &self.key else {
            // The key file is checked before a run starts, so this is a
            // folder whose key file went missing. Its contents must not be
            // written into a vault as if they were notes.
            // A file this app encrypted: its mark, the format version, and at
            // least a full header. A note that merely begins with the same
            // four letters is a note.
            let sealed = crate::sync_crypto::is_encrypted(&bytes)
                && bytes.get(4) == Some(&1)
                && bytes.len() >= 45;
            if sealed {
                return Err("The copy on the server is encrypted, and this vault is not set up to read it, so it was left alone.".into());
            }
            return Ok(bytes);
        };
        crate::sync_crypto::decrypt(key, &bytes).map_err(|e| match e {
            CryptoError::NotEncrypted => {
                "The copy on the server is not encrypted, so it was left alone.".to_string()
            }
            other => format!("The copy on the server could not be decrypted. {other}"),
        })
    }

    async fn ensure_remote_parents(&mut self, rel: &str) {
        let mut so_far = String::new();
        let parts: Vec<&str> = rel.split('/').collect();
        for seg in &parts[..parts.len().saturating_sub(1)] {
            if !so_far.is_empty() {
                so_far.push('/');
            }
            so_far.push_str(seg);
            if self.remote_dirs.insert(so_far.clone()) {
                // If this fails the upload that follows reports the real problem.
                let _ = mkcol(self.client, &dir_url(self.root, &so_far)).await;
            }
        }
    }

    /// Send a local file and note what both sides look like afterwards.
    ///
    /// Returns false if the server turned the upload down because the file
    /// changed there after this run listed it. Nothing is recorded then, so the
    /// next run sees both versions and keeps both.
    async fn upload(&mut self, rel: &str) -> Result<bool, String> {
        let full = local_path(self.vault, rel);
        // Taken before reading: if the file changes mid-upload, the next run sees it as changed.
        let before = stat_local(&full).ok_or("The file is no longer on disk.")?;
        let bytes = fs::read(&full).map_err(|e| e.to_string())?;
        // The fingerprint is of the note as it is here. What is sent may be
        // encrypted, and differs every time it is.
        let hash = content_hash(&bytes);
        let body = self.seal(&bytes)?;
        let url = file_url(self.root, rel);
        // Only replace the version this run saw, and only create a file that was not there.
        let (listed_sig, expect) = match self.remote.get(rel) {
            None => (None, Expect::Absent),
            Some(r) => (
                Some(r.sig.clone()),
                r.etag
                    .clone()
                    .map(Expect::Version)
                    .unwrap_or(Expect::Anything),
            ),
        };

        self.ensure_remote_parents(rel).await;
        if !put(self.client, &url, body.clone(), &expect).await? {
            let now = stat_remote(self.client, self.root, rel)
                .await?
                .map(|r| r.sig);
            if now != listed_sig {
                // Another device changed it in the meantime.
                return Ok(false);
            }
            // The server refused, yet still shows exactly what this run listed:
            // its answer contradicts its own listing, so send the file plainly.
            put(self.client, &url, body.clone(), &Expect::Anything).await?;
        }
        let missing = "The file was uploaded but the server does not list it.";
        let mut uploaded = stat_remote(self.client, self.root, rel)
            .await?
            .ok_or(missing)?;
        if listed_sig.as_deref() == Some(uploaded.sig.as_str()) {
            // Some servers tell versions apart only by the second and the size.
            // This upload looks the same to the server as the version it
            // replaced, so other devices would never notice it. Send it again
            // a moment later, when it gets a time of its own.
            tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
            put(self.client, &url, body, &Expect::Anything).await?;
            uploaded = stat_remote(self.client, self.root, rel)
                .await?
                .ok_or(missing)?;
        }
        self.record.files.insert(
            rel.to_string(),
            FileRecord {
                local_mtime_ms: before.mtime_ms,
                local_size: before.size,
                remote_sig: uploaded.sig,
                hash,
            },
        );
        self.outcome.pushed += 1;
        Ok(true)
    }

    /// Put the server's bytes in place of the local file as this run listed it.
    fn place_download(
        &mut self,
        rel: &str,
        bytes: &[u8],
        remote: &RemoteFile,
    ) -> Result<(), String> {
        match write_local_if_unchanged(self.vault, rel, bytes, self.local.get(rel))? {
            Some(now) => {
                self.record.files.insert(
                    rel.to_string(),
                    FileRecord {
                        local_mtime_ms: now.mtime_ms,
                        local_size: now.size,
                        remote_sig: remote.sig.clone(),
                        hash: content_hash(bytes),
                    },
                );
                self.outcome.pulled += 1;
                Ok(())
            }
            // The file was edited while this run was working. Leave it; the next run decides.
            None => Ok(()),
        }
    }

    async fn download(&mut self, rel: &str) -> Result<(), String> {
        let remote = self
            .remote
            .get(rel)
            .ok_or("The file is no longer on the server.")?
            .clone();
        let bytes = self.unseal(get(self.client, &file_url(self.root, rel)).await?)?;
        self.place_download(rel, &bytes, &remote)
    }

    /// Both sides have the file and it is not known which is right. Fetch the
    /// server's copy: identical contents are simply noted as in step. If they
    /// differ, the newer one stays under the note's name and the other is kept
    /// beside it as a conflict copy, on this device and on the server.
    async fn reconcile(&mut self, rel: &str) -> Result<(), String> {
        let local = self
            .local
            .get(rel)
            .ok_or("The file is no longer on disk.")?
            .clone();
        let remote = self
            .remote
            .get(rel)
            .ok_or("The file is no longer on the server.")?
            .clone();
        let full = local_path(self.vault, rel);
        let local_bytes = fs::read(&full).map_err(|e| e.to_string())?;
        let remote_bytes = self.unseal(get(self.client, &file_url(self.root, rel)).await?)?;

        if local_bytes == remote_bytes {
            self.record.files.insert(
                rel.to_string(),
                FileRecord {
                    local_mtime_ms: local.mtime_ms,
                    local_size: local.size,
                    remote_sig: remote.sig,
                    hash: content_hash(&local_bytes),
                },
            );
            return Ok(());
        }

        if is_settings_file(rel) {
            // Bookmarks and the like are not notes: the newer file wins and
            // no second copy is kept beside it.
            if remote.mtime_ms > local.mtime_ms {
                self.place_download(rel, &remote_bytes, &remote)?;
            } else {
                self.upload(rel).await?;
            }
            return Ok(());
        }

        let stamp = chrono::Local::now().format("%Y-%m-%d %H-%M-%S").to_string();
        let copy_rel = {
            let vault = self.vault;
            let remote_files = self.remote;
            conflict_rel(rel, &stamp, &|candidate: &str| {
                local_path(vault, candidate).exists() || remote_files.contains_key(candidate)
            })
        };
        let server_is_newer = remote.mtime_ms > local.mtime_ms;
        let losing_bytes = if server_is_newer {
            &local_bytes
        } else {
            &remote_bytes
        };

        // Save the version that will not keep the name first, so it exists before anything is replaced.
        if write_local_if_unchanged(self.vault, &copy_rel, losing_bytes, None)?.is_none() {
            return Err("A conflict copy could not be written.".into());
        }
        self.upload(&copy_rel).await?;

        if server_is_newer {
            self.place_download(rel, &remote_bytes, &remote)?;
        } else {
            self.upload(rel).await?;
        }
        self.outcome.conflicts += 1;
        self.outcome.conflict_copies.push(ConflictCopy {
            note: rel.to_string(),
            copy: copy_rel,
            in_vault: true,
        });
        Ok(())
    }

    async fn apply(&mut self, action: &Action) -> Result<(), String> {
        match action {
            Action::Upload(rel) => self.upload(rel).await.map(|_| ()),
            Action::Download(rel) => self.download(rel).await,
            Action::Compare(rel) | Action::Conflict(rel) => self.reconcile(rel).await,
            Action::DeleteRemote(rel) => {
                delete(self.client, &file_url(self.root, rel)).await?;
                self.record.files.remove(rel);
                self.outcome.deleted += 1;
                Ok(())
            }
            Action::TrashLocal(rel) => {
                let expected = self
                    .local
                    .get(rel)
                    .ok_or("The file is no longer on disk.")?;
                if move_to_trash_if_unchanged(self.vault, rel, expected)? {
                    self.record.files.remove(rel);
                    self.outcome.deleted += 1;
                }
                Ok(())
            }
            Action::Forget(rel) => {
                self.record.files.remove(rel);
                Ok(())
            }
        }
    }
}

pub(crate) fn action_rel(action: &Action) -> &str {
    match action {
        Action::Upload(r)
        | Action::Download(r)
        | Action::DeleteRemote(r)
        | Action::TrashLocal(r)
        | Action::Compare(r)
        | Action::Conflict(r)
        | Action::Forget(r) => r,
    }
}

/// Everything one run found and decided, before anything is changed.
struct Prepared {
    client: reqwest::Client,
    root: String,
    vault: PathBuf,
    local: BTreeMap<String, LocalFile>,
    listing: RemoteListing,
    record_path: PathBuf,
    record: SyncRecord,
    actions: Vec<Action>,
    key: Option<crate::sync_crypto::Key>,
}

/// Look at both sides and decide what to do. Changes nothing but the remote
/// folder itself, which is created if it is missing.
///
/// Listing either side has to succeed completely, or the run stops here.
async fn prepare(
    vault_path: &str,
    cfg: &WebDavConfig,
    record_dir: &Path,
) -> Result<Prepared, String> {
    let vault = Path::new(vault_path);
    if !vault.is_dir() {
        return Err("The vault folder is missing, so nothing was synced.".into());
    }
    let vault_id = fs::canonicalize(vault)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| vault_path.to_string());

    let root = root_url(cfg)?;
    let client = build_client(cfg)?;

    ensure_root(&client, cfg).await?;
    let listing = list_remote(&client, &root, &cfg.filter).await?;
    // Before any note is looked at: is this folder encrypted, and do we hold its key?
    let key = unlock(&client, &root, cfg, listing.any_files, true).await?;
    let local = list_local_with(vault, &cfg.filter)?;
    // An encrypted folder has a record of its own, so one kept for the same
    // address when it held readable files is never applied to it.
    let remote_id = format!(
        "{root}\n{}{}",
        cfg.username,
        if key.is_some() { "\nencrypted" } else { "" }
    );

    let record_path = record_path(record_dir, &vault_id, &remote_id);
    let mut loaded = load_record(&record_path, &vault_id, &remote_id);
    if let Some(record) = loaded.as_mut() {
        settle_touched_files(vault, &local, record);
    }
    let actions = plan(&local, &listing.files, loaded.as_ref());
    let record = loaded.unwrap_or_else(|| SyncRecord {
        version: RECORD_VERSION,
        vault: vault_id,
        remote: remote_id,
        files: BTreeMap::new(),
    });
    Ok(Prepared {
        client,
        root,
        vault: vault.to_path_buf(),
        local,
        listing,
        record_path,
        record,
        actions,
        key,
    })
}

/// Carry out what `prepare` decided. Each file stands alone: one that fails is
/// reported in `errors` and does not stop the rest.
async fn execute(prepared: Prepared) -> Result<Outcome, String> {
    let Prepared {
        client,
        root,
        vault,
        local,
        listing,
        record_path,
        record,
        actions,
        key,
    } = prepared;
    let mut run = Run {
        client: &client,
        root: &root,
        vault: &vault,
        local: &local,
        remote: &listing.files,
        remote_dirs: listing.dirs.clone(),
        key,
        record,
        outcome: Outcome::default(),
    };

    let mut since_save = 0usize;
    for action in &actions {
        match run.apply(action).await {
            Ok(()) => {
                since_save += 1;
                if since_save >= SAVE_EVERY {
                    since_save = 0;
                    let _ = save_record(&record_path, &run.record);
                }
            }
            Err(e) => run
                .outcome
                .errors
                .push(format!("{}: {e}", action_rel(action))),
        }
    }
    save_record(&record_path, &run.record)
        .map_err(|e| format!("The record of this sync could not be saved: {e}"))?;
    Ok(run.outcome)
}

/// Sync a vault with its WebDAV folder. `record_dir` is where this machine
/// keeps its records of earlier syncs.
pub(crate) async fn sync(
    vault_path: &str,
    cfg: WebDavConfig,
    record_dir: &Path,
) -> Result<Outcome, String> {
    execute(prepare(vault_path, &cfg, record_dir).await?).await
}

/// Check that the server can be reached with these details and that the
/// remote folder exists, creating it if it does not.
pub(crate) async fn test_connection(cfg: WebDavConfig) -> Result<(), String> {
    let root = root_url(&cfg)?;
    let client = build_client(&cfg)?;
    let url = dir_url(&root, "");
    let (status, _) = propfind(&client, &url, 0).await?;
    if (200..300).contains(&status) {
        // The folder is there: check the encryption settings against it too,
        // without setting anything up.
        let listing = list_remote(&client, &root, &cfg.filter).await?;
        return unlock(&client, &root, &cfg, listing.any_files, false)
            .await
            .map(|_| ());
    }
    if status != 404 {
        return Err(explain_status(status, "Reaching the remote folder"));
    }
    ensure_root(&client, &cfg).await?;
    let (status, _) = propfind(&client, &url, 0).await?;
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "The remote folder does not exist and could not be created (HTTP {status})."
        ))
    }
}

// ============================================================
// Tests that need no server
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_filter_chooses_by_kind_and_folder_and_keeps_the_apps_own_folder_private() {
        let plain = SyncFilter::default();
        for yes in ["Note.md", "a/b.canvas", "Projects.base", "pic.PNG", "paper.pdf"] {
            assert!(plain.allows(yes), "{yes}");
        }
        for no in [
            "song.mp3",
            "clip.mp4",
            "archive.zip",
            "noext",
            ".noteriv/bookmarks.json",
            ".noteriv/workspace.json",
            KEY_FILE,
        ] {
            assert!(!plain.allows(no), "{no}");
        }

        let all = SyncFilter {
            audio: true,
            video: true,
            settings: true,
            ..SyncFilter::default()
        };
        for yes in [
            "song.mp3",
            "clip.mp4",
            ".noteriv/bookmarks.json",
            ".noteriv/types.json",
            ".noteriv/workspaces.json",
        ] {
            assert!(all.allows(yes), "{yes}");
        }
        // Even with settings on, only the three settings files leave the app's folder.
        for private in [
            ".noteriv/workspace.json",
            ".noteriv/trash/Note.md",
            ".noteriv/plugins/x/main.js",
            ".noteriv/bookmarks (conflict).json",
            ".noteriv",
            KEY_FILE,
        ] {
            assert!(!all.allows(private), "{private}");
        }

        let lean = SyncFilter {
            images: false,
            pdfs: false,
            exclude_folders: vec!["Archive".into(), "/Work/Private/".into(), "  ".into()],
            ..SyncFilter::default()
        };
        assert!(!lean.allows("pic.png") && !lean.allows("paper.pdf") && lean.allows("Note.md"));
        // A recording made in the app is a .webm: it travels with sound or with video.
        let sound = SyncFilter { audio: true, ..SyncFilter::default() };
        let film = SyncFilter { video: true, ..SyncFilter::default() };
        assert!(sound.allows("recording.webm") && film.allows("recording.webm"));
        assert!(!plain.allows("recording.webm") && !sound.allows("clip.mp4") && film.allows("clip.mp4"));
        assert!(!lean.allows("Archive/Old.md") && !lean.allows("Work/Private/x.md"));
        // A name that only starts the same way is another folder, or a file.
        assert!(lean.allows("Archive2/Note.md") && lean.allows("Work/Public/x.md"));
        assert!(lean.allows("Archive.md"));

        assert!(!plain.enters(".noteriv", ".noteriv"));
        assert!(all.enters(".noteriv", ".noteriv") && !all.enters(".noteriv/trash", "trash"));
        assert!(!plain.enters(".git", ".git") && !plain.enters("a/node_modules", "node_modules"));
        assert!(!lean.enters("Archive", "Archive") && lean.enters("Archive2", "Archive2"));
        assert!(!lean.enters("Work/Private", "Private") && lean.enters("Work", "Work"));
    }

    #[test]
    fn a_listing_follows_the_filter_on_disk() {
        let vault = std::env::temp_dir().join(format!("noteriv-filter-{}", std::process::id()));
        let _ = fs::remove_dir_all(&vault);
        for (rel, text) in [
            ("Note.md", "n"),
            ("Archive/Old.md", "o"),
            ("song.mp3", "s"),
            (".noteriv/bookmarks.json", "{}"),
            (".noteriv/workspace.json", "{}"),
            (".noteriv/trash/Gone.md", "g"),
        ] {
            let path = local_path(&vault, rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
        let names = |filter: &SyncFilter| -> Vec<String> {
            list_local_with(&vault, filter).unwrap().keys().cloned().collect()
        };
        assert_eq!(names(&SyncFilter::default()), ["Archive/Old.md", "Note.md"]);
        let chosen = SyncFilter {
            audio: true,
            settings: true,
            exclude_folders: vec!["Archive".into()],
            ..SyncFilter::default()
        };
        assert_eq!(names(&chosen), [".noteriv/bookmarks.json", "Note.md", "song.mp3"]);
        let _ = fs::remove_dir_all(&vault);
    }

    fn local(mtime_ms: u64, size: u64) -> LocalFile {
        LocalFile { mtime_ms, size }
    }

    fn remote(sig: &str) -> RemoteFile {
        RemoteFile {
            sig: sig.into(),
            mtime_ms: 0,
            etag: None,
        }
    }

    fn locals(items: &[(&str, u64, u64)]) -> BTreeMap<String, LocalFile> {
        items
            .iter()
            .map(|(n, m, s)| (n.to_string(), local(*m, *s)))
            .collect()
    }

    fn remotes(items: &[(&str, &str)]) -> BTreeMap<String, RemoteFile> {
        items
            .iter()
            .map(|(n, sig)| (n.to_string(), remote(sig)))
            .collect()
    }

    fn record(items: &[(&str, u64, u64, &str)]) -> SyncRecord {
        SyncRecord {
            version: RECORD_VERSION,
            vault: "/vault".into(),
            remote: "server".into(),
            files: items
                .iter()
                .map(|(n, m, s, sig)| {
                    (
                        n.to_string(),
                        FileRecord {
                            local_mtime_ms: *m,
                            local_size: *s,
                            remote_sig: sig.to_string(),
                            hash: String::new(),
                        },
                    )
                })
                .collect(),
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("noteriv-webdav-unit-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ── Reading the server's answers ──

    #[test]
    fn a_self_closing_collection_tag_marks_a_folder() {
        // The shape Nextcloud, Apache and the standard's own examples use.
        let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/Daily%20Notes/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype><d:getetag>"abc"</d:getetag></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/Inbox.md</d:href>
    <d:propstat><d:prop><d:resourcetype/><d:getlastmodified>Thu, 12 Nov 2026 19:35:45 GMT</d:getlastmodified><d:getetag>"e1"</d:getetag><d:getcontentlength>8</d:getcontentlength></d:prop></d:propstat>
  </d:response>
</d:multistatus>"#;
        let entries = parse_propfind(xml);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].is_dir);
        assert!(entries[1].is_dir);
        assert_eq!(
            entries[1].path,
            "/remote.php/dav/files/alice/Noteriv/Daily Notes/"
        );
        assert!(!entries[2].is_dir);
        assert_eq!(entries[2].to_remote_file().sig, "etag:\"e1\"");
        assert!(entries[2].to_remote_file().mtime_ms > 0);
    }

    #[test]
    fn a_collection_written_as_an_open_and_close_tag_also_marks_a_folder() {
        let xml = r#"<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/x/</D:href>
<D:propstat><D:prop><D:resourcetype><D:collection></D:collection></D:resourcetype></D:prop></D:propstat>
</D:response></D:multistatus>"#;
        assert!(parse_propfind(xml)[0].is_dir);
    }

    #[test]
    fn full_addresses_are_reduced_to_a_decoded_path() {
        let xml = r#"<D:multistatus xmlns:D="DAV:"><D:response>
<D:href>https://cloud.example.com/dav/Caf%C3%A9/C%23%20basics.md</D:href>
<D:propstat><D:prop><D:getlastmodified>2026-11-12T19:35:45Z</D:getlastmodified><D:getcontentlength>4</D:getcontentlength></D:prop></D:propstat>
</D:response></D:multistatus>"#;
        let entries = parse_propfind(xml);
        assert_eq!(entries[0].path, "/dav/Café/C# basics.md");
        // No ETag: the time and size stand in for it.
        assert_eq!(entries[0].to_remote_file().sig, "lm:2026-11-12T19:35:45Z|4");
    }

    #[test]
    fn only_the_first_address_in_a_response_names_the_entry() {
        let xml = r#"<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/a.md</D:href>
<D:propstat><D:prop><D:owner><D:href>/principals/alice</D:href></D:owner></D:prop></D:propstat>
</D:response></D:multistatus>"#;
        assert_eq!(parse_propfind(xml)[0].path, "/dav/a.md");
    }

    // ── Paths and addresses ──

    #[test]
    fn special_characters_in_names_are_sent_as_part_of_the_name() {
        let root = "http://host/dav/Noteriv";
        assert_eq!(
            file_url(root, "C# basics.md"),
            "http://host/dav/Noteriv/C%23%20basics.md"
        );
        assert_eq!(
            file_url(root, "What now?.md"),
            "http://host/dav/Noteriv/What%20now%3F.md"
        );
        assert_eq!(
            file_url(root, "100% done.md"),
            "http://host/dav/Noteriv/100%25%20done.md"
        );
        assert_eq!(
            file_url(root, "Café/Résumé.md"),
            "http://host/dav/Noteriv/Caf%C3%A9/R%C3%A9sum%C3%A9.md"
        );
        assert_eq!(
            dir_url(root, "Daily Notes"),
            "http://host/dav/Noteriv/Daily%20Notes/"
        );
        assert_eq!(dir_url(root, ""), "http://host/dav/Noteriv/");
        // What the server sends back decodes to the same name.
        assert_eq!(
            decoded_path(&file_url(root, "C# basics.md")),
            "/dav/Noteriv/C# basics.md"
        );
    }

    #[test]
    fn the_remote_path_becomes_part_of_the_address() {
        let cfg = |url: &str, path: &str| WebDavConfig {
            url: url.into(),
            username: "u".into(),
            password: "p".into(),
            remote_path: path.into(),
            filter: SyncFilter::default(),
            encryption_password: None,
        };
        assert_eq!(
            root_url(&cfg("https://c.example/dav/", "/Noteriv")).unwrap(),
            "https://c.example/dav/Noteriv"
        );
        assert_eq!(
            root_url(&cfg("https://c.example/dav", "Noteriv/")).unwrap(),
            "https://c.example/dav/Noteriv"
        );
        assert_eq!(
            root_url(&cfg("https://c.example/dav", "/")).unwrap(),
            "https://c.example/dav"
        );
        assert_eq!(
            root_url(&cfg("https://c.example/dav", "/My Notes/Deep Vault")).unwrap(),
            "https://c.example/dav/My%20Notes/Deep%20Vault"
        );
        assert!(root_url(&cfg("not an address", "/")).is_err());
        assert!(root_url(&cfg("ftp://c.example/dav", "/")).is_err());
    }

    #[test]
    fn a_path_is_made_relative_by_removing_the_folder_once() {
        assert_eq!(
            rel_under("/dav/My Notes/", "/dav/My Notes"),
            Some(String::new())
        );
        assert_eq!(
            rel_under("/dav/My Notes/One.md", "/dav/My Notes/"),
            Some("One.md".into())
        );
        // A folder that repeats its parent's name keeps its own.
        assert_eq!(rel_under("/a/a/x.md", "/a"), Some("a/x.md".into()));
        assert_eq!(rel_under("/elsewhere/x.md", "/dav"), None);
        assert_eq!(rel_under("/davinci/x.md", "/dav"), None);
    }

    #[test]
    fn names_that_could_leave_the_vault_are_refused() {
        for bad in [
            "",
            "../x.md",
            "a/../b.md",
            "a/./b.md",
            "a//b.md",
            "a\\b.md",
            "/abs.md",
        ] {
            assert!(!safe_rel(bad), "{bad:?} should be refused");
        }
        for good in [
            "x.md",
            "a/b.md",
            "C# basics.md",
            "Café/Résumé.md",
            "..hidden/x.md",
        ] {
            assert!(safe_rel(good), "{good:?} should be allowed");
        }
    }

    #[test]
    fn notes_and_attachments_are_synced_but_not_everything() {
        for yes in [
            "a.md",
            "a.MD",
            "x/board.canvas",
            "s.drawing",
            "p.png",
            "p.JPG",
            "d.pdf",
            "t.txt",
            "c.css",
        ] {
            assert!(is_synced_file(yes), "{yes}");
        }
        for no in [
            "C",
            "Meeting ",
            "a.tmp",
            "movie.mp4",
            "x.noteriv-part",
            ".DS_Store",
        ] {
            assert!(!is_synced_file(no), "{no}");
        }
    }

    // ── Deciding what to do ──

    #[test]
    fn nothing_changed_means_nothing_to_do() {
        let l = locals(&[("a.md", 10, 5), ("d/b.md", 20, 7)]);
        let r = remotes(&[("a.md", "s1"), ("d/b.md", "s2")]);
        let rec = record(&[("a.md", 10, 5, "s1"), ("d/b.md", 20, 7, "s2")]);
        assert!(plan(&l, &r, Some(&rec)).is_empty());
    }

    #[test]
    fn the_server_clock_plays_no_part_in_spotting_a_change() {
        // The local file is "older" than anything the server could report, and
        // still counts as changed, because it differs from the record.
        let l = locals(&[("a.md", 1, 9)]);
        let r = remotes(&[("a.md", "s1")]);
        let rec = record(&[("a.md", 10, 5, "s1")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::Upload("a.md".into())]
        );
    }

    #[test]
    fn an_edit_on_one_side_goes_to_the_other() {
        let rec = record(&[("a.md", 10, 5, "s1"), ("b.md", 10, 5, "s1")]);
        let l = locals(&[("a.md", 11, 5), ("b.md", 10, 5)]);
        let r = remotes(&[("a.md", "s1"), ("b.md", "s2")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![
                Action::Upload("a.md".into()),
                Action::Download("b.md".into())
            ]
        );
    }

    #[test]
    fn an_edit_on_both_sides_is_a_conflict() {
        let rec = record(&[("a.md", 10, 5, "s1")]);
        let l = locals(&[("a.md", 11, 6)]);
        let r = remotes(&[("a.md", "s2")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::Conflict("a.md".into())]
        );
    }

    #[test]
    fn new_files_are_copied_across() {
        let rec = record(&[("old.md", 1, 1, "s")]);
        let l = locals(&[("old.md", 1, 1), ("mine.md", 5, 5)]);
        let r = remotes(&[("old.md", "s"), ("theirs.md", "t")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![
                Action::Upload("mine.md".into()),
                Action::Download("theirs.md".into())
            ]
        );
    }

    #[test]
    fn without_a_record_nothing_is_deleted_and_shared_files_are_compared() {
        let l = locals(&[("both.md", 1, 1), ("mine.md", 1, 1)]);
        let r = remotes(&[("both.md", "s"), ("theirs.md", "t")]);
        let actions = plan(&l, &r, None);
        assert_eq!(
            actions,
            vec![
                Action::Compare("both.md".into()),
                Action::Upload("mine.md".into()),
                Action::Download("theirs.md".into()),
            ]
        );
    }

    #[test]
    fn a_note_deleted_here_is_removed_from_the_server() {
        let rec = record(&[("keep.md", 1, 1, "k"), ("gone.md", 1, 1, "g")]);
        let l = locals(&[("keep.md", 1, 1)]);
        let r = remotes(&[("keep.md", "k"), ("gone.md", "g")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::DeleteRemote("gone.md".into())]
        );
    }

    #[test]
    fn a_note_deleted_on_the_server_goes_to_the_trash_here() {
        let rec = record(&[("keep.md", 1, 1, "k"), ("gone.md", 1, 1, "g")]);
        let l = locals(&[("keep.md", 1, 1), ("gone.md", 1, 1)]);
        let r = remotes(&[("keep.md", "k")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::TrashLocal("gone.md".into())]
        );
    }

    #[test]
    fn an_edit_outranks_a_deletion_on_the_other_side() {
        let rec = record(&[
            ("keep.md", 1, 1, "k"),
            ("a.md", 1, 1, "a"),
            ("b.md", 1, 1, "b"),
        ]);
        // a.md: deleted on the server, edited here. b.md: deleted here, edited on the server.
        let l = locals(&[("keep.md", 1, 1), ("a.md", 2, 2)]);
        let r = remotes(&[("keep.md", "k"), ("b.md", "b2")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![
                Action::Upload("a.md".into()),
                Action::Download("b.md".into())
            ]
        );
    }

    #[test]
    fn an_empty_vault_never_deletes_from_the_server() {
        // Looks like "everything was deleted here", but is far more likely an unmounted drive.
        let rec = record(&[("a.md", 1, 1, "a"), ("b.md", 1, 1, "b")]);
        let l = locals(&[]);
        let r = remotes(&[("a.md", "a"), ("b.md", "b")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![
                Action::Download("a.md".into()),
                Action::Download("b.md".into())
            ]
        );
    }

    #[test]
    fn an_empty_server_gets_everything_again_and_nothing_is_trashed() {
        let rec = record(&[("a.md", 1, 1, "a"), ("b.md", 1, 1, "b")]);
        let l = locals(&[("a.md", 1, 1), ("b.md", 1, 1)]);
        let r = remotes(&[]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::Upload("a.md".into()), Action::Upload("b.md".into())]
        );
    }

    #[test]
    fn a_file_gone_from_both_sides_is_forgotten() {
        let rec = record(&[("keep.md", 1, 1, "k"), ("gone.md", 1, 1, "g")]);
        let l = locals(&[("keep.md", 1, 1)]);
        let r = remotes(&[("keep.md", "k")]);
        assert_eq!(
            plan(&l, &r, Some(&rec)),
            vec![Action::Forget("gone.md".into())]
        );
    }

    // ── The record ──

    #[test]
    fn a_record_is_only_used_for_the_vault_and_server_it_was_written_for() {
        let dir = scratch("record");
        let path = record_path(&dir, "/vault", "server");
        let rec = record(&[("a.md", 1, 2, "s")]);
        save_record(&path, &rec).unwrap();

        let loaded = load_record(&path, "/vault", "server").expect("the matching record loads");
        assert_eq!(loaded.files["a.md"], rec.files["a.md"]);
        assert!(load_record(&path, "/other-vault", "server").is_none());
        assert!(load_record(&path, "/vault", "other-server").is_none());
        // Different vaults and servers get different files in the first place.
        assert_ne!(path, record_path(&dir, "/other-vault", "server"));
        assert_ne!(path, record_path(&dir, "/vault", "other-server"));

        let mut old = rec.clone();
        old.version = RECORD_VERSION + 1;
        save_record(&path, &old).unwrap();
        assert!(load_record(&path, "/vault", "server").is_none());

        fs::write(&path, "{ not json").unwrap();
        assert!(load_record(&path, "/vault", "server").is_none());
        assert!(load_record(&dir.join("missing.json"), "/vault", "server").is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_touched_file_with_the_same_content_is_not_an_edit() {
        let vault = scratch("touched");
        fs::write(vault.join("touched.md"), "same").unwrap();
        fs::write(vault.join("edited.md"), "edit").unwrap();
        let local = list_local(&vault).unwrap();
        // Both files have a new time and the size they had; only one has new content.
        let mut rec = record(&[("touched.md", 1, 4, "s"), ("edited.md", 1, 4, "s")]);
        rec.files.get_mut("touched.md").unwrap().hash = content_hash(b"same");
        rec.files.get_mut("edited.md").unwrap().hash = content_hash(b"orig");
        settle_touched_files(&vault, &local, &mut rec);

        let remote = remotes(&[("touched.md", "s"), ("edited.md", "s")]);
        assert_eq!(
            plan(&local, &remote, Some(&rec)),
            vec![Action::Upload("edited.md".into())]
        );
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn only_a_strong_etag_is_used_to_guard_an_upload() {
        assert_eq!(strong_etag("\"abc\""), Some("\"abc\"".to_string()));
        assert_eq!(strong_etag("abc"), Some("\"abc\"".to_string()));
        assert_eq!(strong_etag("W/\"abc\""), None);
        assert_eq!(strong_etag("  "), None);
    }

    // ── Local files ──

    #[test]
    fn conflict_copies_get_a_name_next_to_the_note() {
        let free = |_: &str| false;
        assert_eq!(
            conflict_rel("Note.md", "2026-11-12 14-30-05", &free),
            "Note (conflict 2026-11-12 14-30-05).md"
        );
        assert_eq!(
            conflict_rel("Daily Notes/v1.2 plan.md", "S", &free),
            "Daily Notes/v1.2 plan (conflict S).md"
        );
        assert_eq!(conflict_rel("noext", "S", &free), "noext (conflict S)");
        let taken = |name: &str| name == "Note (conflict S).md";
        assert_eq!(
            conflict_rel("Note.md", "S", &taken),
            "Note (conflict S 2).md"
        );
        assert!(is_synced_file(&conflict_rel("Note.md", "S", &free)));
    }

    #[test]
    fn a_download_leaves_a_file_alone_if_it_changed_since_it_was_listed() {
        let vault = scratch("write");
        fs::write(vault.join("a.md"), "edited while syncing").unwrap();
        let listed = LocalFile {
            mtime_ms: 1,
            size: 3,
        };
        let written =
            write_local_if_unchanged(&vault, "a.md", b"from server", Some(&listed)).unwrap();
        assert!(written.is_none());
        assert_eq!(
            fs::read_to_string(vault.join("a.md")).unwrap(),
            "edited while syncing"
        );

        // Unchanged since the listing: replaced, and no temporary file is left behind.
        let listed = stat_local(&vault.join("a.md")).unwrap();
        let written =
            write_local_if_unchanged(&vault, "a.md", b"from server", Some(&listed)).unwrap();
        assert!(written.is_some());
        assert_eq!(
            fs::read_to_string(vault.join("a.md")).unwrap(),
            "from server"
        );
        // A new file in a new folder.
        assert!(
            write_local_if_unchanged(&vault, "New Folder/b.md", b"x", None)
                .unwrap()
                .is_some()
        );
        let names: Vec<String> = list_local(&vault).unwrap().keys().cloned().collect();
        assert_eq!(
            names,
            vec!["New Folder/b.md".to_string(), "a.md".to_string()]
        );
        assert!(!vault.join("a.md.noteriv-part").exists());
        let _ = fs::remove_dir_all(&vault);
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_that_cannot_be_read_stops_the_listing() {
        use std::os::unix::fs::PermissionsExt;
        let vault = scratch("unreadable");
        fs::create_dir_all(vault.join("Locked")).unwrap();
        fs::write(vault.join("Locked/Inside.md"), "x").unwrap();
        fs::write(vault.join("Open.md"), "x").unwrap();
        assert_eq!(list_local(&vault).unwrap().len(), 2);

        // Skipping the folder would make Locked/Inside.md look deleted.
        fs::set_permissions(vault.join("Locked"), fs::Permissions::from_mode(0o000)).unwrap();
        let err = list_local(&vault).unwrap_err();
        assert!(
            err.contains("Locked") && err.contains("nothing was synced"),
            "{err}"
        );

        // A link whose target is gone is an error too, not a deleted note.
        fs::set_permissions(vault.join("Locked"), fs::Permissions::from_mode(0o755)).unwrap();
        std::os::unix::fs::symlink(vault.join("nowhere.md"), vault.join("Dangling.md")).unwrap();
        assert!(list_local(&vault).is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn a_trashed_note_uses_the_layout_the_trash_view_reads() {
        let vault = scratch("trash");
        fs::create_dir_all(vault.join("Projects")).unwrap();
        fs::write(vault.join("Projects/Plan.md"), "plan").unwrap();
        let listed = stat_local(&vault.join("Projects/Plan.md")).unwrap();

        // Changed since the listing: kept.
        let stale = LocalFile {
            mtime_ms: listed.mtime_ms + 1,
            size: listed.size,
        };
        assert!(!move_to_trash_if_unchanged(&vault, "Projects/Plan.md", &stale).unwrap());
        assert!(vault.join("Projects/Plan.md").exists());

        assert!(move_to_trash_if_unchanged(&vault, "Projects/Plan.md", &listed).unwrap());
        assert!(!vault.join("Projects/Plan.md").exists());
        let trash = vault.join(".noteriv").join("trash");
        let mut names: Vec<String> = fs::read_dir(&trash)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names.len(), 2);
        assert!(names[0].ends_with("-Plan.md"));
        assert_eq!(names[1], format!("{}.meta.json", names[0]));
        assert_eq!(fs::read_to_string(trash.join(&names[0])).unwrap(), "plan");
        let meta: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(trash.join(&names[1])).unwrap()).unwrap();
        assert_eq!(meta["fileName"], "Plan.md");
        assert!(meta["originalPath"].as_str().unwrap().ends_with("Plan.md"));
        assert!(meta["deletedAt"].as_str().unwrap().ends_with('Z'));
        // The trash itself is never synced.
        assert!(list_local(&vault).unwrap().is_empty());
        let _ = fs::remove_dir_all(&vault);
    }
}

// ============================================================
// Tests against a live server
// ============================================================
//
// Not part of the normal run: they need a WebDAV server, so they are ignored.
// Each test plays one or two devices syncing through the server.
//
//   NOTERIV_WEBDAV_URL=http://127.0.0.1:8099 NOTERIV_WEBDAV_USER=... NOTERIV_WEBDAV_PASS=... \
//   cargo test --lib sync_webdav::live -- --ignored --test-threads=1

#[cfg(test)]
mod live {
    use super::*;
    use std::env;
    use std::sync::OnceLock;

    fn var(name: &str) -> String {
        env::var(name).unwrap_or_else(|_| panic!("{name} is not set"))
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Runtime::new().unwrap()
    }

    /// A folder on the server that only this test run uses.
    fn prefix() -> &'static str {
        static PREFIX: OnceLock<String> = OnceLock::new();
        PREFIX.get_or_init(|| format!("noteriv-live-{}", now_ms()))
    }

    fn cfg(remote: &str) -> WebDavConfig {
        WebDavConfig {
            url: var("NOTERIV_WEBDAV_URL"),
            username: var("NOTERIV_WEBDAV_USER"),
            password: var("NOTERIV_WEBDAV_PASS"),
            remote_path: format!("/{}/{remote}", prefix()),
            filter: SyncFilter::default(),
            encryption_password: None,
        }
    }

    /// Some servers only tell two versions of a file apart by the second.
    fn pause() {
        std::thread::sleep(std::time::Duration::from_millis(1100));
    }

    fn counts(o: &Outcome) -> (usize, usize, usize, usize) {
        (o.pushed, o.pulled, o.deleted, o.conflicts)
    }

    /// One device: a vault folder and this machine's records for it.
    struct Device {
        vault: PathBuf,
        records: PathBuf,
    }

    impl Device {
        fn new(name: &str) -> Device {
            let base = env::temp_dir()
                .join(format!("noteriv-webdav-live-{}", std::process::id()))
                .join(name);
            let _ = fs::remove_dir_all(&base);
            let device = Device {
                vault: base.join("vault"),
                records: base.join("records"),
            };
            fs::create_dir_all(&device.vault).unwrap();
            device
        }

        fn sync(&self, remote: &str) -> Outcome {
            rt().block_on(sync(
                self.vault.to_str().unwrap(),
                cfg(remote),
                &self.records,
            ))
            .expect("the sync runs")
        }

        fn sync_clean(&self, remote: &str) -> Outcome {
            let outcome = self.sync(remote);
            assert!(
                outcome.errors.is_empty(),
                "unexpected errors: {:?}",
                outcome.errors
            );
            outcome
        }

        /// Two more runs with nothing to do: the vault has settled.
        fn assert_idle(&self, remote: &str) {
            for _ in 0..2 {
                assert_eq!(
                    counts(&self.sync_clean(remote)),
                    (0, 0, 0, 0),
                    "a run with nothing changed did something"
                );
            }
        }

        fn write(&self, rel: &str, content: &[u8]) {
            let path = local_path(&self.vault, rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }

        fn read(&self, rel: &str) -> Vec<u8> {
            fs::read(local_path(&self.vault, rel)).unwrap_or_else(|_| panic!("{rel} is missing"))
        }

        fn text(&self, rel: &str) -> String {
            String::from_utf8(self.read(rel)).unwrap()
        }

        fn remove(&self, rel: &str) {
            fs::remove_file(local_path(&self.vault, rel)).unwrap();
        }

        fn tree(&self) -> Vec<String> {
            list_local(&self.vault).unwrap().keys().cloned().collect()
        }
    }

    fn server_tree(remote: &str) -> Vec<String> {
        let cfg = cfg(remote);
        let client = build_client(&cfg).unwrap();
        let root = root_url(&cfg).unwrap();
        rt().block_on(list_remote(&client, &root, &SyncFilter::default()))
            .expect("the server lists the folder")
            .files
            .keys()
            .cloned()
            .collect()
    }

    fn server_put(remote: &str, rel: &str, bytes: &[u8]) {
        let cfg = cfg(remote);
        let client = build_client(&cfg).unwrap();
        let root = root_url(&cfg).unwrap();
        rt().block_on(async {
            ensure_root(&client, &cfg).await.unwrap();
            put(
                &client,
                &file_url(&root, rel),
                bytes.to_vec(),
                &Expect::Anything,
            )
            .await
            .unwrap();
        });
    }

    fn server_get(remote: &str, rel: &str) -> Vec<u8> {
        let cfg = cfg(remote);
        let client = build_client(&cfg).unwrap();
        let root = root_url(&cfg).unwrap();
        rt().block_on(get(&client, &file_url(&root, rel))).unwrap()
    }

    #[test]
    #[ignore]
    fn connection_test_accepts_good_details_and_creates_the_folder() {
        rt().block_on(test_connection(cfg("conn/not/created/yet")))
            .expect("a missing folder is created");
        assert!(server_tree("conn/not/created/yet").is_empty());

        let mut wrong = cfg("conn");
        wrong.password = "wrong".into();
        let err = rt().block_on(test_connection(wrong)).unwrap_err();
        assert!(err.contains("username or password"), "{err}");
    }

    #[test]
    #[ignore]
    fn a_vault_reaches_a_second_device_and_then_stays_quiet() {
        let a = Device::new("s2-a");
        let b = Device::new("s2-b");
        a.write("Inbox.md", b"inbox");
        a.write("notes.txt", b"notes");
        a.write("Projects/Plan.md", b"plan");
        a.write("Projects/Deep/Idea.md", b"idea");

        assert_eq!(counts(&a.sync_clean("s2")), (4, 0, 0, 0));
        assert_eq!(server_tree("s2"), a.tree());
        a.assert_idle("s2");

        assert_eq!(counts(&b.sync_clean("s2")), (0, 4, 0, 0));
        assert_eq!(b.tree(), a.tree());
        for file in a.tree() {
            assert_eq!(a.read(&file), b.read(&file), "{file}");
        }
        b.assert_idle("s2");
        a.assert_idle("s2");
    }

    #[test]
    #[ignore]
    fn edits_travel_in_both_directions() {
        let a = Device::new("s3-a");
        let b = Device::new("s3-b");
        a.write("Note.md", b"v1");
        a.write("Other/Second.md", b"one");
        a.sync_clean("s3");
        b.sync_clean("s3");

        pause();
        a.write("Note.md", b"v2 from a");
        assert_eq!(counts(&a.sync_clean("s3")), (1, 0, 0, 0));
        assert_eq!(counts(&b.sync_clean("s3")), (0, 1, 0, 0));
        assert_eq!(b.text("Note.md"), "v2 from a");

        pause();
        b.write("Other/Second.md", b"two from b");
        b.write("Other/New here.md", b"made on b");
        assert_eq!(counts(&b.sync_clean("s3")), (2, 0, 0, 0));
        assert_eq!(counts(&a.sync_clean("s3")), (0, 2, 0, 0));
        assert_eq!(a.text("Other/Second.md"), "two from b");
        assert_eq!(a.text("Other/New here.md"), "made on b");
        a.assert_idle("s3");
        b.assert_idle("s3");
    }

    #[test]
    #[ignore]
    fn names_with_special_characters_keep_their_names() {
        let a = Device::new("s4-a");
        let b = Device::new("s4-b");
        let mut names = vec![
            "C# basics.md",
            "Meeting #3.md",
            "100% done.md",
            "Daily Notes/2026-11-12.md",
            "Café/Résumé.md",
            "[draft] plan (v2).md",
            "a+b & c = d.md",
            "it's ~ok!.md",
        ];
        if !cfg!(windows) {
            names.push("What now?.md");
        }
        for name in &names {
            a.write(name, name.as_bytes());
        }
        let mut expected: Vec<String> = names.iter().map(|n| n.to_string()).collect();
        expected.sort();

        assert_eq!(a.sync_clean("s4").pushed, names.len());
        assert_eq!(server_tree("s4"), expected);
        a.assert_idle("s4");

        assert_eq!(b.sync_clean("s4").pulled, names.len());
        assert_eq!(b.tree(), expected);
        for name in &names {
            assert_eq!(b.text(name), *name);
        }
        b.assert_idle("s4");
    }

    #[test]
    #[ignore]
    fn attachments_arrive_byte_for_byte() {
        let a = Device::new("s5-a");
        let b = Device::new("s5-b");
        let binary: Vec<u8> = (0..=255u8).cycle().take(70_000).collect();
        let synced = [
            "Board.canvas",
            "Sketch.drawing",
            "anim.gif",
            "icon.svg",
            "img/pic.png",
            "paper.pdf",
            "photo.jpg",
            "shot.webp",
        ];
        for name in synced {
            a.write(name, &binary);
        }
        // Left on this device: not a type the vault syncs.
        a.write("movie.mp4", &binary);
        a.write("scratch.tmp", &binary);

        assert_eq!(a.sync_clean("s5").pushed, synced.len());
        assert_eq!(server_tree("s5"), synced);
        assert_eq!(b.sync_clean("s5").pulled, synced.len());
        for name in synced {
            assert_eq!(b.read(name), binary, "{name}");
        }
        a.assert_idle("s5");
        b.assert_idle("s5");
    }

    #[test]
    #[ignore]
    fn a_deleted_note_stays_deleted_everywhere() {
        let a = Device::new("s6-a");
        let b = Device::new("s6-b");
        a.write("Keep.md", b"keep");
        a.write("Gone.md", b"gone");
        a.write("Folder/Also gone.md", b"also gone");
        a.sync_clean("s6");
        b.sync_clean("s6");

        a.remove("Gone.md");
        a.remove("Folder/Also gone.md");
        assert_eq!(counts(&a.sync_clean("s6")), (0, 0, 2, 0));
        assert_eq!(server_tree("s6"), ["Keep.md"]);
        a.assert_idle("s6");
        assert_eq!(a.tree(), ["Keep.md"], "the deleted notes came back");

        // The other device loses them too, but can restore them from its trash.
        assert_eq!(counts(&b.sync_clean("s6")), (0, 0, 2, 0));
        assert_eq!(b.tree(), ["Keep.md"]);
        let trashed = fs::read_dir(b.vault.join(".noteriv").join("trash"))
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".meta.json"))
            .count();
        assert_eq!(trashed, 2);
        b.assert_idle("s6");
    }

    #[test]
    #[ignore]
    fn an_edit_on_one_device_survives_a_deletion_on_another() {
        let a = Device::new("s7-a");
        let b = Device::new("s7-b");
        a.write("X.md", b"v1");
        a.write("Keep.md", b"keep");
        a.sync_clean("s7");
        b.sync_clean("s7");

        pause();
        a.remove("X.md");
        b.write("X.md", b"edited on b");
        assert_eq!(counts(&a.sync_clean("s7")), (0, 0, 1, 0));
        assert_eq!(counts(&b.sync_clean("s7")), (1, 0, 0, 0));
        assert_eq!(counts(&a.sync_clean("s7")), (0, 1, 0, 0));
        assert_eq!(a.text("X.md"), "edited on b");
        a.assert_idle("s7");
        b.assert_idle("s7");
    }

    #[test]
    #[ignore]
    fn the_same_note_edited_on_two_devices_keeps_both_versions() {
        let a = Device::new("s8-a");
        let b = Device::new("s8-b");
        a.write("Both.md", b"original");
        a.sync_clean("s8");
        b.sync_clean("s8");

        pause();
        a.write("Both.md", b"edit from a");
        pause();
        b.write("Both.md", b"edit from b");
        assert_eq!(counts(&a.sync_clean("s8")), (1, 0, 0, 0));

        let outcome = b.sync_clean("s8");
        assert_eq!(outcome.conflicts, 1);
        let files = b.tree();
        assert_eq!(files.len(), 2, "{files:?}");
        assert!(files.iter().any(|f| f.contains("(conflict ")), "{files:?}");
        // The run names the note and its copy, for the notice in the app.
        assert_eq!(outcome.conflict_copies.len(), 1);
        let reported = &outcome.conflict_copies[0];
        assert_eq!(reported.note, "Both.md");
        assert!(reported.in_vault);
        assert!(files.contains(&reported.copy), "{} not in {files:?}", reported.copy);
        let mut versions: Vec<String> = files.iter().map(|f| b.text(f)).collect();
        versions.sort();
        assert_eq!(versions, ["edit from a", "edit from b"]);
        b.assert_idle("s8");

        // The first device ends up with both versions as well.
        a.sync_clean("s8");
        assert_eq!(a.tree(), b.tree());
        for file in a.tree() {
            assert_eq!(a.read(&file), b.read(&file), "{file}");
        }
        a.assert_idle("s8");
    }

    #[test]
    #[ignore]
    fn the_first_run_after_upgrading_adopts_matching_files_without_copying() {
        let a = Device::new("s9-a");
        a.write("One.md", b"one");
        a.write("Two.md", b"two");
        a.write("Folder/Three.md", b"three");
        a.sync_clean("s9");

        // What an upgraded install looks like: the same files on both sides and no record.
        fs::remove_dir_all(&a.records).unwrap();
        assert_eq!(counts(&a.sync_clean("s9")), (0, 0, 0, 0));
        assert_eq!(a.tree().len(), 3);
        assert_eq!(server_tree("s9").len(), 3);
        a.assert_idle("s9");
    }

    #[test]
    #[ignore]
    fn the_first_run_after_upgrading_keeps_both_versions_of_a_file_that_differs() {
        let a = Device::new("s10-a");
        a.write("Same.md", b"same");
        a.write("Diff.md", b"server version");
        a.sync_clean("s10");

        pause();
        fs::remove_dir_all(&a.records).unwrap();
        a.write("Diff.md", b"local version");
        let outcome = a.sync_clean("s10");
        assert_eq!(outcome.conflicts, 1);
        let files = a.tree();
        assert_eq!(files.len(), 3, "{files:?}");
        let mut versions: Vec<String> = files
            .iter()
            .filter(|f| f.starts_with("Diff"))
            .map(|f| a.text(f))
            .collect();
        versions.sort();
        assert_eq!(versions, ["local version", "server version"]);
        assert_eq!(server_tree("s10"), files);
        a.assert_idle("s10");
    }

    #[test]
    #[ignore]
    fn an_edit_is_not_lost_when_the_server_clock_runs_ahead() {
        let a = Device::new("s11-a");
        let b = Device::new("s11-b");
        a.write("Note.md", b"v1");
        a.sync_clean("s11");
        b.sync_clean("s11");

        pause();
        a.write("Note.md", b"v2, written just after the upload");
        // How the edit looks on a machine whose clock is an hour behind the server's:
        // older than the copy the server already has.
        let an_hour_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        fs::File::options()
            .write(true)
            .open(local_path(&a.vault, "Note.md"))
            .unwrap()
            .set_modified(an_hour_ago)
            .unwrap();

        assert_eq!(counts(&a.sync_clean("s11")), (1, 0, 0, 0));
        assert_eq!(a.text("Note.md"), "v2, written just after the upload");
        b.sync_clean("s11");
        assert_eq!(b.text("Note.md"), "v2, written just after the upload");
        a.assert_idle("s11");
    }

    #[test]
    #[ignore]
    fn a_touched_note_is_not_sent_again() {
        let a = Device::new("s16-a");
        a.write("Note.md", b"unchanged");
        a.sync_clean("s16");

        let later = std::time::SystemTime::now() + std::time::Duration::from_secs(90);
        fs::File::options()
            .write(true)
            .open(local_path(&a.vault, "Note.md"))
            .unwrap()
            .set_modified(later)
            .unwrap();
        assert_eq!(counts(&a.sync_clean("s16")), (0, 0, 0, 0));
        a.assert_idle("s16");
    }

    #[test]
    #[ignore]
    fn a_same_length_edit_made_straight_after_an_upload_still_reaches_other_devices() {
        let a = Device::new("s17-a");
        let b = Device::new("s17-b");
        a.write("Note.md", b"aaaa");
        a.sync_clean("s17");
        b.sync_clean("s17");

        // No pause: on a server that tells versions apart by the second and the
        // size, this upload looks just like the one before it.
        a.write("Note.md", b"bbbb");
        assert_eq!(counts(&a.sync_clean("s17")), (1, 0, 0, 0));
        assert_eq!(counts(&b.sync_clean("s17")), (0, 1, 0, 0));
        assert_eq!(b.text("Note.md"), "bbbb");
        a.assert_idle("s17");
        b.assert_idle("s17");
    }

    #[test]
    #[ignore]
    fn a_note_another_device_changes_mid_sync_is_not_overwritten() {
        let a = Device::new("s18-a");
        let b = Device::new("s18-b");
        a.write("Race.md", b"original");
        a.sync_clean("s18");
        b.sync_clean("s18");

        pause();
        b.write("Race.md", b"edit from b");
        // Device b has looked at the server and decided to upload…
        let prepared = rt()
            .block_on(prepare(b.vault.to_str().unwrap(), &cfg("s18"), &b.records))
            .unwrap();
        assert_eq!(prepared.actions, vec![Action::Upload("Race.md".into())]);
        // …and before it does, device a uploads an edit of its own.
        a.write("Race.md", b"an edit from a");
        assert_eq!(counts(&a.sync_clean("s18")), (1, 0, 0, 0));

        let outcome = rt().block_on(execute(prepared)).unwrap();
        assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
        assert_eq!(
            outcome.pushed, 0,
            "device b overwrote the other device's edit"
        );
        assert_eq!(server_get("s18", "Race.md"), b"an edit from a");

        // On its next run device b sees both edits and keeps both.
        pause();
        assert_eq!(b.sync_clean("s18").conflicts, 1);
        let mut versions: Vec<String> = b.tree().iter().map(|f| b.text(f)).collect();
        versions.sort();
        assert_eq!(versions, ["an edit from a", "edit from b"]);
        b.assert_idle("s18");
    }

    #[test]
    #[ignore]
    fn a_remote_path_with_spaces_and_several_levels_works() {
        let remote = "My Notes/Deep Vault";
        let a = Device::new("s12-a");
        let b = Device::new("s12-b");
        a.write("One.md", b"one");
        a.write("Sub Folder/Two.md", b"two");

        assert_eq!(counts(&a.sync_clean(remote)), (2, 0, 0, 0));
        a.assert_idle(remote);
        assert_eq!(counts(&b.sync_clean(remote)), (0, 2, 0, 0));
        b.assert_idle(remote);
        assert_eq!(a.tree(), ["One.md", "Sub Folder/Two.md"]);
        assert_eq!(b.tree(), a.tree());
        assert_eq!(server_tree(remote), a.tree());
    }

    #[test]
    #[ignore]
    fn an_emptied_vault_gets_its_notes_back_instead_of_wiping_the_server() {
        let a = Device::new("s13-a");
        for name in ["One.md", "Two.md", "Folder/Three.md"] {
            a.write(name, name.as_bytes());
        }
        a.sync_clean("s13");

        // What a vault on an unmounted drive looks like.
        for name in ["One.md", "Two.md", "Folder/Three.md"] {
            a.remove(name);
        }
        assert_eq!(counts(&a.sync_clean("s13")), (0, 3, 0, 0));
        assert_eq!(server_tree("s13").len(), 3);
        assert_eq!(a.tree().len(), 3);
    }

    #[cfg(unix)]
    #[test]
    #[ignore]
    fn one_unreadable_file_does_not_stop_the_others() {
        use std::os::unix::fs::PermissionsExt;
        let a = Device::new("s14-a");
        a.write("Bad.md", b"cannot be read");
        a.write("Good.md", b"good");
        a.write("More/Fine.md", b"fine");
        let bad = local_path(&a.vault, "Bad.md");
        fs::set_permissions(&bad, fs::Permissions::from_mode(0o000)).unwrap();

        let outcome = a.sync("s14");
        assert_eq!(outcome.pushed, 2);
        assert_eq!(outcome.errors.len(), 1, "{:?}", outcome.errors);
        assert!(
            outcome.errors[0].starts_with("Bad.md: "),
            "{:?}",
            outcome.errors
        );
        assert_eq!(server_tree("s14"), ["Good.md", "More/Fine.md"]);

        // Once it can be read it goes up on the next run; nothing else is sent again.
        fs::set_permissions(&bad, fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(counts(&a.sync_clean("s14")), (1, 0, 0, 0));
        a.assert_idle("s14");
    }

    #[cfg(unix)]
    #[test]
    #[ignore]
    fn an_unreadable_folder_stops_the_sync_instead_of_deleting_its_notes() {
        use std::os::unix::fs::PermissionsExt;
        let a = Device::new("s19-a");
        a.write("Open.md", b"open");
        a.write("Locked/Inside.md", b"inside");
        a.write("Locked/Deeper/Too.md", b"too");
        a.sync_clean("s19");
        assert_eq!(server_tree("s19").len(), 3);

        let locked = local_path(&a.vault, "Locked");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = rt().block_on(sync(a.vault.to_str().unwrap(), cfg("s19"), &a.records));
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();

        let err = result.expect_err("the sync should refuse to run");
        assert!(err.contains("nothing was synced"), "{err}");
        assert_eq!(
            server_tree("s19").len(),
            3,
            "notes in the unreadable folder were deleted from the server"
        );
        a.assert_idle("s19");
    }

    #[test]
    #[ignore]
    fn files_left_on_the_server_by_older_versions_are_left_alone() {
        // Older versions cut "C# basics.md" down to "C" when uploading.
        server_put("s15", "C", b"left by an older version");
        let a = Device::new("s15-a");
        a.write("C# basics.md", b"csharp");

        assert_eq!(counts(&a.sync_clean("s15")), (1, 0, 0, 0));
        assert_eq!(a.tree(), ["C# basics.md"]);
        assert_eq!(server_tree("s15"), ["C# basics.md"]);
        assert_eq!(server_get("s15", "C"), b"left by an older version");
        a.assert_idle("s15");
    }

    // ── Encryption and choosing what to sync ──

    impl Device {
        fn try_sync_as(
            &self,
            remote: &str,
            change: impl Fn(&mut WebDavConfig),
        ) -> Result<Outcome, String> {
            let mut cfg = cfg(remote);
            change(&mut cfg);
            rt().block_on(sync(self.vault.to_str().unwrap(), cfg, &self.records))
        }
    }

    fn encrypted(password: &'static str) -> impl Fn(&mut WebDavConfig) {
        move |cfg| cfg.encryption_password = Some(password.into())
    }

    fn server_has(remote: &str, rel: &str) -> bool {
        let cfg = cfg(remote);
        let client = build_client(&cfg).unwrap();
        let root = root_url(&cfg).unwrap();
        rt().block_on(stat_remote(&client, &root, rel))
            .expect("the server answers")
            .is_some()
    }

    fn holds(bytes: &[u8], text: &[u8]) -> bool {
        bytes.windows(text.len()).any(|window| window == text)
    }

    #[test]
    #[ignore = "needs a WebDAV server; see the module docs"]
    fn an_encrypted_folder_holds_no_readable_note_and_a_second_device_reads_it() {
        let remote = "enc-round-trip";
        let a = Device::new("enc-a");
        let b = Device::new("enc-b");
        a.write("Note.md", b"secret text");
        a.write("Sub/Other.md", b"more secrets");

        let first = a.try_sync_as(remote, encrypted("pw one")).unwrap();
        assert!(first.errors.is_empty(), "{:?}", first.errors);
        assert_eq!(counts(&first), (2, 0, 0, 0));
        let raw = server_get(remote, "Note.md");
        assert!(crate::sync_crypto::is_encrypted(&raw));
        assert!(!holds(&raw, b"secret"));
        assert!(server_has(remote, KEY_FILE));
        // The key file is not a note: it is not listed and not brought into a vault.
        assert_eq!(server_tree(remote), ["Note.md", "Sub/Other.md"]);

        let second = b.try_sync_as(remote, encrypted("pw one")).unwrap();
        assert!(second.errors.is_empty(), "{:?}", second.errors);
        assert_eq!(counts(&second), (0, 2, 0, 0));
        assert_eq!(b.text("Note.md"), "secret text");
        assert_eq!(b.text("Sub/Other.md"), "more secrets");
        assert_eq!(b.tree(), ["Note.md", "Sub/Other.md"]);

        // Nothing to do afterwards, although an encrypted upload never looks the same twice.
        for device in [&a, &b] {
            for _ in 0..2 {
                let idle = device.try_sync_as(remote, encrypted("pw one")).unwrap();
                assert_eq!(counts(&idle), (0, 0, 0, 0), "{:?}", idle.errors);
            }
        }

        pause();
        b.write("Note.md", b"edited secret");
        assert_eq!(counts(&b.try_sync_as(remote, encrypted("pw one")).unwrap()), (1, 0, 0, 0));
        assert_eq!(counts(&a.try_sync_as(remote, encrypted("pw one")).unwrap()), (0, 1, 0, 0));
        assert_eq!(a.text("Note.md"), "edited secret");
        assert!(!holds(&server_get(remote, "Note.md"), b"edited"));
    }

    #[test]
    #[ignore = "needs a WebDAV server; see the module docs"]
    fn a_wrong_password_or_none_changes_nothing_on_either_side() {
        let remote = "enc-wrong-password";
        let a = Device::new("enc-owner");
        a.write("Note.md", b"secret text");
        a.try_sync_as(remote, encrypted("the right one")).unwrap();
        let on_server = server_get(remote, "Note.md");

        let c = Device::new("enc-stranger");
        c.write("Local.md", b"local only");
        let wrong = c.try_sync_as(remote, encrypted("not it")).unwrap_err();
        assert!(wrong.contains("password"), "{wrong}");
        let none = c.try_sync_as(remote, |_| {}).unwrap_err();
        assert!(none.contains("encrypted"), "{none}");

        assert_eq!(c.tree(), ["Local.md"]);
        assert_eq!(c.text("Local.md"), "local only");
        assert_eq!(server_tree(remote), ["Note.md"]);
        assert_eq!(server_get(remote, "Note.md"), on_server);
    }

    #[test]
    #[ignore = "needs a WebDAV server; see the module docs"]
    fn encryption_is_not_started_on_a_folder_that_holds_readable_files() {
        let remote = "enc-refused";
        let a = Device::new("enc-late");
        a.write("Note.md", b"readable");
        a.sync_clean(remote);

        let refused = a.try_sync_as(remote, encrypted("pw")).unwrap_err();
        assert!(refused.contains("not encrypted"), "{refused}");
        assert_eq!(server_get(remote, "Note.md"), b"readable");
        assert!(!server_has(remote, KEY_FILE));
        // Without the password it still syncs as it did.
        a.assert_idle(remote);
    }

    #[test]
    #[ignore = "needs a WebDAV server; see the module docs"]
    fn a_readable_file_put_in_an_encrypted_folder_is_not_taken_into_the_vault() {
        let remote = "enc-planted";
        let a = Device::new("enc-guarded");
        a.write("Note.md", b"secret text");
        a.try_sync_as(remote, encrypted("pw")).unwrap();

        server_put(remote, "Planted.md", b"written by someone with the server and no key");
        let outcome = a.try_sync_as(remote, encrypted("pw")).unwrap();
        assert_eq!(outcome.errors.len(), 1, "{:?}", outcome.errors);
        assert!(outcome.errors[0].contains("not encrypted"), "{:?}", outcome.errors);
        assert_eq!(a.tree(), ["Note.md"]);
        assert_eq!(a.text("Note.md"), "secret text");
    }

    #[test]
    #[ignore = "needs a WebDAV server; see the module docs"]
    fn a_folder_left_out_of_sync_is_untouched_on_both_sides() {
        let remote = "filter-folder";
        let a = Device::new("filter-a");
        a.write("Keep.md", b"keep");
        a.write("Archive/Old.md", b"old");
        assert_eq!(counts(&a.sync_clean(remote)), (2, 0, 0, 0));

        let without = |cfg: &mut WebDavConfig| cfg.filter.exclude_folders = vec!["Archive".into()];
        assert_eq!(counts(&a.try_sync_as(remote, without).unwrap()), (0, 0, 0, 0));
        a.remove("Archive/Old.md");
        a.write("Archive/New.md", b"new");
        assert_eq!(counts(&a.try_sync_as(remote, without).unwrap()), (0, 0, 0, 0));
        assert_eq!(server_tree(remote), ["Archive/Old.md", "Keep.md"]);

        // A device that takes everything still gets the folder as the server has it.
        let b = Device::new("filter-b");
        assert_eq!(counts(&b.sync_clean(remote)), (0, 2, 0, 0));
        assert_eq!(b.text("Archive/Old.md"), "old");
    }
}
