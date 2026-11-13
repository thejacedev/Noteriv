// Fetches a web page for the reader.
//
// The reader never runs a remote page inside the app's window. This command
// downloads the page's HTML and hands it over as text; the frontend picks the
// readable part out of it without running any of it (see
// `desktop/src/lib/web-reader.ts`).
//
// The request carries nothing that says who the user is: no cookies, no saved
// logins, no referrer, and a User-Agent that names only the app.

use encoding_rs::Encoding;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_TYPE, LOCATION};
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Duration;
use url::Url;

/// What the reader gets back. A failure is a result too, with `ok` false and
/// a sentence in `error`, so the frontend never has to read a rejection.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebPage {
    ok: bool,
    /// A sentence for the user. `None` when the page loaded.
    error: Option<String>,
    /// The address the page was finally read from, after any redirects.
    url: String,
    /// The HTTP status of the last answer, or 0 when the site never answered.
    status: u16,
    /// The `Content-Type` the site sent, as sent.
    content_type: String,
    /// The page's text, already decoded. Empty on failure.
    html: String,
    /// True when the page was longer than the limit and the end was cut off.
    truncated: bool,
}

/// How far one fetch may go. Tests use smaller numbers than the app does.
struct Limits {
    max_bytes: usize,
    timeout: Duration,
    max_redirects: usize,
}

const LIMITS: Limits = Limits {
    max_bytes: 5 * 1024 * 1024,
    timeout: Duration::from_secs(20),
    max_redirects: 5,
};

/// The charset is looked for this far into the page. The standard asks pages
/// to declare it in the first 1024 bytes; a little slack costs nothing.
const CHARSET_SNIFF_BYTES: usize = 4096;

const USER_AGENT: &str = concat!("Noteriv/", env!("CARGO_PKG_VERSION"), " (reader)");

#[tauri::command]
pub async fn web_fetch_page(url: String) -> WebPage {
    fetch_with(client(), &url, &LIMITS).await
}

/// One client for every fetch, so following links on the same site reuses the
/// connection.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        client_builder()
            .build()
            .expect("the reader's HTTP client is built from fixed settings")
    })
}

fn client_builder() -> reqwest::ClientBuilder {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1"),
    );
    // This build of reqwest cannot unpack compressed answers, so ask for none.
    headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("identity"));
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .default_headers(headers)
        // Redirects are followed by hand in `fetch_page`, so each hop is
        // checked the same way the first address is.
        .redirect(reqwest::redirect::Policy::none())
        .referer(false)
        .connect_timeout(Duration::from_secs(10))
}

/// Why a fetch stopped, with what was known about the answer by then.
struct Failure {
    message: String,
    url: String,
    status: u16,
    content_type: String,
}

async fn fetch_with(client: &reqwest::Client, input: &str, limits: &Limits) -> WebPage {
    // One clock for the whole job: connecting, every redirect and reading the body.
    let outcome = match tokio::time::timeout(limits.timeout, fetch_page(client, input, limits)).await {
        Ok(outcome) => outcome,
        Err(_) => Err(Failure {
            message: "The page took too long to answer.".to_string(),
            url: input.trim().to_string(),
            status: 0,
            content_type: String::new(),
        }),
    };
    match outcome {
        Ok(page) => page,
        Err(failure) => WebPage {
            ok: false,
            error: Some(failure.message),
            url: failure.url,
            status: failure.status,
            content_type: failure.content_type,
            html: String::new(),
            truncated: false,
        },
    }
}

async fn fetch_page(client: &reqwest::Client, input: &str, limits: &Limits) -> Result<WebPage, Failure> {
    let mut url = check_url(input).map_err(|message| Failure {
        message,
        url: input.trim().to_string(),
        status: 0,
        content_type: String::new(),
    })?;

    let mut redirects = 0;
    let mut response = loop {
        let response = client.get(url.clone()).send().await.map_err(|e| Failure {
            message: explain_error(&e),
            url: url.to_string(),
            status: 0,
            content_type: String::new(),
        })?;

        let status = response.status();
        let location = response.headers().get(LOCATION).filter(|_| status.is_redirection());
        let Some(location) = location else {
            break response;
        };

        let stop = |message: &str| Failure {
            message: message.to_string(),
            url: url.to_string(),
            status: status.as_u16(),
            content_type: String::new(),
        };
        redirects += 1;
        if redirects > limits.max_redirects {
            return Err(stop("The page redirected too many times."));
        }
        let target = String::from_utf8_lossy(location.as_bytes()).into_owned();
        let mut next = url
            .join(target.trim())
            .ok()
            .and_then(|next| check_url(next.as_str()).ok())
            .ok_or_else(|| stop("The page redirected to an address the reader does not open."))?;
        // As a browser does: "#section" on the address asked for carries over
        // when the redirect does not name one of its own.
        if next.fragment().is_none() {
            next.set_fragment(url.fragment());
        }
        url = next;
    };

    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .map(|v| String::from_utf8_lossy(v.as_bytes()).trim().to_string())
        .unwrap_or_default();
    let fail = |message: String| Failure {
        message,
        url: url.to_string(),
        status: status.as_u16(),
        content_type: content_type.clone(),
    };

    if !status.is_success() {
        return Err(fail(explain_status(status.as_u16())));
    }
    if !content_type.is_empty() && !is_readable_type(&content_type) {
        return Err(fail(format!(
            "This is not a web page. It is {}.",
            describe_type(&content_type)
        )));
    }
    let packed = response
        .headers()
        .get(CONTENT_ENCODING)
        .map(|v| String::from_utf8_lossy(v.as_bytes()).trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty() && v != "identity");
    if packed.is_some() {
        return Err(fail(
            "The site sent this page in a compressed form the reader cannot unpack.".to_string(),
        ));
    }

    // Read the body piece by piece, so a huge page is cut off at the limit
    // instead of being held in memory whole.
    let mut body: Vec<u8> = Vec::new();
    let mut truncated = false;
    loop {
        let chunk = response.chunk().await.map_err(|e| fail(explain_error(&e)))?;
        let Some(chunk) = chunk else { break };
        let room = limits.max_bytes - body.len();
        if chunk.len() > room {
            body.extend_from_slice(&chunk[..room]);
            truncated = true;
            break;
        }
        body.extend_from_slice(&chunk);
    }

    // A site that does not say what it is sending: take it as a page unless it
    // is plainly not text.
    if content_type.is_empty() && body.contains(&0) {
        return Err(fail("This is not a web page.".to_string()));
    }

    let mut html = decode_body(&body, &content_type);
    if truncated {
        // The cut can land in the middle of a character; drop the broken piece.
        while html.ends_with('\u{FFFD}') {
            html.pop();
        }
    }

    Ok(WebPage {
        ok: true,
        error: None,
        url: url.to_string(),
        status: status.as_u16(),
        content_type,
        html,
        truncated,
    })
}

/// Reads an address the reader may fetch, or says why it may not.
fn check_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter a web address.".to_string());
    }
    let url = Url::parse(trimmed).map_err(|_| "That is not a web address the reader can open.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Only http and https addresses can be opened in the reader.".to_string());
    }
    if url.host_str().map_or(true, str::is_empty) {
        return Err("That is not a web address the reader can open.".to_string());
    }
    // reqwest would turn "user:password@" into a login header. The reader
    // never sends a login.
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Addresses that carry a username or password are not opened in the reader.".to_string());
    }
    Ok(url)
}

/// The media type alone, lower case: "text/html" from "Text/HTML; charset=utf-8".
fn media_type(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

/// True for a type the reader can show: HTML, or text of some other kind.
fn is_readable_type(content_type: &str) -> bool {
    let media = media_type(content_type);
    media.starts_with("text/") || media == "application/xhtml+xml"
}

/// Names a type the reader cannot show, to finish "It is ...".
fn describe_type(content_type: &str) -> String {
    let media = media_type(content_type);
    if media == "application/pdf" {
        "a PDF document".to_string()
    } else if media.starts_with("image/") {
        "an image".to_string()
    } else if media.starts_with("video/") {
        "a video".to_string()
    } else if media.starts_with("audio/") {
        "a sound file".to_string()
    } else {
        format!("a file of type {media}")
    }
}

fn explain_status(status: u16) -> String {
    match status {
        401 | 403 => format!("The site refused to show this page (HTTP {status}). It may need you to sign in."),
        404 | 410 => format!("The page was not found (HTTP {status})."),
        429 => "The site is turning requests away for now (HTTP 429). Try again later.".to_string(),
        500..=599 => format!("The site had a problem answering (HTTP {status})."),
        _ => format!("The site answered with an error (HTTP {status})."),
    }
}

fn explain_error(error: &reqwest::Error) -> String {
    // reqwest's own text is for developers. The useful detail sits in the
    // causes underneath it, so read those to pick the sentence.
    let mut causes = String::new();
    let mut cause = std::error::Error::source(error);
    while let Some(inner) = cause {
        causes.push_str(&inner.to_string().to_lowercase());
        causes.push('\n');
        cause = inner.source();
    }

    if error.is_timeout() {
        "The page took too long to answer.".to_string()
    } else if causes.contains("certificate") {
        "The site's security certificate could not be checked, so the page was not loaded.".to_string()
    } else if causes.contains("dns error") || causes.contains("failed to lookup address") {
        "The site could not be found. Check the address and your connection.".to_string()
    } else if error.is_connect() {
        "Could not connect to the site. Check the address and your connection.".to_string()
    } else if error.is_body() || error.is_decode() {
        "The page stopped arriving before it was complete.".to_string()
    } else {
        "The page could not be loaded.".to_string()
    }
}

/// Turns the page's bytes into text. A byte-order mark decides first, then the
/// charset in the `Content-Type` header, then one declared in the page itself.
/// With none of those the page is read as UTF-8, and bytes that are not valid
/// UTF-8 become the replacement character.
fn decode_body(body: &[u8], content_type: &str) -> String {
    let encoding = charset_from_content_type(content_type)
        .or_else(|| sniff_meta_charset(&body[..body.len().min(CHARSET_SNIFF_BYTES)]))
        .unwrap_or(encoding_rs::UTF_8);
    // `decode` checks for a byte-order mark itself and removes it.
    let (text, _, _) = encoding.decode(body);
    text.into_owned()
}

/// The charset named in a `Content-Type` header, when it names one we know.
fn charset_from_content_type(content_type: &str) -> Option<&'static Encoding> {
    content_type.split(';').skip(1).find_map(|param| {
        let (name, value) = param.split_once('=')?;
        if !name.trim().eq_ignore_ascii_case("charset") {
            return None;
        }
        let label = value.trim().trim_matches(|c| c == '"' || c == '\'');
        Encoding::for_label(label.as_bytes())
    })
}

/// Looks for `<meta charset="...">` or
/// `<meta http-equiv="Content-Type" content="text/html; charset=...">` at the
/// start of a page. The bytes are read as ASCII, which every charset a page
/// can declare this way agrees on for the tag itself.
fn sniff_meta_charset(head: &[u8]) -> Option<&'static Encoding> {
    let lower = head.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = find_bytes(&lower[from..], b"<meta") {
        let start = from + at + b"<meta".len();
        let end = lower[start..]
            .iter()
            .position(|&b| b == b'>')
            .map_or(lower.len(), |p| start + p);
        if let Some(encoding) = charset_in_tag(&lower[start..end]) {
            // A page that could be read this far as ASCII is not UTF-16,
            // whatever it says. Browsers read such a page as UTF-8.
            if encoding == encoding_rs::UTF_16LE || encoding == encoding_rs::UTF_16BE {
                return Some(encoding_rs::UTF_8);
            }
            return Some(encoding);
        }
        from = end;
    }
    None
}

/// The charset named inside one `<meta ...>` tag, if any.
fn charset_in_tag(tag: &[u8]) -> Option<&'static Encoding> {
    let mut from = 0;
    while let Some(at) = find_bytes(&tag[from..], b"charset") {
        let mut i = from + at + b"charset".len();
        from = i;
        while i < tag.len() && tag[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= tag.len() || tag[i] != b'=' {
            continue;
        }
        i += 1;
        while i < tag.len() && (tag[i].is_ascii_whitespace() || tag[i] == b'"' || tag[i] == b'\'') {
            i += 1;
        }
        let end = tag[i..]
            .iter()
            .position(|&b| b.is_ascii_whitespace() || matches!(b, b'"' | b'\'' | b';' | b'/'))
            .map_or(tag.len(), |p| i + p);
        if let Some(encoding) = Encoding::for_label(&tag[i..end]) {
            return Some(encoding);
        }
    }
    None
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    // ── Which addresses are opened ──

    #[test]
    fn web_addresses_are_accepted() {
        assert_eq!(check_url("https://example.com/a?b=1#c").unwrap().as_str(), "https://example.com/a?b=1#c");
        assert_eq!(check_url("  http://example.com  ").unwrap().as_str(), "http://example.com/");
        assert_eq!(check_url("HTTPS://Example.COM/Path").unwrap().as_str(), "https://example.com/Path");
    }

    #[test]
    fn anything_that_is_not_http_or_https_is_refused() {
        for address in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<p>hi</p>",
            "ftp://example.com/file",
            "tauri://localhost/",
            "about:blank",
        ] {
            let error = check_url(address).unwrap_err();
            assert!(error.contains("http and https"), "{address}: {error}");
        }
    }

    #[test]
    fn an_address_that_cannot_be_read_is_refused_with_a_sentence() {
        assert_eq!(check_url("").unwrap_err(), "Enter a web address.");
        assert_eq!(check_url("   ").unwrap_err(), "Enter a web address.");
        assert!(check_url("example.com").unwrap_err().contains("not a web address"));
        assert!(check_url("https://").unwrap_err().contains("not a web address"));
    }

    #[test]
    fn an_address_with_a_login_in_it_is_refused() {
        assert!(check_url("https://alice:secret@example.com/").unwrap_err().contains("username or password"));
        assert!(check_url("https://alice@example.com/").unwrap_err().contains("username or password"));
    }

    // ── Which answers are pages ──

    #[test]
    fn html_and_text_are_readable() {
        assert!(is_readable_type("text/html"));
        assert!(is_readable_type("Text/HTML; charset=UTF-8"));
        assert!(is_readable_type("application/xhtml+xml"));
        assert!(is_readable_type("text/plain; charset=utf-8"));
    }

    #[test]
    fn files_are_not_readable() {
        for content_type in ["application/pdf", "image/png", "application/json", "application/octet-stream", "video/mp4"] {
            assert!(!is_readable_type(content_type), "{content_type}");
        }
    }

    #[test]
    fn a_file_is_named_in_plain_words() {
        assert_eq!(describe_type("application/pdf"), "a PDF document");
        assert_eq!(describe_type("image/png"), "an image");
        assert_eq!(describe_type("Application/Zip; x=1"), "a file of type application/zip");
    }

    #[test]
    fn a_refusal_from_the_site_says_what_happened() {
        assert!(explain_status(404).contains("not found"));
        assert!(explain_status(403).contains("refused"));
        assert!(explain_status(503).contains("problem answering"));
        assert!(explain_status(418).contains("HTTP 418"));
    }

    // ── Reading the page's charset ──

    #[test]
    fn the_header_names_the_charset() {
        let name = |content_type: &str| charset_from_content_type(content_type).map(|e| e.name());
        assert_eq!(name("text/html; charset=ISO-8859-1"), Some("windows-1252"));
        assert_eq!(name("text/html;charset=\"Shift_JIS\""), Some("Shift_JIS"));
        assert_eq!(name("text/html; boundary=x; CHARSET=utf-8"), Some("UTF-8"));
        assert_eq!(name("text/html"), None);
        assert_eq!(name("text/html; charset=klingon"), None);
    }

    #[test]
    fn the_page_can_name_its_own_charset() {
        let name = |head: &str| sniff_meta_charset(head.as_bytes()).map(|e| e.name());
        assert_eq!(name("<html><head><meta charset=\"windows-1251\">"), Some("windows-1251"));
        assert_eq!(name("<META CHARSET='EUC-KR'>"), Some("EUC-KR"));
        assert_eq!(name("<meta charset=gbk />"), Some("GBK"));
        assert_eq!(
            name("<meta http-equiv=\"Content-Type\" content=\"text/html; charset=shift_jis\">"),
            Some("Shift_JIS")
        );
        // A meta tag about something else, then the one that counts.
        assert_eq!(
            name("<meta name=\"viewport\" content=\"width=device-width\"><meta charset=\"big5\">"),
            Some("Big5")
        );
        assert_eq!(name("<html><head><title>No charset here</title>"), None);
        assert_eq!(name("<meta charset=\"klingon\">"), None);
    }

    #[test]
    fn a_page_that_claims_utf16_in_ascii_is_read_as_utf8() {
        assert_eq!(sniff_meta_charset(b"<meta charset=\"utf-16\">").map(|e| e.name()), Some("UTF-8"));
    }

    #[test]
    fn the_header_wins_over_the_page() {
        // "é" in windows-1252 is the single byte E9.
        let body = b"<meta charset=\"utf-8\"><p>caf\xE9</p>";
        assert!(decode_body(body, "text/html; charset=windows-1252").contains("café"));
    }

    #[test]
    fn the_page_decides_when_the_header_is_silent() {
        let body = b"<meta charset=\"iso-8859-1\"><p>caf\xE9</p>";
        assert!(decode_body(body, "text/html").contains("café"));
        // Shift_JIS for "日本".
        let body = b"<meta http-equiv=\"content-type\" content=\"text/html; charset=Shift_JIS\"><p>\x93\xFA\x96\x7B</p>";
        assert!(decode_body(body, "").contains("日本"));
    }

    #[test]
    fn a_byte_order_mark_wins_over_everything() {
        let mut body = vec![0xEF, 0xBB, 0xBF];
        body.extend_from_slice("<p>café</p>".as_bytes());
        let text = decode_body(&body, "text/html; charset=windows-1252");
        assert_eq!(text, "<p>café</p>");
    }

    #[test]
    fn with_no_charset_named_the_page_is_utf8_and_bad_bytes_do_not_stop_it() {
        assert_eq!(decode_body("<p>naïve</p>".as_bytes(), "text/html"), "<p>naïve</p>");
        assert_eq!(decode_body(b"<p>caf\xE9</p>", "text/html"), "<p>caf\u{FFFD}</p>");
    }

    // ── A site on this machine ──
    //
    // These run against a small server on 127.0.0.1, so they need no network.

    /// One request the test site received.
    struct Seen {
        path: String,
        headers: Vec<(String, String)>,
    }

    struct TestSite {
        base: String,
        server: Arc<tiny_http::Server>,
        seen: Arc<Mutex<Vec<Seen>>>,
    }

    impl TestSite {
        fn start() -> TestSite {
            let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").expect("a free port on this machine"));
            let port = server.server_addr().to_ip().expect("an address with a port").port();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let (for_thread, seen_in_thread) = (server.clone(), seen.clone());
            std::thread::spawn(move || {
                for request in for_thread.incoming_requests() {
                    seen_in_thread.lock().unwrap().push(Seen {
                        path: request.url().to_string(),
                        headers: request
                            .headers()
                            .iter()
                            .map(|h| (h.field.as_str().as_str().to_ascii_lowercase(), h.value.as_str().to_string()))
                            .collect(),
                    });
                    answer(request);
                }
            });
            TestSite {
                base: format!("http://127.0.0.1:{port}"),
                server,
                seen,
            }
        }

        fn fetch(&self, path: &str, limits: &Limits) -> WebPage {
            // No proxy: a proxy set for this machine must not be asked for 127.0.0.1.
            let client = client_builder().no_proxy().build().unwrap();
            tauri::async_runtime::block_on(fetch_with(&client, &format!("{}{path}", self.base), limits))
        }
    }

    impl Drop for TestSite {
        fn drop(&mut self) {
            self.server.unblock();
        }
    }

    const TEST_LIMITS: Limits = Limits {
        max_bytes: 64 * 1024,
        timeout: Duration::from_secs(10),
        max_redirects: 5,
    };

    fn header(name: &str, value: &str) -> tiny_http::Header {
        tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
    }

    fn redirect(to: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
        tiny_http::Response::from_data(Vec::new())
            .with_status_code(302)
            .with_header(header("Location", to))
            // A cookie the reader must not send back on the next hop.
            .with_header(header("Set-Cookie", "session=abc; Path=/"))
    }

    fn page(content_type: &str, body: &[u8]) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
        let response = tiny_http::Response::from_data(body.to_vec());
        if content_type.is_empty() {
            response
        } else {
            response.with_header(header("Content-Type", content_type))
        }
    }

    fn answer(request: tiny_http::Request) {
        let path = request.url().to_string();
        let response = match path.as_str() {
            "/start" => redirect("/hop"),
            "/hop" => redirect("article?from=hop"),
            "/article?from=hop" => page("text/html; charset=utf-8", "<html><body><p>Arrivé</p></body></html>".as_bytes()),
            "/loop" => redirect("/loop"),
            "/away" => redirect("ftp://example.com/file"),
            "/login" => redirect("http://alice:secret@127.0.0.1:1/"),
            "/big" => page("text/html", &vec![b'a'; TEST_LIMITS.max_bytes + 5000]),
            "/exact" => page("text/html", &vec![b'a'; TEST_LIMITS.max_bytes]),
            "/report.pdf" => page("application/pdf", b"%PDF-1.7"),
            "/latin1" => page("text/html", b"<meta charset=\"iso-8859-1\"><p>caf\xE9</p>"),
            "/untyped" => page("", b"<p>plain enough</p>"),
            "/untyped-binary" => page("", b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"),
            "/packed" => page("text/html", b"not really gzip").with_header(header("Content-Encoding", "gzip")),
            "/slow" => {
                std::thread::sleep(Duration::from_millis(1500));
                page("text/html", b"<p>late</p>")
            }
            _ => page("text/html", b"<h1>Nothing here</h1>").with_status_code(404),
        };
        let _ = request.respond(response);
    }

    #[test]
    fn redirects_are_followed_and_the_final_address_is_reported() {
        let site = TestSite::start();
        let result = site.fetch("/start#part-2", &TEST_LIMITS);
        assert!(result.ok, "{:?}", result.error);
        assert_eq!(result.error, None);
        assert_eq!(result.status, 200);
        // The second hop was a relative address, and "#part-2" carried over.
        assert_eq!(result.url, format!("{}/article?from=hop#part-2", site.base));
        assert_eq!(result.content_type, "text/html; charset=utf-8");
        assert!(result.html.contains("Arrivé"));
        assert!(!result.truncated);
    }

    #[test]
    fn nothing_that_identifies_the_user_is_sent() {
        let site = TestSite::start();
        assert!(site.fetch("/start", &TEST_LIMITS).ok);
        let seen = site.seen.lock().unwrap();
        assert_eq!(
            seen.iter().map(|s| s.path.as_str()).collect::<Vec<_>>(),
            ["/start", "/hop", "/article?from=hop"]
        );
        for request in seen.iter() {
            let value = |name: &str| {
                request
                    .headers
                    .iter()
                    .find(|(field, _)| field == name)
                    .map(|(_, value)| value.as_str())
            };
            // The site set a cookie on each redirect; it must not come back.
            assert_eq!(value("cookie"), None, "{}", request.path);
            assert_eq!(value("authorization"), None, "{}", request.path);
            assert_eq!(value("referer"), None, "{}", request.path);
            assert_eq!(value("user-agent"), Some(USER_AGENT), "{}", request.path);
            assert_eq!(value("accept-encoding"), Some("identity"), "{}", request.path);
            assert!(value("accept").unwrap_or("").starts_with("text/html"), "{}", request.path);
        }
        assert!(USER_AGENT.starts_with("Noteriv/") && USER_AGENT.ends_with(" (reader)"));
    }

    #[test]
    fn a_redirect_loop_is_given_up_on() {
        let site = TestSite::start();
        let result = site.fetch("/loop", &TEST_LIMITS);
        assert!(!result.ok);
        assert_eq!(result.error.as_deref(), Some("The page redirected too many times."));
        assert!(result.html.is_empty());
        // The first request and five redirects followed, and no more.
        assert_eq!(site.seen.lock().unwrap().len(), 6);
    }

    #[test]
    fn a_redirect_away_from_the_web_is_not_followed() {
        let site = TestSite::start();
        for path in ["/away", "/login"] {
            let result = site.fetch(path, &TEST_LIMITS);
            assert!(!result.ok, "{path}");
            assert!(
                result.error.as_deref().unwrap_or("").contains("redirected to an address"),
                "{path}: {:?}",
                result.error
            );
        }
        assert_eq!(site.seen.lock().unwrap().len(), 2, "only the two redirects themselves were asked for");
    }

    #[test]
    fn a_page_over_the_limit_is_cut_off_and_says_so() {
        let site = TestSite::start();
        let big = site.fetch("/big", &TEST_LIMITS);
        assert!(big.ok, "{:?}", big.error);
        assert!(big.truncated);
        assert_eq!(big.html.len(), TEST_LIMITS.max_bytes);

        let exact = site.fetch("/exact", &TEST_LIMITS);
        assert!(exact.ok, "{:?}", exact.error);
        assert!(!exact.truncated, "a page of exactly the limit is whole");
        assert_eq!(exact.html.len(), TEST_LIMITS.max_bytes);
    }

    #[test]
    fn a_file_is_refused_as_not_a_web_page() {
        let site = TestSite::start();
        let result = site.fetch("/report.pdf", &TEST_LIMITS);
        assert!(!result.ok);
        assert_eq!(result.error.as_deref(), Some("This is not a web page. It is a PDF document."));
        assert_eq!(result.status, 200);
        assert_eq!(result.content_type, "application/pdf");
        assert!(result.html.is_empty());
        assert_eq!(result.url, format!("{}/report.pdf", site.base));
    }

    #[test]
    fn an_answer_with_no_type_is_judged_by_its_bytes() {
        let site = TestSite::start();
        let text = site.fetch("/untyped", &TEST_LIMITS);
        assert!(text.ok, "{:?}", text.error);
        assert_eq!(text.html, "<p>plain enough</p>");

        let binary = site.fetch("/untyped-binary", &TEST_LIMITS);
        assert!(!binary.ok);
        assert_eq!(binary.error.as_deref(), Some("This is not a web page."));
    }

    #[test]
    fn an_old_charset_named_in_the_page_is_decoded() {
        let site = TestSite::start();
        let result = site.fetch("/latin1", &TEST_LIMITS);
        assert!(result.ok, "{:?}", result.error);
        assert!(result.html.contains("café"), "{}", result.html);
    }

    #[test]
    fn a_missing_page_is_an_error_with_its_status() {
        let site = TestSite::start();
        let result = site.fetch("/nowhere", &TEST_LIMITS);
        assert!(!result.ok);
        assert_eq!(result.status, 404);
        assert_eq!(result.error.as_deref(), Some("The page was not found (HTTP 404)."));
        assert!(result.html.is_empty());
    }

    #[test]
    fn a_compressed_answer_is_refused_rather_than_shown_as_noise() {
        let site = TestSite::start();
        let result = site.fetch("/packed", &TEST_LIMITS);
        assert!(!result.ok);
        assert!(result.error.as_deref().unwrap_or("").contains("compressed"), "{:?}", result.error);
    }

    #[test]
    fn a_slow_site_is_given_up_on() {
        let site = TestSite::start();
        let hurried = Limits {
            timeout: Duration::from_millis(300),
            ..TEST_LIMITS
        };
        let result = site.fetch("/slow", &hurried);
        assert!(!result.ok);
        assert_eq!(result.error.as_deref(), Some("The page took too long to answer."));
        assert_eq!(result.status, 0);
    }

    #[test]
    fn a_site_that_is_not_there_is_an_error_not_a_panic() {
        // Port 1 on this machine: nothing listens there.
        let client = client_builder().no_proxy().build().unwrap();
        let result = tauri::async_runtime::block_on(fetch_with(&client, "http://127.0.0.1:1/", &TEST_LIMITS));
        assert!(!result.ok);
        assert!(result.error.as_deref().unwrap_or("").contains("Could not connect"), "{:?}", result.error);
    }

    #[test]
    fn a_bad_address_never_reaches_the_network() {
        let result = tauri::async_runtime::block_on(fetch_with(client(), "file:///etc/passwd", &LIMITS));
        assert!(!result.ok);
        assert!(result.error.as_deref().unwrap_or("").contains("http and https"));
        assert_eq!(result.url, "file:///etc/passwd");
        assert_eq!(result.status, 0);
    }

    #[test]
    fn the_result_is_sent_to_the_frontend_in_camel_case() {
        let page = WebPage {
            ok: true,
            error: None,
            url: "https://example.com/".into(),
            status: 200,
            content_type: "text/html".into(),
            html: "<p>hi</p>".into(),
            truncated: false,
        };
        let json = serde_json::to_value(&page).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "ok": true,
                "error": null,
                "url": "https://example.com/",
                "status": 200,
                "contentType": "text/html",
                "html": "<p>hi</p>",
                "truncated": false,
            })
        );
    }

    #[test]
    fn the_apps_own_limits_are_the_documented_ones() {
        assert_eq!(LIMITS.max_bytes, 5 * 1024 * 1024);
        assert_eq!(LIMITS.timeout, Duration::from_secs(20));
        assert_eq!(LIMITS.max_redirects, 5);
    }
}

// ============================================================
// A test against the real web
// ============================================================
//
// Not part of the normal run: it needs the network, so it is ignored.
//
//   NOTERIV_WEB_URL=https://example.com/ cargo test --lib commands_web::live -- --ignored --nocapture
//
// Set NOTERIV_WEB_SAVE to a file path to keep the HTML that came back.

#[cfg(test)]
mod live {
    use super::*;

    #[test]
    #[ignore = "needs the network"]
    fn a_real_page_is_fetched() {
        let url = std::env::var("NOTERIV_WEB_URL").unwrap_or_else(|_| "https://example.com/".to_string());
        let page = tauri::async_runtime::block_on(web_fetch_page(url));
        assert!(page.ok, "{:?}", page.error);
        assert_eq!(page.status, 200);
        assert!(is_readable_type(&page.content_type), "{}", page.content_type);
        assert!(!page.html.is_empty());
        println!(
            "{} ({} bytes, {}, cut off: {})",
            page.url,
            page.html.len(),
            page.content_type,
            page.truncated
        );
        if let Ok(path) = std::env::var("NOTERIV_WEB_SAVE") {
            std::fs::write(path, &page.html).expect("the page is saved");
        }
    }
}
