// Hidden menu — kept only so keyboard accelerators (Cmd/Ctrl+S, etc.) emit
// the same menu:* events the renderer already listens for.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, WebviewWindow};

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle();

    let new_file = MenuItemBuilder::with_id("menu:new-file", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_file = MenuItemBuilder::with_id("menu:open-file", "Open File")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("menu:save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("menu:save-as", "Save As")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_file)
        .item(&open_file)
        .separator()
        .item(&save)
        .item(&save_as)
        .separator()
        .quit()
        .build()?;

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
            &MenuItemBuilder::with_id("menu:reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:devtools", "Toggle DevTools")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(app)?,
        )
        .separator()
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

    let _ = AboutMetadataBuilder::new(); // hush unused-import warning
    let menu: Menu<_> = MenuBuilder::new(app)
        .items(&[&file_menu, &edit_menu, &view_menu])
        .build()?;

    app.set_menu(menu)?;
    // Hide the menu bar (we render our own titlebar; menu exists only for accelerators).
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
                        #[cfg(debug_assertions)]
                        {
                            if win.is_devtools_open() {
                                win.close_devtools();
                            } else {
                                win.open_devtools();
                            }
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
