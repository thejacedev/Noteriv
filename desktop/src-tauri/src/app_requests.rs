//! Things the app is asked to do from outside its window: a command line, a
//! second launch that hands its arguments to the copy already running, and a
//! `noteriv://` link. `cli.rs` reads all three into one `Request`; this
//! module works out what the request means on this machine (which vault,
//! which file) and passes it to the window.
//!
//! A request waits in a queue until the window takes it. The window may not
//! be drawn yet when the first one arrives, and an event sent then would be
//! lost.
//!
//! A link is not trusted. `cli::parse_url` has already refused anything that
//! names a path outside a vault or would replace a note; here a link's file
//! must also be found in a vault as it is on disk, and the window asks the
//! user before a link writes anything.

use crate::cli::{self, Invocation, Request, VaultRef};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// Requests the window has not taken yet.
#[derive(Default)]
pub struct Pending(Mutex<Vec<Value>>);

fn full_path(vault: &VaultRef, rel: &str) -> String {
    let mut path = PathBuf::from(&vault.path);
    for part in rel.split('/').filter(|part| !part.is_empty()) {
        path.push(part);
    }
    path.to_string_lossy().into_owned()
}

fn failed(from_link: bool, message: String) -> Value {
    json!({ "action": "error", "fromLink": from_link, "message": message })
}

/// What the window is to do for an invocation, or `None` when it is not
/// something for the window (a command that prints, which the process that
/// was asked has already carried out itself).
///
/// `grant` lets the window read one file outside every vault: a note the
/// user named themselves on a command line.
pub fn resolve(invocation: Invocation, grant: &dyn Fn(&str)) -> Option<Value> {
    let (request, from_link) = match invocation {
        Invocation::App(None) => return Some(json!({ "action": "focus", "fromLink": false })),
        Invocation::App(Some(request)) => (request, false),
        Invocation::Link(Ok(request)) => (request, true),
        Invocation::Link(Err(reason)) => {
            return Some(failed(true, format!("That link could not be followed. {reason}")))
        }
        _ => return None,
    };
    let (vaults, active) = cli::vaults_from_store();
    // Whether carrying it out creates or changes a note: the window asks first when a link does.
    let writes = request.writes();
    let wanted = request.vault().map(str::to_string);
    let chosen = || cli::find_vault(&vaults, active.as_deref(), wanted.as_deref());

    let resolved = match request {
        Request::Open { path: Some(path), line, heading, .. } => {
            match cli::locate(Path::new(&path), &vaults) {
                Some((vault, rel)) => json!({
                    "action": "open", "vaultId": vault.id, "filePath": full_path(vault, &rel),
                    "line": line, "heading": heading,
                }),
                // A file in no vault opens only for the user who named it, never for a link.
                None if !from_link && Path::new(&path).is_file() => {
                    grant(&path);
                    json!({ "action": "open", "vaultId": null, "filePath": path, "line": line, "heading": heading })
                }
                None => return Some(failed(from_link, "That file is not in one of your vaults.".into())),
            }
        }
        Request::Open { file, line, heading, .. } => {
            let vault = match chosen() {
                Ok(vault) => vault,
                Err(e) => return Some(failed(from_link, e)),
            };
            let file_path = match file {
                Some(note) => match cli::find_note(&vault.path, &note) {
                    Ok(rel) => Some(full_path(vault, &rel)),
                    Err(e) => return Some(failed(from_link, e)),
                },
                None => None,
            };
            json!({ "action": "open", "vaultId": vault.id, "filePath": file_path, "line": line, "heading": heading })
        }
        Request::New { name, content, mode, silent, .. } => match chosen() {
            Ok(vault) => json!({
                "action": "new", "vaultId": vault.id, "vaultPath": vault.path,
                "name": name, "content": content, "mode": mode, "silent": silent,
            }),
            Err(e) => return Some(failed(from_link, e)),
        },
        Request::Daily { .. } => match chosen() {
            Ok(vault) => json!({ "action": "daily", "vaultId": vault.id }),
            Err(e) => return Some(failed(from_link, e)),
        },
        Request::Unique { content, .. } => match chosen() {
            Ok(vault) => json!({
                "action": "unique", "vaultId": vault.id, "vaultPath": vault.path, "content": content,
            }),
            Err(e) => return Some(failed(from_link, e)),
        },
        Request::Search { query, .. } => match chosen() {
            Ok(vault) => json!({ "action": "search", "vaultId": vault.id, "query": query }),
            Err(e) => return Some(failed(from_link, e)),
        },
    };
    let mut resolved = resolved;
    resolved["fromLink"] = json!(from_link);
    resolved["writes"] = json!(writes);
    Some(resolved)
}

/// Queue a request for the window and tell it something is waiting.
/// `bring_forward` raises the window as well: for a request that arrives
/// while the app is running, not for the one it was started with.
pub fn deliver(app: &tauri::AppHandle, invocation: Invocation, bring_forward: bool) {
    let grant = |path: &str| {
        if let Some(state) = app.try_state::<crate::AppState>() {
            state.scope.grant(path);
        }
    };
    let Some(request) = resolve(invocation, &grant) else {
        return;
    };
    if let Some(state) = app.try_state::<crate::AppState>() {
        if let Ok(mut pending) = state.requests.0.lock() {
            pending.push(request);
        }
    }
    if bring_forward {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            // Showing a window that is already shown also brings back the
            // menu bar the app keeps hidden, so it is only shown when hidden,
            // and the menu bar is put away again afterwards.
            if !window.is_visible().unwrap_or(true) {
                let _ = window.show();
                #[cfg(not(target_os = "windows"))]
                let _ = window.hide_menu();
            }
            let _ = window.set_focus();
        }
    }
    crate::emit_to_main(app, "app:request", ());
}

/// The requests waiting for the window, oldest first. Taking them empties the queue.
#[tauri::command]
pub async fn app_take_requests(app: tauri::AppHandle) -> Vec<Value> {
    app.try_state::<crate::AppState>()
        .and_then(|state| state.requests.0.lock().ok().map(|mut pending| std::mem::take(&mut *pending)))
        .unwrap_or_default()
}

/// The arguments this process was started with, read before the window
/// exists. A command that only prints is carried out here and the process
/// ends; anything else is returned, to be delivered once the app is up.
pub fn at_startup() -> Invocation {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match cli::parse_args(&args) {
        Err(message) => {
            attach_console();
            eprintln!("{message}");
            std::process::exit(cli::EXIT_USAGE);
        }
        Ok(Invocation::Help(topic)) => {
            attach_console();
            println!("{}", cli::help_text(topic.as_deref()));
            std::process::exit(0);
        }
        Ok(Invocation::Version) => {
            attach_console();
            println!("{}", cli::version_text());
            std::process::exit(0);
        }
        Ok(Invocation::Headless(command)) => {
            attach_console();
            let (vaults, active) = cli::vaults_from_store();
            let code = cli::run(
                &command,
                &vaults,
                active.as_deref(),
                &mut std::io::stdin().lock(),
                &mut std::io::stdout().lock(),
                &mut std::io::stderr().lock(),
            );
            std::process::exit(code);
        }
        Ok(other) => other,
    }
}

/// A Windows release build has no console of its own (see `main.rs`), so
/// what a command prints would go nowhere. This joins the console of the
/// terminal the command was typed in, when there is one.
#[cfg(windows)]
fn attach_console() {
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }
    const PARENT_PROCESS: u32 = 0xFFFF_FFFF;
    // SAFETY: a plain Win32 call with no pointers. It fails harmlessly when
    // there is no parent console or one is attached already.
    unsafe {
        AttachConsole(PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
fn attach_console() {}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_grant(_: &str) {}

    #[test]
    fn a_bare_launch_only_brings_the_window_forward() {
        let request = resolve(Invocation::App(None), &no_grant).unwrap();
        assert_eq!(request["action"], "focus");
        assert_eq!(request["fromLink"], false);
    }

    #[test]
    fn a_link_that_cannot_be_read_becomes_a_message_and_stays_marked_as_a_link() {
        let request = resolve(Invocation::Link(Err("It names no action.".into())), &no_grant).unwrap();
        assert_eq!(request["action"], "error");
        assert_eq!(request["fromLink"], true);
        assert!(request["message"].as_str().unwrap().contains("It names no action."));
    }

    #[test]
    fn a_command_that_prints_is_nothing_for_the_window() {
        assert!(resolve(Invocation::Version, &no_grant).is_none());
        assert!(resolve(Invocation::Help(None), &no_grant).is_none());
    }

    #[test]
    fn a_link_to_a_file_outside_every_vault_is_refused_and_nothing_is_granted() {
        let dir = std::env::temp_dir().join(format!("noteriv-req-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("loose.md");
        std::fs::write(&file, "x").unwrap();
        let granted = std::cell::Cell::new(false);
        let grant = |_: &str| granted.set(true);
        let open = Request::Open {
            vault: None,
            file: None,
            path: Some(file.to_string_lossy().into_owned()),
            line: None,
            heading: None,
        };
        // No vault of the user's holds a temp file, so `locate` finds none.
        let request = resolve(Invocation::Link(Ok(open)), &grant).unwrap();
        assert_eq!(request["action"], "error");
        assert!(!granted.get());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_inside_a_vault_is_built_from_its_parts() {
        let vault = VaultRef { id: "v".into(), name: "V".into(), path: PathBuf::from("/tmp/vault") };
        let path = full_path(&vault, "Projects/Alpha.md");
        assert_eq!(PathBuf::from(path), PathBuf::from("/tmp/vault").join("Projects").join("Alpha.md"));
    }
}
