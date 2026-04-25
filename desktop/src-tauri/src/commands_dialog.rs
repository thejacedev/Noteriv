use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri_plugin_dialog::{DialogExt, FilePath};

#[derive(Debug, Serialize)]
pub struct OpenedFile {
    #[serde(rename = "filePath")]
    file_path: String,
    content: String,
}

fn fp_to_string(fp: FilePath) -> Option<String> {
    match fp {
        FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        FilePath::Url(u) => Some(u.to_string()),
    }
}

#[tauri::command]
pub async fn dialog_open_file(app: tauri::AppHandle) -> Option<OpenedFile> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    let fp = picked?;
    let path_str = fp_to_string(fp)?;
    let content = fs::read_to_string(&path_str).ok()?;
    Some(OpenedFile { file_path: path_str, content })
}

#[tauri::command]
pub async fn dialog_open_folder(app: tauri::AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder();
    fp_to_string(picked?)
}

#[derive(Debug, Deserialize)]
pub struct OpenDialogOptions {
    #[serde(default)]
    pub properties: Option<Vec<String>>,
    #[serde(default)]
    pub filters: Option<Vec<DialogFilter>>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(rename = "defaultPath", default)]
    pub default_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenDialogResult {
    canceled: bool,
    #[serde(rename = "filePaths")]
    file_paths: Vec<String>,
}

#[tauri::command]
pub async fn dialog_show_open(
    app: tauri::AppHandle,
    options: OpenDialogOptions,
) -> OpenDialogResult {
    let props = options.properties.unwrap_or_default();
    let directory = props.iter().any(|p| p == "openDirectory");
    let multi = props.iter().any(|p| p == "multiSelections");

    let mut builder = app.dialog().file();
    if let Some(t) = options.title {
        builder = builder.set_title(t);
    }
    if let Some(d) = options.default_path {
        builder = builder.set_directory(PathBuf::from(d));
    }
    if !directory {
        if let Some(filters) = options.filters {
            for f in filters {
                let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                builder = builder.add_filter(&f.name, &exts);
            }
        }
    }

    let picked: Vec<String> = if directory {
        if multi {
            builder
                .blocking_pick_folders()
                .map(|v| v.into_iter().filter_map(fp_to_string).collect())
                .unwrap_or_default()
        } else {
            builder
                .blocking_pick_folder()
                .and_then(fp_to_string)
                .map(|s| vec![s])
                .unwrap_or_default()
        }
    } else if multi {
        builder
            .blocking_pick_files()
            .map(|v| v.into_iter().filter_map(fp_to_string).collect())
            .unwrap_or_default()
    } else {
        builder
            .blocking_pick_file()
            .and_then(fp_to_string)
            .map(|s| vec![s])
            .unwrap_or_default()
    };

    OpenDialogResult {
        canceled: picked.is_empty(),
        file_paths: picked,
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveFileInput {
    #[serde(rename = "defaultPath", default)]
    pub default_path: Option<String>,
}

#[tauri::command]
pub async fn dialog_save_file(app: tauri::AppHandle, args: SaveFileInput) -> Option<String> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .add_filter("All Files", &["*"]);
    if let Some(p) = args.default_path {
        if let Some(parent) = PathBuf::from(&p).parent() {
            builder = builder.set_directory(parent.to_path_buf());
        }
        if let Some(file) = PathBuf::from(&p).file_name() {
            builder = builder.set_file_name(file.to_string_lossy().to_string());
        }
    }
    builder.blocking_save_file().and_then(fp_to_string)
}

#[tauri::command]
pub async fn dialog_save_html(app: tauri::AppHandle, args: SaveFileInput) -> Option<String> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter("HTML", &["html"])
        .add_filter("All Files", &["*"]);
    if let Some(p) = args.default_path {
        if let Some(parent) = PathBuf::from(&p).parent() {
            builder = builder.set_directory(parent.to_path_buf());
        }
        if let Some(file) = PathBuf::from(&p).file_name() {
            builder = builder.set_file_name(file.to_string_lossy().to_string());
        }
    }
    builder.blocking_save_file().and_then(fp_to_string)
}
