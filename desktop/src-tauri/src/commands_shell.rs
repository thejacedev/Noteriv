use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use crate::AppState;

#[tauri::command]
pub async fn shell_open_external(app: tauri::AppHandle, url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

/// Hand a path to the OS opener.
///
/// The opener resolves the file's registered handler and starts it, so an
/// unrestricted version of this command turns any write primitive in the
/// webview into process execution. Only the exact paths the user named in a
/// native dialog this session are accepted; neither vault membership nor
/// sitting inside a picked folder is enough, because a file can reach either
/// place without the user ever choosing it — through sync, the web clipper, the
/// MCP server, or a write from the renderer itself.
#[tauri::command]
pub async fn shell_open_path(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !state.scope.is_openable(Path::new(&file_path)) {
        log::warn!("[shell] refused open_path for a path the user did not select: {file_path}");
        return Err("refusing to open a path that was not selected by the user".into());
    }
    app.opener()
        .open_path(&file_path, None::<&str>)
        .map_err(|e| e.to_string())
}
