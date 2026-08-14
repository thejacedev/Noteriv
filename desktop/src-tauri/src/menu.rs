// Native application menu. It is visible on Windows and retained for keyboard
// accelerators on platforms that use Noteriv's custom window chrome.

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, WebviewWindow};

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle();

    let new_file = MenuItemBuilder::with_id("menu:new-file", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_file = MenuItemBuilder::with_id("menu:open-file", "Open File")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("menu:open-folder", "Open Folder as Vault")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("menu:save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("menu:save-as", "Save As")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;

    // On macOS, Quit lives in the application menu (below); elsewhere it stays here.
    #[allow(unused_mut)]
    let mut file_builder = SubmenuBuilder::new(app, "File")
        .item(&new_file)
        .item(&open_file)
        .item(&open_folder)
        .separator()
        .item(&save)
        .item(&save_as);
    #[cfg(not(target_os = "macos"))]
    {
        file_builder = file_builder.separator().quit();
    }
    let file_menu = file_builder.build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("menu:zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+Plus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:zoom-reset", "Reset Zoom")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:fullscreen", "Toggle Full Screen")
                .accelerator("F11")
                .build(app)?,
        )
        .build()?;

    #[cfg(not(target_os = "macos"))]
    let settings_menu = SubmenuBuilder::new(app, "Settings")
        .item(
            &MenuItemBuilder::with_id("menu:settings", "Preferences…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .build()?;

    let developer_menu = SubmenuBuilder::new(app, "Developer")
        .item(
            &MenuItemBuilder::with_id("menu:devtools", "Toggle Developer Tools")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:reload", "Reload Window")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .build()?;

    // macOS application menu (the first submenu becomes the app menu). This is
    // where the platform's standard items live: About, Settings (Cmd+,), Hide
    // (Cmd+H), Hide Others (Cmd+Opt+H), Show All, and Quit (Cmd+Q). The Hide /
    // Show roles are native — the renderer never sees them — while Settings
    // emits `menu:settings` like the other accelerators.
    #[cfg(target_os = "macos")]
    let app_menu = {
        use tauri::menu::AboutMetadataBuilder;
        let about = AboutMetadataBuilder::new()
            .name(Some("Noteriv"))
            .version(Some(env!("CARGO_PKG_VERSION")))
            .build();
        let settings = MenuItemBuilder::with_id("menu:settings", "Settings…")
            .accelerator("Cmd+,")
            .build(app)?;
        SubmenuBuilder::new(app, "Noteriv")
            .about(Some(about))
            .separator()
            .item(&settings)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?
    };

    let menu: Menu<_> = {
        let builder = MenuBuilder::new(app);
        #[cfg(target_os = "macos")]
        let builder = builder.items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &developer_menu,
        ]);
        #[cfg(not(target_os = "macos"))]
        let builder = builder.items(&[
            &file_menu,
            &edit_menu,
            &view_menu,
            &settings_menu,
            &developer_menu,
        ]);
        builder.build()?
    };

    app.set_menu(menu)?;
    #[cfg(target_os = "windows")]
    let _ = window.show_menu();
    #[cfg(not(target_os = "windows"))]
    let _ = window.hide_menu();

    let app_handle = app.clone();
    app.on_menu_event(move |_app, event| {
        let id = event.id().0.as_str();
        if let Some(stripped) = id.strip_prefix("menu:") {
            let event_name = format!("menu:{stripped}");
            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.emit(&event_name, ());
                // Built-in view actions
                match stripped {
                    "reload" => {
                        let _ = win.eval("location.reload()");
                    }
                    "devtools" => {
                        if win.is_devtools_open() {
                            win.close_devtools();
                        } else {
                            win.open_devtools();
                        }
                    }
                    "fullscreen" => {
                        let f = win.is_fullscreen().unwrap_or(false);
                        let _ = win.set_fullscreen(!f);
                    }
                    _ => {}
                }
            }
        }
    });

    Ok(())
}
