use tauri::{Manager, WebviewWindow};

fn main_win(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

#[tauri::command]
pub async fn window_minimize(app: tauri::AppHandle) {
    if let Some(w) = main_win(&app) {
        let _ = w.minimize();
    }
}

#[tauri::command]
pub async fn window_maximize(app: tauri::AppHandle) -> bool {
    if let Some(w) = main_win(&app) {
        let max = w.is_maximized().unwrap_or(false);
        if max {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
        return w.is_maximized().unwrap_or(false);
    }
    false
}

#[tauri::command]
pub async fn window_close(app: tauri::AppHandle) {
    if let Some(w) = main_win(&app) {
        let _ = w.close();
    }
}

#[tauri::command]
pub async fn window_is_maximized(app: tauri::AppHandle) -> bool {
    main_win(&app).and_then(|w| w.is_maximized().ok()).unwrap_or(false)
}

#[tauri::command]
pub async fn window_platform() -> &'static str {
    // Match Electron's process.platform values
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}
