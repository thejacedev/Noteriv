mod auth;
mod app_requests;
mod cli;
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
mod importers;
mod links;
mod menu;
mod paths;
mod scope;
mod search;
mod shim;
mod store;
mod sync_crypto;
mod sync_folder;
mod sync_webdav;
mod updater_cmds;
mod vault_index;
mod watcher;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Re-export for `main.rs` (which can't see the private `paths` module directly).
pub fn portable_root_public() -> Option<PathBuf> {
    paths::portable_root()
}

/// Mutable app-wide state. Wrapped in Mutex because Tauri commands take `&State<...>`.
pub struct AppState {
    pub clipper: Mutex<clipper::ClipperState>,
    pub watcher: Mutex<watcher::WatcherState>,
    /// Paths the webview is permitted to reach. See `scope`.
    pub scope: scope::PathScope,
    /// What a command line or a link asked for, waiting for the window. See `app_requests`.
    pub requests: app_requests::Pending,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // A command that only prints (`noteriv search ...`) is done here and the
    // process ends, before any window or plugin is set up.
    let startup = app_requests::at_startup();

    // One-time legacy token migration (Electron safeStorage → Tauri keyring).
    auth::migrate_legacy_tokens();

    let app_state = AppState {
        clipper: Mutex::new(clipper::ClipperState::default()),
        watcher: Mutex::new(watcher::WatcherState::default()),
        scope: scope::PathScope::default(),
        requests: app_requests::Pending::default(),
    };

    let mut builder = tauri::Builder::default().manage(app_state);

    // One running copy of the app. A later launch hands its arguments to the
    // first and ends: that is how a clicked noteriv:// link, a note opened
    // from the file manager, or `noteriv open ...` reaches the open window.
    // This plugin has to be registered before every other.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let args = argv.get(1..).unwrap_or_default();
            match cli::parse_args_in(args, std::path::Path::new(&cwd)) {
                // A command that prints was carried out by the process that was
                // asked, before it got this far. It is never run from here.
                Ok(invocation) => app_requests::deliver(app, invocation, true),
                Err(_) => app_requests::deliver(app, cli::Invocation::App(None), true),
            }
        }));
    }

    let mut builder = builder
        .plugin(tauri_plugin_deep_link::init())
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
            commands_window::window_set_title,
            commands_window::window_platform,
            commands_window::window_open_popout,
            app_requests::app_take_requests,
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
            commands_fs::fs_read_text_file,
            commands_fs::fs_read_binary_file,
            commands_fs::fs_write_file,
            commands_fs::fs_write_file_guarded,
            commands_fs::fs_read_dir,
            commands_fs::fs_create_file,
            commands_fs::fs_delete_file,
            commands_fs::fs_delete_dir,
            commands_fs::fs_rename,
            commands_fs::fs_rename_update_links,
            commands_fs::fs_vault_index,
            commands_fs::fs_search_vault,
            commands_fs::fs_import_notes,
            commands_fs::fs_list_vault_files,
            commands_fs::fs_trash_system,
            commands_fs::fs_create_dir,
            commands_fs::fs_copy_file,
            commands_fs::fs_write_binary_file,
            commands_fs::fs_search_in_files,
            commands_fs::fs_list_all_files,
            commands_fs::fs_list_knowledge_files,
            commands_fs::fs_get_file_stats,
            commands_fs::fs_apply_knowledge_change,
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
            updater_cmds::updater_is_managed,
        ])
        .setup(move |app| {
            // What this launch was started to do, for the window to pick up.
            app_requests::deliver(app.handle(), startup, false);

            // On macOS a clicked link arrives as an event rather than as an
            // argument. Elsewhere it is an argument, read above or handed
            // over by a second launch.
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        app_requests::deliver(&handle, cli::Invocation::Link(cli::parse_url(url.as_str())), true);
                    }
                });
            }
            // An AppImage is not installed, so nothing told the system that
            // noteriv:// links are for it. Say so now. Installed packages do
            // this through their desktop file or installer instead.
            #[cfg(target_os = "linux")]
            if std::env::var_os("APPIMAGE").is_some() {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("could not register noteriv:// links: {e}");
                }
            }

            // Inject the window.electronAPI shim so unmodified renderer code works.
            let main_win = app.get_webview_window("main").expect("main window");
            let _ = main_win.eval(shim::SHIM_JS);

            // Windows users expect the native title bar and menu bar. Other
            // platforms retain the existing custom window chrome.
            #[cfg(target_os = "windows")]
            let _ = main_win.set_decorations(true);

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

            // Auto-update check on startup (if enabled). Skipped in portable
            // mode — the running EXE can't reliably replace itself from a
            // USB stick or read-only mount, and portable users expect no
            // surprise writes to the executable directory.
            #[cfg(desktop)]
            if !paths::is_portable() && !paths::is_flatpak() {
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
            // Only the main window owns the watcher and the clipper: closing
            // a pop-out must leave them running.
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle();
                commands_window::close_popouts(app_handle);
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
