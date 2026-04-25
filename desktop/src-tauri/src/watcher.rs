// File system watcher — emits "vault:changed" events to the renderer.
// Mirrors the recursive fs.watch + 300ms debounce in desktop/main/main.js.

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub struct WatcherState {
    debouncer: Option<Debouncer<notify::RecommendedWatcher>>,
    current_path: Option<PathBuf>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            debouncer: None,
            current_path: None,
        }
    }
}

impl WatcherState {
    pub fn start(&mut self, vault_path: &str, app: tauri::AppHandle) -> Result<(), String> {
        self.stop();
        let p = PathBuf::from(vault_path);
        if !p.exists() {
            return Ok(());
        }
        let app_clone = app.clone();
        let internal = p.join(".noteriv");
        let git_dir = p.join(".git");
        let trash = p.join(".trash");
        let node_modules = p.join("node_modules");
        let mut debouncer = new_debouncer(
            Duration::from_millis(300),
            move |res: DebounceEventResult| {
                if let Ok(events) = res {
                    for ev in events {
                        // Skip internal/build/vcs paths so they don't fire reload storms.
                        if ev.path.starts_with(&internal)
                            || ev.path.starts_with(&git_dir)
                            || ev.path.starts_with(&trash)
                            || ev.path.starts_with(&node_modules)
                        {
                            continue;
                        }
                        // Also skip any path with a hidden directory component except top-level files.
                        if ev
                            .path
                            .components()
                            .any(|c| {
                                c.as_os_str()
                                    .to_str()
                                    .map(|s| s.starts_with('.') && s.len() > 1 && s != "." && s != "..")
                                    .unwrap_or(false)
                            })
                        {
                            continue;
                        }
                        let payload = ev.path.to_string_lossy().into_owned();
                        crate::emit_to_main(&app_clone, "vault:changed", payload);
                    }
                }
            },
        )
        .map_err(|e| e.to_string())?;
        debouncer
            .watcher()
            .watch(&p, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        self.debouncer = Some(debouncer);
        self.current_path = Some(p);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.debouncer.take();
        self.current_path = None;
    }

    pub fn restart(state: &mut WatcherState, path: &str, app: tauri::AppHandle) -> Result<(), String> {
        state.stop();
        state.start(path, app)
    }
}

#[allow(dead_code)]
fn _path_marker(_p: &Path) {}
