use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
}

#[tauri::command]
pub async fn fs_read_file(file_path: String) -> Option<String> {
    fs::read_to_string(&file_path).ok()
}

#[tauri::command]
pub async fn fs_read_binary_file(file_path: String) -> Option<String> {
    let bytes = fs::read(&file_path).ok()?;
    Some(B64.encode(bytes))
}

#[derive(Debug, Deserialize)]
pub struct WriteFileInput {
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub content: String,
}

#[tauri::command]
pub async fn fs_write_file(args: WriteFileInput) -> bool {
    let path = Path::new(&args.file_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, args.content).is_ok()
}

#[tauri::command]
pub async fn fs_read_dir(dir_path: String) -> Vec<DirEntry> {
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
pub async fn fs_create_file(file_path: String) -> bool {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, "").is_ok()
}

#[tauri::command]
pub async fn fs_delete_file(file_path: String) -> bool {
    fs::remove_file(&file_path).is_ok()
}

#[tauri::command]
pub async fn fs_delete_dir(dir_path: String) -> bool {
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
pub async fn fs_rename(args: RenameInput) -> bool {
    fs::rename(&args.old_path, &args.new_path).is_ok()
}

#[tauri::command]
pub async fn fs_create_dir(dir_path: String) -> bool {
    fs::create_dir_all(&dir_path).is_ok()
}

#[derive(Debug, Deserialize)]
pub struct CopyInput {
    pub src: String,
    pub dest: String,
}

#[tauri::command]
pub async fn fs_copy_file(args: CopyInput) -> bool {
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
pub async fn fs_write_binary_file(args: WriteBinaryInput) -> bool {
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
pub async fn fs_search_in_files(args: SearchInput) -> Vec<SearchHit> {
    let mut results = Vec::new();
    if args.query.is_empty() || args.dir.is_empty() {
        return results;
    }
    let lower = args.query.to_lowercase();

    fn walk(dir: &Path, lower: &str, results: &mut Vec<SearchHit>) {
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
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk(&path, lower, results);
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

    walk(Path::new(&args.dir), &lower, &mut results);
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
pub async fn fs_list_all_files(dir: String) -> Vec<ListedFile> {
    let mut out = Vec::new();
    if dir.is_empty() {
        return out;
    }

    fn walk(dir: &Path, base: &str, out: &mut Vec<ListedFile>) {
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
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk(&path, base, out);
            } else if name_s.ends_with(".md") || name_s.ends_with(".markdown") {
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

    walk(Path::new(&dir), &dir, &mut out);
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
pub async fn fs_get_file_stats(dir: String) -> Vec<StatsFile> {
    let mut out = Vec::new();
    if dir.is_empty() {
        return out;
    }

    fn ms(t: std::time::SystemTime) -> f64 {
        t.duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0)
    }

    fn walk(dir: &Path, base: &str, out: &mut Vec<StatsFile>) {
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
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk(&path, base, out);
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

    walk(Path::new(&dir), &dir, &mut out);
    out
}
