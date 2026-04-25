use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn shell_open_external(app: tauri::AppHandle, url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

#[tauri::command]
pub async fn shell_open_path(app: tauri::AppHandle, file_path: String) -> String {
    let _ = app.opener().open_path(&file_path, None::<&str>);
    String::new()
}
