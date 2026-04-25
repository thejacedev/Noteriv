// Thin wrappers over tauri-plugin-updater to match the renderer's window.electronAPI surface.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Default)]
pub struct UpdateInfo {
    available: bool,
    version: Option<String>,
    #[serde(rename = "releaseDate")]
    release_date: Option<String>,
    #[serde(rename = "releaseNotes")]
    release_notes: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> UpdateInfo {
    #[cfg(desktop)]
    {
        match app.updater() {
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => UpdateInfo {
                    available: true,
                    version: Some(update.version.clone()),
                    release_date: update.date.map(|d| d.to_string()),
                    release_notes: update.body.clone(),
                    error: None,
                },
                Ok(None) => UpdateInfo {
                    available: false,
                    ..Default::default()
                },
                Err(e) => UpdateInfo {
                    available: false,
                    error: Some(e.to_string()),
                    ..Default::default()
                },
            },
            Err(e) => UpdateInfo {
                available: false,
                error: Some(e.to_string()),
                ..Default::default()
            },
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        UpdateInfo::default()
    }
}

#[tauri::command]
pub async fn updater_download(app: AppHandle) -> bool {
    #[cfg(desktop)]
    {
        let updater = match app.updater() {
            Ok(u) => u,
            Err(_) => return false,
        };
        let update = match updater.check().await {
            Ok(Some(u)) => u,
            _ => return false,
        };
        let app_progress = app.clone();
        let app_done = app.clone();
        let result = update
            .download_and_install(
                move |chunk_length, content_length| {
                    let payload = json!({
                        "percent": content_length
                            .map(|t| (chunk_length as f64 / t as f64) * 100.0)
                            .unwrap_or(0.0),
                        "bytesPerSecond": 0,
                        "transferred": chunk_length,
                        "total": content_length.unwrap_or(0),
                    });
                    crate::emit_to_main(&app_progress, "updater:download-progress", payload);
                },
                move || {
                    crate::emit_to_main(
                        &app_done,
                        "updater:update-downloaded",
                        json!({ "version": "" }),
                    );
                },
            )
            .await;
        result.is_ok()
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub async fn updater_install(app: AppHandle) {
    // tauri-plugin-updater installs the update after download_and_install completes.
    // Restart the process to apply it (parity with electron-updater.quitAndInstall()).
    #[cfg(desktop)]
    {
        app.restart();
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
}

#[tauri::command]
pub async fn updater_get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg(desktop)]
pub async fn check_and_emit(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            let payload: Value = json!({
                "version": update.version,
                "releaseDate": update.date.map(|d| d.to_string()),
                "releaseNotes": update.body,
            });
            crate::emit_to_main(app, "updater:update-available", payload);
        }
        Ok(None) => {
            crate::emit_to_main(app, "updater:update-not-available", Value::Null);
        }
        Err(e) => {
            crate::emit_to_main(app, "updater:error", json!({ "message": e.to_string() }));
        }
    }
    Ok(())
}
