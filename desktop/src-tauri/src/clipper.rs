// Local HTTP server (matches desktop/main/clipper-server.js) — accepts /status
// and /clip from the browser extension. Listens on 127.0.0.1, increments port if busy.

use crate::store;
use chrono::Utc;
use serde_json::{json, Value};
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const DEFAULT_PORT: u16 = 27123;

#[derive(Default)]
pub struct ClipperState {
    port: Option<u16>,
    server: Option<Arc<tiny_http::Server>>,
}

impl ClipperState {
    pub fn port(&self) -> u16 {
        self.port.unwrap_or(DEFAULT_PORT)
    }

    pub fn is_running(&self) -> bool {
        self.server.is_some()
    }

    pub fn start(&mut self, app: tauri::AppHandle) -> Result<u16, String> {
        if self.is_running() {
            return Ok(self.port());
        }
        let mut port = DEFAULT_PORT;
        let server = loop {
            let addr: SocketAddr = format!("127.0.0.1:{port}")
                .parse()
                .map_err(|e: std::net::AddrParseError| e.to_string())?;
            match tiny_http::Server::http(addr) {
                Ok(s) => break Arc::new(s),
                Err(_) => {
                    if port == DEFAULT_PORT + 50 {
                        return Err("could not bind clipper port".into());
                    }
                    port += 1;
                }
            }
        };
        log::info!("[Clipper] running on http://127.0.0.1:{port}");
        let server_for_thread = server.clone();
        let app_for_thread = app.clone();
        thread::spawn(move || {
            // recv_timeout lets us wake periodically and check whether the server has
            // been unblocked (Arc drop count goes to 1 — we hold no extra references).
            loop {
                match server_for_thread.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(req)) => handle_request(req, &app_for_thread),
                    Ok(None) => {
                        // timeout — check whether the server is still owned externally
                        if Arc::strong_count(&server_for_thread) == 1 {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            log::info!("[Clipper] thread exited");
        });
        self.port = Some(port);
        self.server = Some(server);
        Ok(port)
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(server) = self.server.take() {
            // Calling unblock causes any pending recv to return immediately.
            server.unblock();
            // Dropping our Arc lets the worker loop exit on its next tick.
            drop(server);
        }
        Ok(())
    }
}

fn cors(headers: &mut Vec<tiny_http::Header>) {
    let h = |s: &str| tiny_http::Header::from_bytes(
        &b"Access-Control-Allow-Origin"[..],
        &b"*"[..],
    ).map(|h| (h, s.to_string()));
    let _ = h;
    headers.push(tiny_http::Header::from_bytes(
        &b"Access-Control-Allow-Origin"[..],
        &b"*"[..],
    ).unwrap());
    headers.push(tiny_http::Header::from_bytes(
        &b"Access-Control-Allow-Methods"[..],
        &b"GET, POST, OPTIONS"[..],
    ).unwrap());
    headers.push(tiny_http::Header::from_bytes(
        &b"Access-Control-Allow-Headers"[..],
        &b"Content-Type"[..],
    ).unwrap());
}

fn json_response(status: u16, body: Value) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let s = body.to_string();
    let mut headers = Vec::new();
    cors(&mut headers);
    headers.push(tiny_http::Header::from_bytes(
        &b"Content-Type"[..],
        &b"application/json"[..],
    ).unwrap());
    let mut resp = tiny_http::Response::from_string(s).with_status_code(status);
    for h in headers {
        resp = resp.with_header(h);
    }
    resp
}

fn handle_request(mut req: tiny_http::Request, app: &tauri::AppHandle) {
    let method = req.method().clone();
    let url = req.url().split('?').next().unwrap_or("").to_string();

    if matches!(method, tiny_http::Method::Options) {
        let mut headers = Vec::new();
        cors(&mut headers);
        let mut resp = tiny_http::Response::empty(204);
        for h in headers {
            resp = resp.with_header(h);
        }
        let _ = req.respond(resp);
        return;
    }

    if matches!(method, tiny_http::Method::Get) && url == "/status" {
        let vault = store::get_active_vault();
        let body = json!({
            "running": true,
            "vault": vault.as_ref().map(|v| v.name.clone()),
            "vaultPath": vault.as_ref().map(|v| v.path.clone()),
        });
        let _ = req.respond(json_response(200, body));
        return;
    }

    if matches!(method, tiny_http::Method::Post) && url == "/clip" {
        let mut body_bytes = Vec::new();
        if std::io::Read::read_to_end(req.as_reader(), &mut body_bytes).is_err() {
            let _ = req.respond(json_response(400, json!({ "success": false, "error": "read error" })));
            return;
        }
        let body: Value = match serde_json::from_slice(&body_bytes) {
            Ok(v) => v,
            Err(e) => {
                let _ = req.respond(json_response(400, json!({ "success": false, "error": e.to_string() })));
                return;
            }
        };

        let title = body.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let url_field = body.get("url").and_then(|v| v.as_str()).map(String::from);
        let folder = body.get("folder").and_then(|v| v.as_str()).map(String::from);
        let tags: Vec<String> = match body.get("tags") {
            Some(Value::Array(a)) => a
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
            Some(Value::String(s)) => s
                .split(',')
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect(),
            _ => Vec::new(),
        };

        if title.is_empty() || content.is_empty() {
            let _ = req.respond(json_response(
                400,
                json!({ "success": false, "error": "Missing required fields: title, content" }),
            ));
            return;
        }

        let vault = match store::get_active_vault() {
            Some(v) => v,
            None => {
                let _ = req.respond(json_response(
                    500,
                    json!({ "success": false, "error": "No active vault. Please open Noteriv and select a vault." }),
                ));
                return;
            }
        };

        let mut save_dir = PathBuf::from(&vault.path);
        if let Some(f) = folder.as_deref() {
            if !f.is_empty() {
                save_dir = save_dir.join(f);
            }
        }
        if let Err(e) = fs::create_dir_all(&save_dir) {
            let _ = req.respond(json_response(
                500,
                json!({ "success": false, "error": format!("Failed to create directory: {e}") }),
            ));
            return;
        }

        let frontmatter = build_frontmatter(&title, url_field.as_deref(), &tags);
        let file_content = format!("{frontmatter}\n\n{content}");

        let mut base_name = sanitize_filename(&title);
        if base_name.is_empty() {
            base_name = "Clipped Note".into();
        }
        let mut file_name = format!("{base_name}.md");
        let mut file_path = save_dir.join(&file_name);
        let mut counter = 1;
        while file_path.exists() {
            file_name = format!("{base_name} ({counter}).md");
            file_path = save_dir.join(&file_name);
            counter += 1;
        }

        if let Err(e) = fs::write(&file_path, file_content) {
            let _ = req.respond(json_response(
                500,
                json!({ "success": false, "error": format!("Failed to write file: {e}") }),
            ));
            return;
        }

        let saved = file_path.to_string_lossy().into_owned();
        let _ = req.respond(json_response(
            200,
            json!({ "success": true, "filePath": saved.clone() }),
        ));
        crate::emit_to_main(app, "clipper:clipped", saved);
        return;
    }

    let _ = req.respond(json_response(404, json!({ "error": "Not found" })));
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\u{0}'..='\u{1F}'
            )
        })
        .collect();
    let collapsed: String = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = collapsed.trim();
    let mut out: String = trimmed.chars().take(200).collect();
    out = out.trim().to_string();
    out
}

fn build_frontmatter(title: &str, url: Option<&str>, tags: &[String]) -> String {
    let clipped = Utc::now().format("%Y-%m-%d").to_string();
    let mut lines = vec!["---".to_string()];
    lines.push(format!("title: \"{}\"", title.replace('"', "\\\"")));
    if let Some(u) = url {
        if !u.is_empty() {
            lines.push(format!("url: \"{u}\""));
        }
    }
    lines.push(format!("clipped: {clipped}"));
    if !tags.is_empty() {
        let formatted: Vec<String> = tags
            .iter()
            .map(|t| format!("\"{}\"", t.trim()))
            .collect();
        lines.push(format!("tags: [{}]", formatted.join(", ")));
    }
    lines.push("---".into());
    lines.join("\n")
}

#[allow(dead_code)]
fn _unused(_p: &Path) {} // keeps `Path` import green
