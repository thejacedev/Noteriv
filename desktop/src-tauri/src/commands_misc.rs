use crate::AppState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn clipper_get_port(app: AppHandle) -> u16 {
    let state: State<AppState> = app.state();
    let c = state.clipper.lock().unwrap();
    c.port()
}

#[tauri::command]
pub async fn clipper_set_enabled(app: AppHandle, enabled: bool) {
    let state: State<AppState> = app.state();
    let mut c = state.clipper.lock().unwrap();
    if enabled {
        let _ = c.start(app.clone());
    } else {
        let _ = c.stop();
    }
}
