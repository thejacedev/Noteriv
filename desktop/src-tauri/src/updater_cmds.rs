// Thin wrappers over tauri-plugin-updater to match the renderer's window.electronAPI surface.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::utils::config::BundleType;
use tauri::AppHandle;

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

/// How this copy of the app gets a new version.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum UpdateWay {
    /// It replaces itself: the AppImage, the macOS app, an install made by
    /// one of the Windows installers.
    InApp,
    /// It cannot replace itself. Its files belong to a package manager (the
    /// .deb, the .rpm, the AUR and COPR packages that are made from the
    /// .deb), or it is a build that nobody installed. It says that a new
    /// version is out and opens the download page.
    Download,
    /// Something else keeps it up to date, or it is updated by hand: Flatpak
    /// and the portable build. The update controls are not shown at all.
    Managed,
}

/// `bundle` is the kind of package the build was made for, which the bundler
/// writes into the binary. `appimage` says the app was started by an
/// AppImage's launcher, which is the only way it knows which file to replace.
pub(crate) fn update_way(
    os: &str,
    bundle: Option<BundleType>,
    appimage: bool,
    flatpak: bool,
    portable: bool,
) -> UpdateWay {
    if flatpak || portable {
        return UpdateWay::Managed;
    }
    let in_app = match os {
        "linux" => appimage && matches!(bundle, Some(BundleType::AppImage)),
        "windows" => matches!(bundle, Some(BundleType::Msi | BundleType::Nsis)),
        "macos" => true,
        _ => false,
    };
    if in_app {
        UpdateWay::InApp
    } else {
        UpdateWay::Download
    }
}

fn current_update_way(app: &AppHandle) -> UpdateWay {
    #[cfg(target_os = "linux")]
    let appimage = {
        use tauri::Manager;
        app.env().appimage.is_some()
    };
    #[cfg(not(target_os = "linux"))]
    let appimage = {
        let _ = app;
        false
    };
    update_way(
        std::env::consts::OS,
        tauri::utils::platform::bundle_type(),
        appimage,
        crate::paths::is_flatpak(),
        crate::paths::is_portable(),
    )
}

#[derive(Debug, Serialize, Default)]
pub struct UpdateInfo {
    available: bool,
    version: Option<String>,
    #[serde(rename = "releaseDate")]
    release_date: Option<String>,
    #[serde(rename = "releaseNotes")]
    release_notes: Option<String>,
    error: Option<String>,
    /// False when this copy cannot install the update itself, and the
    /// download page is the way to get it.
    #[serde(rename = "canInstall")]
    can_install: bool,
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> UpdateInfo {
    if crate::paths::is_flatpak() {
        return UpdateInfo {
            available: false,
            error: Some("Installed via Flatpak: updates are managed by Flatpak/Flathub.".into()),
            ..Default::default()
        };
    }
    if crate::paths::is_portable() {
        return UpdateInfo {
            available: false,
            error: Some("Portable build: update manually by downloading the latest zip.".into()),
            ..Default::default()
        };
    }
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
                    can_install: current_update_way(&app) == UpdateWay::InApp,
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

/// What became of a download: done, or why not. The reason is shown as it
/// is, so that "it failed" can be told apart from "the file did not match
/// its signature" or "the folder cannot be written to".
#[derive(Debug, Serialize)]
pub struct DownloadOutcome {
    ok: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn updater_download(app: AppHandle) -> DownloadOutcome {
    match download_and_install(&app).await {
        Ok(()) => DownloadOutcome {
            ok: true,
            error: None,
        },
        Err(error) => DownloadOutcome {
            ok: false,
            error: Some(error),
        },
    }
}

#[cfg(desktop)]
async fn download_and_install(app: &AppHandle) -> Result<(), String> {
    // The plugin would go ahead on any copy: on a .deb or .rpm install it
    // asks for the administrator password to run dpkg or rpm, and on a plain
    // binary it writes the AppImage over the binary.
    if current_update_way(app) != UpdateWay::InApp {
        return Err("This copy of Noteriv cannot replace itself. Install the new version the way you installed this one.".into());
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("There is no newer version to download.")?;

    let version = update.version.clone();
    let app_progress = app.clone();
    let app_done = app.clone();
    // The plugin reports each piece as it arrives, not the total so far.
    let mut received: u64 = 0;
    let mut last_percent: u64 = u64::MAX;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                received += chunk_length as u64;
                let total = content_length.unwrap_or(0);
                let percent = if total > 0 {
                    (received.min(total) * 100) / total
                } else {
                    0
                };
                // One event for each percent, not one for each piece.
                if percent == last_percent {
                    return;
                }
                last_percent = percent;
                let payload = json!({
                    "percent": percent,
                    "bytesPerSecond": 0,
                    "transferred": received,
                    "total": total,
                });
                crate::emit_to_main(&app_progress, "updater:download-progress", payload);
            },
            move || {
                crate::emit_to_main(
                    &app_done,
                    "updater:update-downloaded",
                    json!({ "version": version }),
                );
            },
        )
        .await
        .map_err(|e| format!("The update could not be installed: {e}"))
}

#[cfg(not(desktop))]
async fn download_and_install(_app: &AppHandle) -> Result<(), String> {
    Err("Updates are installed by the app store on this device.".into())
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

/// True when self-update is unavailable and the update UI should be hidden:
/// inside Flatpak (managed by Flathub) or in a portable build.
#[tauri::command]
pub async fn updater_is_managed() -> bool {
    crate::paths::is_flatpak() || crate::paths::is_portable()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_copy_that_owns_its_files_replaces_itself() {
        use BundleType::*;
        use UpdateWay::*;
        // Linux: the AppImage, and only when its launcher started it.
        assert_eq!(
            update_way("linux", Some(AppImage), true, false, false),
            InApp
        );
        assert_eq!(
            update_way("linux", Some(AppImage), false, false, false),
            Download
        );
        // A package manager owns these. The AUR and COPR packages are made
        // from the .deb, so "Deb" does not even mean dpkg is there.
        assert_eq!(
            update_way("linux", Some(Deb), false, false, false),
            Download
        );
        assert_eq!(
            update_way("linux", Some(Rpm), false, false, false),
            Download
        );
        // A build from source, also when something set APPIMAGE around it.
        assert_eq!(update_way("linux", None, false, false, false), Download);
        assert_eq!(update_way("linux", None, true, false, false), Download);

        assert_eq!(
            update_way("windows", Some(Nsis), false, false, false),
            InApp
        );
        assert_eq!(update_way("windows", Some(Msi), false, false, false), InApp);
        // The bare exe, which the installers would install beside it.
        assert_eq!(update_way("windows", None, false, false, false), Download);

        assert_eq!(update_way("macos", Some(App), false, false, false), InApp);
        assert_eq!(update_way("freebsd", None, false, false, false), Download);
    }

    #[test]
    fn flatpak_and_the_portable_build_are_left_alone() {
        use UpdateWay::Managed;
        // The .deb inside the Flatpak, and the portable exe from an installer build.
        assert_eq!(
            update_way("linux", Some(BundleType::Deb), false, true, false),
            Managed
        );
        assert_eq!(
            update_way("linux", Some(BundleType::AppImage), true, true, false),
            Managed
        );
        assert_eq!(
            update_way("windows", Some(BundleType::Nsis), false, false, true),
            Managed
        );
        assert_eq!(update_way("windows", None, false, false, true), Managed);
    }
}
