// Where an import writes: one folder inside the vault.
//
// Everything every importer creates goes through `Output`, so the rules are
// kept in one place:
//
// - Nothing that exists is overwritten or changed. Files are created with
//   `create_new`, so the system refuses a name that is taken even if this
//   code got it wrong.
// - A note's name is unique among the notes of the whole vault, and an
//   attachment's among its other files, compared without case. The app finds
//   `[[Note]]` and `![[photo.png]]` by name anywhere in the vault, so a name
//   that is only unique in its folder could open the wrong file. A taken
//   name becomes "Name 2", "Name 3" and so on.
// - Names are valid on Windows, macOS and Linux, and safe inside `[[...]]`.
// - Frontmatter keeps every property on one line with lists in `[a, b]`
//   form, because the app reads frontmatter line by line.

use super::markdown::table_safe;
use super::{Report, Skipped};
use chrono::{DateTime, SecondsFormat, TimeZone, Utc};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// A name is cut to whichever of these comes first. The byte limit keeps a
/// name in a script that takes three bytes a letter under the 255 bytes most
/// file systems allow, with room left for " 12" and an extension.
const MAX_NAME_CHARS: usize = 120;
const MAX_NAME_BYTES: usize = 180;

/// Attachments go in this folder under the destination folder.
const ATTACHMENTS: &str = "attachments";

// ============================================================
// Names
// ============================================================

/// A title as a file or folder name that is valid on every system and can be
/// written inside `[[...]]`. Never empty.
pub(crate) fn clean_name(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut kept = String::with_capacity(raw.len());
    for (i, c) in chars.iter().enumerate() {
        match c {
            // These separate two things, so a dash keeps them apart:
            // "2021/01/31" reads better as "2021-01-31" than "20210131".
            '/' | '\\' | '|' => kept.push('-'),
            // "Meeting: plan" loses the colon, "10:30" keeps its two halves.
            ':' => {
                let ends_a_word = chars.get(i + 1).map_or(true, |next| next.is_whitespace());
                if !ends_a_word {
                    kept.push('-');
                }
            }
            // Not allowed in a Windows file name, or read as link syntax
            // inside `[[...]]` (and "#" would turn the rest into a tag).
            '*' | '?' | '"' | '<' | '>' | '[' | ']' | '#' | '^' => {}
            c if c.is_control() => kept.push(' '),
            c => kept.push(*c),
        }
    }
    let collapsed = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    // A leading dot hides the file from the app; Windows drops a trailing
    // dot or space.
    let trimmed = collapsed
        .trim_start_matches(['.', ' ', '-'])
        .trim_end_matches(['.', ' ']);
    let mut name = truncate(trimmed).trim_end_matches(['.', ' ']).to_string();
    if name.is_empty() {
        return "Untitled".to_string();
    }
    if is_windows_device(&name) {
        name.insert(0, '_');
    }
    name
}

/// As `clean_name`, for a file that keeps its extension.
pub(crate) fn clean_file_name(raw: &str) -> String {
    let (stem, ext) = split_extension(raw);
    let stem = clean_name(stem);
    match ext {
        Some(ext) => format!("{stem}.{ext}"),
        None => stem,
    }
}

/// "photo.final.PNG" is ("photo.final", Some("PNG")). Only a short run of
/// letters and digits counts as an extension, so "v1.2 notes" has none.
pub(crate) fn split_extension(name: &str) -> (&str, Option<&str>) {
    match name.rsplit_once('.') {
        Some((stem, ext))
            if !stem.is_empty()
                && !ext.is_empty()
                && ext.len() <= 10
                && ext.chars().all(|c| c.is_ascii_alphanumeric()) =>
        {
            (stem, Some(ext))
        }
        _ => (name, None),
    }
}

fn truncate(name: &str) -> &str {
    let mut end = 0;
    for (count, (i, c)) in name.char_indices().enumerate() {
        if count >= MAX_NAME_CHARS || i + c.len_utf8() > MAX_NAME_BYTES {
            break;
        }
        end = i + c.len_utf8();
    }
    &name[..end]
}

/// Windows refuses these names, with or without an extension.
fn is_windows_device(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
}

/// `base`, or the first of "base 2", "base 3" ... that is not taken.
fn first_free(base: &str, taken: impl Fn(&str) -> bool) -> String {
    next_free(base, &mut 0, taken)
}

/// As `first_free`, going on from the number this base got to the last
/// time (`last`, 0 at first). A table of ten thousand rows that are all
/// "Untitled" is then numbered in ten thousand steps, not fifty million.
fn next_free(base: &str, last: &mut usize, taken: impl Fn(&str) -> bool) -> String {
    loop {
        *last += 1;
        let candidate = if *last == 1 {
            base.to_string()
        } else {
            format!("{base} {last}")
        };
        if !taken(&candidate) {
            return candidate;
        }
    }
}

pub(crate) fn is_note_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// The app draws these as pictures when they are embedded.
pub(crate) fn is_image(name: &str) -> bool {
    let ext = split_extension(name).1.unwrap_or("").to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif"
    )
}

/// The usual extension for a media type, for an attachment that came
/// without a file name.
pub(crate) fn extension_for_mime(mime: &str) -> &'static str {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/avif" => "avif",
        "image/heic" => "heic",
        "image/tiff" => "tiff",
        "application/pdf" => "pdf",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/mp4" | "audio/x-m4a" | "audio/m4a" => "m4a",
        "audio/ogg" => "ogg",
        "audio/amr" => "amr",
        "audio/3gpp" => "3gp",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/quicktime" => "mov",
        "text/plain" => "txt",
        "text/html" => "html",
        "text/csv" => "csv",
        "application/json" => "json",
        "application/zip" => "zip",
        "application/msword" => "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
        "application/vnd.ms-excel" => "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        "application/vnd.ms-powerpoint" => "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => "pptx",
        _ => "bin",
    }
}

// ============================================================
// Links
// ============================================================

/// `[[Name]]`, or `[[Name|shown]]` when the text shown differs from the name.
pub(crate) fn wikilink(name: &str, shown: Option<&str>) -> String {
    wikilink_to(name, "", shown)
}

/// As `wikilink`, with a `#Heading` or `#^block` after the name.
pub(crate) fn wikilink_to(name: &str, anchor: &str, shown: Option<&str>) -> String {
    let shown = shown.map(link_text).filter(|text| !text.is_empty());
    match shown {
        Some(text) if anchor.is_empty() && text == name => format!("[[{name}]]"),
        Some(text) => format!("[[{name}{anchor}|{text}]]"),
        None => format!("[[{name}{anchor}]]"),
    }
}

/// An attachment as it is written in a note: drawn if it is a picture,
/// otherwise a link to the file.
pub(crate) fn embed(file_name: &str) -> String {
    if is_image(file_name) {
        format!("![[{file_name}]]")
    } else {
        format!("[[{file_name}]]")
    }
}

/// Text that can stand after the `|` of a link: one line, and nothing that
/// ends the link early.
fn link_text(text: &str) -> String {
    let cleaned: String = text
        .chars()
        .map(|c| match c {
            '[' => '(',
            ']' => ')',
            '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A block id the app accepts after `^`: letters, digits and dashes.
pub(crate) fn block_id(raw: &str) -> String {
    raw.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

// ============================================================
// Dates
// ============================================================

pub(crate) fn iso(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub(crate) fn from_millis(millis: i64) -> Option<DateTime<Utc>> {
    if millis <= 0 {
        return None;
    }
    Utc.timestamp_millis_opt(millis).single()
}

/// An ISO 8601 time with an offset, written "+01:00", "+0100" or "Z".
pub(crate) fn parse_iso(text: &str) -> Option<DateTime<Utc>> {
    let text = text.trim();
    DateTime::parse_from_rfc3339(text)
        .or_else(|_| DateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%z"))
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

// ============================================================
// Frontmatter
// ============================================================

pub(crate) enum Value {
    /// Quoted when YAML would otherwise read it as something else.
    Text(String),
    /// Written as it is: a number, a date or a time.
    Plain(String),
    Bool(bool),
    List(Vec<String>),
}

/// The properties of a note, in the order they are written.
#[derive(Default)]
pub(crate) struct Props(Vec<(String, Value)>);

impl Props {
    fn push(&mut self, key: &str, value: Value) {
        let key = clean_key(key);
        let taken = |candidate: &str| {
            self.0
                .iter()
                .any(|(k, _)| k.eq_ignore_ascii_case(candidate))
        };
        let key = first_free(&key, taken);
        self.0.push((key, value));
    }

    /// A text property. An empty value is left out.
    pub(crate) fn text(&mut self, key: &str, value: &str) {
        if !value.trim().is_empty() {
            self.push(key, Value::Text(value.trim().to_string()));
        }
    }

    /// A value that came out of a table: a number or true/false stays one.
    pub(crate) fn cell(&mut self, key: &str, value: &str) {
        let value = value.trim();
        if value.is_empty() {
            return;
        }
        let lower = value.to_ascii_lowercase();
        if lower == "true" || lower == "false" {
            self.push(key, Value::Bool(lower == "true"));
        } else if is_plain_number(value) {
            self.push(key, Value::Plain(value.to_string()));
        } else {
            self.push(key, Value::Text(value.to_string()));
        }
    }

    /// Written only when true: a note that is not pinned says nothing.
    pub(crate) fn flag(&mut self, key: &str, value: bool) {
        if value {
            self.push(key, Value::Bool(true));
        }
    }

    pub(crate) fn list(&mut self, key: &str, items: Vec<String>) {
        if !items.is_empty() {
            self.push(key, Value::List(items));
        }
    }

    pub(crate) fn date(&mut self, key: &str, time: Option<DateTime<Utc>>) {
        if let Some(time) = time {
            self.push(key, Value::Plain(iso(time)));
        }
    }

    /// Labels or tags from another app as the `tags` list.
    pub(crate) fn tags<S: AsRef<str>>(&mut self, raw: impl IntoIterator<Item = S>) {
        let mut tags: Vec<String> = Vec::new();
        for tag in raw.into_iter().filter_map(|tag| clean_tag(tag.as_ref())) {
            if !tags.iter().any(|seen| seen.eq_ignore_ascii_case(&tag)) {
                tags.push(tag);
            }
        }
        self.list("tags", tags);
    }

    /// The title as it was, when the file name could not keep it whole.
    pub(crate) fn title_if_changed(&mut self, title: &str, slot: &Slot) {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        if !title.is_empty() && title != slot.base {
            self.push("title", Value::Text(title));
        }
    }

    fn render(&self) -> String {
        if self.0.is_empty() {
            return String::new();
        }
        let mut out = String::from("---\n");
        for (key, value) in &self.0 {
            let written = match value {
                Value::Text(text) => yaml_scalar(text, false),
                Value::Plain(text) => text.clone(),
                Value::Bool(value) => value.to_string(),
                Value::List(items) => {
                    let items: Vec<String> =
                        items.iter().map(|item| yaml_scalar(item, true)).collect();
                    format!("[{}]", items.join(", "))
                }
            };
            out.push_str(&format!("{key}: {written}\n"));
        }
        out.push_str("---\n");
        out
    }
}

/// A property name the app's line-by-line reader takes whole: it splits a
/// line at the first colon, so a key cannot hold one.
fn clean_key(raw: &str) -> String {
    let kept: String = raw
        .chars()
        .filter(|c| !c.is_control() && !":#[]{},\"'&*!|>%@`".contains(*c))
        .collect();
    let collapsed = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_start_matches(['-', '?', '.', ' ']);
    if trimmed.is_empty() {
        "property".to_string()
    } else {
        trimmed.to_string()
    }
}

/// A tag as the app reads one: no spaces, nothing that ends a list.
pub(crate) fn clean_tag(raw: &str) -> Option<String> {
    let kept: String = raw
        .trim()
        .trim_start_matches('#')
        .chars()
        .filter(|c| !c.is_control() && !",[]{}\"'#|".contains(*c))
        .collect();
    let tag = kept.split_whitespace().collect::<Vec<_>>().join("-");
    let tag = tag.trim_matches('/').to_string();
    if tag.is_empty() {
        None
    } else {
        Some(tag)
    }
}

/// Digits with an optional sign and fraction. "1e5", "0x1F" and "007" are
/// left as text: they are more often codes than amounts.
fn is_plain_number(text: &str) -> bool {
    let digits = text.strip_prefix('-').unwrap_or(text);
    let (whole, fraction) = digits.split_once('.').unwrap_or((digits, "0"));
    let all_digits = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    all_digits(whole)
        && all_digits(fraction)
        && (whole == "0" || !whole.starts_with('0'))
        && text.len() <= 18
}

/// A string as a YAML value, in double quotes when a YAML reader would
/// otherwise take it for a number, a boolean, nothing, or syntax. `in_list`
/// is for an item of a `[a, b]` list, where a comma would end it.
fn yaml_scalar(text: &str, in_list: bool) -> String {
    let lower = text.to_ascii_lowercase();
    let reserved = matches!(
        lower.as_str(),
        "null" | "~" | "true" | "false" | "yes" | "no" | "on" | "off" | "y" | "n"
    );
    let starts_like_syntax = text
        .chars()
        .next()
        .is_some_and(|c| "-?:,[]{}#&*!|>'\"%@`".contains(c));
    // "12:30" is a number in base sixty to some YAML readers.
    let looks_numeric = text.parse::<f64>().is_ok()
        || lower.starts_with("0x")
        || lower.starts_with("0o")
        || (text.contains(':')
            && text.chars().all(|c| c.is_ascii_digit() || c == ':')
            && text.chars().any(|c| c.is_ascii_digit()));
    let needs_quotes = text.is_empty()
        || text != text.trim()
        || reserved
        || starts_like_syntax
        || looks_numeric
        || text.chars().any(char::is_control)
        || text.contains(": ")
        || text.contains(" #")
        || text.ends_with(':')
        || (in_list && text.contains([',', '[', ']', '{', '}']));
    if !needs_quotes {
        return text.to_string();
    }
    let mut quoted = String::with_capacity(text.len() + 2);
    quoted.push('"');
    for c in text.chars() {
        match c {
            '\\' => quoted.push_str("\\\\"),
            '"' => quoted.push_str("\\\""),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            c if c.is_control() => quoted.push_str(&format!("\\x{:02X}", (c as u32).min(0xFF))),
            c => quoted.push(c),
        }
    }
    quoted.push('"');
    quoted
}

// ============================================================
// A note
// ============================================================

#[derive(Default)]
pub(crate) struct Note {
    pub props: Props,
    pub body: String,
    /// When the note was last changed in the app it came from. The file is
    /// given this time, so sorting by date in the app still means something.
    pub modified: Option<DateTime<Utc>>,
}

impl Note {
    /// The whole file: frontmatter if there are properties, then the body.
    /// A link written `[[Note|shown]]` in a table row gets its `|` escaped
    /// here, whichever importer wrote it, or it would end the table cell.
    pub(crate) fn render(&self) -> String {
        let mut text = self.props.render();
        let body = table_safe(&self.body);
        let body = body.trim_matches('\n').trim_end();
        if !text.is_empty() && !body.is_empty() {
            text.push('\n');
        }
        text.push_str(body);
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text
    }
}

/// A note's place in the vault, settled before the note is written so that
/// other notes can link to it by its final name.
#[derive(Debug, Clone)]
pub(crate) struct Slot {
    /// The file name without ".md": what goes inside `[[...]]`.
    pub name: String,
    /// The name before " 2" was added to make it unique.
    base: String,
    path: PathBuf,
}

// ============================================================
// The destination
// ============================================================

pub(crate) struct Output {
    /// The destination folder, and the same as written in the report.
    root: PathBuf,
    folder: String,
    /// The folders this import had to make for the destination, deepest first.
    created: Vec<PathBuf>,
    /// Every note name in the vault and in this import, lower case.
    note_names: HashSet<String>,
    /// Every other file name in the vault and in this import, lower case.
    file_names: HashSet<String>,
    /// The last number given to each name that had to be numbered.
    numbers: HashMap<String, usize>,
    notes: usize,
    attachments: usize,
    skipped: Vec<Skipped>,
}

impl Output {
    /// `dest_folder` is a path inside the vault such as "Imported/Evernote".
    /// It is created if it is missing.
    pub(crate) fn open(vault: &Path, dest_folder: &str) -> Result<Output, String> {
        let vault = dunce::canonicalize(vault)
            .ok()
            .filter(|path| path.is_dir())
            .ok_or_else(|| "The vault folder could not be found.".to_string())?;
        let parts = destination_parts(dest_folder)?;
        let mut root = vault.clone();
        root.extend(&parts);

        // The folders that are not there yet, deepest first.
        let mut created = Vec::new();
        let mut existing = root.clone();
        while !existing.exists() && existing != vault {
            created.push(existing.clone());
            existing.pop();
        }
        // A link inside the vault could lead the folder somewhere else, so
        // the part that exists is followed before anything is created.
        let inside = dunce::canonicalize(&existing).is_ok_and(|real| real.starts_with(&vault));
        if !inside {
            return Err("The destination folder is outside the vault.".to_string());
        }
        fs::create_dir_all(&root)
            .map_err(|e| format!("The destination folder could not be created: {e}."))?;
        // From here on the folder is known by its real path, so that every
        // folder made under it can be checked against it.
        let root = dunce::canonicalize(&root)
            .map_err(|e| format!("The destination folder could not be opened: {e}."))?;

        let mut output = Output {
            root,
            folder: parts.join("/"),
            created,
            note_names: HashSet::new(),
            file_names: HashSet::new(),
            numbers: HashMap::new(),
            notes: 0,
            attachments: 0,
            skipped: Vec::new(),
        };
        output.index(&vault);
        Ok(output)
    }

    /// Note the name of every file the app lists: hidden files and folders,
    /// `node_modules` and links are not part of the vault to it.
    fn index(&mut self, dir: &Path) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                self.index(&entry.path());
            } else if file_type.is_file() {
                self.remember(&name);
            }
        }
    }

    fn remember(&mut self, file_name: &str) {
        let lower = file_name.to_lowercase();
        if is_note_file(&lower) {
            let stem = lower
                .rsplit_once('.')
                .map_or(lower.as_str(), |(stem, _)| stem);
            self.note_names.insert(stem.to_string());
        } else {
            self.file_names.insert(lower);
        }
    }

    /// Settle the name of a note. `folders` lead from the destination folder
    /// to the note's own folder and are cleaned the same way as the title.
    pub(crate) fn reserve<S: AsRef<str>>(&mut self, folders: &[S], title: &str) -> Slot {
        let base = clean_name(title);
        let last = self
            .numbers
            .entry(format!("note/{}", base.to_lowercase()))
            .or_insert(0);
        let name = next_free(&base, last, |candidate| {
            self.note_names.contains(&candidate.to_lowercase())
        });
        self.note_names.insert(name.to_lowercase());
        let mut path = self.root.clone();
        path.extend(folders.iter().map(|folder| clean_name(folder.as_ref())));
        path.push(format!("{name}.md"));
        Slot { name, base, path }
    }

    /// Write a note at the place reserved for it. A note that cannot be
    /// written is recorded as skipped; the import goes on.
    pub(crate) fn write(&mut self, slot: &Slot, note: &Note) -> bool {
        match self.write_new(&slot.path, note) {
            Ok(()) => {
                self.notes += 1;
                true
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                self.skip(&slot.name, "A file with this name already exists.");
                false
            }
            Err(e) => {
                self.skip(&slot.name, &format!("The note could not be written: {e}."));
                false
            }
        }
    }

    /// Make a folder under the destination folder. A link lying in the
    /// destination could lead a folder of the import somewhere else, so the
    /// part of the path that exists is followed before the rest is made.
    fn make_folder(&self, dir: &Path) -> io::Result<()> {
        let mut existing = dir.to_path_buf();
        while !existing.exists() && existing.pop() {}
        if !dunce::canonicalize(&existing)?.starts_with(&self.root) {
            return Err(io::Error::other(
                "a link in the destination folder leads out of it",
            ));
        }
        fs::create_dir_all(dir)
    }

    fn write_new(&self, path: &Path, note: &Note) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            self.make_folder(parent)?;
        }
        let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
        file.write_all(note.render().as_bytes())?;
        if let Some(modified) = note.modified {
            // Best effort: a file system that cannot store the time keeps today's.
            let _ = file.set_modified(modified.into());
        }
        Ok(())
    }

    /// Save an attachment and return the name it was given.
    pub(crate) fn attach(&mut self, wanted: &str, bytes: &[u8]) -> Result<String, String> {
        self.attach_with(wanted, &mut |file| file.write_all(bytes))
    }

    /// As `attach`, for content that is copied from somewhere rather than
    /// held in memory. `fill` writes the content into the new file.
    pub(crate) fn attach_with(
        &mut self,
        wanted: &str,
        fill: &mut dyn FnMut(&mut File) -> io::Result<()>,
    ) -> Result<String, String> {
        let dir = self.root.join(ATTACHMENTS);
        self.make_folder(&dir)
            .map_err(|e| format!("The attachments folder could not be created: {e}."))?;
        let cleaned = clean_file_name(wanted);
        let (stem, ext) = split_extension(&cleaned);
        let with_ext = |stem: &str| match ext {
            Some(ext) => format!("{stem}.{ext}"),
            None => stem.to_string(),
        };
        let last = self
            .numbers
            .entry(format!("file/{}", cleaned.to_lowercase()))
            .or_insert(0);
        loop {
            let stem = next_free(stem, last, |candidate| {
                self.file_names
                    .contains(&with_ext(candidate).to_lowercase())
            });
            let name = with_ext(&stem);
            self.file_names.insert(name.to_lowercase());
            let path = dir.join(&name);
            let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => file,
                // Something the vault listing did not show has the name: try the next.
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("The attachment could not be written: {e}.")),
            };
            if let Err(e) = fill(&mut file) {
                // The half-written file is ours, made a moment ago.
                drop(file);
                let _ = fs::remove_file(&path);
                return Err(format!("The attachment could not be written: {e}."));
            }
            self.attachments += 1;
            return Ok(name);
        }
    }

    pub(crate) fn skip(&mut self, name: &str, reason: &str) {
        self.skipped.push(Skipped {
            name: name.to_string(),
            reason: reason.to_string(),
        });
    }

    pub(crate) fn finish(self) -> Report {
        self.remove_root_if_unused();
        Report {
            notes: self.notes,
            attachments: self.attachments,
            skipped: self.skipped,
            folder: self.folder,
        }
    }

    /// An import that wrote nothing leaves no empty folders behind. Only
    /// folders this import made are removed, and only while they are empty.
    pub(crate) fn remove_root_if_unused(&self) {
        if self.notes == 0 && self.attachments == 0 {
            for dir in &self.created {
                if fs::remove_dir(dir).is_err() {
                    break;
                }
            }
        }
    }
}

/// The folders of a destination such as "Imported/Evernote". It has to stay
/// inside the vault and be made of names every system accepts.
fn destination_parts(dest_folder: &str) -> Result<Vec<String>, String> {
    let normalized = dest_folder.trim().replace('\\', "/");
    let has_drive = normalized.as_bytes().get(1) == Some(&b':');
    if normalized.starts_with('/') || has_drive {
        return Err(
            "The destination folder has to be a folder inside the vault, not a full path."
                .to_string(),
        );
    }
    let mut parts = Vec::new();
    for part in normalized
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
    {
        let valid = part != ".."
            && !part.starts_with('.')
            && !part.ends_with(['.', ' '])
            && !part.starts_with(' ')
            && !part
                .chars()
                .any(|c| c.is_control() || ":*?\"<>|".contains(c))
            && !is_windows_device(part);
        if !valid {
            return Err(format!(
                "\"{part}\" cannot be used as a folder name in the destination folder."
            ));
        }
        parts.push(part.to_string());
    }
    Ok(parts)
}

#[cfg(test)]
pub(crate) mod testing {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    /// An empty folder of its own for one test.
    pub(crate) fn scratch(name: &str) -> PathBuf {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("noteriv-import-{}-{n}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dunce::canonicalize(dir).unwrap()
    }

    pub(crate) fn write(base: &Path, rel: &str, content: impl AsRef<[u8]>) {
        let path = base.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    pub(crate) fn text(base: &Path, rel: &str) -> String {
        fs::read_to_string(base.join(rel)).unwrap_or_else(|_| panic!("{rel} is missing"))
    }

    /// Every file under `base`, as sorted paths with `/`.
    pub(crate) fn files(base: &Path) -> Vec<String> {
        fn walk(dir: &Path, prefix: &str, out: &mut Vec<String>) {
            for entry in fs::read_dir(dir).unwrap().flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let rel = if prefix.is_empty() {
                    name
                } else {
                    format!("{prefix}/{name}")
                };
                if entry.file_type().unwrap().is_dir() {
                    walk(&entry.path(), &rel, out);
                } else {
                    out.push(rel);
                }
            }
        }
        let mut out = Vec::new();
        walk(base, "", &mut out);
        out.sort();
        out
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{files, scratch, text, write};
    use super::*;

    #[test]
    fn a_title_becomes_a_name_every_system_accepts() {
        assert_eq!(clean_name("Meeting: Q3/Q4?"), "Meeting Q3-Q4");
        assert_eq!(clean_name("10:30 call"), "10-30 call");
        assert_eq!(clean_name("a\\b|c"), "a-b-c");
        assert_eq!(clean_name("  spaced \t out\n title  "), "spaced out title");
        assert_eq!(clean_name("what <is> \"this\"*"), "what is this");
        assert_eq!(clean_name("trailing dots... "), "trailing dots");
        assert_eq!(clean_name(".hidden"), "hidden");
        assert_eq!(clean_name("[Draft] C# notes ^1"), "Draft C notes 1");
        assert_eq!(clean_name("con"), "_con");
        assert_eq!(clean_name("LPT1.txt"), "_LPT1.txt");
        assert_eq!(clean_name("COM10"), "COM10");
        assert_eq!(clean_name("Console"), "Console");
    }

    #[test]
    fn a_title_with_nothing_usable_in_it_is_untitled() {
        assert_eq!(clean_name(""), "Untitled");
        assert_eq!(clean_name("  "), "Untitled");
        assert_eq!(clean_name("???"), "Untitled");
        assert_eq!(clean_name("..."), "Untitled");
        assert_eq!(clean_name("\u{0}\u{7}"), "Untitled");
    }

    #[test]
    fn a_long_title_is_cut_on_a_whole_letter() {
        let long = "x".repeat(500);
        assert_eq!(clean_name(&long).chars().count(), MAX_NAME_CHARS);

        // Three bytes a letter: the byte limit comes first.
        let wide = "日".repeat(200);
        let cut = clean_name(&wide);
        assert!(cut.len() <= MAX_NAME_BYTES);
        assert_eq!(cut.chars().count(), MAX_NAME_BYTES / 3);
        assert!(cut.chars().all(|c| c == '日'));
    }

    #[test]
    fn a_file_name_keeps_its_extension() {
        assert_eq!(clean_file_name("my: photo?.PNG"), "my photo.PNG");
        assert_eq!(clean_file_name("archive.tar.gz"), "archive.tar.gz");
        assert_eq!(clean_file_name("v1.2 notes"), "v1.2 notes");
        assert_eq!(clean_file_name("?.pdf"), "Untitled.pdf");
        assert_eq!(clean_file_name(".png"), "png");
    }

    #[test]
    fn values_are_quoted_only_when_yaml_would_misread_them() {
        assert_eq!(yaml_scalar("plain text", false), "plain text");
        assert_eq!(yaml_scalar("2021-01-31", false), "2021-01-31");
        assert_eq!(yaml_scalar("a: b", false), "\"a: b\"");
        assert_eq!(yaml_scalar("ends with:", false), "\"ends with:\"");
        assert_eq!(yaml_scalar("say \"hi\"", false), "say \"hi\"");
        assert_eq!(yaml_scalar("\"quoted\"", false), "\"\\\"quoted\\\"\"");
        assert_eq!(yaml_scalar("two\nlines", false), "\"two\\nlines\"");
        assert_eq!(yaml_scalar("back\\slash: x", false), "\"back\\\\slash: x\"");
        assert_eq!(yaml_scalar("- item", false), "\"- item\"");
        assert_eq!(yaml_scalar("#tag", false), "\"#tag\"");
        assert_eq!(yaml_scalar("a #comment", false), "\"a #comment\"");
        assert_eq!(yaml_scalar("true", false), "\"true\"");
        assert_eq!(yaml_scalar("No", false), "\"No\"");
        assert_eq!(yaml_scalar("null", false), "\"null\"");
        assert_eq!(yaml_scalar("42", false), "\"42\"");
        assert_eq!(yaml_scalar("1e5", false), "\"1e5\"");
        assert_eq!(yaml_scalar("12:30", false), "\"12:30\"");
        assert_eq!(yaml_scalar("", false), "\"\"");
        assert_eq!(yaml_scalar(" padded", false), "\" padded\"");
        assert_eq!(yaml_scalar("a, b", false), "a, b");
        assert_eq!(yaml_scalar("a, b", true), "\"a, b\"");
        assert_eq!(yaml_scalar("x[1]", true), "\"x[1]\"");
    }

    #[test]
    fn frontmatter_keeps_each_property_on_one_line() {
        let mut props = Props::default();
        props.tags(["work", "#To Do", "work", "a, b", "  "]);
        props.date("created", from_millis(1_612_096_496_000));
        props.text("source", "https://example.com/a?b=c");
        props.text("empty", "  ");
        props.flag("pinned", true);
        props.flag("archived", false);
        props.cell("Price ($)", "12.50");
        props.cell("Code", "007");
        props.cell("Done", "TRUE");
        props.text("Project: status", "on hold");
        props.text("source", "second");
        let note = Note {
            props,
            body: "\n\nBody text.\n\n\n".to_string(),
            modified: None,
        };
        assert_eq!(
            note.render(),
            "---\n\
             tags: [work, To-Do, a-b]\n\
             created: 2021-01-31T12:34:56Z\n\
             source: https://example.com/a?b=c\n\
             pinned: true\n\
             Price ($): 12.50\n\
             Code: \"007\"\n\
             Done: true\n\
             Project status: on hold\n\
             source 2: second\n\
             ---\n\
             \n\
             Body text.\n"
        );
    }

    #[test]
    fn a_note_without_properties_has_no_frontmatter() {
        let note = Note {
            body: "Just text.".to_string(),
            ..Note::default()
        };
        assert_eq!(note.render(), "Just text.\n");
        // Whoever made the link, its "|" must not split a table cell.
        let table = Note {
            body: "| [[Plan 2|the plan]] | x |".to_string(),
            ..Note::default()
        };
        assert_eq!(table.render(), "| [[Plan 2\\|the plan]] | x |\n");
        assert_eq!(Note::default().render(), "");
    }

    #[test]
    fn links_are_written_the_way_the_app_reads_them() {
        assert_eq!(wikilink("Plan", None), "[[Plan]]");
        assert_eq!(wikilink("Plan", Some("Plan")), "[[Plan]]");
        assert_eq!(
            wikilink("Plan 2", Some("the [old] plan | v1")),
            "[[Plan 2|the (old) plan - v1]]"
        );
        assert_eq!(wikilink_to("Plan", "#^abc", None), "[[Plan#^abc]]");
        assert_eq!(
            wikilink_to("Plan", "#^abc", Some("Plan")),
            "[[Plan#^abc|Plan]]"
        );
        assert_eq!(embed("photo.PNG"), "![[photo.PNG]]");
        assert_eq!(embed("paper.pdf"), "[[paper.pdf]]");
        assert_eq!(block_id("a_b-C9"), "a-b-C9");
    }

    #[test]
    fn a_taken_name_gets_a_number_and_nothing_is_overwritten() {
        let vault = scratch("names");
        write(&vault, "Imported/Plan.md", "mine\n");
        write(&vault, "Elsewhere/plan 2.markdown", "also mine\n");
        write(&vault, ".trash/Hidden.md", "not listed by the app\n");

        let mut out = Output::open(&vault, "Imported").unwrap();
        let first = out.reserve::<&str>(&[], "Plan");
        let second = out.reserve(&["Sub: folder"], "PLAN");
        let hidden = out.reserve::<&str>(&[], "Hidden");
        assert_eq!(
            (first.name.as_str(), second.name.as_str()),
            ("Plan 3", "PLAN 4")
        );
        assert_eq!(hidden.name, "Hidden");

        let note = |body: &str| Note {
            body: body.to_string(),
            ..Note::default()
        };
        assert!(out.write(&first, &note("one")));
        assert!(out.write(&second, &note("two")));
        // The same place twice: the second write is refused, not an overwrite.
        assert!(!out.write(&first, &note("again")));

        let report = out.finish();
        assert_eq!(report.notes, 2);
        assert_eq!(report.folder, "Imported");
        assert_eq!(report.skipped.len(), 1);
        assert_eq!(
            report.skipped[0].reason,
            "A file with this name already exists."
        );
        assert_eq!(text(&vault, "Imported/Plan.md"), "mine\n");
        assert_eq!(text(&vault, "Imported/Plan 3.md"), "one\n");
        assert_eq!(text(&vault, "Imported/Sub folder/PLAN 4.md"), "two\n");
    }

    #[test]
    fn many_notes_with_one_title_are_numbered_without_starting_over() {
        let vault = scratch("many");
        write(&vault, "Untitled 3.md", "taken before the import\n");
        let mut out = Output::open(&vault, "In").unwrap();
        let names: Vec<String> = (0..5000)
            .map(|_| out.reserve::<&str>(&[], "").name)
            .collect();
        assert_eq!(
            names[..4],
            ["Untitled", "Untitled 2", "Untitled 4", "Untitled 5"]
        );
        assert_eq!(names[4999], "Untitled 5001");
        // A different way of writing the same name shares the numbering.
        assert_eq!(out.reserve::<&str>(&[], "UNTITLED").name, "UNTITLED 5002");
        for n in 1..=300 {
            let name = out.attach("scan.png", b"x").unwrap();
            let expected = if n == 1 {
                "scan.png".to_string()
            } else {
                format!("scan {n}.png")
            };
            assert_eq!(name, expected);
        }
    }

    #[test]
    fn attachments_get_names_no_other_file_in_the_vault_has() {
        let vault = scratch("attachments");
        write(&vault, "attachments/photo.png", "old");
        write(&vault, "In/attachments/scan.pdf", "old scan");

        let mut out = Output::open(&vault, "In").unwrap();
        assert_eq!(out.attach("photo.png", b"new").unwrap(), "photo 2.png");
        assert_eq!(out.attach("Photo.PNG", b"newer").unwrap(), "Photo 3.PNG");
        assert_eq!(out.attach("scan.pdf", b"new scan").unwrap(), "scan 2.pdf");
        assert_eq!(out.attach("what?.txt", b"text").unwrap(), "what.txt");
        assert_eq!(out.attach("README", b"plain").unwrap(), "README");
        let failed = out.attach_with("broken.bin", &mut |_| Err(io::Error::other("disk full")));
        assert!(failed.unwrap_err().contains("disk full"));

        assert_eq!(out.finish().attachments, 5);
        assert_eq!(text(&vault, "attachments/photo.png"), "old");
        assert_eq!(text(&vault, "In/attachments/scan.pdf"), "old scan");
        assert_eq!(
            files(&vault.join("In/attachments")),
            [
                "Photo 3.PNG",
                "README",
                "photo 2.png",
                "scan 2.pdf",
                "scan.pdf",
                "what.txt"
            ]
        );
    }

    #[test]
    fn the_destination_has_to_stay_inside_the_vault() {
        let vault = scratch("destination");
        for bad in [
            "../outside",
            "a/../../b",
            "/etc",
            "C:\\Users",
            "a/b:c",
            "nul",
            ".hidden/x",
            "trailing./x",
        ] {
            assert!(Output::open(&vault, bad).is_err(), "{bad} was accepted");
        }
        assert!(files(&vault).is_empty());

        let out = Output::open(&vault, "Imported\\From Evernote/").unwrap();
        let report = out.finish();
        assert_eq!(report.folder, "Imported/From Evernote");
        // Nothing was imported, so the folders made for it are removed again.
        assert!(files(&vault).is_empty());
        assert!(!vault.join("Imported").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_destination_that_is_a_link_out_of_the_vault_is_refused() {
        let vault = scratch("link-vault");
        let outside = scratch("link-outside");
        std::os::unix::fs::symlink(&outside, vault.join("Escape")).unwrap();
        let refused = Output::open(&vault, "Escape/Notes");
        assert_eq!(
            refused.err().unwrap(),
            "The destination folder is outside the vault."
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_inside_the_destination_cannot_lead_a_note_out_of_it() {
        let vault = scratch("link-inside");
        let outside = scratch("link-inside-target");
        fs::create_dir_all(vault.join("In")).unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("In/Shared")).unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("In/attachments")).unwrap();

        let mut out = Output::open(&vault, "In").unwrap();
        let note = Note {
            body: "text".to_string(),
            ..Note::default()
        };
        let through_link = out.reserve(&["Shared", "Deeper"], "Escaping");
        assert!(!out.write(&through_link, &note));
        assert!(out.attach("photo.png", b"x").is_err());
        let fine = out.reserve(&["Real"], "Staying");
        assert!(out.write(&fine, &note));

        let report = out.finish();
        assert_eq!((report.notes, report.attachments), (1, 0));
        assert_eq!(
            report.skipped[0].reason,
            "The note could not be written: a link in the destination folder leads out of it."
        );
        assert!(files(&outside).is_empty());
        assert_eq!(text(&vault, "In/Real/Staying.md"), "text\n");
    }

    #[test]
    fn a_written_note_carries_the_time_it_was_last_changed() {
        let vault = scratch("times");
        let mut out = Output::open(&vault, "In").unwrap();
        let slot = out.reserve::<&str>(&[], "Old note");
        let modified = from_millis(1_612_096_496_000);
        out.write(
            &slot,
            &Note {
                body: "text".into(),
                modified,
                ..Note::default()
            },
        );
        let on_disk: DateTime<Utc> = fs::metadata(vault.join("In/Old note.md"))
            .unwrap()
            .modified()
            .unwrap()
            .into();
        assert_eq!(iso(on_disk), "2021-01-31T12:34:56Z");
    }
}
