// Evernote: `.enex` export files, one per notebook.
//
// An export is one XML file that holds every note with its attachments as
// base64 text, so it can be hundreds of megabytes. It is read as a stream
// of events and never as a whole: at any moment one note's text and one
// attachment are in memory. An attachment's base64 is decoded as it is read
// rather than collected first, which keeps the most held for one attachment
// near twice its size instead of four times.
//
// The file is read twice. The first reading takes only the titles, so that
// every note's final name is settled before any note is written. The second
// writes the notes. Without the first, a link from one note to a later one
// could not be given the name that note ends up with.
//
// Inside a note:
//
// - The body is ENML, a kind of XHTML, and goes through the HTML converter.
// - `<en-media hash="...">` shows an attachment, named by the MD5 of its
//   bytes. Attachments are saved as they are read and the hash is looked up
//   when the body is converted. One the body never shows is listed at the
//   end of the note, so nothing is saved without a link to it.
// - A link to another note (`evernote:///view/...`) carries ids that the
//   export does not contain. The text of such a link is the title of the
//   note it points at, so it is matched by title. One that matches nothing
//   stays a link into Evernote.
// - Tasks from Evernote's task list (`<task>` elements) are written as
//   task lines at the end of the note they belong to.
//
// Given a folder, every `.enex` file in it is imported into a folder of its
// own. "Stack@@@Notebook.enex" goes into Stack/Notebook, the naming the
// Obsidian importer documents for keeping notebook stacks.
//
// Not handled: encrypted text (a placeholder is left), ink notes, and the
// reminders' "done" state.

use super::html::{self, Resolver};
use super::md5;
use super::output::{
    embed, extension_for_mime, parse_iso, split_extension, wikilink, Note, Output, Props, Slot,
};
use base64::Engine;
use chrono::{DateTime, NaiveDateTime, Utc};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};

pub(crate) fn import(source: &Path, out: &mut Output) -> Result<(), String> {
    let files = enex_files(source)?;

    // First reading: titles, and from them every note's final name.
    let mut plans: Vec<Vec<Slot>> = Vec::new();
    let mut links: HashMap<String, String> = HashMap::new();
    let mut first_problem = None;
    for (file, folders) in &files {
        let mut titles = Titles::default();
        if let Err(problem) = walk(file, &mut titles) {
            first_problem.get_or_insert(problem);
        }
        let mut slots = Vec::new();
        for title in &titles.found {
            let slot = out.reserve(folders, title);
            links
                .entry(link_key(title))
                .or_insert_with(|| slot.name.clone());
            slots.push(slot);
        }
        plans.push(slots);
    }
    if plans.iter().all(Vec::is_empty) {
        return Err(first_problem.unwrap_or_else(|| {
            "No notes were found. The file does not look like an Evernote export (.enex)."
                .to_string()
        }));
    }

    // Second reading: the notes themselves.
    let mut saved = HashMap::new();
    for ((file, folders), slots) in files.iter().zip(plans) {
        let mut notes = Notes {
            out: &mut *out,
            slots,
            next: 0,
            folders,
            links: &links,
            saved: &mut saved,
            note: RawNote::default(),
            resource: RawResource::default(),
            task: RawTask::default(),
        };
        if let Err(problem) = walk(file, &mut notes) {
            let name = file
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            out.skip(
                &name,
                &format!("{problem} The notes before that point were imported."),
            );
        }
    }
    Ok(())
}

/// The export files to read, each with the folders its notes go in.
fn enex_files(source: &Path) -> Result<Vec<(PathBuf, Vec<String>)>, String> {
    if !source.is_dir() {
        return Ok(vec![(source.to_path_buf(), Vec::new())]);
    }
    let mut files = Vec::new();
    let entries =
        fs::read_dir(source).map_err(|e| format!("The folder could not be read: {e}."))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let is_enex = path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("enex"));
        if is_enex && entry.file_type().is_ok_and(|kind| kind.is_file()) {
            let stem = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let folders = stem.split("@@@").map(str::to_string).collect();
            files.push((path, folders));
        }
    }
    files.sort();
    if files.is_empty() {
        return Err("The folder has no Evernote export (.enex) files in it.".to_string());
    }
    Ok(files)
}

/// Titles are compared without case or stray spaces when a link is matched.
fn link_key(title: &str) -> String {
    title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

// ============================================================
// Reading the XML
// ============================================================

/// Told about the parts of each `<note>` as the file goes by. `key` is the
/// path below the note: "title", "resource/mime", and "" for the note itself.
trait Visitor {
    /// Whether the text of this element is wanted. Text nobody wants is
    /// never copied, which matters for attachments on the first reading.
    fn wants(&self, key: &str) -> bool;
    fn text(&mut self, key: &str, text: String);
    /// The bytes of an attachment, or an error if they were not base64.
    fn data(&mut self, _bytes: Result<Vec<u8>, ()>) {}
    fn end(&mut self, key: &str);
}

const DATA: &str = "resource/data";

/// Decodes base64 as it arrives in pieces. White space between characters
/// is skipped, as Evernote breaks the text into lines.
#[derive(Default)]
struct Base64Stream {
    decoded: Vec<u8>,
    /// Characters left over from the last piece: base64 is decoded four
    /// characters at a time.
    pending: Vec<u8>,
    damaged: bool,
}

impl Base64Stream {
    fn push(&mut self, text: &[u8]) {
        for mut piece in text
            .split(u8::is_ascii_whitespace)
            .filter(|piece| !piece.is_empty())
        {
            if !self.pending.is_empty() {
                let take = (4 - self.pending.len()).min(piece.len());
                self.pending.extend_from_slice(&piece[..take]);
                piece = &piece[take..];
                if self.pending.len() < 4 {
                    continue;
                }
                let four = std::mem::take(&mut self.pending);
                self.decode(&four);
            }
            let whole = piece.len() - piece.len() % 4;
            self.decode(&piece[..whole]);
            self.pending.extend_from_slice(&piece[whole..]);
        }
    }

    fn decode(&mut self, text: &[u8]) {
        let engine = &base64::engine::general_purpose::STANDARD;
        if !self.damaged && !text.is_empty() && engine.decode_vec(text, &mut self.decoded).is_err()
        {
            self.damaged = true;
        }
    }

    fn finish(mut self) -> Result<Vec<u8>, ()> {
        // Characters left at the end are a last group written without its
        // "=" padding.
        let rest = std::mem::take(&mut self.pending);
        let engine = &base64::engine::general_purpose::STANDARD_NO_PAD;
        if !rest.is_empty() && engine.decode_vec(&rest, &mut self.decoded).is_err() {
            self.damaged = true;
        }
        if self.damaged {
            Err(())
        } else {
            Ok(self.decoded)
        }
    }
}

/// The path below `<note>`, or `None` outside any note.
fn key_of(stack: &[String]) -> Option<String> {
    let note = stack.iter().position(|name| name == "note")?;
    Some(stack[note + 1..].join("/"))
}

/// Read the file from start to end. An error is where and why the reading
/// stopped; everything before that point has been passed on.
fn walk(path: &Path, visitor: &mut dyn Visitor) -> Result<(), String> {
    let file = File::open(path).map_err(|e| format!("The file could not be opened: {e}."))?;
    let mut reader = Reader::from_reader(BufReader::with_capacity(1 << 16, file));
    let mut buffer = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut text = String::new();
    let mut data = Base64Stream::default();
    // The element being read, when it is one whose text is wanted.
    let mut collecting: Option<String> = None;
    let name_of = |raw: &[u8]| String::from_utf8_lossy(raw).into_owned();

    loop {
        // After an attachment the buffer is as large as the attachment was.
        if buffer.capacity() > (1 << 22) {
            buffer = Vec::new();
        }
        buffer.clear();
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|e| format!("The file is damaged ({e})."))?;
        match event {
            Event::Eof => break,
            Event::Start(start) => {
                stack.push(name_of(start.name().as_ref()));
                text.clear();
                data = Base64Stream::default();
                collecting = key_of(&stack).filter(|key| visitor.wants(key));
            }
            Event::Empty(empty) => {
                stack.push(name_of(empty.name().as_ref()));
                if let Some(key) = key_of(&stack) {
                    if visitor.wants(&key) && key != DATA {
                        visitor.text(&key, String::new());
                    }
                    visitor.end(&key);
                }
                stack.pop();
                collecting = None;
            }
            Event::Text(bytes) => match collecting.as_deref() {
                Some(DATA) => data.push(&bytes),
                Some(_) => match bytes.unescape() {
                    Ok(unescaped) => text.push_str(&unescaped),
                    // An entity XML does not know: better the text as written than none.
                    Err(_) => text.push_str(&String::from_utf8_lossy(&bytes)),
                },
                None => {}
            },
            Event::CData(bytes) => match collecting.as_deref() {
                Some(DATA) => data.push(&bytes),
                Some(_) => text.push_str(&String::from_utf8_lossy(&bytes)),
                None => {}
            },
            Event::End(_) => {
                if let Some(key) = key_of(&stack) {
                    match collecting.take() {
                        Some(wanted) if wanted == DATA => {
                            visitor.data(std::mem::take(&mut data).finish())
                        }
                        Some(wanted) => visitor.text(&wanted, std::mem::take(&mut text)),
                        None => {}
                    }
                    visitor.end(&key);
                }
                collecting = None;
                stack.pop();
            }
            _ => {}
        }
    }
    if stack.iter().any(|name| name == "note") {
        return Err("The file ends in the middle of a note.".to_string());
    }
    Ok(())
}

// ============================================================
// First reading: titles
// ============================================================

#[derive(Default)]
struct Titles {
    found: Vec<String>,
    current: String,
}

impl Visitor for Titles {
    fn wants(&self, key: &str) -> bool {
        key == "title"
    }

    fn text(&mut self, _key: &str, text: String) {
        self.current = text;
    }

    fn end(&mut self, key: &str) {
        if key.is_empty() {
            self.found.push(std::mem::take(&mut self.current));
        }
    }
}

// ============================================================
// Second reading: notes
// ============================================================

#[derive(Default)]
struct RawNote {
    title: String,
    content: String,
    created: Option<DateTime<Utc>>,
    updated: Option<DateTime<Utc>>,
    reminder: Option<DateTime<Utc>>,
    tags: Vec<String>,
    source: String,
    author: String,
    latitude: String,
    longitude: String,
    /// The attachments saved for this note: MD5 to file name, and the
    /// hashes in the order they came.
    attachments: HashMap<String, String>,
    order: Vec<String>,
    tasks: Vec<RawTask>,
}

#[derive(Default)]
struct RawResource {
    /// `None` until the data has been read; an error if it was not base64.
    bytes: Option<Result<Vec<u8>, ()>>,
    mime: String,
    file_name: String,
}

#[derive(Default)]
struct RawTask {
    title: String,
    done: bool,
    due: Option<DateTime<Utc>>,
}

struct Notes<'a> {
    out: &'a mut Output,
    /// The names settled on the first reading, in the order of the notes.
    slots: Vec<Slot>,
    next: usize,
    folders: &'a [String],
    /// Lower-case title to the final name of the first note with it.
    links: &'a HashMap<String, String>,
    /// Attachments already saved by this import, by MD5: a picture that
    /// many notes share is kept once.
    saved: &'a mut HashMap<String, String>,
    note: RawNote,
    resource: RawResource,
    task: RawTask,
}

impl Visitor for Notes<'_> {
    fn wants(&self, key: &str) -> bool {
        matches!(
            key,
            "title"
                | "content"
                | "created"
                | "updated"
                | "tag"
                | "note-attributes/source-url"
                | "note-attributes/author"
                | "note-attributes/latitude"
                | "note-attributes/longitude"
                | "note-attributes/reminder-time"
                | "resource/data"
                | "resource/mime"
                | "resource/resource-attributes/file-name"
                | "task/title"
                | "task/taskStatus"
                | "task/dueDate"
        )
    }

    fn text(&mut self, key: &str, text: String) {
        let trimmed = text.trim();
        match key {
            "title" => self.note.title = trimmed.to_string(),
            "content" => self.note.content = text,
            "created" => self.note.created = parse_time(trimmed),
            "updated" => self.note.updated = parse_time(trimmed),
            "tag" => self.note.tags.push(trimmed.to_string()),
            "note-attributes/source-url" => self.note.source = trimmed.to_string(),
            "note-attributes/author" => self.note.author = trimmed.to_string(),
            "note-attributes/latitude" => self.note.latitude = trimmed.to_string(),
            "note-attributes/longitude" => self.note.longitude = trimmed.to_string(),
            "note-attributes/reminder-time" => self.note.reminder = parse_time(trimmed),
            "resource/mime" => self.resource.mime = trimmed.to_string(),
            "resource/resource-attributes/file-name" => {
                self.resource.file_name = trimmed.to_string()
            }
            "task/title" => self.task.title = trimmed.to_string(),
            "task/taskStatus" => self.task.done = trimmed.eq_ignore_ascii_case("completed"),
            "task/dueDate" => self.task.due = parse_time(trimmed),
            _ => {}
        }
    }

    fn data(&mut self, bytes: Result<Vec<u8>, ()>) {
        self.resource.bytes = Some(bytes);
    }

    fn end(&mut self, key: &str) {
        match key {
            "resource" => self.finish_resource(),
            "task" => {
                let task = std::mem::take(&mut self.task);
                if !task.title.is_empty() {
                    self.note.tasks.push(task);
                }
            }
            "" => self.finish_note(),
            _ => {}
        }
    }
}

impl Notes<'_> {
    /// Save an attachment and remember it under its MD5, which is how the
    /// note's text refers to it.
    fn finish_resource(&mut self) {
        let resource = std::mem::take(&mut self.resource);
        let label = format!(
            "{} ({})",
            if self.note.title.is_empty() {
                "Untitled"
            } else {
                &self.note.title
            },
            if resource.file_name.is_empty() {
                "attachment"
            } else {
                &resource.file_name
            },
        );
        let bytes = match resource.bytes {
            Some(Ok(bytes)) if !bytes.is_empty() => bytes,
            Some(Err(())) => {
                self.out.skip(&label, "The attachment's data is damaged.");
                return;
            }
            // No data at all: there is nothing to save.
            _ => return,
        };
        let hash = md5::hex_digest(&bytes);
        if self.note.attachments.contains_key(&hash) {
            return;
        }
        let name = match self.saved.get(&hash) {
            Some(name) => name.clone(),
            None => {
                let wanted = attachment_name(&resource.file_name, &resource.mime, &self.note.title);
                match self.out.attach(&wanted, &bytes) {
                    Ok(name) => {
                        self.saved.insert(hash.clone(), name.clone());
                        name
                    }
                    Err(reason) => {
                        self.out.skip(&label, &reason);
                        return;
                    }
                }
            }
        };
        self.note.attachments.insert(hash.clone(), name);
        self.note.order.push(hash);
    }

    fn finish_note(&mut self) {
        let note = std::mem::take(&mut self.note);
        let slot = match self.slots.get(self.next) {
            Some(slot) => slot.clone(),
            None => self.out.reserve(self.folders, &note.title),
        };
        self.next += 1;

        let mut shown = HashSet::new();
        let converted = {
            let mut resolver = Enml {
                note: &note,
                shown: &mut shown,
                links: self.links,
                out: &mut *self.out,
            };
            let enml = expand_empty_elements(&note.content);
            html::guarded(|| html::to_markdown(&enml, &mut resolver))
        };
        let mut body = match converted {
            Ok(body) => body,
            Err(reason) => {
                self.out.skip(&slot.name, &reason);
                return;
            }
        };

        let unshown: Vec<String> = note
            .order
            .iter()
            .filter(|hash| !shown.contains(*hash))
            .map(|hash| embed(&note.attachments[hash]))
            .collect();
        if !unshown.is_empty() {
            body.push_str("\n\n");
            body.push_str(&unshown.join("\n\n"));
        }
        if !note.tasks.is_empty() {
            let tasks: Vec<String> = note.tasks.iter().map(task_line).collect();
            body.push_str("\n\n");
            body.push_str(&tasks.join("\n"));
        }

        let mut props = Props::default();
        props.title_if_changed(&note.title, &slot);
        props.tags(&note.tags);
        props.date("created", note.created);
        props.date("updated", note.updated);
        props.text("source", &note.source);
        props.text("author", &note.author);
        if !note.latitude.is_empty() && !note.longitude.is_empty() {
            props.text(
                "location",
                &format!("{}, {}", note.latitude, note.longitude),
            );
        }
        props.date("reminder", note.reminder);
        let modified = note.updated.or(note.created);
        self.out.write(
            &slot,
            &Note {
                props,
                body,
                modified,
            },
        );
    }
}

fn task_line(task: &RawTask) -> String {
    let mark = if task.done { 'x' } else { ' ' };
    match task.due {
        Some(due) => format!("- [{mark}] {} (due {})", task.title, due.format("%Y-%m-%d")),
        None => format!("- [{mark}] {}", task.title),
    }
}

/// The name to save an attachment under. One that came without a name is
/// called after its note; one without an extension gets the usual one for
/// its type, so the app knows a picture is a picture.
fn attachment_name(file_name: &str, mime: &str, title: &str) -> String {
    let extension = extension_for_mime(mime);
    if file_name.is_empty() {
        let base = if title.is_empty() {
            "Evernote attachment"
        } else {
            title
        };
        return format!("{base}.{extension}");
    }
    if split_extension(file_name).1.is_none() && extension != "bin" {
        return format!("{file_name}.{extension}");
    }
    file_name.to_string()
}

/// "20210131T123456Z", as Evernote writes every time.
fn parse_time(text: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(text, "%Y%m%dT%H%M%SZ")
        .ok()
        .map(|time| time.and_utc())
        .or_else(|| parse_iso(text))
}

// ============================================================
// The body
// ============================================================

struct Enml<'a> {
    note: &'a RawNote,
    /// The hashes of the attachments the body shows.
    shown: &'a mut HashSet<String>,
    links: &'a HashMap<String, String>,
    out: &'a mut Output,
}

impl Resolver for Enml<'_> {
    fn media(&mut self, hash: &str, _mime: &str) -> Option<String> {
        let hash = hash.to_ascii_lowercase();
        let name = self.note.attachments.get(&hash)?;
        self.shown.insert(hash);
        Some(embed(name))
    }

    fn link(&mut self, href: &str, text: &str) -> Option<String> {
        let lower = href.to_ascii_lowercase();
        let to_a_note = lower.starts_with("evernote:")
            || (lower.contains("evernote.com/shard/") && lower.contains("/nl/"));
        if !to_a_note {
            return None;
        }
        self.links
            .get(&link_key(text))
            .map(|name| wikilink(name, Some(text)))
    }

    /// A picture written into the note itself is saved like an attachment.
    fn image(&mut self, src: &str, _alt: &str) -> Option<String> {
        let (mime, bytes) = html::decode_data_uri(src)?;
        if !mime.starts_with("image/") || bytes.is_empty() {
            return None;
        }
        let wanted = attachment_name("", &mime, &self.note.title);
        self.out
            .attach(&wanted, &bytes)
            .ok()
            .map(|name| embed(&name))
    }
}

/// ENML is XML, where any element can be written `<x/>`. The HTML parser
/// knows that form only for elements that never have content (`<br/>`); it
/// reads `<div/>` or `<en-todo/>` as an opening tag and puts everything that
/// follows inside it. So every such element gets its closing tag here first.
fn expand_empty_elements(xml: &str) -> String {
    const NEVER_HAS_CONTENT: [&str; 14] = [
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
        "source", "track", "wbr",
    ];
    let bytes = xml.as_bytes();
    let mut out = String::with_capacity(xml.len() + 64);
    let mut copied = 0;
    let mut at = 0;
    while let Some(found) = xml[at..].find('<') {
        let start = at + found;
        if xml[start..].starts_with("<!--") {
            at = xml[start..]
                .find("-->")
                .map_or(xml.len(), |end| start + end + 3);
            continue;
        }
        // The end of the tag: the first ">" that is not inside a quoted value.
        let mut end = start + 1;
        let mut quote = None;
        while end < bytes.len() {
            match (quote, bytes[end]) {
                (None, b'"' | b'\'') => quote = Some(bytes[end]),
                (Some(open), byte) if byte == open => quote = None,
                (None, b'>') => break,
                _ => {}
            }
            end += 1;
        }
        if end >= bytes.len() {
            break;
        }
        let name = xml[start + 1..end]
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or("");
        let is_element = name.chars().next().is_some_and(|c| c.is_ascii_alphabetic());
        let is_empty_form = bytes[end - 1] == b'/';
        if is_element
            && is_empty_form
            && !NEVER_HAS_CONTENT.contains(&name.to_ascii_lowercase().as_str())
        {
            out.push_str(&xml[copied..end - 1]);
            out.push_str("></");
            out.push_str(name);
            out.push('>');
            copied = end + 1;
        }
        at = end + 1;
    }
    out.push_str(&xml[copied..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::Report;

    fn base64(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn enex(notes: &[String]) -> String {
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE en-export SYSTEM \"http://xml.evernote.com/pub/evernote-export4.dtd\">\n<en-export export-date=\"20240101T000000Z\" application=\"Evernote\" version=\"10.1\">\n{}\n</en-export>\n",
            notes.join("\n")
        )
    }

    /// A note whose body is given as the inside of `<en-note>`.
    fn note(title: &str, body: &str, rest: &str) -> String {
        format!(
            "<note><title>{title}</title><content><![CDATA[<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?><!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\"><en-note>{body}</en-note>]]></content>{rest}</note>"
        )
    }

    fn resource(bytes: &[u8], mime: &str, file_name: Option<&str>) -> String {
        let name = file_name.map_or(String::new(), |name| {
            format!("<resource-attributes><file-name>{name}</file-name></resource-attributes>")
        });
        // Evernote breaks the base64 into lines.
        let mut data = base64(bytes);
        if data.len() > 8 {
            data.insert(8, '\n');
        }
        format!("<resource><data encoding=\"base64\">\n{data}\n</data><mime>{mime}</mime><width>1</width><recognition><![CDATA[<recoIndex/>]]></recognition>{name}</resource>")
    }

    fn run(name: &str, export: &str) -> (std::path::PathBuf, Report) {
        let dir = scratch(name);
        write(&dir, "export/My Notes.enex", export);
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Evernote").unwrap();
        import(&dir.join("export/My Notes.enex"), &mut out).unwrap();
        (vault, out.finish())
    }

    #[test]
    fn a_note_keeps_its_text_dates_tags_and_attachments() {
        let picture = b"\x89PNG not really a picture";
        let paper = b"%PDF-1.4 not really a paper";
        let body = format!(
            "<div>Bring the <b>tickets</b></div><div><br/></div><div><en-todo checked=\"true\"/>Passport</div><div><en-todo/>Charger</div><div><en-media type=\"image/png\" hash=\"{}\" width=\"20\"/></div><div><en-media hash=\"{}\" type=\"application/pdf\"/></div>",
            md5::hex_digest(picture),
            md5::hex_digest(paper).to_uppercase(),
        );
        let rest = format!(
            "<created>20210131T123456Z</created><updated>20210201T080000Z</updated><tag>travel</tag><tag>To Do</tag><note-attributes><author>Ann</author><source-url>https://example.com/trip?a=1&amp;b=2</source-url><latitude>52.5</latitude><longitude>13.4</longitude><reminder-time>20210301T090000Z</reminder-time></note-attributes>{}{}",
            resource(picture, "image/png", Some("map.png")),
            resource(paper, "application/pdf", Some("Booking: final.pdf")),
        );
        let (vault, report) = run("full", &enex(&[note("Trip: Berlin/Prague?", &body, &rest)]));

        assert_eq!(
            (report.notes, report.attachments, report.skipped.len()),
            (1, 2, 0)
        );
        assert_eq!(
            files(&vault),
            [
                "Evernote/Trip Berlin-Prague.md",
                "Evernote/attachments/Booking final.pdf",
                "Evernote/attachments/map.png"
            ]
        );
        assert_eq!(
            text(&vault, "Evernote/Trip Berlin-Prague.md"),
            "---\n\
             title: \"Trip: Berlin/Prague?\"\n\
             tags: [travel, To-Do]\n\
             created: 2021-01-31T12:34:56Z\n\
             updated: 2021-02-01T08:00:00Z\n\
             source: https://example.com/trip?a=1&b=2\n\
             author: Ann\n\
             location: 52.5, 13.4\n\
             reminder: 2021-03-01T09:00:00Z\n\
             ---\n\
             \n\
             Bring the **tickets**\n\
             \n\
             - [x] Passport\n\
             - [ ] Charger\n\
             \n\
             ![[map.png]]\n\
             \n\
             [[Booking final.pdf]]\n"
        );
        assert_eq!(
            fs::read(vault.join("Evernote/attachments/map.png")).unwrap(),
            picture
        );
        let modified: DateTime<Utc> = fs::metadata(vault.join("Evernote/Trip Berlin-Prague.md"))
            .unwrap()
            .modified()
            .unwrap()
            .into();
        assert_eq!(modified, parse_time("20210201T080000Z").unwrap());
    }

    #[test]
    fn links_between_notes_use_the_final_names() {
        let export = enex(&[
            note("Index", "<div><a href=\"evernote:///view/123/s1/aaaa/aaaa/\">Meeting</a> and <a href=\"https://www.evernote.com/shard/s1/nl/123/bbbb/\">Plans: 2024</a> and <a href=\"evernote:///view/123/s1/cccc/cccc/\">Deleted note</a> and <a href=\"https://example.com\">Meeting</a></div>", ""),
            note("Meeting", "<div>first</div>", ""),
            note("Meeting", "<div>second</div>", ""),
            note("Plans: 2024", "<div>plans</div>", ""),
        ]);
        let (vault, report) = run("links", &export);
        assert_eq!(report.notes, 4);
        assert_eq!(
            files(&vault),
            [
                "Evernote/Index.md",
                "Evernote/Meeting 2.md",
                "Evernote/Meeting.md",
                "Evernote/Plans 2024.md"
            ]
        );
        assert_eq!(
            text(&vault, "Evernote/Index.md"),
            "[[Meeting]] and [[Plans 2024|Plans: 2024]] and [Deleted note](evernote:///view/123/s1/cccc/cccc/) and [Meeting](https://example.com)\n"
        );
        assert_eq!(text(&vault, "Evernote/Meeting 2.md"), "second\n");
    }

    #[test]
    fn attachments_are_named_saved_once_and_never_left_unlinked() {
        let logo = b"GIF89a logo";
        let voice = b"RIFF voice memo";
        let body = format!(
            "<div>Logo: <en-media hash=\"{}\" type=\"image/gif\"/></div>",
            md5::hex_digest(logo)
        );
        let export = enex(&[
            note(
                "First",
                &body,
                &format!(
                    "{}{}",
                    resource(logo, "image/gif", None),
                    resource(voice, "audio/wav", Some("memo"))
                ),
            ),
            note(
                "Second",
                &body,
                &format!(
                    "{}{}",
                    resource(logo, "image/gif", Some("other name.gif")),
                    resource(logo, "image/gif", None)
                ),
            ),
            note(
                "Third",
                "<div><img src=\"data:image/png;base64,aGVsbG8=\"/> inline</div>",
                "",
            ),
        ]);
        let (vault, report) = run("attachments", &export);
        assert_eq!((report.notes, report.attachments), (3, 3));
        assert_eq!(
            files(&vault.join("Evernote/attachments")),
            ["First.gif", "Third.png", "memo.wav"]
        );
        // The memo is not shown in the text, so it is linked at the end.
        assert_eq!(
            text(&vault, "Evernote/First.md"),
            "Logo: ![[First.gif]]\n\n[[memo.wav]]\n"
        );
        assert_eq!(text(&vault, "Evernote/Second.md"), "Logo: ![[First.gif]]\n");
        assert_eq!(text(&vault, "Evernote/Third.md"), "![[Third.png]] inline\n");
        assert_eq!(
            fs::read(vault.join("Evernote/attachments/Third.png")).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn a_damaged_part_costs_only_itself() {
        let good = b"good bytes";
        let mut export = enex(&[
            note("Bad attachment", "<div>text stays</div>", "<resource><data encoding=\"base64\">!!! not base64 !!!</data><mime>image/png</mime></resource>"),
            note("Fine", "<div>fine</div>", &resource(good, "text/plain", Some("ok.txt"))),
            note("Cut off", "<div>never finished</div>", ""),
        ]);
        // The file stops in the middle of the third note.
        export.truncate(export.find("never finished").unwrap());
        let (vault, report) = run("damaged", &export);

        assert_eq!((report.notes, report.attachments), (2, 1));
        assert_eq!(text(&vault, "Evernote/Bad attachment.md"), "text stays\n");
        assert_eq!(text(&vault, "Evernote/Fine.md"), "fine\n\n[[ok.txt]]\n");
        let reasons: Vec<(&str, &str)> = report
            .skipped
            .iter()
            .map(|s| (s.name.as_str(), s.reason.as_str()))
            .collect();
        assert_eq!(reasons.len(), 2);
        assert_eq!(
            reasons[0],
            (
                "Bad attachment (attachment)",
                "The attachment's data is damaged."
            )
        );
        assert_eq!(reasons[1].0, "My Notes.enex");
        assert!(
            reasons[1]
                .1
                .ends_with("The notes before that point were imported."),
            "{}",
            reasons[1].1
        );
    }

    #[test]
    fn older_exports_and_escaped_bodies_are_read_too() {
        // Content before the dates, the body escaped instead of in CDATA,
        // an empty title, a task from Evernote's task list.
        let export = enex(&[
            "<note><title></title><content>&lt;en-note&gt;&lt;div&gt;escaped &amp;amp; fine&lt;/div&gt;&lt;/en-note&gt;</content><created>20200101T000000Z</created><tag/></note>".to_string(),
            "<note><title>With tasks</title><content><![CDATA[<en-note><div>Body</div></en-note>]]></content><task><title>Call Sam</title><taskStatus>open</taskStatus><dueDate>20240305T100000Z</dueDate></task><task><title>Pay bill</title><taskStatus>completed</taskStatus></task></note>".to_string(),
        ]);
        let (vault, report) = run("older", &export);
        assert_eq!(report.notes, 2);
        assert_eq!(
            text(&vault, "Evernote/Untitled.md"),
            "---\ncreated: 2020-01-01T00:00:00Z\n---\n\nescaped & fine\n"
        );
        assert_eq!(
            text(&vault, "Evernote/With tasks.md"),
            "Body\n\n- [ ] Call Sam (due 2024-03-05)\n- [x] Pay bill\n"
        );
    }

    #[test]
    fn a_folder_of_exports_becomes_a_folder_per_notebook() {
        let dir = scratch("folder");
        write(
            &dir,
            "exports/Work@@@Projects.enex",
            enex(&[note(
                "Roadmap",
                "<div>see <a href=\"evernote:///view/1/s1/x/x/\">Recipes</a></div>",
                "",
            )]),
        );
        write(
            &dir,
            "exports/Home.enex",
            enex(&[note("Recipes", "<div>soup</div>", "")]),
        );
        write(&dir, "exports/readme.txt", "not an export");
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Imported/Evernote").unwrap();
        import(&dir.join("exports"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 2);
        assert_eq!(
            files(&vault),
            [
                "Imported/Evernote/Home/Recipes.md",
                "Imported/Evernote/Work/Projects/Roadmap.md"
            ]
        );
        assert_eq!(
            text(&vault, "Imported/Evernote/Work/Projects/Roadmap.md"),
            "see [[Recipes]]\n"
        );
    }

    #[test]
    fn a_file_that_is_not_an_export_is_refused() {
        let dir = scratch("refused");
        write(&dir, "notes.enex", "just some text");
        write(&dir, "empty.enex", enex(&[]));
        write(&dir, "broken.enex", "<en-export><note><title>x</wrong>");
        fs::create_dir_all(dir.join("vault")).unwrap();
        fs::create_dir_all(dir.join("no-exports")).unwrap();
        for (source, expected) in [
            ("notes.enex", "No notes were found."),
            ("empty.enex", "No notes were found."),
            ("broken.enex", "The file is damaged"),
            ("missing.enex", "The file could not be opened"),
            ("no-exports", "The folder has no Evernote export"),
        ] {
            let mut out = Output::open(&dir.join("vault"), "In").unwrap();
            let refused = import(&dir.join(source), &mut out).unwrap_err();
            assert!(refused.starts_with(expected), "{source}: {refused}");
            out.remove_root_if_unused();
        }
        assert!(files(&dir.join("vault")).is_empty());
    }

    #[test]
    fn base64_is_decoded_however_it_is_cut_into_pieces() {
        let decode = |pieces: &[&str]| {
            let mut stream = Base64Stream::default();
            for piece in pieces {
                stream.push(piece.as_bytes());
            }
            stream.finish()
        };
        assert_eq!(decode(&["aGVsbG8gd29ybGQ="]).unwrap(), b"hello world");
        assert_eq!(
            decode(&["aGVs\nbG8g\r\n  d29y bGQ=\n"]).unwrap(),
            b"hello world"
        );
        assert_eq!(
            decode(&["a", "GV", "sbG8", "gd2", "9ybGQ", "="]).unwrap(),
            b"hello world"
        );
        assert_eq!(decode(&["aGVsbG8gd29ybGQ"]).unwrap(), b"hello world");
        assert_eq!(decode(&[]).unwrap(), b"");
        assert!(decode(&["aGVs", "!!!!"]).is_err());
    }

    #[test]
    fn empty_xml_elements_get_a_closing_tag_before_the_html_parser_sees_them() {
        assert_eq!(
            expand_empty_elements("<en-note><div/><en-todo checked=\"true\" />a<br/><en-media hash=\"a>b\" type='x/y'/><!-- <b/> --><img src=\"x\"/><td/></en-note>"),
            "<en-note><div></div><en-todo checked=\"true\" ></en-todo>a<br/><en-media hash=\"a>b\" type='x/y'></en-media><!-- <b/> --><img src=\"x\"/><td></td></en-note>"
        );
        assert_eq!(expand_empty_elements("no tags, 1 < 2"), "no tags, 1 < 2");
        assert_eq!(
            expand_empty_elements("<a href=\"unfinished"),
            "<a href=\"unfinished"
        );
        // Without this an empty bold would make the rest of the note bold.
        let enml =
            expand_empty_elements("<en-note><div><b/>plain</div><div><span/>text</div></en-note>");
        assert_eq!(
            html::to_markdown(&enml, &mut html::KeepLinks),
            "plain\n\ntext"
        );
    }
}
