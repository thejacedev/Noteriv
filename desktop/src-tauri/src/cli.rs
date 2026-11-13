// The command line and `noteriv://` links.
//
//   noteriv                                    start the app, or focus it
//   noteriv ~/notes/Inbox.md                   open a note file
//   noteriv open "Projects/Alpha" --line 12    open a note in the app's window
//   noteriv search "meeting" --vault Work      search and print, no window
//   noteriv://open?vault=Work&file=Projects%2FAlpha
//   noteriv://vault/Work/Projects/Alpha
//
// A command line and a link are read into the same `Request`, so the app has
// one thing to carry out whichever way it was asked. The commands that only
// read or write files and print are carried out here, by `run`, and need no
// window.
//
// A link is untrusted input: any web page can make one, and the system hands
// it to the app when it is clicked. So a link is held to more than a command
// someone typed:
//
//   - It only ever becomes a `Request`, never a command that `run` carries
//     out. `parse_args` reports it as `Invocation::Link`, apart from what
//     was typed, so the app can ask before a link `writes()`.
//   - A file or note name in it is a path inside the vault: no full paths,
//     no drive letters, no `..`, nothing in a hidden folder such as
//     `.noteriv`. See `vault_relative`.
//   - `new` can only name a Markdown note, and `overwrite` is refused, so a
//     link cannot replace or delete what is already in a note.
//   - `content` is capped at `MAX_LINK_CONTENT`.
//   - A full path (`path=`) is only for opening. It names no vault, so the
//     app has to pass it through `locate`, which answers only for a file
//     inside a vault the user already has.
//
// The link format follows Obsidian's URI scheme: the actions `open`, `new`,
// `daily`, `unique` and `search`, and the shorthand `noteriv://vault/...`.

use atomicwrites::{AllowOverwrite, AtomicFile, DisallowOverwrite};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

/// What every link starts with. `noteriv://open` is the usual form; the
/// system also hands over `noteriv:open`, which is a link in the same scheme.
const SCHEME: &str = "noteriv:";

/// The most text a link may carry as `content`, in bytes once decoded.
pub const MAX_LINK_CONTENT: usize = 1024 * 1024;
/// A link longer than this is not read at all. Encoding can triple the size
/// of its content, so this leaves room for the largest content allowed.
const MAX_LINK_BYTES: usize = 4 * MAX_LINK_CONTENT;
/// The longest path, vault name or heading, in bytes.
const MAX_NAME_BYTES: usize = 1024;
/// The longest search a link may ask for, in bytes.
const MAX_QUERY_BYTES: usize = 4096;
/// The most text `--stdin` reads.
const MAX_INPUT_BYTES: u64 = 16 * 1024 * 1024;

/// The exit code when a command was understood and could not be done.
pub const EXIT_FAILED: i32 = 1;
/// The exit code for a command line `parse_args` could not read.
pub const EXIT_USAGE: i32 = 2;

// ============================================================
// What can be asked for
// ============================================================

/// How `new` treats a note that is already there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WriteMode {
    /// A new note. When the name is taken the app picks another name or
    /// declines; it never replaces the note that has it.
    Create,
    /// Add the content to the end of the note, creating it if needed.
    Append,
    /// Add the content to the start of the note, creating it if needed.
    Prepend,
    /// Replace the note. Only a command line can ask for this: `parse_url`
    /// refuses a link that does.
    Overwrite,
}

/// Something for the running app's window to do. A command line and a link
/// both become one of these.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Request {
    /// Open a note, or with no note just the vault.
    Open {
        /// A vault's name, id or folder, as given. `find_vault` reads it.
        vault: Option<String>,
        /// The note, as a `[[link]]` names one: its name, or its path inside
        /// the vault with `/` between folders. `.md` may be missing.
        file: Option<String>,
        /// A full path on this computer instead of `vault` and `file`: a note
        /// file given as an argument, or a link's `path`. `locate` finds the
        /// vault it is in. From a link, a path `locate` has no answer for
        /// must not be opened.
        path: Option<String>,
        /// The line to go to, counted from 1.
        line: Option<u32>,
        /// The heading to go to, without its `#`. A block is `^id`.
        heading: Option<String>,
    },
    /// Create a note, or add to one.
    New {
        vault: Option<String>,
        /// The note's file name with its extension, which is always `.md` or
        /// `.markdown`, or its path inside the vault. With no folder part the
        /// note goes where the user's settings put new notes. `None` is an
        /// untitled note.
        name: Option<String>,
        content: Option<String>,
        mode: WriteMode,
        /// Do not open the note afterwards.
        silent: bool,
    },
    /// Open today's daily note, creating it if there is none.
    Daily { vault: Option<String> },
    /// Create a note named by the date and time.
    Unique {
        vault: Option<String>,
        content: Option<String>,
    },
    /// Show a search in the app. An empty query just opens the search.
    Search { vault: Option<String>, query: String },
}

impl Request {
    /// Whether carrying this out creates or changes a note, which is when
    /// the app asks first if the request came from a link. `Daily` counts
    /// because it creates today's note when there is none.
    pub fn writes(&self) -> bool {
        matches!(
            self,
            Request::New { .. } | Request::Unique { .. } | Request::Daily { .. }
        )
    }

    /// The vault the request names, if it names one.
    pub fn vault(&self) -> Option<&str> {
        match self {
            Request::Open { vault, .. }
            | Request::New { vault, .. }
            | Request::Daily { vault }
            | Request::Unique { vault, .. }
            | Request::Search { vault, .. } => vault.as_deref(),
        }
    }
}

/// What a command line asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invocation {
    /// Start the app, or focus it, with something to do if there is
    /// anything. The request was typed by the user or names a file they
    /// opened.
    App(Option<Request>),
    /// Start the app, or focus it, to follow a link the system handed over.
    /// Untrusted: ask before carrying out a request that `writes()`. A link
    /// that could not be read is kept as its reason, so the app can still
    /// come up and say so.
    Link(Result<Request, String>),
    /// Do it here and print; no window.
    Headless(Command),
    /// Print `help_text` for everything, or for one sub-command.
    Help(Option<String>),
    /// Print `version_text`.
    Version,
}

/// A command that `run` carries out without a window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Command {
    /// A vault's name, id or folder. `None` is the vault open in the app.
    pub vault: Option<String>,
    pub action: Action,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Vaults { json: bool },
    List { folder: Option<String>, json: bool },
    Read { note: String },
    Search { query: String, json: bool, limit: Option<usize> },
    Tags { json: bool },
    Create { name: String, content: Content, overwrite: bool },
    Append { note: String, content: Content },
}

/// Where the text for `create` and `append` comes from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Content {
    Text(String),
    Stdin,
}

/// A vault, as far as the command line needs to know it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultRef {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
}

// ============================================================
// Paths
// ============================================================

/// A piece of someone else's text made safe to show in a message: in quotes,
/// with anything unprintable escaped, and cut short.
fn shown(text: &str) -> String {
    let cut: String = text.chars().take(80).collect();
    if cut.len() < text.len() {
        format!("{cut:?}...")
    } else {
        format!("{cut:?}")
    }
}

fn is_note(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Names Windows keeps for devices, with or without an extension.
fn is_windows_device(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or_default().trim_end().to_ascii_lowercase();
    let numbered = |prefix: &str| {
        stem.strip_prefix(prefix)
            .is_some_and(|n| n.len() == 1 && matches!(n.as_bytes()[0], b'1'..=b'9'))
    };
    matches!(stem.as_str(), "con" | "prn" | "aux" | "nul") || numbered("com") || numbered("lpt")
}

/// A path inside a vault, checked: `/` between its parts and nothing in it
/// that could lead out of the vault or into one of its hidden folders.
/// `what` names the thing in an error, as in "The note name".
fn vault_relative(what: &str, input: &str) -> Result<String, String> {
    vault_relative_on(what, input, cfg!(windows))
}

/// `windows` adds the names that are harmless elsewhere and are not on
/// Windows: `note.md:stream` is a hidden stream of `note.md` there, and `CON`
/// is the console. It is a parameter so the rule is tested everywhere.
fn vault_relative_on(what: &str, input: &str, windows: bool) -> Result<String, String> {
    if input.chars().any(char::is_control) {
        return Err(format!(
            "{what} has a character that cannot be in a file name: {}",
            shown(input)
        ));
    }
    // `\` is read as `/`, as it is in a link between notes, so `..\..\x` and
    // `\\server\share` are caught by the same checks as their `/` forms.
    let path = input.trim().replace('\\', "/");
    if path.is_empty() {
        return Err(format!("{what} is empty."));
    }
    if path.len() > MAX_NAME_BYTES {
        return Err(format!("{what} is too long."));
    }
    let bytes = path.as_bytes();
    let drive = bytes.len() >= 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes.get(2), None | Some(b'/'));
    if path.starts_with('/') || drive || path == "~" || path.starts_with("~/") {
        return Err(format!(
            "{what} has to be a path inside the vault, not a full path: {}",
            shown(input)
        ));
    }
    for part in path.split('/') {
        if part.is_empty() {
            return Err(format!(
                "{what} has an empty part where a folder or file name should be: {}",
                shown(input)
            ));
        }
        if part == "." || part == ".." {
            return Err(format!(
                "{what} has to stay inside the vault, so it cannot have \".\" or \"..\" as a part: {}",
                shown(input)
            ));
        }
        if part.starts_with('.') {
            return Err(format!(
                "{what} cannot be in a hidden folder or be a hidden file: {}",
                shown(input)
            ));
        }
        if windows
            && (part.contains(['<', '>', ':', '"', '|', '?', '*'])
                || part.ends_with(['.', ' '])
                || is_windows_device(part))
        {
            return Err(format!(
                "{what} is not a name Windows allows for a file: {}",
                shown(input)
            ));
        }
    }
    Ok(path)
}

/// The file a new note is written to: a checked path inside the vault that
/// ends in `.md`, added unless the name already ends in `.md` or `.markdown`.
/// A new note is always Markdown, whatever else its name ends in: "Meeting
/// 2.5" becomes "Meeting 2.5.md", and so does "run.sh" become "run.sh.md".
fn note_file_name(what: &str, input: &str) -> Result<String, String> {
    let mut path = vault_relative(what, input)?;
    if !is_note(&path) {
        path.push_str(".md");
    }
    Ok(path)
}

/// A full path from a link, checked as far as text can be: it is a full
/// path, with no `..` in it. Whether it is somewhere the app may open is for
/// `locate` to say.
fn full_path(input: &str) -> Result<String, String> {
    if input.chars().any(char::is_control) || input.len() > 4 * MAX_NAME_BYTES {
        return Err("The path in this link cannot be read.".into());
    }
    let path = input.trim();
    let bytes = path.as_bytes();
    let drive = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\');
    let rooted = path.starts_with('/') && !path.starts_with("//");
    if !(rooted || drive) {
        return Err(format!(
            "The path in this link has to be a full path to a file: {}",
            shown(input)
        ));
    }
    if path.split(['/', '\\']).any(|part| part == "..") {
        return Err(format!(
            "The path in this link cannot have \"..\" in it: {}",
            shown(input)
        ));
    }
    Ok(path.to_string())
}

/// A path without its `.` and `..` parts, worked out from the text alone.
fn tidy(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// A path someone typed, made full. It is done while the command line is
/// read because a second copy of the app passes its arguments to the first,
/// which is running in some other folder.
fn absolute(path: &str, cwd: &Path) -> String {
    let joined = cwd.join(path);
    dunce::canonicalize(&joined)
        .unwrap_or_else(|_| tidy(&joined))
        .to_string_lossy()
        .into_owned()
}

/// The note file an argument names, if it names one that is there: a path,
/// or the `file://` address a file manager may pass in its place.
fn note_file(arg: &str, cwd: &Path) -> Option<String> {
    let path = if arg.get(..5).is_some_and(|start| start.eq_ignore_ascii_case("file:")) {
        url::Url::parse(arg).ok()?.to_file_path().ok()?
    } else if arg.starts_with('-') {
        return None;
    } else {
        cwd.join(arg)
    };
    if !is_note(&path.to_string_lossy()) || !path.is_file() {
        return None;
    }
    let real = dunce::canonicalize(&path).ok()?;
    Some(real.to_string_lossy().into_owned())
}

/// The vault a file is in, and its path inside that vault with `/` between
/// folders (empty for the vault's own folder). Of two vaults, one inside the
/// other, the inner one answers.
///
/// There is no answer for a file that is not there, one that is in no vault,
/// one that a symbolic link takes out of its vault, or one in a hidden
/// folder. This is the check a link's `path` has to pass before the app
/// opens it.
pub fn locate<'v>(path: &Path, vaults: &'v [VaultRef]) -> Option<(&'v VaultRef, String)> {
    if !path.is_absolute() {
        return None;
    }
    let real = dunce::canonicalize(path).ok()?;
    let mut best: Option<(&VaultRef, PathBuf, usize)> = None;
    for vault in vaults {
        let Ok(root) = dunce::canonicalize(&vault.path) else {
            continue;
        };
        let Ok(inside) = real.strip_prefix(&root) else {
            continue;
        };
        let depth = root.components().count();
        if best.as_ref().map_or(true, |(_, _, deepest)| depth > *deepest) {
            best = Some((vault, inside.to_path_buf(), depth));
        }
    }
    let (vault, inside, _) = best?;
    let parts: Vec<String> = inside
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    if parts.iter().any(|part| part.starts_with('.')) {
        return None;
    }
    Some((vault, parts.join("/")))
}

// ============================================================
// Links
// ============================================================

/// Whether an argument is a link for the app.
fn is_link(arg: &str) -> bool {
    arg.get(..SCHEME.len())
        .is_some_and(|start| start.eq_ignore_ascii_case(SCHEME))
}

/// Decode one piece of a link's path. `%20` is a space and `+` is a plus:
/// only a query writes a space as `+`. A piece that does not decode to UTF-8
/// is refused.
fn decode_part(part: &str) -> Result<String, String> {
    urlencoding::decode(part)
        .map(|text| text.into_owned())
        .map_err(|_| "This link has text in it that cannot be read.".to_string())
}

/// A short piece of text from a link or a flag: trimmed, and `None` when
/// nothing is left.
fn short_text(what: &str, text: &str, max: usize) -> Result<Option<String>, String> {
    if text.chars().any(char::is_control) {
        return Err(format!("{what} has a character in it that cannot be used."));
    }
    let text = text.trim();
    if text.len() > max {
        return Err(format!("{what} is too long."));
    }
    Ok(Some(text.to_string()).filter(|text| !text.is_empty()))
}

fn line_number(text: &str) -> Result<u32, String> {
    match text.trim().parse::<u32>() {
        Ok(number) if number > 0 => Ok(number),
        _ => Err(format!(
            "A line number is a whole number from 1 up, not {}.",
            shown(text)
        )),
    }
}

/// The parameters of a link that mean something here, decoded. The others
/// are dropped as they are read.
#[derive(Default)]
struct Fields(Vec<(String, String)>);

const FIELDS: &[&str] = &[
    "vault", "file", "path", "name", "content", "append", "prepend", "overwrite", "silent",
    "query", "line", "heading",
];

impl Fields {
    fn push(&mut self, name: &str, value: String) {
        if FIELDS.contains(&name) {
            self.0.push((name.to_string(), value));
        }
    }

    /// The first value given for a name.
    fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    /// A parameter that is on by being there, as in `&append` or
    /// `&append=true`. Written out as off, it is off.
    fn flag(&self, name: &str) -> bool {
        self.0.iter().any(|(key, value)| {
            key == name
                && !matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "false" | "0" | "no" | "off"
                )
        })
    }

    fn vault(&self) -> Result<Option<String>, String> {
        match self.get("vault") {
            Some(vault) => short_text("The vault in this link", vault, MAX_NAME_BYTES),
            None => Ok(None),
        }
    }

    fn content(&self) -> Result<Option<String>, String> {
        let Some(content) = self.get("content") else {
            return Ok(None);
        };
        if content.len() > MAX_LINK_CONTENT {
            return Err(format!(
                "This link carries more text than a link may: the most is {} KB.",
                MAX_LINK_CONTENT / 1024
            ));
        }
        if content.contains('\0') {
            return Err("The text in this link has a character in it that cannot be used.".into());
        }
        Ok(Some(content.to_string()).filter(|content| !content.is_empty()))
    }
}

/// `new`, from either a command line or a link: the same things have to hold.
fn new_request(
    vault: Option<String>,
    name: Option<String>,
    content: Option<String>,
    mode: WriteMode,
    silent: bool,
) -> Result<Request, String> {
    if mode != WriteMode::Create && name.is_none() {
        return Err("Adding to a note or replacing one needs the note's name.".into());
    }
    if matches!(mode, WriteMode::Append | WriteMode::Prepend) && content.is_none() {
        return Err("Adding to a note needs the text to add.".into());
    }
    Ok(Request::New {
        vault,
        name,
        content,
        mode,
        silent,
    })
}

/// Read a `noteriv://` link.
///
/// A link is untrusted, so some of what a command line can ask for is
/// refused here with an error (see the top of this file):
///
/// - `overwrite` is an error, not a quieter kind of `new`. A link that meant
///   to replace a note and was turned into one that creates a note would do
///   something its author did not ask for, so it does nothing instead.
/// - A `file` or `name` that is not a path inside the vault is an error.
/// - `content` over `MAX_LINK_CONTENT` is an error.
/// - An action other than `open`, `new`, `daily`, `unique` and `search` is
///   an error. Parameters that are not known are ignored.
///
/// Decoding: a parameter is decoded as a web form is, which is what the
/// `url` crate does for `Url::query_pairs`: `%20` and `+` are both a space,
/// and `%2B` is a plus. In the path of the shorthand `noteriv://vault/My
/// Vault/My Note` only `%XX` is decoded, and `+` is a plus.
///
/// The link is split by hand rather than by `Url::parse`, which tidies a
/// path before handing it over: it would turn `noteriv://vault/Work/../x`
/// into `/x`, and the `..` has to be seen to be refused.
pub fn parse_url(url: &str) -> Result<Request, String> {
    if url.len() > MAX_LINK_BYTES {
        return Err("This link is too long to read.".into());
    }
    let url = url.trim();
    if !is_link(url) {
        return Err("This is not a Noteriv link: it does not start with noteriv://".into());
    }
    let rest = &url[SCHEME.len()..];
    let (rest, fragment) = match rest.split_once('#') {
        Some((rest, fragment)) => (rest, Some(fragment)),
        None => (rest, None),
    };
    let (place, query) = rest.split_once('?').unwrap_or((rest, ""));
    // `//action`, `//vault/<vault>/<file>`, `///full/path`, or `action`.
    let (host, path) = match place.strip_prefix("//") {
        Some(after) => after.split_at(after.find('/').unwrap_or(after.len())),
        None => (place, ""),
    };
    let host = decode_part(host)?.to_ascii_lowercase();

    let mut fields = Fields::default();
    let action = match (host.as_str(), path) {
        // Nothing at all: bring the app to the front.
        ("", "" | "/") => "open",
        ("", path) => {
            // `noteriv:///C:/notes/a.md` is the Windows path `C:/notes/a.md`.
            let decoded = decode_part(path)?;
            let bytes = decoded.as_bytes();
            let drive = bytes.len() > 2 && bytes[1].is_ascii_alphabetic() && bytes[2] == b':';
            fields.push("path", decoded[usize::from(drive)..].to_string());
            "open"
        }
        ("vault", path) => {
            let (vault, file) = path
                .trim_start_matches('/')
                .split_once('/')
                .unwrap_or((path.trim_start_matches('/'), ""));
            let vault = decode_part(vault)?;
            if vault.trim().is_empty() {
                return Err("This link does not say which vault it is for.".into());
            }
            fields.push("vault", vault);
            // Decoded once, here, and checked as it will be used: an encoded
            // `..%2F` is a `../` by the time `vault_relative` sees it.
            if !file.is_empty() {
                fields.push("file", decode_part(file)?);
            }
            "open"
        }
        (action, "" | "/") => action,
        _ => {
            return Err(format!(
                "This link cannot be read: there is more after {} than Noteriv understands.",
                shown(&host)
            ))
        }
    };
    for (name, value) in url::form_urlencoded::parse(query.as_bytes()) {
        fields.push(&name, value.into_owned());
    }

    let vault = fields.vault()?;
    match action {
        "open" => {
            let line = fields.get("line").map(line_number).transpose()?;
            let mut heading = match fields.get("heading") {
                Some(heading) => short_text("The heading in this link", heading, MAX_NAME_BYTES)?,
                None => None,
            };
            // As in Obsidian, a full path stands in for the vault and file.
            let path = fields.get("path").map(full_path).transpose()?;
            let mut file = None;
            if path.is_none() {
                if let Some(raw) = fields.get("file") {
                    // "Note#Heading" is the heading in the note.
                    let (name, inner) = match raw.split_once('#') {
                        Some((name, inner)) => (name, Some(inner)),
                        None => (raw, None),
                    };
                    if !name.trim().is_empty() {
                        file = Some(vault_relative("The file in this link", name)?);
                    }
                    if let (None, Some(inner)) = (&heading, inner) {
                        heading = short_text("The heading in this link", inner, MAX_NAME_BYTES)?;
                    }
                }
            }
            if let (None, Some(fragment)) = (&heading, fragment) {
                heading = short_text(
                    "The heading in this link",
                    &decode_part(fragment)?,
                    MAX_NAME_BYTES,
                )?;
            }
            Ok(Request::Open {
                vault: if path.is_some() { None } else { vault },
                file,
                path,
                line,
                heading,
            })
        }
        "new" => {
            if fields.get("path").is_some() {
                return Err(
                    "A link can only create a note inside a vault: it has to give vault and file, not path."
                        .into(),
                );
            }
            if fields.flag("overwrite") {
                return Err(
                    "This link asks to replace a note. A link is not allowed to do that.".into(),
                );
            }
            // `file` is a path in the vault and `name` a bare name. Both end
            // up in `name`, and `file` wins when a link gives both.
            let given = |key: &str| fields.get(key).filter(|value| !value.trim().is_empty());
            let name = given("file")
                .or_else(|| given("name"))
                .map(|name| note_file_name("The note name in this link", name))
                .transpose()?;
            let mode = if fields.flag("append") {
                WriteMode::Append
            } else if fields.flag("prepend") {
                WriteMode::Prepend
            } else {
                WriteMode::Create
            };
            new_request(vault, name, fields.content()?, mode, fields.flag("silent"))
        }
        "daily" => Ok(Request::Daily { vault }),
        "unique" => Ok(Request::Unique {
            vault,
            content: fields.content()?,
        }),
        "search" => {
            let query = match fields.get("query") {
                Some(query) => short_text("The search in this link", query, MAX_QUERY_BYTES)?,
                None => None,
            };
            Ok(Request::Search {
                vault,
                query: query.unwrap_or_default(),
            })
        }
        other => Err(format!(
            "Noteriv links cannot do {}. They can open, new, daily, unique and search.",
            shown(other)
        )),
    }
}

// ============================================================
// The command line
// ============================================================

/// A sub-command: its name, how it is written, the options it takes besides
/// `--vault` and `--help`, and what `help` says about it.
struct Spec {
    name: &'static str,
    usage: &'static str,
    flags: &'static [&'static str],
    about: &'static str,
}

const COMMANDS: &[Spec] = &[
    Spec {
        name: "open",
        usage: "open [note] [--line N] [--heading TEXT]",
        flags: &["--line", "--heading"],
        about: "\
Open a note in Noteriv, starting the app if it is not running. With no note,
open the vault.

A path that starts with / or ./ is a file on this computer. Anything else is
a note in the vault, by name or by its path inside the vault.

  --line N         Go to this line
  --heading TEXT   Go to this heading",
    },
    Spec {
        name: "new",
        usage: "new [name] [--content TEXT] [--silent]\n                   [--append | --prepend | --overwrite]",
        flags: &["--content", "--append", "--prepend", "--overwrite", "--silent"],
        about: "\
Create a note in Noteriv and open it. With no name it is an untitled note.
A name with no folder goes where your settings put new notes.

  --content TEXT   The text of the note
  --append         Add the text to the end of the note if it exists
  --prepend        Add the text to the start of the note if it exists
  --overwrite      Replace the note if it exists
  --silent         Do not open the note",
    },
    Spec {
        name: "daily",
        usage: "daily",
        flags: &[],
        about: "Open today's daily note in Noteriv, creating it if there is none.",
    },
    Spec {
        name: "unique",
        usage: "unique [--content TEXT]",
        flags: &["--content"],
        about: "\
Create a note named by the date and time, and open it in Noteriv.

  --content TEXT   The text of the note",
    },
    Spec {
        name: "search",
        usage: "search <query> [--json] [--limit N]\n       noteriv search [query] --open",
        flags: &["--json", "--limit", "--open"],
        about: "\
Search the notes and print each matching line as path:line: text. A note
that matches by its name, a tag or a property is printed as its path alone.
The query is written as in the app's search:

  meeting notes    both words          \"exact phrase\"   the words together
  work OR home     either              tag:#work        a tag
  file:plan        in the file name    path:Projects/   in the path
  /regex/          a pattern           [status:done]    a property

  --limit N        Print at most N notes
  --json           Print the result as JSON
  --open           Show the search in Noteriv instead of printing it

A query that starts with - goes after --:  noteriv search -- -draft",
    },
    Spec {
        name: "vaults",
        usage: "vaults [--json]",
        flags: &["--json"],
        about: "\
List the vaults: name and folder, with * before the one open in the app.

  --json           Print them as JSON, with their ids",
    },
    Spec {
        name: "list",
        usage: "list [folder] [--json]",
        flags: &["--json"],
        about: "\
List the notes in the vault, or in one folder of it and the folders inside
that. Each is printed as its path inside the vault. Hidden folders, such as
.noteriv and .git, are left out.

  --json           Print the paths as a JSON list",
    },
    Spec {
        name: "read",
        usage: "read <note>",
        flags: &[],
        about: "Print a note.",
    },
    Spec {
        name: "tags",
        usage: "tags [--json]",
        flags: &["--json"],
        about: "\
List the tags in the vault, each with how many notes use it. Tags in a
note's text and in its properties both count, and capitals do not matter.

  --json           Print them as JSON",
    },
    Spec {
        name: "create",
        usage: "create <name> [--content TEXT | --stdin] [--overwrite]",
        flags: &["--content", "--stdin", "--overwrite"],
        about: "\
Create a note and print its path inside the vault. The name may have folders
in it, which are created. \".md\" is added unless the name ends in .md or
.markdown.

  --content TEXT   The text of the note
  --stdin          Read the text from standard input
  --overwrite      Replace the note if it exists. Without this, an existing
                   note is left alone and the command fails.",
    },
    Spec {
        name: "append",
        usage: "append <note> (--content TEXT | --stdin)",
        flags: &["--content", "--stdin"],
        about: "\
Add text to the end of a note, on a new line, and print the note's path
inside the vault.

  --content TEXT   The text to add
  --stdin          Read the text from standard input",
    },
    Spec {
        name: "help",
        usage: "help [command]",
        flags: &[],
        about: "Show the help, or the help for one command.",
    },
    Spec {
        name: "version",
        usage: "version",
        flags: &[],
        about: "Print the version.",
    },
];

/// Options that are followed by a value. The value is taken as it is, so it
/// may start with `-`: `--content "- [ ] milk"`.
const VALUE_FLAGS: &[&str] = &["--vault", "--content", "--line", "--heading", "--limit"];
const SWITCHES: &[&str] = &[
    "--json", "--open", "--append", "--prepend", "--overwrite", "--silent", "--stdin", "--help",
];

/// A sub-command's arguments, sorted into what they are.
struct Line<'a> {
    spec: &'static Spec,
    positional: Vec<&'a str>,
    values: Vec<(&'static str, &'a str)>,
    switches: Vec<&'static str>,
}

impl<'a> Line<'a> {
    /// `args` is the line without the sub-command's own name.
    fn read(spec: &'static Spec, args: &[&'a str]) -> Result<Line<'a>, String> {
        let mut line = Line {
            spec,
            positional: Vec::new(),
            values: Vec::new(),
            switches: Vec::new(),
        };
        // After `--` everything is text, whatever it starts with.
        let mut literal = false;
        let mut at = 0;
        while at < args.len() {
            let arg = args[at];
            at += 1;
            if literal || arg == "-" || !arg.starts_with('-') {
                line.positional.push(arg);
                continue;
            }
            if arg == "--" {
                literal = true;
                continue;
            }
            let arg = if arg == "-h" { "--help" } else { arg };
            let (name, attached) = match arg.split_once('=') {
                Some((name, value)) if name.starts_with("--") => (name, Some(value)),
                _ => (arg, None),
            };
            if let Some(flag) = VALUE_FLAGS.iter().copied().find(|flag| *flag == name) {
                let value = match attached {
                    Some(value) => value,
                    None => {
                        let value = args
                            .get(at)
                            .ok_or_else(|| format!("{flag} needs a value after it."))?;
                        at += 1;
                        *value
                    }
                };
                line.allow(flag)?;
                if line.values.iter().any(|(given, _)| *given == flag) {
                    return Err(format!("{flag} is given twice."));
                }
                line.values.push((flag, value));
            } else if let Some(flag) = SWITCHES.iter().copied().find(|flag| *flag == name) {
                if attached.is_some() {
                    return Err(format!("{flag} does not take a value."));
                }
                line.allow(flag)?;
                if !line.switches.contains(&flag) {
                    line.switches.push(flag);
                }
            } else {
                return Err(format!(
                    "{} is not an option of `noteriv {}`. If it is text, put -- before it.",
                    shown(arg),
                    spec.name
                ));
            }
        }
        Ok(line)
    }

    fn allow(&self, flag: &str) -> Result<(), String> {
        if flag == "--vault" || flag == "--help" || self.spec.flags.contains(&flag) {
            Ok(())
        } else {
            Err(format!("`noteriv {}` has no {flag} option.", self.spec.name))
        }
    }

    fn value(&self, flag: &str) -> Option<&'a str> {
        self.values
            .iter()
            .find(|(given, _)| *given == flag)
            .map(|(_, value)| *value)
    }

    fn has(&self, switch: &str) -> bool {
        self.switches.contains(&switch)
    }

    fn none(&self) -> Result<(), String> {
        match self.positional.first() {
            None => Ok(()),
            Some(extra) => Err(format!(
                "`noteriv {}` takes nothing after it, and was given {}.",
                self.spec.name,
                shown(extra)
            )),
        }
    }

    fn at_most_one(&self, what: &str) -> Result<Option<&'a str>, String> {
        match self.positional[..] {
            [] => Ok(None),
            [one] => Ok(Some(one)),
            _ => Err(format!(
                "`noteriv {}` takes one {what}, and was given {}. Put a {what} with spaces in it in quotes.",
                self.spec.name,
                self.positional.len()
            )),
        }
    }

    fn one(&self, what: &str) -> Result<&'a str, String> {
        self.at_most_one(what)?
            .ok_or_else(|| format!("`noteriv {}` needs a {what}.", self.spec.name))
    }

    /// `--content` or `--stdin`, whichever was given.
    fn content(&self) -> Result<Option<Content>, String> {
        match (self.value("--content"), self.has("--stdin")) {
            (Some(_), true) => Err("Use --content or --stdin, not both.".into()),
            (Some(text), false) => Ok(Some(Content::Text(text.to_string()))),
            (None, true) => Ok(Some(Content::Stdin)),
            (None, false) => Ok(None),
        }
    }
}

/// Read a command line. `args` is without the program's own name.
///
/// A link or a file to open is all the system ever adds, and launchers add
/// flags of their own (macOS has passed `-psn_0_12345`; a desktop file may
/// pass `--no-sandbox`). So only a line that begins with a sub-command, or
/// with options of ours and then a sub-command, is held to the rules, and
/// only that gives an error. Anything else starts the app:
///
/// - with the link, if any argument is one. Nothing else on such a line is
///   read: a link's own text could otherwise add arguments on a system that
///   quotes it badly, and they would be taken for a command the user typed;
/// - with the note file, if an argument is the path of one that exists;
/// - with nothing to do otherwise, as for a mistyped command.
///
/// A sub-command's values may themselves start with `noteriv://`, as in
/// `noteriv append Inbox --content noteriv://open?file=Plan`. A line like
/// that was typed, so it stays a command.
pub fn parse_args(args: &[String]) -> Result<Invocation, String> {
    let cwd = std::env::current_dir().unwrap_or_default();
    parse_args_in(args, &cwd)
}

/// `parse_args`, told which folder relative paths start from. This is the
/// one for arguments passed on by a second copy of the app: they come with
/// the folder that copy was started in, which is not this one's.
pub fn parse_args_in(args: &[String], cwd: &Path) -> Result<Invocation, String> {
    match args.first().map(String::as_str) {
        Some("--help" | "-h") => return Ok(Invocation::Help(None)),
        Some("--version" | "-V") => return Ok(Invocation::Version),
        _ => {}
    }
    let Some((at, spec)) = command_at(args) else {
        return Ok(launch(args, cwd));
    };
    let rest: Vec<&str> = args
        .iter()
        .enumerate()
        .filter(|(index, _)| *index != at)
        .map(|(_, arg)| arg.as_str())
        .collect();

    let usage = |error: String| format!("{error}\nUsage: noteriv {}", spec.usage);
    let line = Line::read(spec, &rest).map_err(usage)?;
    if line.has("--help") {
        return Ok(Invocation::Help(Some(spec.name.to_string())));
    }
    interpret(&line, cwd).map_err(usage)
}

/// Where the sub-command is, when the line begins with one. Only options of
/// ours may come before it, as in `noteriv --vault Work list`.
fn command_at(args: &[String]) -> Option<(usize, &'static Spec)> {
    let mut at = 0;
    loop {
        let arg = args.get(at)?.as_str();
        if let Some(spec) = COMMANDS.iter().find(|spec| spec.name == arg) {
            return Some((at, spec));
        }
        let (name, attached) = match arg.split_once('=') {
            Some((name, _)) => (name, true),
            None => (arg, false),
        };
        if VALUE_FLAGS.contains(&name) {
            at += if attached { 1 } else { 2 };
        } else if SWITCHES.contains(&name) {
            at += 1;
        } else {
            return None;
        }
    }
}

fn vault_name(vault: &str) -> Result<Option<String>, String> {
    match short_text("The vault", vault, 4 * MAX_NAME_BYTES)? {
        Some(vault) => Ok(Some(vault)),
        None => Err("--vault needs a vault's name, id or folder.".into()),
    }
}

/// A line that does not begin with a sub-command: start the app, with the
/// link or the note file on the line if there is one. `--vault` on its own
/// opens that vault.
fn launch(args: &[String], cwd: &Path) -> Invocation {
    if let Some(link) = args.iter().find(|arg| is_link(arg)) {
        return Invocation::Link(parse_url(link));
    }
    let vault = args
        .iter()
        .enumerate()
        .find_map(|(at, arg)| match arg.strip_prefix("--vault") {
            Some("") => args.get(at + 1).map(String::as_str),
            Some(rest) => rest.strip_prefix('='),
            None => None,
        })
        .and_then(|vault| vault_name(vault).ok().flatten());
    if let Some(path) = args.iter().find_map(|arg| note_file(arg, cwd)) {
        return Invocation::App(Some(Request::Open {
            vault,
            file: None,
            path: Some(path),
            line: None,
            heading: None,
        }));
    }
    Invocation::App(vault.map(|vault| Request::Open {
        vault: Some(vault),
        file: None,
        path: None,
        line: None,
        heading: None,
    }))
}

/// Whether what follows `open` is a file on this computer and not a note in
/// the vault: a full path, or one that starts from the current folder.
fn is_disk_path(note: &str) -> bool {
    Path::new(note).is_absolute()
        || ["./", "../", ".\\", "..\\"].iter().any(|start| note.starts_with(start))
}

fn interpret(line: &Line, cwd: &Path) -> Result<Invocation, String> {
    let vault = match line.value("--vault") {
        Some(vault) => vault_name(vault)?,
        None => None,
    };
    let window = |request: Request| Ok(Invocation::App(Some(request)));
    let headless = |action: Action| {
        Ok(Invocation::Headless(Command {
            vault: vault.clone(),
            action,
        }))
    };
    let json = line.has("--json");

    match line.spec.name {
        "open" => {
            let note = line.at_most_one("note")?;
            let number = line.value("--line").map(line_number).transpose()?;
            let heading = match line.value("--heading") {
                Some(heading) => short_text("The heading", heading, MAX_NAME_BYTES)?,
                None => None,
            };
            if note.is_none() && (number.is_some() || heading.is_some()) {
                return Err("--line and --heading need a note to go to.".into());
            }
            let (file, path) = match note {
                None => (None, None),
                Some(note) if is_disk_path(note) => (None, Some(absolute(note, cwd))),
                Some(note) => (Some(vault_relative("The note", note)?), None),
            };
            window(Request::Open {
                vault: vault.clone(),
                file,
                path,
                line: number,
                heading,
            })
        }
        "new" => {
            let name = line
                .at_most_one("name")?
                .map(|name| note_file_name("The note name", name))
                .transpose()?;
            let modes: Vec<WriteMode> = [
                ("--append", WriteMode::Append),
                ("--prepend", WriteMode::Prepend),
                ("--overwrite", WriteMode::Overwrite),
            ]
            .into_iter()
            .filter(|(flag, _)| line.has(flag))
            .map(|(_, mode)| mode)
            .collect();
            if modes.len() > 1 {
                return Err("Use only one of --append, --prepend and --overwrite.".into());
            }
            let content = line.value("--content").filter(|text| !text.is_empty());
            window(new_request(
                vault.clone(),
                name,
                content.map(str::to_string),
                modes.first().copied().unwrap_or(WriteMode::Create),
                line.has("--silent"),
            )?)
        }
        "daily" => {
            line.none()?;
            window(Request::Daily { vault: vault.clone() })
        }
        "unique" => {
            line.none()?;
            let content = line.value("--content").filter(|text| !text.is_empty());
            window(Request::Unique {
                vault: vault.clone(),
                content: content.map(str::to_string),
            })
        }
        "search" => {
            let limit = match line.value("--limit") {
                Some(text) => match text.trim().parse::<usize>() {
                    Ok(limit) if limit > 0 => Some(limit),
                    _ => {
                        return Err(format!(
                            "--limit is a whole number from 1 up, not {}.",
                            shown(text)
                        ))
                    }
                },
                None => None,
            };
            if line.has("--open") {
                if json || limit.is_some() {
                    return Err(
                        "--json and --limit are for printing the results here, so they do not go with --open."
                            .into(),
                    );
                }
                let query = line.at_most_one("query")?.unwrap_or_default();
                return window(Request::Search {
                    vault: vault.clone(),
                    query: query.trim().to_string(),
                });
            }
            let query = line.one("query")?;
            if query.trim().is_empty() {
                return Err("The search is empty.".into());
            }
            headless(Action::Search {
                query: query.to_string(),
                json,
                limit,
            })
        }
        "vaults" => {
            line.none()?;
            headless(Action::Vaults { json })
        }
        "list" => headless(Action::List {
            folder: line.at_most_one("folder")?.map(str::to_string),
            json,
        }),
        "read" => headless(Action::Read {
            note: line.one("note")?.to_string(),
        }),
        "tags" => {
            line.none()?;
            headless(Action::Tags { json })
        }
        "create" => headless(Action::Create {
            name: line.one("name")?.to_string(),
            content: line.content()?.unwrap_or(Content::Text(String::new())),
            overwrite: line.has("--overwrite"),
        }),
        "append" => {
            let note = line.one("note")?.to_string();
            let content = line
                .content()?
                .ok_or("`noteriv append` needs the text to add: --content TEXT or --stdin.")?;
            headless(Action::Append { note, content })
        }
        "help" => match line.at_most_one("command")? {
            None => Ok(Invocation::Help(None)),
            Some(topic) if COMMANDS.iter().any(|spec| spec.name == topic) => {
                Ok(Invocation::Help(Some(topic.to_string())))
            }
            Some(topic) => Err(format!("There is no command {}.", shown(topic))),
        },
        "version" => {
            line.none()?;
            Ok(Invocation::Version)
        }
        other => Err(format!("There is no command {}.", shown(other))),
    }
}

pub fn version_text() -> String {
    format!("noteriv {}", env!("CARGO_PKG_VERSION"))
}

/// What `help` prints: everything, or one sub-command. A topic that is not a
/// sub-command gets everything.
pub fn help_text(topic: Option<&str>) -> String {
    if let Some(spec) = topic.and_then(|topic| COMMANDS.iter().find(|spec| spec.name == topic)) {
        // The commands that work in a vault all take `--vault`.
        let vault = match spec.name {
            "vaults" | "help" | "version" => "",
            _ => "\n\n  --vault VAULT    The vault to use, by name, id or folder. Without it,\n                   the vault that is open in the app.",
        };
        return format!("Usage: noteriv {}\n\n{}{vault}\n", spec.usage, spec.about);
    }
    format!(
        "\
Noteriv {}

Usage:
  noteriv                     Start Noteriv, or bring its window to the front
  noteriv <file.md>           Open a note file
  noteriv <noteriv://link>    Follow a Noteriv link
  noteriv <command> [options]

Commands that use the app's window:
  open [note]                 Open a note, or just the vault
  new [name]                  Create a note, or add text to one
  daily                       Open today's daily note
  unique                      Create a note named by the date and time
  search [query] --open       Show a search in the app

Commands that print here and need no window:
  vaults                      List the vaults
  list [folder]               List the notes in the vault, or in one folder
  read <note>                 Print a note
  search <query>              Search the notes
  tags                        List the tags, with how many notes use each
  create <name>               Create a note
  append <note>               Add text to the end of a note
  help [command]              Show this help, or the help for one command
  version                     Print the version

Options:
  --vault <name|id|folder>    The vault to use. Without it, the vault that
                              is open in the app.
  --json                      Print JSON (vaults, list, search, tags)
  -h, --help                  Show help
  -V, --version               Print the version

A <note> is found the way a [[link]] finds it: by its name, or by its path
inside the vault. \".md\" may be left off, and capitals do not matter.

Text that starts with - goes after --:  noteriv search -- -draft
",
        env!("CARGO_PKG_VERSION")
    )
}

// ============================================================
// Commands that need no window
// ============================================================

/// The vaults the app knows, and the id of the one that is open in it.
pub fn vaults_from_store() -> (Vec<VaultRef>, Option<String>) {
    let config = crate::store::get_config();
    let vaults = config
        .vaults
        .iter()
        .map(|vault| VaultRef {
            id: vault.id.clone(),
            name: vault.name.clone(),
            path: crate::paths::expand_tilde(&vault.path),
        })
        .collect();
    (vaults, config.active_vault_id)
}

fn describe(vault: &VaultRef) -> String {
    format!("  {}  (id {})  {}", vault.name, vault.id, vault.path.display())
}

/// The vault a command or a request means. `wanted` is what `--vault` or a
/// link's `vault` gave: an id, a name in any capitals, or the vault's
/// folder. With none it is the vault open in the app. The answer is always
/// one of the vaults the user already has: naming some other folder does not
/// make a vault of it.
pub fn find_vault<'v>(
    vaults: &'v [VaultRef],
    active: Option<&str>,
    wanted: Option<&str>,
) -> Result<&'v VaultRef, String> {
    if vaults.is_empty() {
        return Err("There are no vaults yet. Open Noteriv and create one first.".into());
    }
    let Some(wanted) = wanted.map(str::trim).filter(|wanted| !wanted.is_empty()) else {
        return active
            .and_then(|id| vaults.iter().find(|vault| vault.id == id))
            .ok_or_else(|| "No vault is open in Noteriv. Say which to use with --vault.".to_string());
    };
    if let Some(vault) = vaults.iter().find(|vault| vault.id == wanted) {
        return Ok(vault);
    }
    let lower = wanted.to_lowercase();
    let named: Vec<&VaultRef> = vaults
        .iter()
        .filter(|vault| vault.name.to_lowercase() == lower)
        .collect();
    match named[..] {
        [vault] => return Ok(vault),
        [] => {}
        _ => {
            let list: Vec<String> = named.iter().map(|vault| describe(vault)).collect();
            return Err(format!(
                "More than one vault is named {}. Use its id or its folder instead:\n{}",
                shown(wanted),
                list.join("\n")
            ));
        }
    }
    let folder = crate::paths::expand_tilde(wanted);
    let real = dunce::canonicalize(&folder).ok();
    let by_folder = vaults.iter().find(|vault| {
        vault.path == folder
            || real
                .as_ref()
                .is_some_and(|real| dunce::canonicalize(&vault.path).ok().as_ref() == Some(real))
    });
    by_folder.ok_or_else(|| {
        let names: Vec<&str> = vaults.iter().map(|vault| vault.name.as_str()).collect();
        format!(
            "There is no vault {}. The vaults are: {}",
            shown(wanted),
            names.join(", ")
        )
    })
}

/// What a command prints: its output, and anything worth saying beside it.
#[derive(Default)]
struct Printed {
    out: String,
    notes: Vec<String>,
}

impl Printed {
    fn text(out: String) -> Printed {
        Printed {
            out,
            notes: Vec::new(),
        }
    }

    fn json<T: Serialize + ?Sized>(value: &T) -> Result<Printed, String> {
        let mut out = serde_json::to_string_pretty(value)
            .map_err(|error| format!("The result could not be written as JSON: {error}"))?;
        out.push('\n');
        Ok(Printed::text(out))
    }

    /// One item on each line.
    fn lines(items: &[String]) -> Printed {
        let mut out = items.join("\n");
        if !out.is_empty() {
            out.push('\n');
        }
        Printed::text(out)
    }
}

/// Carry out a command that needs no window. The output goes to `out` and
/// anything that went wrong to `err`; `input` is read only for `--stdin`.
/// Returns the exit code: 0, or `EXIT_FAILED`.
///
/// `vaults` and `active` are the vaults there are and the id of the one that
/// is open, as `vaults_from_store` gives them. Every file a command reads or
/// writes is inside the vault it chose, and nothing is written through a
/// symbolic link.
pub fn run(
    command: &Command,
    vaults: &[VaultRef],
    active: Option<&str>,
    input: &mut dyn Read,
    out: &mut dyn Write,
    err: &mut dyn Write,
) -> i32 {
    match carry_out(command, vaults, active, input) {
        Ok(printed) => {
            // A reader that has gone away (`noteriv list | head -1`) is not
            // worth a message.
            if out
                .write_all(printed.out.as_bytes())
                .and_then(|()| out.flush())
                .is_err()
            {
                return EXIT_FAILED;
            }
            for note in &printed.notes {
                let _ = writeln!(err, "noteriv: {note}");
            }
            0
        }
        Err(message) => {
            let _ = writeln!(err, "noteriv: {message}");
            EXIT_FAILED
        }
    }
}

fn carry_out(
    command: &Command,
    vaults: &[VaultRef],
    active: Option<&str>,
    input: &mut dyn Read,
) -> Result<Printed, String> {
    if let Action::Vaults { json } = command.action {
        return print_vaults(vaults, active, json);
    }
    let vault = find_vault(vaults, active, command.vault.as_deref())?;
    // Every path below is checked against this, the vault's real folder.
    let root = dunce::canonicalize(&vault.path)
        .ok()
        .filter(|root| root.is_dir())
        .ok_or_else(|| {
            format!(
                "The folder of the vault {} is not there: {}",
                shown(&vault.name),
                vault.path.display()
            )
        })?;

    match &command.action {
        Action::Vaults { json } => print_vaults(vaults, active, *json),
        Action::List { folder, json } => list(&root, folder.as_deref(), *json),
        Action::Read { note } => {
            let rel = find_note(&root, note)?;
            let path = inside(&root, &rel)?;
            fs::read_to_string(&path)
                .map(Printed::text)
                .map_err(|error| format!("{rel} could not be read: {error}"))
        }
        Action::Search { query, json, limit } => search(&root, query, *json, *limit),
        Action::Tags { json } => tags(&root, *json),
        Action::Create {
            name,
            content,
            overwrite,
        } => {
            let rel = note_file_name("The note name", name)?;
            let text = text_of(content, input)?;
            create(&root, &rel, &text, *overwrite)?;
            Ok(Printed::lines(&[rel]))
        }
        Action::Append { note, content } => {
            let rel = find_note(&root, note)?;
            let text = text_of(content, input)?;
            append(&root, &rel, &text)?;
            Ok(Printed::lines(&[rel]))
        }
    }
}

fn print_vaults(vaults: &[VaultRef], active: Option<&str>, json: bool) -> Result<Printed, String> {
    #[derive(Serialize)]
    struct Row<'a> {
        id: &'a str,
        name: &'a str,
        path: String,
        active: bool,
    }
    // In the order the app lists them.
    let rows: Vec<Row> = vaults
        .iter()
        .map(|vault| Row {
            id: &vault.id,
            name: &vault.name,
            path: vault.path.to_string_lossy().into_owned(),
            active: active == Some(vault.id.as_str()),
        })
        .collect();
    if json {
        return Printed::json(&rows);
    }
    let lines: Vec<String> = rows
        .iter()
        .map(|row| {
            let mark = if row.active { '*' } else { ' ' };
            format!("{mark} {}\t{}", row.name, row.path)
        })
        .collect();
    Ok(Printed::lines(&lines))
}

/// A path inside the vault as a path on disk.
fn on_disk(root: &Path, rel: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    path
}

/// The file a path inside the vault really is, which has to be inside the
/// vault too: a symbolic link out of it is refused.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let real = dunce::canonicalize(on_disk(root, rel))
        .map_err(|error| format!("{rel} could not be read: {error}"))?;
    if !real.starts_with(root) {
        return Err(format!("{rel} leads outside the vault, so it is left alone."));
    }
    Ok(real)
}

/// Every note in the vault, as the app lists them: hidden folders and
/// symbolic links are left out.
fn notes_in(root: &Path) -> Vec<String> {
    crate::links::list_vault(root)
        .into_iter()
        .filter(|rel| is_note(rel))
        .collect()
}

/// The note a name means, found as the app finds the note a `[[link]]`
/// points at: by its name without `.md`, in any capitals, or by its whole
/// path inside the vault. The answer is always one of the vault's own notes.
pub fn find_note(root: &Path, note: &str) -> Result<String, String> {
    let files = crate::links::list_vault(root);
    let index = crate::links::Index::new(&files);
    index
        .note(&note.replace('\\', "/"))
        .map(str::to_string)
        .ok_or_else(|| format!("There is no note {} in the vault.", shown(note)))
}

fn list(root: &Path, folder: Option<&str>, json: bool) -> Result<Printed, String> {
    let mut notes = notes_in(root);
    if let Some(folder) = folder {
        let folder = vault_relative("The folder", folder.trim().trim_end_matches(['/', '\\']))?;
        let start = format!("{}/", folder.to_lowercase());
        notes.retain(|rel| rel.to_lowercase().starts_with(&start));
        if notes.is_empty() && !on_disk(root, &folder).is_dir() {
            return Err(format!("There is no folder {} in the vault.", shown(&folder)));
        }
    }
    if json {
        return Printed::json(&notes);
    }
    Ok(Printed::lines(&notes))
}

fn search(root: &Path, query: &str, json: bool, limit: Option<usize>) -> Result<Printed, String> {
    use crate::search::{search_vault, Sort};
    let mut result = search_vault(root, query, false, Sort::NameAsc, &[]);
    if let Some(error) = result.error.take() {
        return Err(error);
    }
    result
        .files
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    if let Some(limit) = limit {
        result.files.truncate(limit);
    }
    if json {
        return Printed::json(&result);
    }

    let mut printed = Printed::default();
    let mut more_lines = 0;
    for file in &result.files {
        // Found by its name, a tag or a property: there is no line to show.
        if file.lines.is_empty() {
            printed.out.push_str(&file.relative_path);
            printed.out.push('\n');
        }
        for hit in &file.lines {
            printed
                .out
                .push_str(&format!("{}:{}: {}\n", file.relative_path, hit.line, hit.text));
        }
        more_lines += file.more_lines;
    }
    if result.files.len() < result.total_files {
        printed.notes.push(format!(
            "{} notes match; the first {} are shown.",
            result.total_files,
            result.files.len()
        ));
    }
    if more_lines > 0 {
        printed
            .notes
            .push(format!("{more_lines} more matching lines are not shown."));
    }
    Ok(printed)
}

fn tags(root: &Path, json: bool) -> Result<Printed, String> {
    #[derive(Serialize)]
    struct Row {
        tag: String,
        count: usize,
    }
    // Lower case to the tag as first written and the notes that use it. A
    // tag is one tag in any capitals, as it is to `tag:` in a search.
    let mut counts: BTreeMap<String, (String, usize)> = BTreeMap::new();
    for meta in crate::vault_index::index_vault(root) {
        // The `tags` property first, read as the search reads it, then the
        // #tags in the text.
        let mut found: Vec<String> = Vec::new();
        let properties = meta
            .frontmatter
            .as_deref()
            .map(crate::search::flat_properties)
            .unwrap_or_default();
        for (key, values) in &properties {
            if key == "tags" || key == "tag" {
                for value in values {
                    found.extend(
                        value
                            .split([' ', ','])
                            .map(|tag| tag.trim().trim_start_matches('#').to_string())
                            .filter(|tag| !tag.is_empty()),
                    );
                }
            }
        }
        found.extend(meta.tags);

        let mut seen: Vec<String> = Vec::new();
        for tag in found {
            let lower = tag.to_lowercase();
            if seen.contains(&lower) {
                continue;
            }
            counts.entry(lower.clone()).or_insert((tag, 0)).1 += 1;
            seen.push(lower);
        }
    }
    let rows: Vec<Row> = counts
        .into_values()
        .map(|(tag, count)| Row { tag, count })
        .collect();
    if json {
        return Printed::json(&rows);
    }
    let lines: Vec<String> = rows
        .iter()
        .map(|row| format!("{}\t{}", row.tag, row.count))
        .collect();
    Ok(Printed::lines(&lines))
}

fn text_of(content: &Content, input: &mut dyn Read) -> Result<String, String> {
    match content {
        Content::Text(text) => Ok(text.clone()),
        Content::Stdin => {
            let mut bytes = Vec::new();
            input
                .take(MAX_INPUT_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| format!("Standard input could not be read: {error}"))?;
            if bytes.len() as u64 > MAX_INPUT_BYTES {
                return Err("There is too much text on standard input for one note.".into());
            }
            String::from_utf8(bytes).map_err(|_| "The text on standard input is not UTF-8.".into())
        }
    }
}

/// Where a note is to be written, with its folders made. Nothing on the way
/// there may be a symbolic link, so the folders are checked one at a time
/// before any is created: a link is how a path that reads as inside the
/// vault ends up somewhere else, and the app does not list what is behind
/// one either. The folder's real place is checked against the vault after.
fn writable(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let parts: Vec<&str> = rel.split('/').collect();
    let mut path = root.to_path_buf();
    for (at, part) in parts.iter().enumerate() {
        path.push(part);
        let so_far = parts[..=at].join("/");
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(format!(
                    "{so_far} is a symbolic link, and Noteriv does not write through one."
                ));
            }
            Ok(meta) if at + 1 < parts.len() && !meta.is_dir() => {
                return Err(format!("{so_far} is a file, not a folder."));
            }
            Ok(meta) if at + 1 == parts.len() && meta.is_dir() => {
                return Err(format!("{so_far} is a folder, not a note."));
            }
            Ok(_) => {}
            // Nothing from here on exists yet, so none of it is a link.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(format!("{so_far} could not be checked: {error}")),
        }
    }

    let target = on_disk(root, rel);
    let (Some(parent), Some(name)) = (target.parent(), target.file_name()) else {
        return Err(format!("{rel} is not a note's path."));
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("The folder for {rel} could not be created: {error}"))?;
    let real = dunce::canonicalize(parent)
        .map_err(|error| format!("The folder for {rel} could not be checked: {error}"))?;
    if !real.starts_with(root) {
        return Err(format!("{rel} leads outside the vault, so nothing was written."));
    }
    Ok(real.join(name))
}

/// Put new text in place of a note's old text without ever leaving half of
/// it: the text is written to a file beside the note, which then takes the
/// note's place. The note keeps its permissions.
fn replace(target: &Path, rel: &str, text: &str) -> Result<(), String> {
    let permissions = fs::metadata(target).ok().map(|meta| meta.permissions());
    AtomicFile::new(target, AllowOverwrite)
        .write(|file| {
            file.write_all(text.as_bytes())?;
            if let Some(permissions) = permissions.clone() {
                file.set_permissions(permissions)?;
            }
            Ok::<(), std::io::Error>(())
        })
        .map_err(|error| format!("{rel} could not be written: {error}"))
}

fn create(root: &Path, rel: &str, text: &str, overwrite: bool) -> Result<(), String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    // A name that differs from a file's only in capitals is that file on
    // Windows and macOS, and is taken as far as the app is concerned.
    let taken = crate::links::list_vault(root)
        .into_iter()
        .find(|file| file != rel && file.to_lowercase() == rel.to_lowercase());
    if let Some(taken) = taken {
        return Err(format!(
            "{taken} already exists, and {rel} differs from it only in capitals."
        ));
    }
    let target = writable(root, rel)?;
    if fs::symlink_metadata(&target).is_ok() {
        if !overwrite {
            return Err(format!(
                "{rel} already exists. To replace it use --overwrite; to add to it use `noteriv append`."
            ));
        }
        return replace(&target, rel, text);
    }
    // Refuses to take the place of a note that appeared in the meantime.
    AtomicFile::new(&target, DisallowOverwrite)
        .write(|file| file.write_all(text.as_bytes()))
        .map_err(|error| {
            if target.exists() {
                format!("{rel} already exists.")
            } else {
                format!("{rel} could not be written: {error}")
            }
        })
}

fn append(root: &Path, rel: &str, text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("There is no text to add.".into());
    }
    let _guard = crate::commands_fs::lock_file_mutations();
    let target = writable(root, rel)?;
    let mut note =
        fs::read_to_string(&target).map_err(|error| format!("{rel} could not be read: {error}"))?;
    // The new text starts on a line of its own.
    if !note.is_empty() && !note.ends_with('\n') {
        note.push('\n');
    }
    note.push_str(text);
    replace(&target, rel, &note)
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A folder of the test's own, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Scratch {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().join(format!(
                "noteriv-cli-{}-{}-{name}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Scratch(dunce::canonicalize(dir).unwrap())
        }

        fn write(&self, rel: &str, text: &str) {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }

        fn read(&self, rel: &str) -> String {
            fs::read_to_string(self.0.join(rel)).unwrap()
        }

        fn has(&self, rel: &str) -> bool {
            fs::symlink_metadata(self.0.join(rel)).is_ok()
        }

        /// The names in a folder, exactly as they are on disk, in order.
        fn names(&self, rel: &str) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(self.0.join(rel))
                .unwrap()
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            names
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn strings(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn parse(list: &[&str]) -> Result<Invocation, String> {
        parse_args_in(&strings(list), Path::new("/noteriv-test-no-such-folder"))
    }

    fn request(list: &[&str]) -> Request {
        match parse(list) {
            Ok(Invocation::App(Some(request))) => request,
            other => panic!("{list:?} gave {other:?}"),
        }
    }

    fn command(list: &[&str]) -> Command {
        match parse(list) {
            Ok(Invocation::Headless(command)) => command,
            other => panic!("{list:?} gave {other:?}"),
        }
    }

    fn error(list: &[&str]) -> String {
        match parse(list) {
            Err(error) => error,
            other => panic!("{list:?} gave {other:?}"),
        }
    }

    fn open(vault: Option<&str>, file: Option<&str>) -> Request {
        Request::Open {
            vault: vault.map(String::from),
            file: file.map(String::from),
            path: None,
            line: None,
            heading: None,
        }
    }

    fn new(name: Option<&str>, content: Option<&str>, mode: WriteMode) -> Request {
        Request::New {
            vault: None,
            name: name.map(String::from),
            content: content.map(String::from),
            mode,
            silent: false,
        }
    }

    // ---------- the command line ----------

    #[test]
    fn no_arguments_start_the_app() {
        assert_eq!(parse(&[]), Ok(Invocation::App(None)));
    }

    #[test]
    fn arguments_a_launcher_adds_start_the_app() {
        for line in [
            &["-psn_0_12345"][..],
            &["--no-sandbox"],
            &["--gapplication-service"],
            &["--flag", "value"],
            &["-NSDocumentRevisionsDebugMode", "YES"],
            &["--minimized", "open"],
            // A mistyped command starts the app too: nothing that does not
            // begin with a sub-command is an error.
            &["serach", "meeting"],
            &["no-such-file.md"],
            &["notes.txt"],
        ] {
            assert_eq!(parse(line), Ok(Invocation::App(None)), "{line:?}");
        }
    }

    #[test]
    fn a_link_argument_is_followed_as_a_link() {
        let alpha = Ok(open(Some("Work"), Some("Projects/Alpha")));
        let link = "noteriv://open?vault=Work&file=Projects%2FAlpha";
        assert_eq!(parse(&[link]), Ok(Invocation::Link(alpha.clone())));
        assert_eq!(
            parse(&["NOTERIV://open?vault=Work&file=Projects%2FAlpha"]),
            Ok(Invocation::Link(alpha.clone()))
        );
        // After what a launcher added, and after a leading --vault.
        assert_eq!(parse(&["--no-sandbox", link]), Ok(Invocation::Link(alpha.clone())));
        assert_eq!(parse(&["--vault", "Other", link]), Ok(Invocation::Link(alpha)));
        // Bare: just bring the app up.
        assert_eq!(parse(&["noteriv://"]), Ok(Invocation::Link(Ok(open(None, None)))));
    }

    #[test]
    fn a_link_that_cannot_be_read_still_starts_the_app() {
        match parse(&["noteriv://explode?now=1"]) {
            Ok(Invocation::Link(Err(reason))) => assert!(reason.contains("explode"), "{reason}"),
            other => panic!("{other:?}"),
        }
        match parse(&["noteriv://new?name=Plan&overwrite=true&content=gone"]) {
            Ok(Invocation::Link(Err(reason))) => assert!(reason.contains("replace"), "{reason}"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn nothing_else_on_a_line_with_a_link_is_read() {
        // What a badly quoted link could add is not taken for a command.
        let line = ["noteriv://new?name=Plan", "--overwrite", "create", "Evil", "--content", "x"];
        assert_eq!(
            parse(&line),
            Ok(Invocation::Link(Ok(new(Some("Plan.md"), None, WriteMode::Create))))
        );
        let line = ["noteriv://open?file=a", "--vault", "Other", "--help"];
        assert_eq!(parse(&line), Ok(Invocation::Link(Ok(open(None, Some("a"))))));
    }

    #[test]
    fn a_typed_command_may_carry_a_link_as_text() {
        assert_eq!(
            command(&["append", "Inbox", "--content", "noteriv://open?file=Plan"]).action,
            Action::Append {
                note: "Inbox".into(),
                content: Content::Text("noteriv://open?file=Plan".into()),
            }
        );
        assert_eq!(
            command(&["search", "noteriv://open"]).action,
            Action::Search {
                query: "noteriv://open".into(),
                json: false,
                limit: None,
            }
        );
    }

    #[test]
    fn a_note_file_argument_opens_that_file() {
        let dir = Scratch::new("file-arg");
        dir.write("Inbox.md", "x");
        dir.write("sub/Long.markdown", "x");
        dir.write("notes.txt", "x");
        // Compared as paths, so it does not matter which slash they are written with.
        let at = |rel: &str| Some(dir.0.join(rel));
        let opened = |line: &[&str]| match parse_args_in(&strings(line), &dir.0) {
            Ok(Invocation::App(Some(Request::Open { path, file: None, .. }))) => path.map(PathBuf::from),
            Ok(Invocation::App(None)) => None,
            other => panic!("{line:?} gave {other:?}"),
        };

        let full = dir.0.join("Inbox.md").to_string_lossy().into_owned();
        assert_eq!(opened(&[&full]), at("Inbox.md"));
        // A path from the current folder is made full, because the app that
        // ends up reading it is running somewhere else.
        assert_eq!(opened(&["Inbox.md"]), at("Inbox.md"));
        assert_eq!(opened(&["./sub/../Inbox.md"]), at("Inbox.md"));
        assert_eq!(opened(&["sub/Long.markdown"]), at("sub/Long.markdown"));
        assert_eq!(opened(&["--no-sandbox", "Inbox.md"]), at("Inbox.md"));
        // What a file manager may pass instead of a path.
        let address = url::Url::from_file_path(dir.0.join("Inbox.md")).unwrap();
        assert_eq!(opened(&[address.as_str()]), at("Inbox.md"));

        assert_eq!(opened(&["notes.txt"]), None);
        assert_eq!(opened(&["Missing.md"]), None);
        assert_eq!(opened(&["sub"]), None);
    }

    #[test]
    fn open_names_a_note_in_the_vault_or_a_file_on_disk() {
        assert_eq!(request(&["open", "Alpha"]), open(None, Some("Alpha")));
        assert_eq!(request(&["open"]), open(None, None));
        assert_eq!(
            request(&["open", "Projects/Alpha.md", "--line", "12", "--heading", "Tasks"]),
            Request::Open {
                vault: None,
                file: Some("Projects/Alpha.md".into()),
                path: None,
                line: Some(12),
                heading: Some("Tasks".into()),
            }
        );
        assert_eq!(
            request(&["open", "--line=3", "--heading=To do", "Alpha"]),
            Request::Open {
                vault: None,
                file: Some("Alpha".into()),
                path: None,
                line: Some(3),
                heading: Some("To do".into()),
            }
        );
        // A note with # in its name stays whole: the heading is --heading.
        assert_eq!(request(&["open", "C# notes"]), open(None, Some("C# notes")));
        assert_eq!(request(&["open", "Projects\\Alpha"]), open(None, Some("Projects/Alpha")));

        let dir = Scratch::new("open-path");
        dir.write("a/Note.md", "x");
        let path_of = |line: &[&str]| match parse_args_in(&strings(line), &dir.0.join("a")) {
            Ok(Invocation::App(Some(Request::Open { path, file: None, vault: None, .. }))) => {
                path.map(PathBuf::from)
            }
            other => panic!("{line:?} gave {other:?}"),
        };
        assert_eq!(path_of(&["open", "./Note.md"]), Some(dir.0.join("a/Note.md")));
        assert_eq!(path_of(&["open", "../a/Note.md"]), Some(dir.0.join("a/Note.md")));
        assert_eq!(path_of(&["open", "./Not there.md"]), Some(dir.0.join("a/Not there.md")));
        let full = dir.0.join("a/Note.md");
        assert_eq!(path_of(&["open", full.to_str().unwrap()]), Some(full.clone()));
    }

    #[test]
    fn open_refuses_what_it_cannot_mean() {
        assert!(error(&["open", "a", "b"]).contains("takes one note"));
        assert!(error(&["open", "a/../../b"]).contains("inside the vault"));
        assert!(error(&["open", ".obsidian/app.json"]).contains("hidden"));
        assert!(error(&["open", "--line", "12"]).contains("need a note"));
        assert!(error(&["open", "a", "--line", "0"]).contains("line number"));
        assert!(error(&["open", "a", "--line", "twelve"]).contains("line number"));
        assert!(error(&["open", "a", "--line"]).contains("needs a value"));
        assert!(error(&["open", "a", "--json"]).contains("no --json option"));
        // Every error says how the command is written.
        assert!(error(&["open", "a", "b"]).contains("Usage: noteriv open [note]"));
    }

    #[test]
    fn new_reads_its_name_text_and_mode() {
        assert_eq!(request(&["new"]), new(None, None, WriteMode::Create));
        assert_eq!(request(&["new", "Idea"]), new(Some("Idea.md"), None, WriteMode::Create));
        assert_eq!(
            request(&["new", "Projects/Idea.md", "--content", "text"]),
            new(Some("Projects/Idea.md"), Some("text"), WriteMode::Create)
        );
        // A new note is Markdown whatever its name ends in.
        assert_eq!(request(&["new", "Meeting 2.5"]), new(Some("Meeting 2.5.md"), None, WriteMode::Create));
        assert_eq!(request(&["new", "run.sh"]), new(Some("run.sh.md"), None, WriteMode::Create));
        assert_eq!(request(&["new", "Old.markdown"]), new(Some("Old.markdown"), None, WriteMode::Create));
        // A value is taken as it is, even when it starts with a dash.
        assert_eq!(
            request(&["new", "Inbox", "--append", "--content", "- [ ] milk"]),
            new(Some("Inbox.md"), Some("- [ ] milk"), WriteMode::Append)
        );
        assert_eq!(
            request(&["new", "Inbox", "--prepend", "--content=--top--"]),
            new(Some("Inbox.md"), Some("--top--"), WriteMode::Prepend)
        );
        assert_eq!(
            request(&["new", "Inbox", "--overwrite", "--content", "all new"]),
            new(Some("Inbox.md"), Some("all new"), WriteMode::Overwrite)
        );
        assert_eq!(
            request(&["new", "Inbox", "--silent", "--vault", "Work"]),
            Request::New {
                vault: Some("Work".into()),
                name: Some("Inbox.md".into()),
                content: None,
                mode: WriteMode::Create,
                silent: true,
            }
        );
    }

    #[test]
    fn new_refuses_what_it_cannot_mean() {
        assert!(error(&["new", "a", "--append", "--overwrite"]).contains("only one of"));
        assert!(error(&["new", "--append", "--content", "x"]).contains("needs the note's name"));
        assert!(error(&["new", "a", "--append"]).contains("needs the text to add"));
        assert!(error(&["new", "a", "b"]).contains("takes one name"));
        assert!(error(&["new", "../a"]).contains("inside the vault"));
        assert!(error(&["new", "/etc/cron.d/a"]).contains("not a full path"));
        assert!(error(&["new", "a", "--content"]).contains("needs a value"));
        assert!(error(&["new", "a", "--content", "x", "--content", "y"]).contains("twice"));
        assert!(error(&["new", "a", "--silent=yes"]).contains("does not take a value"));
    }

    #[test]
    fn daily_unique_and_search_in_the_app() {
        assert_eq!(request(&["daily"]), Request::Daily { vault: None });
        assert_eq!(
            request(&["daily", "--vault", "Work"]),
            Request::Daily { vault: Some("Work".into()) }
        );
        assert!(error(&["daily", "tomorrow"]).contains("takes nothing"));

        assert_eq!(request(&["unique"]), Request::Unique { vault: None, content: None });
        assert_eq!(
            request(&["unique", "--content", "Hello"]),
            Request::Unique { vault: None, content: Some("Hello".into()) }
        );
        assert!(error(&["unique", "name"]).contains("takes nothing"));

        assert_eq!(
            request(&["search", "meeting notes", "--open"]),
            Request::Search { vault: None, query: "meeting notes".into() }
        );
        assert_eq!(
            request(&["search", "--open", "--vault=Work"]),
            Request::Search { vault: Some("Work".into()), query: String::new() }
        );
        assert!(error(&["search", "x", "--open", "--json"]).contains("do not go with --open"));
        assert!(error(&["search", "x", "--open", "--limit", "3"]).contains("do not go with --open"));
    }

    #[test]
    fn the_commands_that_print_are_read_with_their_options() {
        let action = |line: &[&str]| command(line).action;
        assert_eq!(action(&["vaults"]), Action::Vaults { json: false });
        assert_eq!(action(&["vaults", "--json"]), Action::Vaults { json: true });
        assert_eq!(action(&["list"]), Action::List { folder: None, json: false });
        assert_eq!(
            action(&["list", "Projects", "--json"]),
            Action::List { folder: Some("Projects".into()), json: true }
        );
        assert_eq!(action(&["read", "Alpha"]), Action::Read { note: "Alpha".into() });
        assert_eq!(
            action(&["search", "meeting"]),
            Action::Search { query: "meeting".into(), json: false, limit: None }
        );
        assert_eq!(
            action(&["search", "--json", "--limit", "5", "tag:#work"]),
            Action::Search { query: "tag:#work".into(), json: true, limit: Some(5) }
        );
        assert_eq!(
            action(&["search", "meeting", "--limit=2"]),
            Action::Search { query: "meeting".into(), json: false, limit: Some(2) }
        );
        assert_eq!(action(&["tags"]), Action::Tags { json: false });
        assert_eq!(action(&["tags", "--json"]), Action::Tags { json: true });
        assert_eq!(
            action(&["create", "Idea"]),
            Action::Create { name: "Idea".into(), content: Content::Text(String::new()), overwrite: false }
        );
        assert_eq!(
            action(&["create", "Idea", "--content", "# Idea", "--overwrite"]),
            Action::Create { name: "Idea".into(), content: Content::Text("# Idea".into()), overwrite: true }
        );
        assert_eq!(
            action(&["create", "Idea", "--stdin"]),
            Action::Create { name: "Idea".into(), content: Content::Stdin, overwrite: false }
        );
        assert_eq!(
            action(&["append", "Inbox", "--content", "- [ ] milk"]),
            Action::Append { note: "Inbox".into(), content: Content::Text("- [ ] milk".into()) }
        );
        assert_eq!(
            action(&["append", "Inbox", "--stdin"]),
            Action::Append { note: "Inbox".into(), content: Content::Stdin }
        );
    }

    #[test]
    fn missing_and_extra_arguments_are_errors() {
        assert!(error(&["read"]).contains("needs a note"));
        assert!(error(&["read", "a", "b"]).contains("takes one note"));
        assert!(error(&["search"]).contains("needs a query"));
        assert!(error(&["search", "meeting", "notes"]).contains("in quotes"));
        assert!(error(&["search", "  "]).contains("empty"));
        assert!(error(&["search", "x", "--limit", "0"]).contains("--limit"));
        assert!(error(&["search", "x", "--limit", "many"]).contains("--limit"));
        assert!(error(&["search", "x", "--limit"]).contains("needs a value"));
        assert!(error(&["list", "a", "b"]).contains("takes one folder"));
        assert!(error(&["vaults", "extra"]).contains("takes nothing"));
        assert!(error(&["tags", "extra"]).contains("takes nothing"));
        assert!(error(&["create"]).contains("needs a name"));
        assert!(error(&["create", "a", "b"]).contains("takes one name"));
        assert!(error(&["create", "a", "--content", "x", "--stdin"]).contains("not both"));
        assert!(error(&["append"]).contains("needs a note"));
        assert!(error(&["append", "Inbox"]).contains("needs the text to add"));
        assert!(error(&["append", "Inbox", "--content", "x", "--stdin"]).contains("not both"));
        assert!(error(&["append", "Inbox", "--overwrite"]).contains("no --overwrite option"));
        assert!(error(&["read", "a", "--json"]).contains("no --json option"));
        assert!(error(&["read", "a", "--frobnicate"]).contains("is not an option"));
        assert!(error(&["read", "-a"]).contains("put -- before it"));
        assert!(error(&["help", "frobnicate"]).contains("no command"));
        assert!(error(&["help", "a", "b"]).contains("takes one command"));
        assert!(error(&["version", "now"]).contains("takes nothing"));
    }

    #[test]
    fn text_after_two_dashes_is_never_an_option() {
        assert_eq!(
            command(&["search", "--", "-draft"]).action,
            Action::Search { query: "-draft".into(), json: false, limit: None }
        );
        assert_eq!(
            command(&["search", "--json", "--", "--open"]).action,
            Action::Search { query: "--open".into(), json: true, limit: None }
        );
        assert_eq!(command(&["read", "--", "-weird"]).action, Action::Read { note: "-weird".into() });
        // A lone dash is text as well.
        assert_eq!(command(&["read", "-"]).action, Action::Read { note: "-".into() });
    }

    #[test]
    fn the_vault_may_be_named_before_or_after_the_command() {
        let work = Some("Work".to_string());
        assert_eq!(command(&["--vault", "Work", "list"]).vault, work);
        assert_eq!(command(&["--vault=Work", "list"]).vault, work);
        assert_eq!(command(&["list", "--vault", "Work"]).vault, work);
        assert_eq!(command(&["list", "--vault=Work", "--json"]).vault, work);
        assert_eq!(command(&["read", "--vault", "My Notes", "Alpha"]).vault, Some("My Notes".into()));
        assert_eq!(command(&["list"]).vault, None);
        assert_eq!(request(&["--vault", "Work", "open", "Alpha"]), open(Some("Work"), Some("Alpha")));
        assert_eq!(request(&["open", "Alpha", "--vault", "Work"]), open(Some("Work"), Some("Alpha")));
        // On its own it opens that vault.
        assert_eq!(request(&["--vault", "Work"]), open(Some("Work"), None));
        assert_eq!(request(&["--vault=My Notes"]), open(Some("My Notes"), None));
        assert_eq!(parse(&["--vault"]), Ok(Invocation::App(None)));

        assert!(error(&["--vault", "A", "list", "--vault", "B"]).contains("twice"));
        assert!(error(&["--vault", "A", "--vault", "B", "list"]).contains("twice"));
        assert!(error(&["list", "--vault"]).contains("needs a value"));
        assert!(error(&["list", "--vault", " "]).contains("needs a vault"));
    }

    #[test]
    fn options_may_come_before_the_command() {
        assert_eq!(command(&["--json", "vaults"]).action, Action::Vaults { json: true });
        assert_eq!(
            command(&["--limit", "5", "--json", "search", "meeting"]).action,
            Action::Search { query: "meeting".into(), json: true, limit: Some(5) }
        );
        // A value that happens to be a command's name is still a value.
        let read = command(&["--vault", "list", "read", "Alpha"]);
        assert_eq!((read.vault.as_deref(), read.action), (Some("list"), Action::Read { note: "Alpha".into() }));
        assert_eq!(
            request(&["--content=open", "new", "Idea"]),
            new(Some("Idea.md"), Some("open"), WriteMode::Create)
        );
        // They are held to the same rules there.
        assert!(error(&["--json", "read", "Alpha"]).contains("no --json option"));
        // Anything else before the command, and it is not a command line of ours.
        assert_eq!(parse(&["--verbose", "vaults"]), Ok(Invocation::App(None)));
    }

    #[test]
    fn help_and_version() {
        assert_eq!(parse(&["--help"]), Ok(Invocation::Help(None)));
        assert_eq!(parse(&["-h"]), Ok(Invocation::Help(None)));
        assert_eq!(parse(&["help"]), Ok(Invocation::Help(None)));
        assert_eq!(parse(&["help", "search"]), Ok(Invocation::Help(Some("search".into()))));
        assert_eq!(parse(&["search", "--help"]), Ok(Invocation::Help(Some("search".into()))));
        assert_eq!(parse(&["create", "-h"]), Ok(Invocation::Help(Some("create".into()))));
        assert_eq!(parse(&["--version"]), Ok(Invocation::Version));
        assert_eq!(parse(&["-V"]), Ok(Invocation::Version));
        assert_eq!(parse(&["version"]), Ok(Invocation::Version));
        assert_eq!(version_text(), format!("noteriv {}", env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn the_help_covers_every_command() {
        let all = help_text(None);
        for spec in COMMANDS {
            assert!(all.contains(&format!("\n  {} ", spec.name)), "{} is not in the help", spec.name);
            let one = help_text(Some(spec.name));
            assert!(one.starts_with(&format!("Usage: noteriv {}", spec.name)), "{one}");
            assert!(one.lines().all(|line| line.chars().count() <= 80), "{one}");
            // Every option a command takes is explained in its own help.
            for flag in spec.flags {
                assert!(one.contains(flag), "{flag} is not in the help for {}", spec.name);
            }
        }
        assert!(all.lines().all(|line| line.chars().count() <= 80));
        assert_eq!(help_text(Some("frobnicate")), all);
    }

    // ---------- links ----------

    #[test]
    fn open_links() {
        assert_eq!(
            parse_url("noteriv://open?vault=Work&file=Projects%2FAlpha"),
            Ok(open(Some("Work"), Some("Projects/Alpha")))
        );
        assert_eq!(parse_url("noteriv://open?vault=my%20vault"), Ok(open(Some("my vault"), None)));
        // In a parameter a space may be written as %20 or as +; %2B is a plus.
        assert_eq!(
            parse_url("noteriv://open?vault=my+vault&file=C%2B%2B+notes"),
            Ok(open(Some("my vault"), Some("C++ notes")))
        );
        assert_eq!(
            parse_url("noteriv://open?file=%E6%97%A5%E8%A8%98%2F%C3%9Cbung"),
            Ok(open(None, Some("日記/Übung")))
        );
        assert_eq!(parse_url("noteriv://open?file=日記/Übung"), Ok(open(None, Some("日記/Übung"))));
        // Other ways the same link is written.
        for link in [
            "noteriv://open/?file=Alpha",
            "noteriv:open?file=Alpha",
            "NoteRiv://OPEN?file=Alpha",
            "noteriv://?file=Alpha",
            "  noteriv://open?file=Alpha  ",
            "noteriv://open?file=Alpha&paneType=tab&x-success=evil%3A%2F%2Fx",
            "noteriv://open?file=Alpha&file=Other",
        ] {
            assert_eq!(parse_url(link), Ok(open(None, Some("Alpha"))), "{link}");
        }
        for link in ["noteriv://", "noteriv:", "noteriv://open", "noteriv://open/"] {
            assert_eq!(parse_url(link), Ok(open(None, None)), "{link}");
        }
    }

    #[test]
    fn open_links_go_to_a_heading_or_a_line() {
        let at = |heading: &str, line: Option<u32>| Request::Open {
            vault: None,
            file: Some("Note".into()),
            path: None,
            line,
            heading: Some(heading.into()),
        };
        assert_eq!(parse_url("noteriv://open?file=Note%23Heading"), Ok(at("Heading", None)));
        assert_eq!(parse_url("noteriv://open?file=Note%23%5Eblock1"), Ok(at("^block1", None)));
        assert_eq!(parse_url("noteriv://open?file=Note#My%20Heading"), Ok(at("My Heading", None)));
        assert_eq!(parse_url("noteriv://open?file=Note&heading=Tasks+today"), Ok(at("Tasks today", None)));
        assert_eq!(parse_url("noteriv://open?file=Note&heading=A&line=7#B"), Ok(at("A", Some(7))));
        assert_eq!(parse_url("noteriv://vault/Work/Note#Heading").map(|r| r.vault().map(String::from)), Ok(Some("Work".into())));
        assert_eq!(
            parse_url("noteriv://open?file=Note&line=12"),
            Ok(Request::Open { vault: None, file: Some("Note".into()), path: None, line: Some(12), heading: None })
        );
        // A heading with no file is a heading in whatever note is open.
        assert_eq!(
            parse_url("noteriv://open?file=%23Top"),
            Ok(Request::Open { vault: None, file: None, path: None, line: None, heading: Some("Top".into()) })
        );
        for link in ["noteriv://open?file=a&line=0", "noteriv://open?file=a&line=-1", "noteriv://open?file=a&line=x"] {
            assert!(parse_url(link).unwrap_err().contains("line number"), "{link}");
        }
    }

    #[test]
    fn the_shorthand_names_a_vault_and_a_file_in_the_path() {
        assert_eq!(
            parse_url("noteriv://vault/My%20Vault/Projects/My%20Note"),
            Ok(open(Some("My Vault"), Some("Projects/My Note")))
        );
        assert_eq!(parse_url("noteriv://vault/Work"), Ok(open(Some("Work"), None)));
        assert_eq!(parse_url("noteriv://vault/Work/"), Ok(open(Some("Work"), None)));
        // In the path a + is a plus, and an encoded slash is a slash.
        assert_eq!(
            parse_url("noteriv://vault/A+B/C%2B%2B%20notes%2FIntro/1+1"),
            Ok(open(Some("A+B"), Some("C++ notes/Intro/1+1")))
        );
        assert_eq!(
            parse_url("noteriv://vault/Work/Note?line=4#Tasks"),
            Ok(Request::Open {
                vault: Some("Work".into()),
                file: Some("Note".into()),
                path: None,
                line: Some(4),
                heading: Some("Tasks".into()),
            })
        );
        // What the path says wins over a parameter of the same name.
        assert_eq!(
            parse_url("noteriv://vault/Work/Note?vault=Other&file=Else"),
            Ok(open(Some("Work"), Some("Note")))
        );
        assert!(parse_url("noteriv://vault").unwrap_err().contains("which vault"));
        assert!(parse_url("noteriv://vault/").unwrap_err().contains("which vault"));
    }

    #[test]
    fn a_full_path_is_only_for_opening() {
        let at = |path: &str| {
            Ok(Request::Open { vault: None, file: None, path: Some(path.into()), line: None, heading: None })
        };
        assert_eq!(parse_url("noteriv://open?path=%2Fhome%2Fme%2Fnotes%2FMy%20Note.md"), at("/home/me/notes/My Note.md"));
        assert_eq!(parse_url("noteriv:///home/me/notes/My%20Note.md"), at("/home/me/notes/My Note.md"));
        assert_eq!(parse_url("noteriv:///C:/notes/a.md"), at("C:/notes/a.md"));
        assert_eq!(parse_url("noteriv://open?path=C%3A%5Cnotes%5Ca.md"), at("C:\\notes\\a.md"));
        // As in Obsidian, it stands in for the vault and the file.
        assert_eq!(parse_url("noteriv://open?vault=Work&file=Alpha&path=%2Fn%2Fa.md"), at("/n/a.md"));

        for link in [
            "noteriv://open?path=notes%2Fa.md",
            "noteriv://open?path=..%2Fa.md",
            "noteriv://open?path=%2Fhome%2Fme%2F..%2F..%2Fetc%2Fpasswd",
            "noteriv://open?path=C%3A%5Cnotes%5C..%5C..%5Ca.md",
            "noteriv://open?path=%2F%2Fserver%2Fshare%2Fa.md",
            "noteriv://open?path=%5C%5Cserver%5Cshare%5Ca.md",
            "noteriv://open?path=%2Fhome%2Fme%2Fa%00.md",
            "noteriv:///home/me/../../etc/passwd",
            "noteriv:///home/me/%2e%2e/%2e%2e/etc/passwd",
        ] {
            assert!(parse_url(link).is_err(), "{link}");
        }
        assert!(parse_url("noteriv://new?path=%2Fhome%2Fme%2Fa.md&content=x")
            .unwrap_err()
            .contains("inside a vault"));
    }

    #[test]
    fn new_links() {
        assert_eq!(parse_url("noteriv://new"), Ok(new(None, None, WriteMode::Create)));
        assert_eq!(
            parse_url("noteriv://new?vault=my%20vault&name=my%20note"),
            Ok(Request::New {
                vault: Some("my vault".into()),
                name: Some("my note.md".into()),
                content: None,
                mode: WriteMode::Create,
                silent: false,
            })
        );
        assert_eq!(
            parse_url("noteriv://new?file=path%2Fto%2Fmy%20note&content=Hello%0AWorld+%26+more"),
            Ok(new(Some("path/to/my note.md"), Some("Hello\nWorld & more"), WriteMode::Create))
        );
        // `file` wins over `name`.
        assert_eq!(
            parse_url("noteriv://new?name=Loose&file=Projects%2FPlan.md"),
            Ok(new(Some("Projects/Plan.md"), None, WriteMode::Create))
        );
        assert_eq!(
            parse_url("noteriv://new?file=Inbox&append=true&content=Buy%20milk"),
            Ok(new(Some("Inbox.md"), Some("Buy milk"), WriteMode::Append))
        );
        assert_eq!(
            parse_url("noteriv://new?file=Inbox&prepend&content=First"),
            Ok(new(Some("Inbox.md"), Some("First"), WriteMode::Prepend))
        );
        assert_eq!(
            parse_url("noteriv://new?file=Inbox&append=false&content=x"),
            Ok(new(Some("Inbox.md"), Some("x"), WriteMode::Create))
        );
        assert_eq!(
            parse_url("noteriv://new?name=Quiet&silent=true"),
            Ok(Request::New {
                vault: None,
                name: Some("Quiet.md".into()),
                content: None,
                mode: WriteMode::Create,
                silent: true,
            })
        );
        // A link can only ever name a Markdown note.
        for (name, file) in [("run.sh", "run.sh.md"), ("page.html", "page.html.md"), ("a.MD", "a.MD")] {
            assert_eq!(
                parse_url(&format!("noteriv://new?name={name}")),
                Ok(new(Some(file), None, WriteMode::Create))
            );
        }
        assert!(parse_url("noteriv://new?append=true&content=x").unwrap_err().contains("note's name"));
        assert!(parse_url("noteriv://new?file=Inbox&append=true").unwrap_err().contains("text to add"));
    }

    #[test]
    fn a_link_cannot_overwrite() {
        for link in [
            "noteriv://new?file=Plan&overwrite=true&content=gone",
            "noteriv://new?file=Plan&overwrite&content=gone",
            "noteriv://new?file=Plan&overwrite=1",
            "noteriv://new?file=Plan&append=true&overwrite=true&content=x",
            "noteriv://new?file=Plan&overwrite=false&overwrite=true",
            "noteriv:new?file=Plan&overwrite=yes",
        ] {
            let error = parse_url(link).unwrap_err();
            assert!(error.contains("not allowed"), "{link}: {error}");
        }
        // Written out as off, it is simply not asked for.
        assert_eq!(
            parse_url("noteriv://new?file=Plan&overwrite=false&content=x"),
            Ok(new(Some("Plan.md"), Some("x"), WriteMode::Create))
        );
        // No link at all gives a request to overwrite.
        for link in [
            "noteriv://new?file=Plan&mode=overwrite",
            "noteriv://new?file=Plan&Overwrite=true",
            "noteriv://daily?overwrite=true",
        ] {
            let request = parse_url(link).unwrap();
            assert!(!format!("{request:?}").contains("Overwrite"), "{link}");
        }
    }

    #[test]
    fn daily_unique_and_search_links() {
        assert_eq!(parse_url("noteriv://daily"), Ok(Request::Daily { vault: None }));
        assert_eq!(
            parse_url("noteriv://daily?vault=my%20vault"),
            Ok(Request::Daily { vault: Some("my vault".into()) })
        );
        assert_eq!(parse_url("noteriv://unique"), Ok(Request::Unique { vault: None, content: None }));
        assert_eq!(
            parse_url("noteriv://unique?vault=Work&content=Hello%20World"),
            Ok(Request::Unique { vault: Some("Work".into()), content: Some("Hello World".into()) })
        );
        assert_eq!(
            parse_url("noteriv://search?vault=Work&query=tag%3A%23work%20meeting"),
            Ok(Request::Search { vault: Some("Work".into()), query: "tag:#work meeting".into() })
        );
        assert_eq!(
            parse_url("noteriv://search?vault=Work"),
            Ok(Request::Search { vault: Some("Work".into()), query: String::new() })
        );
    }

    #[test]
    fn a_link_cannot_name_a_file_outside_the_vault() {
        let outside = [
            "..",
            "../secret",
            "a/../../secret",
            "a/..",
            "/etc/passwd",
            "//server/share/a",
            "C:\\Windows\\win.ini",
            "C:/Windows/win.ini",
            "c:",
            "..\\..\\secret",
            "a\\..\\..\\secret",
            "\\Windows\\win.ini",
            "\\\\server\\share\\a",
            "~/secret",
            "a//b",
            "a/./b",
            "a/",
            ".obsidian/app.json",
            ".noteriv/plugins/evil/main.js",
            "Projects/.hidden",
            ".git/hooks/pre-commit",
            "a\0b",
            "a\nb",
        ];
        for bad in outside {
            let encoded = urlencoding::encode(bad);
            for link in [
                format!("noteriv://open?file={encoded}"),
                format!("noteriv://new?file={encoded}&content=x"),
                format!("noteriv://new?name={encoded}&content=x"),
                format!("noteriv://new?file={encoded}&append=true&content=x"),
            ] {
                assert!(parse_url(&link).is_err(), "{bad:?} was let through by {link}");
            }
        }
        // Encoded so that it only shows once decoded, in any capitals.
        for link in [
            "noteriv://open?file=%2e%2e%2fsecret",
            "noteriv://open?file=%2E%2E%2Fsecret",
            "noteriv://open?file=..%2Fsecret",
            "noteriv://open?file=..%5C..%5Csecret",
            "noteriv://open?file=a%2F..%2F..%2Fsecret",
            "noteriv://open?file=%2Fetc%2Fpasswd",
            "noteriv://open?file=%00",
            "noteriv://new?name=%2e%2e%2f%2e%2e%2f.bashrc&content=x",
            "noteriv://new?name=..%2F..%2F.ssh%2Fauthorized_keys&append&content=x",
        ] {
            assert!(parse_url(link).is_err(), "{link}");
        }
        // The same in the path of the shorthand.
        for link in [
            "noteriv://vault/Work/../secret",
            "noteriv://vault/Work/a/../../secret",
            "noteriv://vault/Work/%2e%2e/secret",
            "noteriv://vault/Work/..%2Fsecret",
            "noteriv://vault/Work/..%5Csecret",
            "noteriv://vault/Work/%2Fetc%2Fpasswd",
            "noteriv://vault/Work//etc/passwd",
            "noteriv://vault/Work/.obsidian/app.json",
            "noteriv://vault/Work/a%00b",
        ] {
            assert!(parse_url(link).is_err(), "{link}");
        }
        // The error says what is wrong, and shows the name safely.
        let error = parse_url("noteriv://open?file=..%2F..%2Fetc%2Fpasswd").unwrap_err();
        assert!(error.contains("inside the vault") && error.contains("\"../../etc/passwd\""), "{error}");
        let error = parse_url("noteriv://open?file=%2Fetc%2Fpasswd").unwrap_err();
        assert!(error.contains("not a full path"), "{error}");
        let error = parse_url("noteriv://new?name=.noteriv%2Fplugins%2Fx%2Fmain.js").unwrap_err();
        assert!(error.contains("hidden"), "{error}");
    }

    #[test]
    fn names_that_are_only_dangerous_on_windows_are_refused_there() {
        for name in ["note.md:stream", "CON", "nul.md", "Folder/COM1.txt", "LPT9", "aux .md", "a?b", "a*b", "trailing.", "a/b /c"] {
            assert!(vault_relative_on("It", name, true).is_err(), "{name}");
        }
        // Spaces around the whole name are dropped, so they are no trouble.
        assert_eq!(vault_relative_on("It", " Note ", true).as_deref(), Ok("Note"));
        for name in ["Q: why?", "Meeting 2.5", "console", "com10", "a.b.c", "What is this?"] {
            assert_eq!(vault_relative_on("It", name, false).as_deref(), Ok(name), "{name}");
        }
        for name in ["console", "com10", "com0", "Meeting 2.5", "a.b.c"] {
            assert_eq!(vault_relative_on("It", name, true).as_deref(), Ok(name), "{name}");
        }
        // A drive letter is refused everywhere.
        for name in ["C:\\x", "C:/x", "c:", "Z:\\"] {
            assert!(vault_relative_on("It", name, false).is_err(), "{name}");
        }
    }

    #[test]
    fn a_link_cannot_carry_more_text_than_the_cap() {
        let fits = "a".repeat(MAX_LINK_CONTENT);
        match parse_url(&format!("noteriv://new?name=Big&content={fits}")) {
            Ok(Request::New { content: Some(content), .. }) => assert_eq!(content.len(), MAX_LINK_CONTENT),
            other => panic!("{other:?}"),
        }
        let over = "a".repeat(MAX_LINK_CONTENT + 1);
        for link in [
            format!("noteriv://new?name=Big&content={over}"),
            format!("noteriv://new?name=Big&append=true&content={over}"),
            format!("noteriv://unique?content={over}"),
        ] {
            assert!(parse_url(&link).unwrap_err().contains("more text"), "{}", &link[..40]);
        }
        // Counted once decoded: three bytes to a character here.
        let wide = "%E6%97%A5".repeat(MAX_LINK_CONTENT / 3 + 1);
        assert!(parse_url(&format!("noteriv://new?name=Big&content={wide}")).is_err());
        // And a link far beyond that is not read at all.
        let huge = "a".repeat(MAX_LINK_BYTES);
        assert!(parse_url(&format!("noteriv://search?query={huge}")).unwrap_err().contains("too long"));
        assert!(parse_url(&format!("noteriv://open?vault={}", "v".repeat(5000))).is_err());
        assert!(parse_url(&format!("noteriv://search?query={}", "q".repeat(5000))).is_err());
        assert!(parse_url("noteriv://new?name=a&content=a%00b").is_err());
    }

    #[test]
    fn links_that_are_not_understood_are_errors() {
        for link in [
            "noteriv://delete?file=Plan",
            "noteriv://choose-vault",
            "noteriv://hook-get-address",
            "noteriv://run?command=rm",
            "noteriv://open/extra?file=a",
            "noteriv://new/x/y",
            "noteriv:/open?file=a",
            "noteriv://op%65n%2Fx",
            "obsidian://open?file=a",
            "https://noteriv.com/open?file=a",
            "open?file=a",
            "",
        ] {
            assert!(parse_url(link).is_err(), "{link}");
        }
        assert!(parse_url("noteriv://delete?file=Plan").unwrap_err().contains("\"delete\""));
        assert!(parse_url("noteriv://vault/Work/%FF").is_err());
        // An action may be written encoded; it is still the same action.
        assert_eq!(parse_url("noteriv://op%65n?file=a"), Ok(open(None, Some("a"))));
    }

    #[test]
    fn only_requests_that_change_notes_say_they_write() {
        let writes = |link: &str| parse_url(link).unwrap().writes();
        assert!(!writes("noteriv://open?file=a"));
        assert!(!writes("noteriv://vault/Work/a"));
        assert!(!writes("noteriv://search?query=a"));
        assert!(writes("noteriv://new"));
        assert!(writes("noteriv://new?name=a&content=x"));
        assert!(writes("noteriv://new?name=a&append&content=x"));
        assert!(writes("noteriv://unique"));
        assert!(writes("noteriv://daily"));
        assert!(request(&["new", "a", "--overwrite"]).writes());
        assert!(!request(&["open", "a"]).writes());
    }

    #[test]
    fn a_request_is_sent_to_the_window_in_one_shape() {
        let shape = |request: Request| serde_json::to_value(request).unwrap();
        assert_eq!(
            shape(parse_url("noteriv://open?vault=Work&file=Projects%2FAlpha%23Tasks&line=3").unwrap()),
            json!({"action": "open", "vault": "Work", "file": "Projects/Alpha", "path": null, "line": 3, "heading": "Tasks"})
        );
        assert_eq!(
            shape(parse_url("noteriv://new?name=Idea&content=Hello&append=true").unwrap()),
            json!({"action": "new", "vault": null, "name": "Idea.md", "content": "Hello", "mode": "append", "silent": false})
        );
        assert_eq!(
            shape(request(&["new", "Idea", "--overwrite", "--silent"])),
            json!({"action": "new", "vault": null, "name": "Idea.md", "content": null, "mode": "overwrite", "silent": true})
        );
        assert_eq!(shape(request(&["daily", "--vault", "Work"])), json!({"action": "daily", "vault": "Work"}));
        assert_eq!(
            shape(request(&["unique", "--content", "Hello"])),
            json!({"action": "unique", "vault": null, "content": "Hello"})
        );
        assert_eq!(
            shape(request(&["search", "meeting", "--open", "--vault", "Work"])),
            json!({"action": "search", "vault": "Work", "query": "meeting"})
        );
        for (mode, text) in [(WriteMode::Create, "create"), (WriteMode::Prepend, "prepend")] {
            assert_eq!(serde_json::to_value(mode).unwrap(), json!(text));
        }
    }

    // ---------- commands that need no window ----------

    struct Ran {
        code: i32,
        out: String,
        err: String,
    }

    /// Two vaults, "Work" (open in the app) and "Personal".
    struct Vaults {
        dir: Scratch,
        list: Vec<VaultRef>,
    }

    impl Vaults {
        fn new(name: &str) -> Vaults {
            let dir = Scratch::new(name);
            dir.write("work/Inbox.md", "# Inbox\n\nCall the baker. #todo\n");
            dir.write(
                "work/Projects/Alpha.md",
                "---\ntags: [work, Project/Alpha]\n---\n# Alpha\n\nMeeting notes for alpha. #work\n",
            );
            dir.write("work/Projects/Beta.md", "Beta has no meeting. #Work #todo");
            dir.write("work/Projects/photo.png", "png");
            dir.write("work/.obsidian/app.md", "A hidden meeting. #secret\n");
            dir.write("work/.noteriv/state.md", "meeting\n");
            dir.write("work/.git/HEAD.md", "meeting\n");
            dir.write("work/.trash/Old.md", "meeting\n");
            dir.write("personal/Diary.md", "Dear diary.\n");
            let vault = |id: &str, name: &str, folder: &str| VaultRef {
                id: id.into(),
                name: name.into(),
                path: dir.0.join(folder),
            };
            let list = vec![vault("w1", "Work", "work"), vault("p1", "Personal", "personal")];
            Vaults { dir, list }
        }

        fn run(&self, line: &[&str]) -> Ran {
            self.run_with(line, "")
        }

        fn run_with(&self, line: &[&str], stdin: &str) -> Ran {
            run_in(&self.list, Some("w1"), line, stdin)
        }

        /// A command that works: its output.
        fn ok(&self, line: &[&str]) -> String {
            let ran = self.run(line);
            assert_eq!((ran.code, ran.err.as_str()), (0, ""), "{line:?}");
            ran.out
        }

        /// A command that fails: what it says. It prints nothing.
        fn fails(&self, line: &[&str]) -> String {
            let ran = self.run(line);
            assert_eq!((ran.code, ran.out.as_str()), (EXIT_FAILED, ""), "{line:?}: {}", ran.err);
            assert!(ran.err.starts_with("noteriv: ") && ran.err.ends_with('\n'), "{}", ran.err);
            ran.err
        }
    }

    fn run_in(vaults: &[VaultRef], active: Option<&str>, line: &[&str], stdin: &str) -> Ran {
        let command = command(line);
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = run(&command, vaults, active, &mut stdin.as_bytes(), &mut out, &mut err);
        Ran {
            code,
            out: String::from_utf8(out).unwrap(),
            err: String::from_utf8(err).unwrap(),
        }
    }

    #[test]
    fn vaults_lists_them_and_marks_the_open_one() {
        let vaults = Vaults::new("vaults");
        let work = vaults.dir.0.join("work").to_string_lossy().into_owned();
        let personal = vaults.dir.0.join("personal").to_string_lossy().into_owned();
        assert_eq!(vaults.ok(&["vaults"]), format!("* Work\t{work}\n  Personal\t{personal}\n"));
        let listed: Value = serde_json::from_str(&vaults.ok(&["vaults", "--json"])).unwrap();
        assert_eq!(
            listed,
            json!([
                {"id": "w1", "name": "Work", "path": work, "active": true},
                {"id": "p1", "name": "Personal", "path": personal, "active": false},
            ])
        );
        // It needs no vault to be open, or to exist.
        let ran = run_in(&vaults.list, None, &["vaults"], "");
        assert_eq!((ran.code, ran.out), (0, format!("  Work\t{work}\n  Personal\t{personal}\n")));
        let ran = run_in(&[], None, &["vaults", "--json"], "");
        assert_eq!((ran.code, ran.out.as_str()), (0, "[]\n"));
    }

    #[test]
    fn list_prints_the_notes_and_leaves_hidden_folders_out() {
        let vaults = Vaults::new("list");
        assert_eq!(vaults.ok(&["list"]), "Inbox.md\nProjects/Alpha.md\nProjects/Beta.md\n");
        assert_eq!(vaults.ok(&["list", "Projects"]), "Projects/Alpha.md\nProjects/Beta.md\n");
        assert_eq!(vaults.ok(&["list", "projects/"]), "Projects/Alpha.md\nProjects/Beta.md\n");
        let listed: Value = serde_json::from_str(&vaults.ok(&["list", "--json"])).unwrap();
        assert_eq!(listed, json!(["Inbox.md", "Projects/Alpha.md", "Projects/Beta.md"]));
        assert_eq!(vaults.ok(&["list", "--vault", "Personal"]), "Diary.md\n");

        // A folder with no notes in it lists nothing; one that is not there fails.
        fs::create_dir_all(vaults.dir.0.join("work/Empty")).unwrap();
        assert_eq!(vaults.ok(&["list", "Empty"]), "");
        assert_eq!(vaults.ok(&["list", "Empty", "--json"]), "[]\n");
        assert!(vaults.fails(&["list", "Nowhere"]).contains("no folder \"Nowhere\""));
        assert!(vaults.fails(&["list", ".obsidian"]).contains("hidden"));
        assert!(vaults.fails(&["list", "../personal"]).contains("inside the vault"));
        assert!(vaults.fails(&["list", "/"]).contains("empty"));
    }

    #[test]
    fn read_finds_a_note_as_a_link_would() {
        let vaults = Vaults::new("read");
        let alpha = vaults.dir.read("work/Projects/Alpha.md");
        for note in ["Alpha", "alpha", "ALPHA.md", "Projects/Alpha", "projects/alpha.md", "Projects\\Alpha"] {
            assert_eq!(vaults.ok(&["read", note]), alpha, "{note}");
        }
        // Exactly the note's text: nothing added to one with no last newline.
        assert_eq!(vaults.ok(&["read", "Beta"]), "Beta has no meeting. #Work #todo");
        assert_eq!(vaults.ok(&["read", "Diary", "--vault", "personal"]), "Dear diary.\n");

        assert!(vaults.fails(&["read", "Gamma"]).contains("no note \"Gamma\""));
        // A path is the whole path, and only a note is read.
        assert!(vaults.fails(&["read", "Elsewhere/Alpha"]).contains("no note"));
        assert!(vaults.fails(&["read", "Projects/photo.png"]).contains("no note"));
        for outside in ["../personal/Diary", "../../etc/passwd", "/etc/passwd", ".obsidian/app", "app", "Old"] {
            assert!(vaults.fails(&["read", outside]).contains("no note"), "{outside}");
        }
    }

    #[test]
    fn search_prints_each_matching_line() {
        let vaults = Vaults::new("search");
        assert_eq!(
            vaults.ok(&["search", "meeting"]),
            "Projects/Alpha.md:6: Meeting notes for alpha. #work\nProjects/Beta.md:1: Beta has no meeting. #Work #todo\n"
        );
        // Found by a tag, there is no line to show: the path alone.
        assert_eq!(vaults.ok(&["search", "tag:#todo"]), "Inbox.md\nProjects/Beta.md\n");
        assert_eq!(vaults.ok(&["search", "file:inbox"]), "Inbox.md\n");
        assert_eq!(vaults.ok(&["search", "--", "-meeting"]), "Inbox.md\n");
        assert_eq!(vaults.ok(&["search", "dear", "--vault", "p1"]), "Diary.md:1: Dear diary.\n");
        // Nothing found is not a failure.
        assert_eq!(vaults.ok(&["search", "unicorn"]), "");

        assert!(vaults.fails(&["search", "\"unclosed"]).contains("quote is not closed"));
        assert!(vaults.fails(&["search", "/(/"]).contains("regular expression"));
    }

    #[test]
    fn search_can_be_limited_and_printed_as_json() {
        let vaults = Vaults::new("search-json");
        let ran = vaults.run(&["search", "meeting", "--limit", "1"]);
        assert_eq!(ran.code, 0);
        assert_eq!(ran.out, "Projects/Alpha.md:6: Meeting notes for alpha. #work\n");
        assert_eq!(ran.err, "noteriv: 2 notes match; the first 1 are shown.\n");

        let found: Value = serde_json::from_str(&vaults.ok(&["search", "meeting", "--json"])).unwrap();
        assert_eq!(found["totalFiles"], 2);
        assert_eq!(found["error"], Value::Null);
        let files = found["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0]["relativePath"], "Projects/Alpha.md");
        assert_eq!(files[0]["name"], "Alpha.md");
        assert_eq!(
            files[0]["lines"],
            json!([{"line": 6, "text": "Meeting notes for alpha. #work", "ranges": [[0, 7]]}])
        );
        assert_eq!(files[1]["relativePath"], "Projects/Beta.md");

        let found: Value =
            serde_json::from_str(&vaults.ok(&["search", "meeting", "--json", "--limit=1"])).unwrap();
        assert_eq!(found["files"].as_array().unwrap().len(), 1);
        assert_eq!(found["totalFiles"], 2);
        let found: Value = serde_json::from_str(&vaults.ok(&["search", "unicorn", "--json"])).unwrap();
        assert_eq!(found, json!({"files": [], "totalFiles": 0, "error": null}));
    }

    #[test]
    fn tags_counts_the_notes_that_use_each_tag() {
        let vaults = Vaults::new("tags");
        // Properties and text both count, once a note, in any capitals.
        assert_eq!(vaults.ok(&["tags"]), "Project/Alpha\t1\ntodo\t2\nwork\t2\n");
        let listed: Value = serde_json::from_str(&vaults.ok(&["tags", "--json"])).unwrap();
        assert_eq!(
            listed,
            json!([
                {"tag": "Project/Alpha", "count": 1},
                {"tag": "todo", "count": 2},
                {"tag": "work", "count": 2},
            ])
        );
        assert_eq!(vaults.ok(&["tags", "--vault", "Personal"]), "");
        assert_eq!(vaults.ok(&["tags", "--vault", "Personal", "--json"]), "[]\n");
    }

    #[test]
    fn create_makes_a_note_and_its_folders() {
        let vaults = Vaults::new("create");
        assert_eq!(vaults.ok(&["create", "Idea", "--content", "# Idea\n"]), "Idea.md\n");
        assert_eq!(vaults.dir.read("work/Idea.md"), "# Idea\n");
        assert_eq!(vaults.ok(&["create", "Empty"]), "Empty.md\n");
        assert_eq!(vaults.dir.read("work/Empty.md"), "");
        // Folders in the name are created.
        assert_eq!(vaults.ok(&["create", "Areas/Home/Garden.md", "--content", "Roses"]), "Areas/Home/Garden.md\n");
        assert_eq!(vaults.dir.read("work/Areas/Home/Garden.md"), "Roses");
        assert_eq!(vaults.ok(&["create", "Projects\\Gamma", "--content", "g"]), "Projects/Gamma.md\n");
        assert_eq!(vaults.dir.read("work/Projects/Gamma.md"), "g");
        // Always a Markdown note.
        assert_eq!(vaults.ok(&["create", "Meeting 2.5"]), "Meeting 2.5.md\n");
        assert_eq!(vaults.ok(&["create", "Old.markdown"]), "Old.markdown\n");
        // From standard input, into another vault.
        let ran = vaults.run_with(&["create", "Piped", "--stdin", "--vault", "Personal"], "line one\nline two\n");
        assert_eq!((ran.code, ran.out.as_str(), ran.err.as_str()), (0, "Piped.md\n", ""));
        assert_eq!(vaults.dir.read("personal/Piped.md"), "line one\nline two\n");
        // It is there for the other commands.
        assert_eq!(vaults.ok(&["read", "garden"]), "Roses");
        // Nothing is left behind beside the notes.
        assert_eq!(vaults.dir.names("work/Areas/Home"), ["Garden.md"]);
        assert_eq!(vaults.dir.names("personal"), ["Diary.md", "Piped.md"]);
    }

    #[test]
    fn create_leaves_an_existing_note_alone_unless_told_to_overwrite() {
        let vaults = Vaults::new("create-existing");
        let before = vaults.dir.read("work/Inbox.md");
        assert!(vaults.fails(&["create", "Inbox", "--content", "gone"]).contains("already exists"));
        assert!(vaults.fails(&["create", "Inbox.md"]).contains("--overwrite"));
        assert_eq!(vaults.dir.read("work/Inbox.md"), before);
        // A name that differs only in capitals is the same note to the app.
        assert!(vaults.fails(&["create", "inbox", "--content", "gone"]).contains("only in capitals"));
        assert!(vaults.fails(&["create", "projects/ALPHA", "--overwrite"]).contains("only in capitals"));
        assert_eq!(vaults.dir.names("work"), [".git", ".noteriv", ".obsidian", ".trash", "Inbox.md", "Projects"]);
        assert_eq!(vaults.dir.names("work/Projects"), ["Alpha.md", "Beta.md", "photo.png"]);
        assert_eq!(vaults.dir.read("work/Inbox.md"), before);
        // A folder is not a note, and a note is not a folder.
        fs::create_dir_all(vaults.dir.0.join("work/Folder.md")).unwrap();
        assert!(vaults.fails(&["create", "Folder", "--overwrite"]).contains("is a folder"));
        assert!(vaults.fails(&["create", "Inbox.md/Sub"]).contains("is a file"));

        assert_eq!(vaults.ok(&["create", "Inbox", "--overwrite", "--content", "New text\n"]), "Inbox.md\n");
        assert_eq!(vaults.dir.read("work/Inbox.md"), "New text\n");
    }

    #[cfg(unix)]
    #[test]
    fn overwrite_and_append_keep_a_notes_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let vaults = Vaults::new("permissions");
        let note = vaults.dir.0.join("work/Inbox.md");
        fs::set_permissions(&note, fs::Permissions::from_mode(0o640)).unwrap();
        vaults.ok(&["create", "Inbox", "--overwrite", "--content", "a"]);
        assert_eq!(fs::metadata(&note).unwrap().permissions().mode() & 0o777, 0o640);
        vaults.ok(&["append", "Inbox", "--content", "b"]);
        assert_eq!(fs::metadata(&note).unwrap().permissions().mode() & 0o777, 0o640);
        assert_eq!(vaults.dir.read("work/Inbox.md"), "a\nb");
    }

    #[test]
    fn create_refuses_a_name_that_leaves_the_vault() {
        let vaults = Vaults::new("create-outside");
        for name in [
            "../Escaped",
            "../personal/Escaped",
            "Projects/../../Escaped",
            "..\\Escaped",
            "/tmp/noteriv-cli-escaped",
            "C:\\Escaped",
            "~/Escaped",
            ".obsidian/Escaped",
            ".noteriv/plugins/x/main.js",
            "Projects/.hidden",
            "a//b",
            "",
        ] {
            let error = vaults.fails(&["create", "--content", "x", "--overwrite", "--", name]);
            assert!(error.contains("The note name"), "{name:?}: {error}");
        }
        assert!(!vaults.dir.has("Escaped.md"));
        assert!(!vaults.dir.has("personal/Escaped.md"));
        assert!(!vaults.dir.has("work/.obsidian/Escaped.md"));
        assert!(!vaults.dir.has("work/.noteriv/plugins"));
        assert!(!Path::new("/tmp/noteriv-cli-escaped.md").exists());
        assert!(!vaults.dir.has("work/a"));
    }

    #[cfg(unix)]
    #[test]
    fn nothing_is_read_or_written_through_a_symbolic_link() {
        use std::os::unix::fs::symlink;
        let vaults = Vaults::new("symlinks");
        let outside = Scratch::new("symlinks-outside");
        outside.write("Secret.md", "secret\n");
        let work = vaults.dir.0.join("work");
        // A folder that is really outside the vault, a note that is really a
        // file outside it, a link to nothing yet, and a link that stays inside.
        symlink(&outside.0, work.join("Linked")).unwrap();
        symlink(outside.0.join("Secret.md"), work.join("Leak.md")).unwrap();
        symlink(outside.0.join("Made.md"), work.join("Dangling.md")).unwrap();
        symlink(work.join("Projects"), work.join("Shortcut")).unwrap();

        for line in [
            &["create", "Linked/Note", "--content", "x"][..],
            &["create", "Linked/Deep/Note", "--content", "x"],
            &["create", "Linked/Secret", "--overwrite", "--content", "x"],
            &["create", "Leak", "--overwrite", "--content", "x"],
            &["create", "Dangling", "--content", "x"],
            &["create", "Dangling", "--overwrite", "--content", "x"],
            &["create", "Shortcut/Note", "--content", "x"],
        ] {
            assert!(vaults.fails(line).contains("symbolic link"), "{line:?}");
        }
        assert!(vaults.fails(&["create", "Leak", "--content", "x"]).contains("symbolic link"));
        // Notes behind a link are not notes of the vault, as in the app.
        for line in [
            &["read", "Leak"][..],
            &["read", "Secret"],
            &["read", "Linked/Secret"],
            &["append", "Leak", "--content", "x"],
            &["append", "Linked/Secret", "--content", "x"],
        ] {
            assert!(vaults.fails(line).contains("no note"), "{line:?}");
        }
        assert_eq!(vaults.ok(&["list"]), "Inbox.md\nProjects/Alpha.md\nProjects/Beta.md\n");
        assert_eq!(vaults.ok(&["search", "secret"]), "");

        // Outside is exactly as it was.
        assert_eq!(outside.names(""), ["Secret.md"]);
        assert_eq!(outside.read("Secret.md"), "secret\n");
        assert!(!vaults.dir.has("work/Projects/Note.md"));

        // The checks themselves, past the listing that hides links from them.
        assert!(inside(&work, "Leak.md").unwrap_err().contains("outside the vault"));
        assert!(inside(&work, "Linked/Secret.md").unwrap_err().contains("outside the vault"));
        assert!(append(&work, "Leak.md", "x").unwrap_err().contains("symbolic link"));
        assert_eq!(outside.read("Secret.md"), "secret\n");

        // A vault whose own folder is reached through a link still works.
        symlink(&work, vaults.dir.0.join("alias")).unwrap();
        let aliased = vec![VaultRef { id: "a1".into(), name: "Alias".into(), path: vaults.dir.0.join("alias") }];
        let ran = run_in(&aliased, Some("a1"), &["create", "Through", "--content", "ok"], "");
        assert_eq!((ran.code, ran.out.as_str()), (0, "Through.md\n"));
        assert_eq!(vaults.dir.read("work/Through.md"), "ok");
    }

    #[test]
    fn append_adds_text_on_a_line_of_its_own() {
        let vaults = Vaults::new("append");
        // The note ends without a newline: one is put between.
        assert_eq!(vaults.ok(&["append", "beta", "--content", "- [ ] reply"]), "Projects/Beta.md\n");
        assert_eq!(vaults.dir.read("work/Projects/Beta.md"), "Beta has no meeting. #Work #todo\n- [ ] reply");
        // It ends with one: nothing is added.
        assert_eq!(vaults.ok(&["append", "Inbox", "--content", "More.\n"]), "Inbox.md\n");
        assert_eq!(vaults.dir.read("work/Inbox.md"), "# Inbox\n\nCall the baker. #todo\nMore.\n");
        // An empty note gets just the text.
        vaults.dir.write("work/Blank.md", "");
        vaults.ok(&["append", "Blank", "--content", "first"]);
        assert_eq!(vaults.dir.read("work/Blank.md"), "first");
        // From standard input, by path, into another vault.
        let ran = vaults.run_with(&["append", "Diary.md", "--stdin", "--vault", "Personal"], "Today.\n");
        assert_eq!((ran.code, ran.out.as_str(), ran.err.as_str()), (0, "Diary.md\n", ""));
        assert_eq!(vaults.dir.read("personal/Diary.md"), "Dear diary.\nToday.\n");

        // It adds to a note that is there; it does not make one.
        assert!(vaults.fails(&["append", "Gamma", "--content", "x"]).contains("no note \"Gamma\""));
        assert!(!vaults.dir.has("work/Gamma.md"));
        assert!(vaults.fails(&["append", "../personal/Diary", "--content", "x"]).contains("no note"));
        assert!(vaults.fails(&["append", "Inbox", "--content", ""]).contains("no text"));
        let ran = vaults.run_with(&["append", "Inbox", "--stdin"], "");
        assert_eq!(ran.code, EXIT_FAILED);
        assert_eq!(vaults.dir.read("work/Inbox.md"), "# Inbox\n\nCall the baker. #todo\nMore.\n");
    }

    #[test]
    fn standard_input_has_to_be_text() {
        let vaults = Vaults::new("stdin");
        let command = command(&["create", "Binary", "--stdin"]);
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = run(&command, &vaults.list, Some("w1"), &mut &[0xff, 0xfe, 0x00][..], &mut out, &mut err);
        assert_eq!(code, EXIT_FAILED);
        assert!(String::from_utf8(err).unwrap().contains("not UTF-8"));
        assert!(!vaults.dir.has("work/Binary.md"));
    }

    #[test]
    fn a_vault_is_chosen_by_name_id_or_folder() {
        let vaults = Vaults::new("choose");
        let personal = vaults.dir.0.join("personal").to_string_lossy().into_owned();
        // With none named, the one open in the app.
        assert_eq!(vaults.ok(&["list"]).lines().next(), Some("Inbox.md"));
        for vault in ["Personal", "personal", "PERSONAL", "p1", personal.as_str()] {
            assert_eq!(vaults.ok(&["list", "--vault", vault]), "Diary.md\n", "{vault}");
        }
        assert_eq!(vaults.ok(&["--vault", "Personal", "list"]), "Diary.md\n");

        let error = vaults.fails(&["list", "--vault", "Nope"]);
        assert!(error.contains("no vault \"Nope\"") && error.contains("Work, Personal"), "{error}");
        // A folder that is not a vault is not made one by being named.
        let stray = vaults.dir.0.to_string_lossy().into_owned();
        assert!(vaults.fails(&["list", "--vault", &stray]).contains("no vault"));

        // No vault is open, and none is named.
        let ran = run_in(&vaults.list, None, &["list"], "");
        assert_eq!(ran.code, EXIT_FAILED);
        assert!(ran.err.contains("--vault"), "{}", ran.err);
        let ran = run_in(&vaults.list, Some("gone"), &["list"], "");
        assert_eq!(ran.code, EXIT_FAILED);
        let ran = run_in(&[], None, &["list"], "");
        assert!(ran.err.contains("no vaults yet"), "{}", ran.err);

        // The vault's folder has gone.
        let mut moved = vaults.list.clone();
        moved[1].path = vaults.dir.0.join("not-there");
        let ran = run_in(&moved, Some("w1"), &["list", "--vault", "Personal"], "");
        assert_eq!(ran.code, EXIT_FAILED);
        assert!(ran.err.contains("is not there"), "{}", ran.err);
    }

    #[test]
    fn a_name_two_vaults_share_is_an_error_that_lists_them() {
        let vaults = Vaults::new("ambiguous");
        let mut list = vaults.list.clone();
        list.push(VaultRef { id: "w2".into(), name: "WORK".into(), path: vaults.dir.0.join("personal") });
        let ran = run_in(&list, Some("p1"), &["list", "--vault", "work"], "");
        assert_eq!((ran.code, ran.out.as_str()), (EXIT_FAILED, ""));
        assert!(ran.err.contains("More than one vault is named \"work\""), "{}", ran.err);
        for part in ["Work  (id w1)", "WORK  (id w2)", "work", "personal"] {
            assert!(ran.err.contains(part), "{part} is not in {}", ran.err);
        }
        // Its id or its folder still picks one.
        let ran = run_in(&list, Some("p1"), &["list", "--vault", "w2"], "");
        assert_eq!((ran.code, ran.out.as_str()), (0, "Diary.md\n"));
        let work = vaults.dir.0.join("work").to_string_lossy().into_owned();
        let ran = run_in(&list, Some("p1"), &["list", "--vault", &work], "");
        assert_eq!(ran.out.lines().next(), Some("Inbox.md"));
        // An id is matched before a name.
        list.push(VaultRef { id: "x9".into(), name: "w1".into(), path: vaults.dir.0.join("personal") });
        assert_eq!(find_vault(&list, None, Some("w1")).unwrap().name, "Work");
    }

    #[test]
    fn a_file_is_located_in_the_vault_that_holds_it() {
        let vaults = Vaults::new("locate");
        vaults.dir.write("work/Inner/Deep/Note.md", "x");
        let mut list = vaults.list.clone();
        list.push(VaultRef { id: "i1".into(), name: "Inner".into(), path: vaults.dir.0.join("work/Inner") });
        let found = |rel: &str| {
            locate(&vaults.dir.0.join(rel), &list).map(|(vault, inside)| (vault.id.clone(), inside))
        };
        assert_eq!(found("work/Projects/Alpha.md"), Some(("w1".into(), "Projects/Alpha.md".into())));
        assert_eq!(found("personal/Diary.md"), Some(("p1".into(), "Diary.md".into())));
        assert_eq!(found("work/Projects/../Inbox.md"), Some(("w1".into(), "Inbox.md".into())));
        // The innermost vault answers.
        assert_eq!(found("work/Inner/Deep/Note.md"), Some(("i1".into(), "Deep/Note.md".into())));
        assert_eq!(found("work"), Some(("w1".into(), String::new())));

        vaults.dir.write("stray.md", "x");
        assert_eq!(found("stray.md"), None);
        assert_eq!(found("work/Missing.md"), None);
        assert_eq!(found("work/.obsidian/app.md"), None);
        assert_eq!(locate(Path::new("/etc/passwd"), &list), None);

        #[cfg(unix)]
        {
            let outside = Scratch::new("locate-outside");
            outside.write("Secret.md", "x");
            std::os::unix::fs::symlink(&outside.0, vaults.dir.0.join("work/Linked")).unwrap();
            assert_eq!(found("work/Linked/Secret.md"), None);
        }
    }
}
