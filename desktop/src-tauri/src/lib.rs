mod auth;
mod clipper;
mod commands_dialog;
mod commands_fs;
mod commands_git;
mod commands_misc;
mod commands_shell;
mod commands_sync;
mod commands_vault;
mod commands_window;
mod commands_workspace;
mod menu;
mod paths;
mod shim;
mod store;
mod updater_cmds;
mod watcher;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Mutable app-wide state. Wrapped in Mutex because Tauri commands take `&State<...>`.
pub struct AppState {
    pub clipper: Mutex<clipper::ClipperState>,
    pub watcher: Mutex<watcher::WatcherState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // One-time legacy token migration (Electron safeStorage → Tauri keyring).
    auth::migrate_legacy_tokens();

    let app_state = AppState {
        clipper: Mutex::new(clipper::ClipperState::default()),
        watcher: Mutex::new(watcher::WatcherState::default()),
    };

    let mut builder = tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            // window
            commands_window::window_minimize,
            commands_window::window_maximize,
            commands_window::window_close,
            commands_window::window_is_maximized,
            commands_window::window_platform,
            // workspace
            commands_workspace::workspace_load,
            commands_workspace::workspace_save,
            // dialogs
            commands_dialog::dialog_open_file,
            commands_dialog::dialog_open_folder,
            commands_dialog::dialog_show_open,
            commands_dialog::dialog_save_file,
            commands_dialog::dialog_save_html,
            // shell
            commands_shell::shell_open_external,
            commands_shell::shell_open_path,
            // fs
            commands_fs::fs_read_file,
            commands_fs::fs_read_binary_file,
            commands_fs::fs_write_file,
            commands_fs::fs_read_dir,
            commands_fs::fs_create_file,
            commands_fs::fs_delete_file,
            commands_fs::fs_delete_dir,
            commands_fs::fs_rename,
            commands_fs::fs_create_dir,
            commands_fs::fs_copy_file,
            commands_fs::fs_write_binary_file,
            commands_fs::fs_search_in_files,
            commands_fs::fs_list_all_files,
            commands_fs::fs_get_file_stats,
            // vault + settings
            commands_vault::vault_get_config,
            commands_vault::vault_is_setup_complete,
            commands_vault::vault_get_all,
            commands_vault::vault_get_active,
            commands_vault::vault_create,
            commands_vault::vault_update,
            commands_vault::vault_delete,
            commands_vault::vault_set_active,
            commands_vault::settings_load,
            commands_vault::settings_save,
            // auth
            auth::auth_save_token,
            auth::auth_has_token,
            auth::auth_remove_token,
            auth::auth_validate_token,
            auth::auth_list_repos,
            auth::auth_create_repo,
            auth::auth_open_token_page,
            auth::auth_get_user,
            // git
            commands_git::git_is_installed,
            commands_git::git_is_repo,
            commands_git::git_init,
            commands_git::git_set_remote,
            commands_git::git_status,
            commands_git::git_sync,
            commands_git::git_pull,
            commands_git::git_fetch,
            commands_git::git_log,
            commands_git::git_clone,
            commands_git::git_file_log,
            commands_git::git_show_file,
            // sync providers
            commands_sync::sync_run,
            commands_sync::sync_test,
            // clipper
            commands_misc::clipper_get_port,
            commands_misc::clipper_set_enabled,
            // updater (thin wrappers around plugin)
            updater_cmds::updater_check,
            updater_cmds::updater_download,
            updater_cmds::updater_install,
            updater_cmds::updater_get_version,
        ])
        .setup(|app| {
            // Inject the window.electronAPI shim so unmodified renderer code works.
            let main_win = app.get_webview_window("main").expect("main window");
            let _ = main_win.eval(shim::SHIM_JS);

            // Build menu (keyboard accelerators -> emit menu:* events)
            menu::install(&main_win)?;

            // Start watching the active vault (if any) for external file changes.
            if let Some(vault) = store::get_active_vault() {
                let app_handle = app.handle().clone();
                let state: tauri::State<AppState> = app_handle.state();
                let lock_result = state.watcher.lock();
                if let Ok(mut w) = lock_result {
                    if let Err(e) = w.start(&vault.path, app_handle.clone()) {
                        log::warn!("vault watcher start failed: {e}");
                    }
                }
            }

            // Start the web clipper server.
            {
                let app_handle = app.handle().clone();
                let state: tauri::State<AppState> = app_handle.state();
                let lock_result = state.clipper.lock();
                if let Ok(mut c) = lock_result {
                    if let Err(e) = c.start(app_handle.clone()) {
                        log::warn!("clipper start failed: {e}");
                    }
                }
            }

            // Auto-update check on startup (if enabled).
            #[cfg(desktop)]
            {
                let settings = store::load_settings();
                let auto = settings
                    .get("autoUpdate")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                if auto {
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                        let _ = updater_cmds::check_and_emit(&app_handle).await;
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle();
                let state: tauri::State<AppState> = app_handle.state();
                let clipper_lock = state.clipper.lock();
                if let Ok(mut c) = clipper_lock {
                    let _ = c.stop();
                }
                let watcher_lock = state.watcher.lock();
                if let Ok(mut w) = watcher_lock {
                    w.stop();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Helper used across modules to emit events to the main window.
pub fn emit_to_main<S: serde::Serialize + Clone>(app: &tauri::AppHandle, event: &str, payload: S) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit(event, payload);
    }
}
