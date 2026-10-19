// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Portable mode (Windows): redirect WebView2's user data folder
    // (IndexedDB, localStorage, cache) alongside the EXE. Must be set
    // before WebView2 is initialized — i.e., before Tauri starts.
    // No-op on macOS / Linux (different webview runtimes).
    #[cfg(target_os = "windows")]
    if let Some(root) = noteriv_lib::portable_root_public() {
        let wv = root.join("data").join("webview");
        // SAFETY: single-threaded, before any other code runs.
        unsafe { std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &wv); }
    }

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
        appimage::prefer_system_libwayland();

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

/// The AppImage bundles libwayland from the CI build host, and the AppImage
/// runtime puts that copy ahead of the system's on the library path. The
/// system's Mesa EGL driver is built against the system libwayland and needs
/// symbols the old copy lacks (Fedora 44 / Mesa 26: wl_fixes_interface,
/// wl_display_create_queue_with_name, wl_display_dispatch_queue_timeout), so
/// it fails to load. WebKit then finds no usable EGL display and the web
/// process aborts with "Could not create default EGL display:
/// EGL_BAD_PARAMETER", leaving a blank window (issue #41). NVIDIA's driver
/// doesn't use Mesa, which is why only Intel/AMD machines hit it.
///
/// Restart once with the system's libwayland-client preloaded, provided it's
/// at least as new as the bundled copy, so Mesa gets the library it was built
/// against while the bundled GTK and WebKit still find every symbol they need.
#[cfg(target_os = "linux")]
mod appimage {
    use std::ffi::OsString;
    use std::os::unix::process::CommandExt;
    use std::path::{Path, PathBuf};

    const RESTARTED: &str = "NOTERIV_SYSTEM_LIBWAYLAND";
    /// libwayland minor version bundled by the CI build host (ubuntu-22.04 ships
    /// 1.20). Keep in step with the runner image in release.yml.
    const BUNDLED_MINOR: u32 = 20;

    pub fn prefer_system_libwayland() {
        if std::env::var_os("APPIMAGE").is_none() || std::env::var_os(RESTARTED).is_some() {
            return;
        }
        let Some(system) = system_libwayland_client() else { return };
        if wayland_minor(&system).map_or(true, |minor| minor < BUNDLED_MINOR) {
            return;
        }
        let Ok(exe) = std::env::current_exe() else { return };
        let mut preload = OsString::from(&system);
        if let Some(existing) = std::env::var_os("LD_PRELOAD").filter(|v| !v.is_empty()) {
            preload.push(":");
            preload.push(existing);
        }
        let err = std::process::Command::new(exe)
            .args(std::env::args_os().skip(1))
            .env("LD_PRELOAD", preload)
            .env(RESTARTED, "1")
            .exec();
        // exec only returns on failure; carry on with the bundled copy.
        eprintln!("[startup] could not restart with the system libwayland: {err}");
    }

    /// The system's 64-bit libwayland-client. `/usr/lib` comes last because on
    /// Fedora it holds the 32-bit libraries.
    fn system_libwayland_client() -> Option<PathBuf> {
        let multiarch = format!("/usr/lib/{}-linux-gnu", std::env::consts::ARCH);
        ["/usr/lib64", multiarch.as_str(), "/lib64", "/usr/lib"]
            .iter()
            .map(|dir| Path::new(dir).join("libwayland-client.so.0"))
            .find(|path| is_elf64(path))
    }

    fn is_elf64(path: &Path) -> bool {
        use std::io::Read;
        let mut header = [0u8; 5];
        std::fs::File::open(path)
            .and_then(|mut f| f.read_exact(&mut header))
            .is_ok()
            && header[..4] == *b"\x7fELF"
            && header[4] == 2
    }

    /// `libwayland-client.so.0` resolves to `libwayland-client.so.0.<minor>.<patch>`,
    /// where `<minor>` is libwayland's own minor version (0.26.0 is 1.26).
    fn wayland_minor(path: &Path) -> Option<u32> {
        let real = std::fs::canonicalize(path).ok()?;
        minor_from_file_name(real.file_name()?.to_str()?)
    }

    fn minor_from_file_name(name: &str) -> Option<u32> {
        name.strip_prefix("libwayland-client.so.0.")?.split('.').next()?.parse().ok()
    }

    #[cfg(test)]
    mod tests {
        use super::minor_from_file_name;

        #[test]
        fn reads_the_minor_version_from_the_library_file_name() {
            assert_eq!(minor_from_file_name("libwayland-client.so.0.26.0"), Some(26));
            assert_eq!(minor_from_file_name("libwayland-client.so.0.20.0"), Some(20));
            assert_eq!(minor_from_file_name("libwayland-client.so.0"), None);
            assert_eq!(minor_from_file_name("libwayland-server.so.0.26.0"), None);
        }
    }
}
