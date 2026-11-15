use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use crate::AppState;

/// Whether a link may be handed to the system to open: a web page, or a mail
/// or phone link, which open the mail program or the dialler. Nothing else
/// is let through. `file:` and the schemes programs register for themselves
/// can start a program with what the link says, and a link comes from a note
/// or a web page, not from the user.
pub(crate) fn is_openable_url(url: &str) -> bool {
    if url.chars().any(char::is_control) {
        return false;
    }
    let Some((scheme, rest)) = url.split_once(':') else {
        return false;
    };
    match scheme.to_ascii_lowercase().as_str() {
        "http" | "https" => rest.len() > 2 && rest.starts_with("//"),
        "mailto" | "tel" => !rest.is_empty(),
        _ => false,
    }
}

#[tauri::command]
pub async fn shell_open_external(app: tauri::AppHandle, url: String) {
    if is_openable_url(&url) {
        let _ = app.opener().open_url(url, None::<&str>);
    } else {
        log::warn!("[shell] refused to open a link that is not a web, mail or phone link");
    }
}

/// Hand a path to the OS opener.
///
/// The opener resolves the file's registered handler and starts it, so an
/// unrestricted version of this command turns any write primitive in the
/// webview into process execution. Only the exact paths the user named in a
/// native dialog this session are accepted; neither vault membership nor
/// sitting inside a picked folder is enough, because a file can reach either
/// place without the user ever choosing it — through sync, the web clipper, the
/// MCP server, or a write from the renderer itself.
#[tauri::command]
pub async fn shell_open_path(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !state.scope.is_openable(Path::new(&file_path)) {
        log::warn!("[shell] refused open_path for a path the user did not select: {file_path}");
        return Err("refusing to open a path that was not selected by the user".into());
    }
    app.opener()
        .open_path(&file_path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_openable_url;

    #[test]
    fn web_mail_and_phone_links_open() {
        for url in [
            "https://example.com",
            "http://localhost:3000/page?x=1#top",
            "HTTPS://Example.com/",
            "mailto:someone@example.com",
            "mailto:someone@example.com?subject=Hello%20there&body=Hi",
            "MAILTO:someone@example.com",
            "tel:+15551234567",
        ] {
            assert!(is_openable_url(url), "{url} should open");
        }
    }

    #[test]
    fn other_links_do_not_open() {
        for url in [
            "",
            "example.com",
            "mailto:",
            "tel:",
            "https://",
            "http:/example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "noteriv://open?file=Note",
            "vscode://file/etc/passwd",
            "data:text/html,<script>alert(1)</script>",
            " mailto:someone@example.com",
            "mailto:someone@example.com\nBcc: other@example.com",
            "https://example.com/\u{0}",
            "-mailto:someone@example.com",
        ] {
            assert!(!is_openable_url(url), "{url:?} should not open");
        }
    }
}
