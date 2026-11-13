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
    main_win(&app)
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn window_set_title(app: tauri::AppHandle, title: String) {
    if let Some(w) = main_win(&app) {
        let _ = w.set_title(&title);
    }
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

// ============================================================
// Pop-out windows: one note in a window of its own
// ============================================================

static POPOUT_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

/// The labels of pop-out windows start with this. The capability file
/// (`capabilities/default.json`) lists the same pattern.
pub const POPOUT_PREFIX: &str = "popout-";

/// Open a note in a window of its own. The window loads the same app and is
/// told which note to show before any of the page runs.
#[tauri::command]
pub async fn window_open_popout(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let allowed = app
        .state::<crate::AppState>()
        .scope
        .is_allowed(std::path::Path::new(&path));
    if !allowed {
        log::warn!("[window] refused to open a pop-out outside the permitted scope: {path}");
        return Err("That file is not in an open vault.".into());
    }
    let n = POPOUT_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("{POPOUT_PREFIX}{n}");
    let name = std::path::Path::new(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Note".into());
    // As JSON, so no path can break out of the script it is written into.
    let target = serde_json::to_string(&path).map_err(|e| e.to_string())?;
    let init = format!("window.__NOTERIV_POPOUT__ = {{ path: {target} }};");

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title(format!("{name} - Noteriv"))
        .inner_size(900.0, 700.0)
        .min_inner_size(420.0, 320.0)
        .initialization_script(&init)
        .initialization_script(crate::shim::SHIM_JS)
        .build()
        .map_err(|e| format!("The window could not be opened: {e}"))
        .map(|window| {
            // The app's menu drives the main window; on a note of its own it would only mislead.
            let _ = window.remove_menu();
        })
}

/// Close every pop-out window. They belong to the main window: when it
/// goes, a note left floating on its own would keep the app running with no
/// way back to the rest of it.
pub fn close_popouts(app: &tauri::AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(POPOUT_PREFIX) {
            let _ = window.close();
        }
    }
}
