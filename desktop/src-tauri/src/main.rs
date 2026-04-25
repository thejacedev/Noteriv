// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK on Wayland (GNOME on Fedora, recent KDE) crashes with
    // "Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display"
    // because of dmabuf renderer + accelerated compositing on certain GPU /
    // driver combinations. These env vars disable both code paths and force
    // a software-compositing fallback. They're a no-op on macOS and Windows
    // (different webview runtimes) and on Linux X11 sessions, so it's safe
    // to set unconditionally. Users can override by exporting these vars
    // themselves before launching.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            // SAFETY: single-threaded, before any other code runs.
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1"); }
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1"); }
        }
    }

    noteriv_lib::run()
}
