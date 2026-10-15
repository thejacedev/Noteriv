use atomicwrites::{AllowOverwrite, AtomicFile, DisallowOverwrite, Error as AtomicWriteError};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;

use crate::scope::PathScope;
use crate::AppState;

/// True when the webview may touch this path. See `crate::scope`.
///
/// Every command below is reachable by any script running in the webview, so
/// each one has to ask. A refusal is logged and returned as the command's
/// ordinary failure value rather than an error, matching the existing contract.
fn allowed(app: &tauri::AppHandle, path: &str) -> bool {
    let ok = app.state::<AppState>().scope.is_allowed(Path::new(path));
    if !ok {
        log::warn!("[fs] refused access outside the permitted scope: {path}");
    }
    ok
}

const MAX_KNOWLEDGE_READ_BYTES: u64 = 1_000_000;
const MAX_KNOWLEDGE_FILES: usize = 5_001;
static FILE_MUTATION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_file_mutations() -> MutexGuard<'static, ()> {
    FILE_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
}

#[tauri::command]
pub async fn fs_read_file(app: tauri::AppHandle, file_path: String) -> Option<String> {
    if !allowed(&app, &file_path) {
        return None;
    }
    fs::read_to_string(&file_path).ok()
}

#[tauri::command]
pub async fn fs_read_text_file(app: tauri::AppHandle, file_path: String) -> Result<String, String> {
    if !allowed(&app, &file_path) {
        return Err(format!("Could not read {file_path}: outside the permitted scope"));
    }
    let file = fs::File::open(&file_path)
        .map_err(|error| format!("Could not read {file_path}: {error}"))?;
    if file
        .metadata()
        .map_err(|error| format!("Could not inspect {file_path}: {error}"))?
        .len()
        > MAX_KNOWLEDGE_READ_BYTES
    {
        return Err(format!(
            "Could not read {file_path}: the note is too large for knowledge analysis"
        ));
    }
    let mut bytes = Vec::new();
    file.take(MAX_KNOWLEDGE_READ_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read {file_path}: {error}"))?;
    if bytes.len() as u64 > MAX_KNOWLEDGE_READ_BYTES {
        return Err(format!(
            "Could not read {file_path}: the note is too large for knowledge analysis"
        ));
    }
    String::from_utf8(bytes).map_err(|error| format!("Could not read {file_path}: {error}"))
}

#[tauri::command]
pub async fn fs_read_binary_file(app: tauri::AppHandle, file_path: String) -> Option<String> {
    if !allowed(&app, &file_path) {
        return None;
    }
    let bytes = fs::read(&file_path).ok()?;
    Some(B64.encode(bytes))
}

#[derive(Debug, Deserialize)]
pub struct WriteFileInput {
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct GuardedWriteFileInput {
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub content: String,
    #[serde(rename = "baseHash")]
    pub base_hash: String,
}

#[derive(Debug, Serialize)]
pub struct GuardedWriteFileResult {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl GuardedWriteFileResult {
    fn with_status(status: &str, message: Option<String>) -> Self {
        Self {
            status: status.into(),
            message,
        }
    }
}

#[tauri::command]
pub async fn fs_write_file(app: tauri::AppHandle, args: WriteFileInput) -> bool {
    if !allowed(&app, &args.file_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    let path = Path::new(&args.file_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, args.content).is_ok()
}

#[tauri::command]
pub async fn fs_write_file_guarded(
    app: tauri::AppHandle,
    args: GuardedWriteFileInput,
) -> GuardedWriteFileResult {
    if !allowed(&app, &args.file_path) {
        return GuardedWriteFileResult::with_status(
            "error",
            Some("Refusing to save outside the permitted scope".into()),
        );
    }
    write_file_guarded(args)
}

fn write_file_guarded(args: GuardedWriteFileInput) -> GuardedWriteFileResult {
    let _guard = lock_file_mutations();
    let path = Path::new(&args.file_path);
    let current = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            return GuardedWriteFileResult::with_status(
                "error",
                Some(format!("Could not read the note before saving: {error}")),
            )
        }
    };
    if content_hash(&current) != args.base_hash {
        return GuardedWriteFileResult::with_status(
            "conflict",
            Some("The note changed on disk after it was opened".into()),
        );
    }
    let permissions = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return GuardedWriteFileResult::with_status(
                "error",
                Some("Refusing to replace a symbolic link".into()),
            )
        }
        Ok(metadata) => metadata.permissions(),
        Err(error) => {
            return GuardedWriteFileResult::with_status(
                "error",
                Some(format!("Could not inspect the note before saving: {error}")),
            )
        }
    };
    match AtomicFile::new(path, AllowOverwrite).write(|file| {
        file.write_all(args.content.as_bytes())?;
        file.set_permissions(permissions.clone())?;
        Ok::<(), io::Error>(())
    }) {
        Ok(()) => GuardedWriteFileResult::with_status("written", None),
        Err(error) => GuardedWriteFileResult::with_status(
            "error",
            Some(format!("Could not save the note: {error:?}")),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeChangeInput {
    #[serde(rename = "vaultId")]
    vault_id: String,
    #[serde(rename = "vaultPath")]
    vault_path: String,
    #[serde(rename = "targetPath")]
    target_path: String,
    kind: String,
    #[serde(rename = "baseHash")]
    base_hash: Option<String>,
    content: String,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeChangeResult {
    status: String,
    #[serde(rename = "absolutePath")]
    absolute_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl KnowledgeChangeResult {
    fn written(path: &Path) -> Self {
        Self {
            status: "written".into(),
            absolute_path: path.to_string_lossy().into_owned(),
            message: None,
        }
    }

    fn conflict(path: &Path, message: impl Into<String>) -> Self {
        Self {
            status: "conflict".into(),
            absolute_path: path.to_string_lossy().into_owned(),
            message: Some(message.into()),
        }
    }

    fn error(path: &Path, message: impl Into<String>) -> Self {
        Self {
            status: "error".into(),
            absolute_path: path.to_string_lossy().into_owned(),
            message: Some(message.into()),
        }
    }
}

fn is_windows_reserved(segment: &str) -> bool {
    let stem = segment
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || stem
            .strip_prefix("com")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value))
        || stem
            .strip_prefix("lpt")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value))
}

fn validate_knowledge_relative_path(input: &str) -> Result<PathBuf, String> {
    let normalized = input.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.len() > 1024 {
        return Err("A valid vault-relative note path is required".into());
    }
    if normalized.starts_with('/')
        || normalized.starts_with("//")
        || normalized.as_bytes().get(1) == Some(&b':')
    {
        return Err("Knowledge note paths must be relative to the destination vault".into());
    }

    let segments: Vec<&str> = normalized.split('/').collect();
    if segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return Err(
            "Knowledge note paths cannot contain empty, current, or parent directory segments"
                .into(),
        );
    }
    if segments.iter().any(|segment| segment.starts_with('.')) {
        return Err("Knowledge notes cannot be written to hidden paths".into());
    }
    if segments.iter().any(|segment| {
        segment.ends_with(['.', ' '])
            || segment
                .chars()
                .any(|character| character.is_control() || "<>:\"|?*".contains(character))
    }) {
        return Err("The knowledge note path contains unsupported characters".into());
    }
    if segments.iter().any(|segment| is_windows_reserved(segment)) {
        return Err("The knowledge note path uses a reserved file name".into());
    }
    if !normalized.to_ascii_lowercase().ends_with(".md")
        && !normalized.to_ascii_lowercase().ends_with(".markdown")
    {
        return Err("Knowledge changes can only target Markdown notes".into());
    }

    Ok(PathBuf::from(normalized))
}

struct ConfiguredVaultRoot {
    canonical: PathBuf,
    display: PathBuf,
}

fn configured_vault_root(vault_id: &str, vault_path: &str) -> Result<ConfiguredVaultRoot, String> {
    let configured = crate::store::get_vaults()
        .into_iter()
        .find(|vault| vault.id == vault_id)
        .ok_or_else(|| "The destination vault is not configured".to_string())?;
    let configured_root = dunce::canonicalize(&configured.path)
        .map_err(|error| format!("Could not resolve the configured destination vault: {error}"))?;
    let requested_root = dunce::canonicalize(vault_path)
        .map_err(|error| format!("Could not resolve the destination vault: {error}"))?;
    if configured_root != requested_root || !configured_root.is_dir() {
        return Err("The destination vault does not match the configured vault".into());
    }
    Ok(ConfiguredVaultRoot {
        canonical: configured_root,
        display: PathBuf::from(configured.path),
    })
}

fn checked_knowledge_target(root: &Path, relative_path: &Path) -> Result<PathBuf, String> {
    let mut candidate = root.to_path_buf();
    for component in relative_path.components() {
        candidate.push(component.as_os_str());
        match fs::symlink_metadata(&candidate) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Knowledge note paths cannot traverse symbolic links".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => {
                return Err(format!(
                    "Could not inspect the knowledge note path: {error}"
                ))
            }
        }
    }

    let target = root.join(relative_path);
    let parent = target
        .parent()
        .ok_or_else(|| "The knowledge note has no destination folder".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create the destination folder: {error}"))?;
    let canonical_parent = dunce::canonicalize(parent)
        .map_err(|error| format!("Could not resolve the destination folder: {error}"))?;
    if !canonical_parent.starts_with(root) {
        return Err("The knowledge note path resolves outside the destination vault".into());
    }
    Ok(target)
}

fn content_hash(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!("sha256-{digest:x}")
}

fn snapshot_prefix(relative_path: &Path) -> String {
    let raw = relative_path.to_string_lossy().replace('\\', "/");
    let lower = raw.to_ascii_lowercase();
    let stem = if lower.ends_with(".markdown") {
        &raw[..raw.len() - ".markdown".len()]
    } else if lower.ends_with(".md") {
        &raw[..raw.len() - ".md".len()]
    } else {
        &raw
    };
    let mut sanitized = String::new();
    for character in stem.chars() {
        if character == '/' {
            sanitized.push_str("__");
        } else if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
            sanitized.push(character);
        } else {
            sanitized.push('_');
        }
    }
    sanitized.truncate(170);
    let hash = raw.as_bytes().iter().fold(2166136261_u32, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(16777619)
    });
    format!("{sanitized}--{hash:08x}")
}

fn checked_snapshot_dir(root: &Path) -> Result<PathBuf, String> {
    let noteriv_dir = root.join(".noteriv");
    let snapshot_dir = noteriv_dir.join("snapshots");
    for directory in [&noteriv_dir, &snapshot_dir] {
        match fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Recovery snapshot paths cannot traverse symbolic links".into())
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err("The recovery snapshot path is not a directory".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(directory).map_err(|create_error| {
                    format!("Could not create the recovery snapshot folder: {create_error}")
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "Could not inspect the recovery snapshot folder: {error}"
                ))
            }
        }
    }
    let canonical = dunce::canonicalize(&snapshot_dir)
        .map_err(|error| format!("Could not resolve the recovery snapshot folder: {error}"))?;
    if !canonical.starts_with(root) {
        return Err("The recovery snapshot folder resolves outside the destination vault".into());
    }
    Ok(canonical)
}

fn save_knowledge_snapshot(
    root: &Path,
    relative_path: &Path,
    content: &str,
    permissions: Option<fs::Permissions>,
) -> Result<(), String> {
    if content.trim().is_empty() {
        return Ok(());
    }
    let snapshot_dir = checked_snapshot_dir(root)?;
    let prefix = snapshot_prefix(relative_path);
    let snapshot_name = format!(
        "{}-{}-{:08x}.md",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>(),
    );
    let snapshot_path = snapshot_dir.join(snapshot_name);
    AtomicFile::new(&snapshot_path, DisallowOverwrite)
        .write(|file| {
            file.write_all(content.as_bytes())?;
            if let Some(permissions) = permissions.clone() {
                file.set_permissions(permissions)?;
            }
            Ok::<(), io::Error>(())
        })
        .map_err(|error| format!("Could not save a recovery snapshot: {error:?}"))?;

    let snapshot_dir = checked_snapshot_dir(root)?;
    let mut snapshots: Vec<PathBuf> = fs::read_dir(&snapshot_dir)
        .map_err(|error| format!("Could not inspect recovery snapshots: {error}"))?
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&format!("{prefix}-")))
        })
        .collect();
    snapshots.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    for old_snapshot in snapshots.into_iter().skip(50) {
        let _ = fs::remove_file(old_snapshot);
    }
    Ok(())
}

#[tauri::command]
pub async fn fs_apply_knowledge_change(
    app: tauri::AppHandle,
    args: KnowledgeChangeInput,
) -> KnowledgeChangeResult {
    if !allowed(&app, &args.vault_path) {
        return KnowledgeChangeResult::error(
            Path::new(&args.target_path),
            "The destination vault is outside the permitted scope",
        );
    }
    let relative_path = match validate_knowledge_relative_path(&args.target_path) {
        Ok(path) => path,
        Err(message) => return KnowledgeChangeResult::error(Path::new(&args.target_path), message),
    };
    let root = match configured_vault_root(&args.vault_id, &args.vault_path) {
        Ok(root) => root,
        Err(message) => return KnowledgeChangeResult::error(&relative_path, message),
    };
    let display_target = root.display.join(&relative_path);
    let mut result = apply_knowledge_change(&root.canonical, args);
    result.absolute_path = display_target.to_string_lossy().into_owned();
    result
}

fn apply_knowledge_change(root: &Path, args: KnowledgeChangeInput) -> KnowledgeChangeResult {
    let _guard = lock_file_mutations();
    let relative_path = match validate_knowledge_relative_path(&args.target_path) {
        Ok(path) => path,
        Err(message) => return KnowledgeChangeResult::error(Path::new(&args.target_path), message),
    };
    let target = match checked_knowledge_target(root, &relative_path) {
        Ok(target) => target,
        Err(message) => return KnowledgeChangeResult::error(&root.join(&relative_path), message),
    };
    if args.content.trim().is_empty() || args.content.len() > 16_000_000 {
        return KnowledgeChangeResult::error(
            &target,
            "Knowledge note content is empty or too large",
        );
    }

    match args.kind.as_str() {
        "create" => {
            if fs::symlink_metadata(&target).is_ok() {
                return KnowledgeChangeResult::conflict(&target, "A note now exists at this path");
            }
            match AtomicFile::new(&target, DisallowOverwrite)
                .write(|file| file.write_all(args.content.as_bytes()))
            {
                Ok(()) => KnowledgeChangeResult::written(&target),
                Err(_error) if target.exists() => {
                    KnowledgeChangeResult::conflict(&target, "A note now exists at this path")
                }
                Err(error) => KnowledgeChangeResult::error(
                    &target,
                    format!("Could not create the knowledge note: {error:?}"),
                ),
            }
        }
        "update" => {
            let base_hash = match args.base_hash.as_deref() {
                Some(hash) => hash,
                None => {
                    return KnowledgeChangeResult::error(
                        &target,
                        "The update is missing its base hash",
                    )
                }
            };
            let current_content = match fs::read_to_string(&target) {
                Ok(content) => content,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return KnowledgeChangeResult::conflict(&target, "The note no longer exists");
                }
                Err(error) => {
                    return KnowledgeChangeResult::error(
                        &target,
                        format!("Could not read the existing note: {error}"),
                    )
                }
            };
            if content_hash(&current_content) != base_hash {
                return KnowledgeChangeResult::conflict(
                    &target,
                    "The note changed after analysis; review a fresh proposal before applying",
                );
            }
            let permissions = match fs::symlink_metadata(&target) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return KnowledgeChangeResult::error(
                        &target,
                        "Knowledge note paths cannot traverse symbolic links",
                    )
                }
                Ok(metadata) => Some(metadata.permissions()),
                Err(error) => {
                    return KnowledgeChangeResult::error(
                        &target,
                        format!("Could not inspect the existing note: {error}"),
                    )
                }
            };
            if let Err(message) =
                save_knowledge_snapshot(root, &relative_path, &current_content, permissions.clone())
            {
                return KnowledgeChangeResult::error(&target, message);
            }
            let rechecked_content = match fs::read_to_string(&target) {
                Ok(content) => content,
                Err(error) => {
                    return KnowledgeChangeResult::error(
                        &target,
                        format!("Could not recheck the existing note: {error}"),
                    )
                }
            };
            if content_hash(&rechecked_content) != base_hash {
                return KnowledgeChangeResult::conflict(
                    &target,
                    "The note changed while the update was being prepared; review a fresh proposal before applying",
                );
            }
            match AtomicFile::new(&target, AllowOverwrite).write(|file| {
                file.write_all(args.content.as_bytes())?;
                if let Some(permissions) = permissions.clone() {
                    file.set_permissions(permissions)?;
                }
                let latest_target = checked_knowledge_target(root, &relative_path)
                    .map_err(io::Error::other)?;
                let latest_content = fs::read_to_string(latest_target)?;
                if content_hash(&latest_content) != base_hash {
                    return Err(io::Error::new(
                        io::ErrorKind::WouldBlock,
                        "The note changed while the update was being prepared",
                    ));
                }
                Ok::<(), std::io::Error>(())
            }) {
                Ok(()) => KnowledgeChangeResult::written(&target),
                Err(AtomicWriteError::User(error))
                    if error.kind() == io::ErrorKind::WouldBlock =>
                {
                    KnowledgeChangeResult::conflict(
                        &target,
                        "The note changed while the update was being prepared; review a fresh proposal before applying",
                    )
                }
                Err(error) => KnowledgeChangeResult::error(
                    &target,
                    format!("Could not update the knowledge note: {error:?}"),
                ),
            }
        }
        _ => KnowledgeChangeResult::error(&target, "Unsupported knowledge change kind"),
    }
}

#[tauri::command]
pub async fn fs_read_dir(app: tauri::AppHandle, dir_path: String) -> Vec<DirEntry> {
    if !allowed(&app, &dir_path) {
        return Vec::new();
    }
    let entries = match fs::read_dir(&dir_path) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<DirEntry> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|n| !n.starts_with('.'))
                .unwrap_or(false)
        })
        .map(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let name = e.file_name().to_string_lossy().into_owned();
            let full = e.path();
            DirEntry {
                name,
                path: full.to_string_lossy().into_owned(),
                is_directory: is_dir,
            }
        })
        .collect();
    out.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    out
}

#[tauri::command]
pub async fn fs_create_file(app: tauri::AppHandle, file_path: String) -> bool {
    if !allowed(&app, &file_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, "").is_ok()
}

#[tauri::command]
pub async fn fs_delete_file(app: tauri::AppHandle, file_path: String) -> bool {
    if !allowed(&app, &file_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    fs::remove_file(&file_path).is_ok()
}

#[tauri::command]
pub async fn fs_delete_dir(app: tauri::AppHandle, dir_path: String) -> bool {
    if !allowed(&app, &dir_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    fs::remove_dir_all(&dir_path).is_ok()
}

#[derive(Debug, Deserialize)]
pub struct RenameInput {
    #[serde(rename = "oldPath")]
    pub old_path: String,
    #[serde(rename = "newPath")]
    pub new_path: String,
}

#[tauri::command]
pub async fn fs_rename(app: tauri::AppHandle, args: RenameInput) -> bool {
    if !allowed(&app, &args.old_path) || !allowed(&app, &args.new_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    fs::rename(&args.old_path, &args.new_path).is_ok()
}

#[tauri::command]
pub async fn fs_create_dir(app: tauri::AppHandle, dir_path: String) -> bool {
    if !allowed(&app, &dir_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    fs::create_dir_all(&dir_path).is_ok()
}

#[derive(Debug, Deserialize)]
pub struct CopyInput {
    pub src: String,
    pub dest: String,
}

#[tauri::command]
pub async fn fs_copy_file(app: tauri::AppHandle, args: CopyInput) -> bool {
    if !allowed(&app, &args.src) || !allowed(&app, &args.dest) {
        return false;
    }
    let _guard = lock_file_mutations();
    let dest = Path::new(&args.dest);
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::copy(&args.src, &args.dest).is_ok()
}

#[derive(Debug, Deserialize)]
pub struct WriteBinaryInput {
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub base64: String,
}

#[tauri::command]
pub async fn fs_write_binary_file(app: tauri::AppHandle, args: WriteBinaryInput) -> bool {
    if !allowed(&app, &args.file_path) {
        return false;
    }
    let _guard = lock_file_mutations();
    let bytes = match B64.decode(args.base64.as_bytes()) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let path = Path::new(&args.file_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, bytes).is_ok()
}

// ============================================================
// Search + listing
// ============================================================

#[derive(Debug, Serialize)]
pub struct SearchHit {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    line: usize,
    text: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchInput {
    pub dir: String,
    pub query: String,
}

#[tauri::command]
pub async fn fs_search_in_files(app: tauri::AppHandle, args: SearchInput) -> Vec<SearchHit> {
    if !allowed(&app, &args.dir) {
        return Vec::new();
    }
    let mut results = Vec::new();
    if args.query.is_empty() || args.dir.is_empty() {
        return results;
    }
    let lower = args.query.to_lowercase();

    fn walk(dir: &Path, lower: &str, results: &mut Vec<SearchHit>, scope: &PathScope) {
        if results.len() >= 200 {
            return;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if name_s.starts_with('.') || name_s == "node_modules" {
                continue;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !scope.may_visit(&file_type, &path) {
                log::warn!("[fs] skipped a link out of the permitted scope: {path:?}");
                continue;
            }
            let is_dir = file_type.is_dir();
            if is_dir {
                walk(&path, lower, results, scope);
                if results.len() >= 200 {
                    return;
                }
            } else if name_s.ends_with(".md") || name_s.ends_with(".markdown") {
                if let Ok(content) = fs::read_to_string(&path) {
                    for (i, line) in content.lines().enumerate() {
                        if line.to_lowercase().contains(lower) {
                            results.push(SearchHit {
                                file_path: path.to_string_lossy().into_owned(),
                                file_name: name_s.clone().into_owned(),
                                line: i + 1,
                                text: line.trim().to_string(),
                            });
                            if results.len() >= 200 {
                                return;
                            }
                        }
                    }
                }
            }
        }
    }

    walk(
        Path::new(&args.dir),
        &lower,
        &mut results,
        &app.state::<AppState>().scope,
    );
    results
}

#[derive(Debug, Serialize)]
pub struct ListedFile {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
}

fn rel_path(base: &str, full: &str) -> String {
    full.strip_prefix(base)
        .map(|s| s.trim_start_matches(['/', '\\']).to_string())
        .unwrap_or_else(|| full.to_string())
}

#[tauri::command]
pub async fn fs_list_all_files(app: tauri::AppHandle, dir: String) -> Vec<ListedFile> {
    if !allowed(&app, &dir) {
        return Vec::new();
    }
    list_markdown_files(&dir, None)
}

#[tauri::command]
pub async fn fs_list_knowledge_files(app: tauri::AppHandle, dir: String) -> Vec<ListedFile> {
    if !allowed(&app, &dir) {
        return Vec::new();
    }
    list_markdown_files(&dir, Some(MAX_KNOWLEDGE_FILES))
}

fn list_markdown_files(dir: &str, limit: Option<usize>) -> Vec<ListedFile> {
    let mut out = Vec::new();
    if dir.is_empty() {
        return out;
    }

    fn walk(dir: &Path, base: &str, limit: Option<usize>, out: &mut Vec<ListedFile>) {
        if limit.is_some_and(|limit| out.len() >= limit) {
            return;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            if limit.is_some_and(|limit| out.len() >= limit) {
                return;
            }
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if name_s.starts_with('.') || name_s == "node_modules" {
                continue;
            }
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            let is_dir = file_type.is_dir();
            if is_dir {
                walk(&path, base, limit, out);
            } else if name_s.to_ascii_lowercase().ends_with(".md")
                || name_s.to_ascii_lowercase().ends_with(".markdown")
            {
                let full = path.to_string_lossy().into_owned();
                let trimmed_name = name_s
                    .trim_end_matches(".markdown")
                    .trim_end_matches(".md")
                    .to_string();
                out.push(ListedFile {
                    file_name: trimmed_name,
                    relative_path: rel_path(base, &full),
                    file_path: full,
                });
            }
        }
    }

    walk(Path::new(dir), dir, limit, &mut out);
    out.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    out
}

#[derive(Debug, Serialize)]
pub struct StatsFile {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    #[serde(rename = "mtimeMs")]
    mtime_ms: f64,
    #[serde(rename = "birthtimeMs")]
    birthtime_ms: f64,
}

#[tauri::command]
pub async fn fs_get_file_stats(app: tauri::AppHandle, dir: String) -> Vec<StatsFile> {
    if !allowed(&app, &dir) {
        return Vec::new();
    }
    let mut out = Vec::new();
    if dir.is_empty() {
        return out;
    }

    fn ms(t: std::time::SystemTime) -> f64 {
        t.duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0)
    }

    fn walk(dir: &Path, base: &str, out: &mut Vec<StatsFile>, scope: &PathScope) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_s = name.to_string_lossy();
            if name_s.starts_with('.') || name_s == "node_modules" {
                continue;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !scope.may_visit(&file_type, &path) {
                continue;
            }
            let is_dir = file_type.is_dir();
            if is_dir {
                walk(&path, base, out, scope);
            } else if name_s.ends_with(".md") || name_s.ends_with(".markdown") {
                if let Ok(meta) = entry.metadata() {
                    let full = path.to_string_lossy().into_owned();
                    let trimmed_name = name_s
                        .trim_end_matches(".markdown")
                        .trim_end_matches(".md")
                        .to_string();
                    let mtime = meta.modified().map(ms).unwrap_or(0.0);
                    let birth = meta.created().map(ms).unwrap_or(mtime);
                    out.push(StatsFile {
                        file_name: trimmed_name,
                        relative_path: rel_path(base, &full),
                        file_path: full,
                        mtime_ms: mtime,
                        birthtime_ms: birth,
                    });
                }
            }
        }
    }

    walk(
        Path::new(&dir),
        &dir,
        &mut out,
        &app.state::<AppState>().scope,
    );
    out
}

#[cfg(test)]
mod knowledge_tests {
    use super::{
        apply_knowledge_change, checked_knowledge_target, content_hash, snapshot_prefix,
        validate_knowledge_relative_path, write_file_guarded, GuardedWriteFileInput,
        KnowledgeChangeInput,
    };
    use std::fs;
    use std::path::Path;

    fn change(
        kind: &str,
        target_path: &str,
        base_hash: Option<String>,
        content: &str,
    ) -> KnowledgeChangeInput {
        KnowledgeChangeInput {
            vault_id: "test-vault".into(),
            vault_path: "/unused".into(),
            target_path: target_path.into(),
            kind: kind.into(),
            base_hash,
            content: content.into(),
        }
    }

    #[test]
    fn validates_portable_knowledge_paths() {
        assert!(validate_knowledge_relative_path("Knowledge/Rust.md").is_ok());
        for unsafe_path in [
            "../outside.md",
            "/tmp/outside.md",
            "C:\\outside.md",
            ".noteriv/proposal.md",
            ".knowledge/proposal.md",
            "Knowledge/.hidden.md",
            "folder/note.md:stream.md",
            "folder/aux.md",
            "folder/note.txt",
        ] {
            assert!(
                validate_knowledge_relative_path(unsafe_path).is_err(),
                "expected {unsafe_path} to be rejected",
            );
        }
    }

    #[test]
    fn hashes_content_with_the_renderer_format() {
        assert_eq!(
            content_hash("hello"),
            "sha256-2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        );
    }

    #[test]
    fn uses_the_recovery_snapshot_prefix_format() {
        assert!(snapshot_prefix(Path::new("Knowledge/Existing.MARKDOWN"))
            .starts_with("Knowledge__Existing--"));
        assert_ne!(
            snapshot_prefix(Path::new("A/B.md")),
            snapshot_prefix(Path::new("A__B.md"))
        );
        let long_path = format!("{}/Note.md", "nested-segment/".repeat(30));
        assert!(snapshot_prefix(Path::new(&long_path)).len() <= 190);
    }

    #[test]
    fn creates_without_overwriting_an_existing_note() {
        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-knowledge-create-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let root = fs::canonicalize(root).unwrap();

        let first = apply_knowledge_change(
            &root,
            change("create", "Knowledge/New.md", None, "# First\n"),
        );
        let second = apply_knowledge_change(
            &root,
            change("create", "Knowledge/New.md", None, "# Replacement\n"),
        );

        assert_eq!(first.status, "written");
        assert_eq!(second.status, "conflict");
        assert_eq!(
            fs::read_to_string(root.join("Knowledge/New.md")).unwrap(),
            "# First\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn updates_from_the_reviewed_base_and_keeps_a_recovery_snapshot() {
        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-knowledge-update-{suffix}"));
        fs::create_dir_all(root.join("Knowledge")).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let original = "# Original\n";
        fs::write(root.join("Knowledge/Existing.md"), original).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                root.join("Knowledge/Existing.md"),
                fs::Permissions::from_mode(0o600),
            )
            .unwrap();
        }

        let result = apply_knowledge_change(
            &root,
            change(
                "update",
                "Knowledge/Existing.md",
                Some(content_hash(original)),
                "# Updated\n",
            ),
        );

        assert_eq!(result.status, "written");
        assert_eq!(
            fs::read_to_string(root.join("Knowledge/Existing.md")).unwrap(),
            "# Updated\n"
        );
        let snapshots: Vec<_> = fs::read_dir(root.join(".noteriv/snapshots"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert!(snapshots[0]
            .file_name()
            .to_string_lossy()
            .starts_with("Knowledge__Existing-"));
        assert_eq!(fs::read_to_string(snapshots[0].path()).unwrap(), original);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(snapshots[0].path())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(root.join("Knowledge/Existing.md"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_an_update_when_the_reviewed_base_is_stale() {
        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-knowledge-stale-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let root = fs::canonicalize(root).unwrap();
        fs::write(root.join("Existing.md"), "# Newer edit\n").unwrap();

        let result = apply_knowledge_change(
            &root,
            change(
                "update",
                "Existing.md",
                Some(content_hash("# Reviewed base\n")),
                "# Proposed\n",
            ),
        );

        assert_eq!(result.status, "conflict");
        assert_eq!(
            fs::read_to_string(root.join("Existing.md")).unwrap(),
            "# Newer edit\n"
        );
        assert!(!root.join(".noteriv/snapshots").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn guarded_editor_save_rejects_a_changed_disk_base() {
        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-guarded-save-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("Existing.md");
        fs::write(&target, "# External edit\n").unwrap();

        let result = write_file_guarded(GuardedWriteFileInput {
            file_path: target.to_string_lossy().into_owned(),
            content: "# Stale editor\n".into(),
            base_hash: content_hash("# Opened base\n"),
        });

        assert_eq!(result.status, "conflict");
        assert_eq!(fs::read_to_string(&target).unwrap(), "# External edit\n");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn serializes_two_updates_from_the_same_reviewed_base() {
        use std::sync::{Arc, Barrier};
        use std::thread;

        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-knowledge-race-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let root = Arc::new(fs::canonicalize(root).unwrap());
        let original = "# Original\n";
        fs::write(root.join("Existing.md"), original).unwrap();
        let barrier = Arc::new(Barrier::new(2));

        let handles: Vec<_> = ["# First\n", "# Second\n"]
            .into_iter()
            .map(|content| {
                let root = Arc::clone(&root);
                let barrier = Arc::clone(&barrier);
                let base_hash = content_hash(original);
                thread::spawn(move || {
                    barrier.wait();
                    apply_knowledge_change(
                        &root,
                        change("update", "Existing.md", Some(base_hash), content),
                    )
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap().status)
            .collect();

        assert_eq!(
            results.iter().filter(|status| *status == "written").count(),
            1
        );
        assert_eq!(
            results
                .iter()
                .filter(|status| *status == "conflict")
                .count(),
            1
        );
        let final_content = fs::read_to_string(root.join("Existing.md")).unwrap();
        assert!(final_content == "# First\n" || final_content == "# Second\n");
        let _ = fs::remove_dir_all(root.as_path());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_ancestors() {
        use std::os::unix::fs::symlink;

        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-knowledge-root-{suffix}"));
        let outside = std::env::temp_dir().join(format!("noteriv-knowledge-outside-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("linked")).unwrap();

        let result = checked_knowledge_target(
            &fs::canonicalize(&root).unwrap(),
            &validate_knowledge_relative_path("linked/note.md").unwrap(),
        );

        assert!(result.unwrap_err().contains("symbolic links"));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_snapshot_directories() {
        use std::os::unix::fs::symlink;

        let suffix = rand::random::<u64>();
        let root = std::env::temp_dir().join(format!("noteriv-snapshot-root-{suffix}"));
        let outside = std::env::temp_dir().join(format!("noteriv-snapshot-outside-{suffix}"));
        fs::create_dir_all(root.join(".noteriv")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("Existing.md"), "# Original\n").unwrap();
        symlink(&outside, root.join(".noteriv/snapshots")).unwrap();
        let root = fs::canonicalize(root).unwrap();

        let result = apply_knowledge_change(
            &root,
            change(
                "update",
                "Existing.md",
                Some(content_hash("# Original\n")),
                "# Updated\n",
            ),
        );

        assert_eq!(result.status, "error");
        assert!(result.message.unwrap().contains("symbolic links"));
        assert_eq!(
            fs::read_to_string(root.join("Existing.md")).unwrap(),
            "# Original\n"
        );
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }
}
