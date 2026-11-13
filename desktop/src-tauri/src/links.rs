// Keeping links pointing at the same file when a note, an attachment or a
// folder is renamed or moved.
//
// The rule is one invariant: every link resolves to the same file after the
// rename as it did before. A link that still resolves correctly is left
// exactly as written. One that would break, or would start pointing at a
// different file that shares the name, is rewritten with the least change
// that keeps it on its file: the new name where a name is enough, and the
// path inside the vault where it is not.
//
// Two kinds of link are understood, each resolved the way the app resolves
// it when it is clicked or drawn:
//
//   [[Note]]  ![[Note#Heading|alias]]   a note, by name or by its whole path
//                                       inside the vault (the first note in
//                                       listing order wins a shared name)
//   ![[photo.png]]  [[paper.pdf]]       any other file, by its path, or by
//                                       name with the shallowest file winning
//   [[./Note]]  ![[../img/photo.png]]   a path from the folder of the note
//                                       the link is written in
//
//   [text](/Folder/Note.md)             a path from the top of the vault
//   [text](./Note.md)  ![](../a.png)    a path from the linking note's folder
//   [text](Folder/Note.md)              a path from the top of the vault if a
//                                       file is there, otherwise from the
//                                       linking note's folder, otherwise,
//                                       for a bare name, the way a wiki link
//                                       finds it
//
// A markdown link's path may be percent-encoded, may leave off a note's
// ".md", and may be followed by a `#heading` and a `"title"`.
//
// Because a link can depend on where its own note is, a note that moves has
// its own links looked at as well as the links to it: a path from its old
// folder is rewritten to lead to the same file from its new one. A link that
// is rewritten stays in the style it was written in: a path from the note
// stays one, a path from the top stays one, a bare name stays a bare name
// while the name is enough, and an encoded path stays encoded.
//
// Links inside fenced code blocks and inline code are examples, not links,
// and are never touched.
//
// The resolver is a second copy of the one in `src/lib/link-resolve.ts`
// (and of `findLinkedNote` in `src/lib/wiki-link-utils.ts`). All are tested
// against `src/lib/__fixtures__/link-resolution.json`; change them together.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================
// The files in a vault
// ============================================================

fn is_note(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// "Plan.md" and "Plan.markdown" are both the note "Plan".
fn strip_note_ext(name: &str) -> &str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".markdown") {
        &name[..name.len() - ".markdown".len()]
    } else if lower.ends_with(".md") {
        &name[..name.len() - ".md".len()]
    } else {
        name
    }
}

fn file_name(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

/// The folder a file is in, as a path inside the vault: "" at the top.
fn folder(rel: &str) -> &str {
    rel.rsplit_once('/').map_or("", |(folder, _)| folder)
}

/// `path` as read from `folder`, with "." and ".." worked out. `None` when
/// it climbs out of the vault.
fn join(folder: &str, path: &str) -> Option<String> {
    let mut parts: Vec<&str> = folder.split('/').filter(|part| !part.is_empty()).collect();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

/// The way from `folder` to the file `target`: "x.md", "sub/x.md" or
/// "../other/x.md".
fn relative_path(folder: &str, target: &str) -> String {
    let from: Vec<&str> = folder.split('/').filter(|part| !part.is_empty()).collect();
    let to: Vec<&str> = target.split('/').collect();
    let mut shared = 0;
    while shared < from.len() && shared + 1 < to.len() && from[shared] == to[shared] {
        shared += 1;
    }
    let mut parts = vec![".."; from.len() - shared];
    parts.extend(&to[shared..]);
    parts.join("/")
}

/// Whether a path says outright that it starts at the linking note's folder.
fn starts_relative(path: &str) -> bool {
    path.starts_with("./") || path.starts_with("../")
}

/// A path with each of its parts percent-encoded and the `/` between them
/// kept. The frontend's `encodePath` writes the same.
fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|part| urlencoding::encode(part).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

// ============================================================
// A markdown link's destination
// ============================================================

fn is_blank(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

/// `text` is a title on its own: blank space, then a quoted string, then
/// nothing.
fn is_title(text: &str) -> bool {
    let body = text.trim_matches([' ', '\t']);
    if body.is_empty() {
        return true;
    }
    if !text.as_bytes().first().is_some_and(|b| is_blank(*b)) || body.len() < 2 {
        return false;
    }
    let quote = body.as_bytes()[0];
    (quote == b'"' || quote == b'\'')
        && body.as_bytes()[body.len() - 1] == quote
        && body[1..].find(quote as char) == Some(body.len() - 2)
}

/// Where the file part of a destination is: still percent-encoded, without
/// `<>`, a `#fragment` or a title.
struct Destination {
    from: usize,
    to: usize,
}

/// Split the text between `](` and `)`:
///
///   path            path#fragment            path "title"
///   <path with spaces>                       <path> 'title'
///
/// A title is only a quoted string at the very end with a space before it.
/// Everything else is the path, spaces included, because the app has always
/// read `![](my photo.png)` that way. Mirrors `parseDestination` in the
/// frontend.
fn parse_destination(dest: &str) -> Destination {
    let bytes = dest.as_bytes();
    let mut start = 0;
    while start < bytes.len() && is_blank(bytes[start]) {
        start += 1;
    }
    let mut end = bytes.len();
    while end > start && is_blank(bytes[end - 1]) {
        end -= 1;
    }

    let (mut from, mut to) = (start, end);
    let close = if bytes.get(start) == Some(&b'<') {
        dest[start + 1..].find('>').map(|k| start + 1 + k)
    } else {
        None
    };
    match close {
        Some(close) if is_title(&dest[close + 1..]) => {
            from = start + 1;
            to = close;
        }
        _ => {
            let quote = if end - start >= 2 { bytes[end - 1] } else { 0 };
            if quote == b'"' || quote == b'\'' {
                if let Some(open) = dest[..end - 1].rfind(quote as char) {
                    if open > start && is_blank(bytes[open - 1]) {
                        let mut path_end = open;
                        while path_end > start && is_blank(bytes[path_end - 1]) {
                            path_end -= 1;
                        }
                        if path_end > start {
                            to = path_end;
                        }
                    }
                }
            }
        }
    }
    if let Some(hash) = dest[from..to].find('#') {
        to = from + hash;
    }
    Destination { from, to }
}

/// A web address, a mail address or inline data: never a file in the vault.
fn is_external(path: &str) -> bool {
    if path.contains("://") {
        return true;
    }
    path.split_once(':').is_some_and(|(scheme, _)| {
        ["mailto", "data", "tel", "sms", "file", "javascript", "blob", "about"]
            .iter()
            .any(|known| scheme.eq_ignore_ascii_case(known))
    })
}

/// Where the destination that opens at `start`, just after `](`, closes.
/// Parentheses inside it may pair up, as in `[x](My note (draft).md)`, and
/// a `<path>` may hold a lone one.
fn destination_end(line: &str, start: usize) -> Option<usize> {
    let rest = &line[start..];
    if rest.trim_start_matches([' ', '\t']).starts_with('<') {
        if let Some(close) = rest.find('>') {
            if let Some(end) = rest[close..].find(')') {
                if is_title(&rest[close + 1..close + end]) {
                    return Some(start + close + end);
                }
            }
        }
    }
    let mut depth = 0usize;
    for (i, byte) in rest.bytes().enumerate() {
        match byte {
            b'(' => depth += 1,
            b')' if depth == 0 => return Some(start + i),
            b')' => depth -= 1,
            _ => {}
        }
    }
    // Unpaired: the first one closes it, as it always did.
    rest.find(')').map(|k| start + k)
}

/// Every file in the vault as a path relative to it, with `/` between
/// folders. Hidden folders and files, `node_modules` and symbolic links are
/// left out, as they are from the app's own file listing.
pub(crate) fn list_vault(vault: &Path) -> Vec<String> {
    fn walk(dir: &Path, prefix: &str, out: &mut Vec<String>) {
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
            if file_type.is_symlink() {
                continue;
            }
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if file_type.is_dir() {
                walk(&entry.path(), &rel, out);
            } else {
                out.push(rel);
            }
        }
    }
    let mut out = Vec::new();
    walk(vault, "", &mut out);
    out.sort();
    out
}

/// How a link's file part is compared: `\` read as `/`, lower case.
fn key(text: &str) -> String {
    text.replace('\\', "/").to_lowercase()
}

/// What each kind of link resolves to, for one set of files.
pub(crate) struct Index {
    /// Note name (no extension, lower case) to the first note with it in listing order.
    note_by_name: HashMap<String, String>,
    /// Note path without extension, lower case.
    note_by_path: HashMap<String, String>,
    /// Any other file, by path, lower case.
    other_by_path: HashMap<String, String>,
    /// Any other file, by name, lower case: the shallowest wins.
    other_by_name: HashMap<String, String>,
    /// Every file by its exact path, and by its path in lower case.
    exact: HashMap<String, String>,
    exact_lower: HashMap<String, String>,
}

impl Index {
    /// `files` are vault-relative paths with `/`. Their order does not matter.
    pub(crate) fn new(files: &[String]) -> Index {
        Index::with_separator(files, std::path::MAIN_SEPARATOR)
    }

    /// The first note in listing order wins a shared name, so the order has
    /// to be the one `fs_list_all_files` gives the frontend. That listing
    /// sorts paths as the system writes them, and `\` sorts after the
    /// capital letters where `/` sorts before every letter: on Windows
    /// `AB\Plan.md` comes before `A\Plan.md`.
    fn with_separator(files: &[String], separator: char) -> Index {
        let mut sorted: Vec<&String> = files.iter().collect();
        if separator == '/' {
            sorted.sort();
        } else {
            sorted.sort_by_cached_key(|rel| rel.replace('/', &separator.to_string()));
        }

        let mut index = Index {
            note_by_name: HashMap::new(),
            note_by_path: HashMap::new(),
            other_by_path: HashMap::new(),
            other_by_name: HashMap::new(),
            exact: HashMap::new(),
            exact_lower: HashMap::new(),
        };
        // Other files are found by name shallowest first, then in path order.
        let mut others: Vec<&String> = Vec::new();
        for rel in sorted {
            index.exact.insert(rel.clone(), rel.clone());
            index
                .exact_lower
                .entry(rel.to_lowercase())
                .or_insert_with(|| rel.clone());
            if is_note(rel) {
                let name = key(strip_note_ext(file_name(rel)));
                index.note_by_name.entry(name).or_insert_with(|| rel.clone());
                index
                    .note_by_path
                    .entry(key(strip_note_ext(rel)))
                    .or_insert_with(|| rel.clone());
            } else {
                others.push(rel);
            }
        }
        others.sort_by_key(|rel| (rel.matches('/').count(), rel.as_str()));
        for rel in others {
            index
                .other_by_path
                .entry(key(rel))
                .or_insert_with(|| rel.clone());
            index
                .other_by_name
                .entry(key(file_name(rel)))
                .or_insert_with(|| rel.clone());
        }
        index
    }

    /// The note a wiki link's note part points at: by name, or by its whole
    /// path inside the vault. Mirrors `findLinkedNote` in the frontend.
    pub(crate) fn note(&self, target: &str) -> Option<&str> {
        let wanted = key(strip_note_ext(target.trim()));
        if wanted.is_empty() {
            return None;
        }
        if wanted.contains('/') {
            self.note_by_path.get(&wanted).map(String::as_str)
        } else {
            self.note_by_name.get(&wanted).map(String::as_str)
        }
    }

    /// A file that is not a note, as `![[photo.png]]` finds it: by its path,
    /// or failing that by its name.
    fn other(&self, target: &str) -> Option<&str> {
        let wanted = key(target.trim());
        if wanted.is_empty() {
            return None;
        }
        self.other_by_path
            .get(&wanted)
            .or_else(|| self.other_by_name.get(key(file_name(&wanted)).as_str()))
            .map(String::as_str)
    }

    /// What the file part of a `[[...]]` link points at, wherever the link
    /// is written. A target written with a file extension that is not a
    /// note's is looked up among the other files first, as an embed of it is.
    fn wiki(&self, target: &str) -> Option<&str> {
        let name = file_name(target.trim());
        let has_other_ext = !is_note(name)
            && name
                .rsplit_once('.')
                .is_some_and(|(stem, ext)| !stem.is_empty() && !ext.is_empty() && !ext.contains(' '));
        if has_other_ext {
            self.other(target).or_else(|| self.note(target))
        } else {
            self.note(target).or_else(|| self.other(target))
        }
    }

    /// As `wiki`, but a target written as a path has to be that path: the
    /// fallback to the bare name does not count.
    fn wiki_exact(&self, target: &str) -> Option<&str> {
        let wanted = key(target.trim());
        if !wanted.contains('/') {
            return self.wiki(target);
        }
        self.note_by_path
            .get(key(strip_note_ext(target.trim())).as_str())
            .or_else(|| self.other_by_path.get(&wanted))
            .map(String::as_str)
    }

    /// The file a wiki link names by a path from the note `from` that it is
    /// written in: a target that starts with "./" or "../". `None` for any
    /// other target, and when nothing is at the end of the path.
    fn wiki_beside(&self, from: &str, target: &str) -> Option<&str> {
        let path = target.trim().replace('\\', "/");
        if !starts_relative(&path) {
            return None;
        }
        self.file_at(&join(folder(from), &path)?)
    }

    /// What the file part of a `[[...]]` link points at, from the note
    /// `from` that it is written in. A path from that note's folder comes
    /// first; anything else, and such a path with nothing at the end of it,
    /// is found the way it always was.
    fn wiki_from(&self, from: &str, target: &str) -> Option<&str> {
        self.wiki_beside(from, target).or_else(|| self.wiki(target))
    }

    /// As `wiki_from`, but a target written as a path has to be that path.
    fn wiki_exact_from(&self, from: &str, target: &str) -> Option<&str> {
        self.wiki_beside(from, target)
            .or_else(|| self.wiki_exact(target))
    }

    /// Where the file part of a target ends and its `#heading` or `#^block`
    /// begins. The app tries the whole target, so a note with "#" in its name
    /// is found, and then the part before the first "#". A later "#" is
    /// tried after that, longest name first, for a heading link to a note
    /// with "#" in its name.
    fn split_target<'t>(&self, from: &str, target: &'t str) -> Option<(&'t str, &'t str)> {
        if self.wiki_from(from, target).is_some() {
            return Some((target, ""));
        }
        let hashes: Vec<usize> = target.match_indices('#').map(|(i, _)| i).collect();
        let (first, later) = hashes.split_first()?;
        std::iter::once(first)
            .chain(later.iter().rev())
            .map(|i| target.split_at(*i))
            .find(|(file, _)| self.wiki_from(from, file.trim()).is_some())
    }

    /// A file by its path from the top of the vault, exactly or with the
    /// letter case ignored.
    fn at(&self, rel: &str) -> Option<&str> {
        self.exact
            .get(rel)
            .or_else(|| self.exact_lower.get(&rel.to_lowercase()))
            .map(String::as_str)
    }

    /// The file at a place in the vault. A note's ".md" may be left off.
    fn file_at(&self, rel: &str) -> Option<&str> {
        if rel.is_empty() {
            return None;
        }
        self.at(rel)
            .or_else(|| self.note_by_path.get(&key(rel)).map(String::as_str))
    }

    /// What the file part of a markdown link points at, once decoded, and
    /// which reading of it found the file:
    ///
    ///   /path       from the top of the vault
    ///   ./path      from the folder of the note the link is in ("../" too).
    ///               "./path" with nothing there is read from the top of the
    ///               vault, which is how the app read it before it knew
    ///               relative paths.
    ///   path        from the top of the vault if a file is there; otherwise
    ///               from the note's folder; otherwise, when it is a bare
    ///               name, the way a wiki link finds it.
    fn markdown_path(&self, from: &str, path: &str) -> Option<(&str, Read)> {
        if path.is_empty() {
            return None;
        }
        let top = || join("", path).and_then(|rel| self.file_at(&rel));
        if path.starts_with('/') {
            return top().map(|file| (file, Read::Slash));
        }
        let beside = join(folder(from), path).and_then(|rel| self.file_at(&rel));
        if starts_relative(path) {
            return match beside {
                Some(file) => Some((file, Read::FromNote)),
                None if path.starts_with("./") => top().map(|file| (file, Read::DotFromTop)),
                None => None,
            };
        }
        top()
            .map(|file| (file, Read::Top))
            .or(beside.map(|file| (file, Read::Beside)))
            .or_else(|| {
                if path.contains('/') {
                    return None;
                }
                self.wiki(path).map(|file| (file, Read::Name))
            })
    }

    /// The file a markdown link's path points at, from the note `from` that
    /// it is written in. `written` is the file part of the destination (see
    /// `parse_destination`): it is read percent-decoded first, and then as
    /// written, for a file whose name really holds a "%20".
    fn markdown(&self, from: &str, written: &str) -> Option<MarkdownHit<'_>> {
        if is_external(written) {
            return None;
        }
        // Sequences that do not spell valid text leave only the second reading.
        let decoded = urlencoding::decode(written).ok().map(|d| d.into_owned());
        if let Some(decoded) = decoded.as_deref() {
            if let Some((file, read)) = self.markdown_path(from, decoded) {
                return Some(MarkdownHit {
                    file,
                    read,
                    encoded: decoded != written,
                    path: decoded.to_string(),
                });
            }
            if decoded == written {
                return None;
            }
        }
        self.markdown_path(from, written)
            .map(|(file, read)| MarkdownHit {
                file,
                read,
                encoded: false,
                path: written.to_string(),
            })
    }
}

/// Which reading of a markdown link's path found its file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Read {
    /// "/path": from the top of the vault.
    Slash,
    /// "./path" or "../path": from the linking note's folder.
    FromNote,
    /// "./path" with nothing at that place, read from the top of the vault.
    DotFromTop,
    /// A plain path, found at the top of the vault.
    Top,
    /// A plain path, found from the linking note's folder.
    Beside,
    /// A bare name, found the way a wiki link finds it.
    Name,
}

/// What a markdown link's path resolved to, and how.
struct MarkdownHit<'a> {
    file: &'a str,
    read: Read,
    /// The path that found the file: decoded, or as written.
    path: String,
    /// Whether it had to be decoded: `My%20note.md`.
    encoded: bool,
}

// ============================================================
// One rename
// ============================================================

/// A rename or move of one file or folder, as the two sets of files it
/// turns into each other.
pub(crate) struct Rename {
    old: Index,
    new: Index,
    /// Old path to new path, for every file that moved.
    moved: BTreeMap<String, String>,
}

impl Rename {
    /// `files` is the vault before the rename. `old_rel` is the file or
    /// folder being renamed and `new_rel` where it goes.
    pub(crate) fn new(files: &[String], old_rel: &str, new_rel: &str) -> Rename {
        let folder = format!("{old_rel}/");
        let mut moved = BTreeMap::new();
        let after: Vec<String> = files
            .iter()
            .map(|rel| {
                let to = if rel == old_rel {
                    Some(new_rel.to_string())
                } else {
                    rel.strip_prefix(&folder)
                        .map(|rest| format!("{new_rel}/{rest}"))
                };
                match to {
                    Some(to) => {
                        moved.insert(rel.clone(), to.clone());
                        to
                    }
                    None => rel.clone(),
                }
            })
            .collect();
        Rename {
            old: Index::new(files),
            new: Index::new(&after),
            moved,
        }
    }

    /// Where a file is after the rename.
    fn after<'a>(&'a self, rel: &'a str) -> &'a str {
        self.moved.get(rel).map(String::as_str).unwrap_or(rel)
    }

    /// The text between `[[` and `]]`, rewritten, or `None` to leave it.
    fn wiki_inner(&self, inner: &str, note: &Place) -> Option<String> {
        // "Note|alias", or "Note\|alias" inside a table.
        let (target, suffix) = match inner.find('|') {
            Some(i) if i > 0 && inner.as_bytes()[i - 1] == b'\\' => inner.split_at(i - 1),
            Some(i) => inner.split_at(i),
            None => (inner, ""),
        };
        let core = target.trim();
        if core.is_empty() || core.starts_with('#') {
            return None;
        }
        let lead = &target[..target.len() - target.trim_start().len()];
        let trail = &target[target.trim_end().len()..];

        let (file, fragment) = self.old.split_target(note.before, core)?;
        let file_trimmed = file.trim();
        let before = self.old.wiki_from(note.before, file_trimmed)?;
        let expected = self.after(before);
        let has_path = file_trimmed.contains('/') || file_trimmed.contains('\\');
        // Written as a path from the linking note's folder, and found there.
        let from_note = self.old.wiki_beside(note.before, file_trimmed) == Some(before);
        // A link written as a path has to stay a path that leads to the
        // file, if it was one before or the file has moved. Still being
        // found by name alone would leave a path that leads nowhere.
        let must_be_exact = has_path
            && (self.moved.contains_key(before)
                || self.old.wiki_exact_from(note.before, file_trimmed) == Some(before));
        let still_right = if must_be_exact {
            self.new.wiki_exact_from(note.after, file_trimmed) == Some(expected)
        } else {
            self.new.wiki_from(note.after, file_trimmed) == Some(expected)
        };
        if still_right {
            return None;
        }

        // The least change that lands on the file, in the style it was
        // written in: a path from the note stays one, a path from the top of
        // the vault stays one, and a bare name stays a bare name if the name
        // is enough.
        let keep_ext = !is_note(expected) || is_note(file_trimmed);
        let shown = |rel: &str| -> String {
            if keep_ext {
                rel.to_string()
            } else {
                strip_note_ext(rel).to_string()
            }
        };
        let beside = |rel: &str| -> String {
            let path = relative_path(folder(note.after), rel);
            if path.starts_with("../") {
                path
            } else {
                format!("./{path}")
            }
        };
        let by_name = shown(file_name(expected));
        let by_path = shown(expected);
        let mut candidates = if from_note {
            vec![beside(&by_path)]
        } else if has_path {
            vec![by_path.clone()]
        } else {
            vec![by_name, by_path.clone()]
        };
        // When none of those lands on the file: its path with the extension,
        // and last a path from the note, which is read exactly. That is the
        // one way to name a note at the top of the vault that shares its name
        // with a note listed before it.
        candidates.extend([expected.to_string(), beside(&by_path), beside(expected)]);

        // Spaces between the name and a "#" are kept where they were.
        let gap = &file[file.trim_end().len()..];
        let new_file = candidates.into_iter().find(|candidate| {
            // "]" and "|" end a wiki link wherever they appear.
            if candidate.contains([']', '|']) {
                return false;
            }
            // Read back whole, the way the app will read it: the file, then
            // the heading that was there.
            let written = format!("{candidate}{gap}{fragment}");
            self.new.wiki_exact_from(note.after, candidate) == Some(expected)
                && self
                    .new
                    .split_target(note.after, &written)
                    .is_some_and(|(file, rest)| file.trim() == candidate && rest == fragment)
        })?;

        Some(format!("{lead}{new_file}{gap}{fragment}{trail}{suffix}"))
    }

    /// The text between `](` and `)`, rewritten, or `None` to leave it.
    fn markdown_dest(&self, dest: &str, note: &Place) -> Option<String> {
        let place = parse_destination(dest);
        let written = &dest[place.from..place.to];
        let hit = self.old.markdown(note.before, written)?;
        let expected = self.after(hit.file);
        let now = self.new.markdown(note.after, written);
        if now.is_some_and(|now| now.file == expected) {
            return None;
        }

        // The path to the file's new place, in the style the link was
        // written in. A note's ".md" is left off if it was left off.
        let keep_ext = !is_note(expected) || is_note(&hit.path);
        let top = if keep_ext {
            expected.to_string()
        } else {
            strip_note_ext(expected).to_string()
        };
        let beside = relative_path(folder(note.after), &top);
        // From the note's folder. A path that goes up says so itself; one
        // that does not is written bare when that is read as relative, and
        // with "./" when the bare path would be found somewhere else first.
        let from_note = |dotted: bool| -> Vec<String> {
            if beside.starts_with("../") {
                vec![beside.clone()]
            } else if dotted {
                vec![format!("./{beside}")]
            } else {
                vec![beside.clone(), format!("./{beside}")]
            }
        };
        let mut candidates = match hit.read {
            Read::Slash => vec![format!("/{top}")],
            Read::FromNote => from_note(hit.path.starts_with("./")),
            Read::DotFromTop => vec![format!("./{top}")],
            Read::Top => Vec::new(),
            Read::Beside => from_note(false),
            Read::Name => vec![file_name(&top).to_string()],
        };
        // When none of those lands on the file: its path from the top of the
        // vault, and last that path with a leading "/", which is read exactly.
        candidates.extend([top.clone(), format!("/{top}"), format!("/{expected}")]);

        for candidate in candidates {
            // Written encoded, so kept encoded. A path written as it is
            // stays so, unless the new name cannot stand in a link: a ")"
            // or a "#" in it would cut the path short.
            let forms = if hit.encoded {
                vec![encode_path(&candidate)]
            } else {
                vec![candidate.clone(), encode_path(&candidate)]
            };
            for form in forms {
                let new_dest = format!("{}{}{}", &dest[..place.from], form, &dest[place.to..]);
                if self.reads_as(&new_dest, &form, note.after, expected) {
                    return Some(new_dest);
                }
            }
        }
        None
    }

    /// Whether a rewritten destination, read back whole the way the app
    /// will read it, has `path` for its file part and leads to `expected`.
    fn reads_as(&self, dest: &str, path: &str, from: &str, expected: &str) -> bool {
        let closed = format!("{dest})");
        let place = parse_destination(dest);
        destination_end(&closed, 0) == Some(dest.len())
            && &dest[place.from..place.to] == path
            && self
                .new
                .markdown(from, path)
                .is_some_and(|hit| hit.file == expected)
    }

    /// A note's text with its links rewritten, or `None` when no link in it
    /// needs to change. `note` is the note's path before the rename; where
    /// it is afterwards follows from the rename. Its place matters because a
    /// link can be a path from the folder of the note it is written in.
    pub(crate) fn rewrite(&self, note: &str, content: &str) -> Option<Rewritten> {
        if !content.contains("[[") && !content.contains("](") {
            return None;
        }
        let note = Place {
            before: note,
            after: self.after(note),
        };
        let mut out = String::with_capacity(content.len() + 64);
        let mut changes: Vec<(String, String)> = Vec::new();
        let mut links = 0usize;
        // The fence that opened the code block we are inside, if any.
        let mut fence: Option<(char, usize)> = None;

        for line in content.split_inclusive('\n') {
            let trimmed = line.trim_start();
            let indent = line.len() - trimmed.len();
            let marker = trimmed.chars().next().filter(|c| *c == '`' || *c == '~');
            let run = marker.map_or(0, |m| trimmed.chars().take_while(|c| *c == m).count());

            if let Some((open, length)) = fence {
                out.push_str(line);
                let closes = marker == Some(open)
                    && run >= length
                    && trimmed[run..].trim().is_empty();
                if closes {
                    fence = None;
                }
                continue;
            }
            if indent <= 3 && run >= 3 {
                // A backtick fence cannot have a backtick in its info string.
                let opens = marker != Some('`') || !trimmed[run..].contains('`');
                if opens {
                    fence = marker.map(|m| (m, run));
                    out.push_str(line);
                    continue;
                }
            }
            links += self.rewrite_line(line, &note, &mut out, &mut changes);
        }

        if links == 0 {
            return None;
        }
        changes.sort();
        changes.dedup();
        Some(Rewritten {
            text: out,
            links,
            changes,
        })
    }

    /// Copy one line that is not inside a code block to `out`, rewriting its
    /// links. Returns how many changed.
    fn rewrite_line(
        &self,
        line: &str,
        note: &Place,
        out: &mut String,
        changes: &mut Vec<(String, String)>,
    ) -> usize {
        let bytes = line.as_bytes();
        let mut links = 0;
        let mut i = 0;
        // Everything before `copied` is already in `out`.
        let mut copied = 0;

        while i < bytes.len() {
            match bytes[i] {
                b'`' => {
                    // Inline code: skip to the closing run of the same length.
                    let run = bytes[i..].iter().take_while(|b| **b == b'`').count();
                    let mut j = i + run;
                    let mut close = None;
                    while j < bytes.len() {
                        if bytes[j] == b'`' {
                            let n = bytes[j..].iter().take_while(|b| **b == b'`').count();
                            if n == run {
                                close = Some(j + n);
                                break;
                            }
                            j += n;
                        } else {
                            j += 1;
                        }
                    }
                    i = close.unwrap_or(i + run);
                }
                b'[' if bytes.get(i + 1) == Some(&b'[') => {
                    let start = i + 2;
                    // `[^\]]+` followed by `]]`, as the editor reads it.
                    let end = line[start..].find(']').map(|k| start + k);
                    match end {
                        Some(end) if end > start && bytes.get(end + 1) == Some(&b']') => {
                            let inner = &line[start..end];
                            if let Some(new_inner) = self.wiki_inner(inner, note) {
                                out.push_str(&line[copied..start]);
                                out.push_str(&new_inner);
                                copied = end;
                                links += 1;
                                changes.push((format!("[[{inner}]]"), format!("[[{new_inner}]]")));
                            }
                            i = end + 2;
                        }
                        _ => i += 2,
                    }
                }
                b']' if bytes.get(i + 1) == Some(&b'(') => {
                    let start = i + 2;
                    match destination_end(line, start) {
                        Some(end) if end > start => {
                            let dest = &line[start..end];
                            if let Some(new_dest) = self.markdown_dest(dest, note) {
                                out.push_str(&line[copied..start]);
                                out.push_str(&new_dest);
                                copied = end;
                                links += 1;
                                changes.push((format!("]({dest})"), format!("]({new_dest})")));
                                i = end + 1;
                            } else {
                                // Not a link to a file. Whatever follows its
                                // first ")" is looked at on its own, as it
                                // was before paired parentheses were read.
                                i = line[start..].find(')').map_or(end, |k| start + k) + 1;
                            }
                        }
                        _ => i += 2,
                    }
                }
                _ => i += 1,
            }
        }
        out.push_str(&line[copied..]);
        links
    }
}

/// Where the note being rewritten is, as paths inside the vault.
struct Place<'a> {
    before: &'a str,
    after: &'a str,
}

/// A note's text after a rename.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Rewritten {
    pub text: String,
    /// How many links changed.
    pub links: usize,
    /// Each distinct change as written, brackets included: `[[Old]]` to
    /// `[[New]]`. The frontend applies these to a note that was edited while
    /// the vault was being scanned.
    pub changes: Vec<(String, String)>,
}

// ============================================================
// Doing it to a vault
// ============================================================

/// A note that is open in the app when the rename happens.
pub(crate) struct OpenNote {
    /// Its path as the app knows it, before the rename.
    pub path: String,
    /// Its text in the editor, when that differs from what is on disk.
    pub unsaved: Option<String>,
}

/// What changed for one open note.
#[derive(Debug)]
pub(crate) struct OpenNoteUpdate {
    /// The path the app gave, unchanged, so it can find its own tab.
    pub path: String,
    /// The note's text on disk now, when the rename changed it.
    pub saved: Option<String>,
    /// The unsaved text with the same links rewritten, when it had any.
    pub unsaved: Option<String>,
    pub changes: Vec<(String, String)>,
}

#[derive(Debug, Default)]
pub(crate) struct Report {
    /// Notes whose links were rewritten on disk.
    pub notes: usize,
    pub links: usize,
    /// Notes that needed a change and could not be written.
    pub failed: usize,
    pub open: Vec<OpenNoteUpdate>,
}

fn to_rel(vault: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(vault).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn to_abs(vault: &Path, rel: &str) -> PathBuf {
    let mut path = vault.to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    path
}

/// Replace a note's text without ever leaving a half-written file: the new
/// text goes to a file beside it, which then takes its place.
fn replace_file(path: &Path, text: &str) -> std::io::Result<()> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let part = path.with_file_name(format!(".{name}.noteriv-part"));
    fs::write(&part, text)?;
    if let Ok(meta) = fs::metadata(path) {
        let _ = fs::set_permissions(&part, meta.permissions());
    }
    fs::rename(&part, path).inspect_err(|_| {
        let _ = fs::remove_file(&part);
    })
}

/// Rename or move a file or folder inside a vault and rewrite the links
/// that the rename would break.
///
/// Fails, changing nothing, when the rename itself cannot be done. After
/// that each note stands alone: one that cannot be rewritten is counted in
/// `failed` and the rest are still updated.
pub(crate) fn rename_and_update(
    vault: &Path,
    old_path: &Path,
    new_path: &Path,
    open: Vec<OpenNote>,
) -> Result<Report, String> {
    let old_rel = to_rel(vault, old_path).ok_or("That file is not inside the vault.")?;
    let new_rel = to_rel(vault, new_path).ok_or("The new place is not inside the vault.")?;
    if !old_path.exists() {
        return Err("The file to rename no longer exists.".into());
    }
    // `rename` replaces whatever is at the new path without a word. The one
    // case where something may already be there is a change of letter case on
    // a system that ignores case, where the new name is the same file.
    if new_path.exists() {
        let same_file = matches!(
            (dunce::canonicalize(old_path), dunce::canonicalize(new_path)),
            (Ok(a), Ok(b)) if a == b
        );
        if !same_file {
            return Err("Something with that name already exists there.".into());
        }
    }

    let files = list_vault(vault);
    fs::rename(old_path, new_path).map_err(|e| format!("The rename failed: {e}"))?;
    let rename = Rename::new(&files, &old_rel, &new_rel);

    // The app's paths for its open notes, as they are after the rename.
    let mut open_by_rel: HashMap<String, OpenNote> = HashMap::new();
    for note in open {
        if let Some(rel) = to_rel(vault, Path::new(&note.path)) {
            open_by_rel.insert(rename.after(&rel).to_string(), note);
        }
    }

    let mut report = Report::default();
    // Each note under the path it had and the path it has now: a link in it
    // may be a path from its own folder.
    let notes = files
        .iter()
        .map(|was| (was.as_str(), rename.after(was)))
        .filter(|(_, rel)| is_note(rel));
    for (was, rel) in notes {
        let path = to_abs(vault, rel);
        let open_note = open_by_rel.remove(rel);
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        let on_disk = rename.rewrite(was, &content);
        let mut saved = None;
        let mut changes = Vec::new();
        if let Some(rewritten) = on_disk {
            match replace_file(&path, &rewritten.text) {
                Ok(()) => {
                    report.notes += 1;
                    report.links += rewritten.links;
                    changes = rewritten.changes;
                    saved = Some(rewritten.text);
                }
                Err(e) => {
                    log::warn!("[links] could not update {}: {e}", path.display());
                    report.failed += 1;
                }
            }
        }

        if let Some(note) = open_note {
            let unsaved = note
                .unsaved
                .as_deref()
                .and_then(|text| rename.rewrite(was, text))
                .map(|rewritten| {
                    changes.extend(rewritten.changes);
                    rewritten.text
                });
            if saved.is_some() || unsaved.is_some() {
                changes.sort();
                changes.dedup();
                report.open.push(OpenNoteUpdate {
                    path: note.path,
                    saved,
                    unsaved,
                    changes,
                });
            }
        }
    }
    Ok(report)
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn files(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    /// The file part of every `[[...]]` in a text, in order, code included.
    fn wiki_targets(text: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut rest = text;
        while let Some(start) = rest.find("[[") {
            let after = &rest[start + 2..];
            let Some(end) = after.find("]]") else { break };
            let inner = &after[..end];
            let target = inner.split('|').next().unwrap_or("").trim_end_matches('\\');
            out.push(target.trim().to_string());
            rest = &after[end + 2..];
        }
        out
    }

    /// The text between `](` and each closing `)` in a text, in order, code
    /// included.
    fn markdown_dests(text: &str) -> Vec<String> {
        let mut out = Vec::new();
        for line in text.lines() {
            let mut at = 0;
            while let Some(found) = line[at..].find("](") {
                let start = at + found + 2;
                let Some(end) = destination_end(line, start) else { break };
                out.push(line[start..end].to_string());
                at = end + 1;
            }
        }
        out
    }

    /// What a `[[target]]` written in the note `from` resolves to.
    fn resolves(index: &Index, from: &str, target: &str) -> Option<String> {
        let (file, _) = index.split_target(from, target)?;
        index.wiki_from(from, file.trim()).map(str::to_string)
    }

    /// What a `](dest)` written in the note `from` resolves to.
    fn leads_to(index: &Index, from: &str, dest: &str) -> Option<String> {
        let place = parse_destination(dest);
        index
            .markdown(from, &dest[place.from..place.to])
            .map(|hit| hit.file.to_string())
    }

    // ── The resolver ──

    #[test]
    fn notes_resolve_the_way_the_frontend_resolves_them() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/__fixtures__/link-resolution.json"))
                .expect("the fixture is JSON");
        let notes: Vec<String> = fixture["notes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_str().unwrap().to_string())
            .collect();
        let index = Index::new(&notes);
        let cases = fixture["cases"].as_array().unwrap();
        assert!(cases.len() > 15);
        for case in cases {
            let target = case["target"].as_str().unwrap();
            assert_eq!(
                index.note(target),
                case["expect"].as_str(),
                "[[{target}]]"
            );
        }
    }

    #[test]
    fn links_resolve_from_their_note_the_way_the_frontend_resolves_them() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/__fixtures__/link-resolution.json"))
                .expect("the fixture is JSON");
        let vault: Vec<String> = fixture["vault"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_str().unwrap().to_string())
            .collect();
        let index = Index::with_separator(&vault, '/');
        let links = fixture["links"].as_array().unwrap();
        assert!(links.len() > 60);
        for link in links {
            let from = link["from"].as_str().unwrap();
            let expect = link["expect"].as_str();
            if let Some(dest) = link["markdown"].as_str() {
                let place = parse_destination(dest);
                let path = &dest[place.from..place.to];
                assert_eq!(
                    is_external(path),
                    link["external"].as_bool().unwrap_or(false),
                    "]({dest})"
                );
                assert_eq!(
                    index.markdown(from, path).map(|hit| hit.file),
                    expect,
                    "]({dest}) in {from}"
                );
                if let Some(fragment) = link["fragment"].as_str() {
                    // The heading runs from the path to the title, if there is one.
                    let rest = &dest[place.to..];
                    assert!(rest.starts_with(fragment), "]({dest}): {rest:?}");
                    assert!(is_title(&rest[fragment.len()..]) || rest[fragment.len()..].starts_with('>'));
                }
            } else {
                let target = link["wiki"].as_str().expect("a markdown or a wiki link");
                assert_eq!(index.wiki_from(from, target), expect, "[[{target}]] in {from}");
            }
        }
    }

    #[test]
    fn a_destination_is_split_into_its_path_its_heading_and_its_title() {
        let path = |dest: &'static str| {
            let place = parse_destination(dest);
            &dest[place.from..place.to]
        };
        assert_eq!(path("a.png"), "a.png");
        assert_eq!(path("  a.png  "), "a.png");
        assert_eq!(path("my photo.png"), "my photo.png");
        assert_eq!(path("my photo.png \"A title\""), "my photo.png");
        assert_eq!(path("a.png 'x'"), "a.png");
        assert_eq!(path("<my files/a b.png#x> \"A title\" "), "my files/a b.png");
        assert_eq!(path("Note.md#Heading \"t\""), "Note.md");
        assert_eq!(path("#Heading"), "");
        // Only a quoted string at the very end is a title.
        assert_eq!(path("my \"great\" photo.png"), "my \"great\" photo.png");
        assert_eq!(path("a \"b\" c.png \"title\""), "a \"b\" c.png");
        assert_eq!(path("\"title\""), "\"title\"");
        assert_eq!(path("a.png 'it''s'"), "a.png 'it''s'");
        // An unfinished <path is a plain path.
        assert_eq!(path("<a.png"), "<a.png");
        assert_eq!(path("<a>b.png"), "<a>b.png");

        // Where a destination closes: parentheses inside it may pair up.
        assert_eq!(destination_end("[x](a.md) (b)", 4), Some(8));
        assert_eq!(destination_end("[x](My note (draft).md) c", 4), Some(22));
        assert_eq!(destination_end("[x](<a) b.md>) c", 4), Some(13));
        assert_eq!(destination_end("[x](a (b.md) c", 4), Some(11));
        assert_eq!(destination_end("[x](a.md", 4), None);
    }

    #[test]
    fn percent_sequences_are_read_the_way_the_frontend_reads_them() {
        // The frontend has its own decoder and encoder; these are the cases
        // its tests pin too.
        let decode = |text: &str| urlencoding::decode(text).ok().map(|d| d.into_owned());
        assert_eq!(decode("100%.md").as_deref(), Some("100%.md"));
        assert_eq!(decode("100% done").as_deref(), Some("100% done"));
        assert_eq!(decode("%4%41").as_deref(), Some("%4A"));
        assert_eq!(decode("a%2").as_deref(), Some("a%2"));
        assert_eq!(decode("%FF"), None);
        assert_eq!(decode("%C3%zz%A9"), None);
        assert_eq!(encode_path("My files/a b (1).png"), "My%20files/a%20b%20%281%29.png");
        assert_eq!(encode_path("Notes/C# 100%.md"), "Notes/C%23%20100%25.md");
        assert_eq!(encode_path("Café/it's~ok_-.md"), "Caf%C3%A9/it%27s~ok_-.md");
    }

    #[test]
    fn paths_are_joined_and_walked_between_folders() {
        assert_eq!(join("A/B", "c.md").as_deref(), Some("A/B/c.md"));
        assert_eq!(join("A/B", "./c.md").as_deref(), Some("A/B/c.md"));
        assert_eq!(join("A/B", "../../c.md").as_deref(), Some("c.md"));
        assert_eq!(join("A/B", "../../../c.md"), None);
        assert_eq!(join("", "/a//b/./c.md").as_deref(), Some("a/b/c.md"));
        assert_eq!(relative_path("A/B", "A/B/c.md"), "c.md");
        assert_eq!(relative_path("A/B", "A/B/C/d.md"), "C/d.md");
        assert_eq!(relative_path("A/B", "A/c.md"), "../c.md");
        assert_eq!(relative_path("A/B", "X/c.md"), "../../X/c.md");
        assert_eq!(relative_path("", "X/c.md"), "X/c.md");
        assert_eq!(relative_path("A", "c.md"), "../c.md");
        // A folder and a file with the same name are different things.
        assert_eq!(relative_path("A/B", "A/B"), "../B");
    }

    #[test]
    fn a_shared_name_goes_to_the_first_note_in_the_systems_own_listing_order() {
        // "A/Plan" and "AB/Plan": which is listed first depends on how the
        // system writes the separator, and the app's listing is sorted that way.
        let notes = files(&["A/Plan.md", "AB/Plan.md", "a/lower.md", "Z/lower.md"]);
        let unix = Index::with_separator(&notes, '/');
        assert_eq!(unix.note("Plan"), Some("A/Plan.md"));
        let windows = Index::with_separator(&notes, '\\');
        assert_eq!(windows.note("Plan"), Some("AB/Plan.md"));
        // Where the separator plays no part, the order is the same.
        assert_eq!(unix.note("lower"), Some("Z/lower.md"));
        assert_eq!(windows.note("lower"), Some("Z/lower.md"));
        // A path names its note on either system.
        assert_eq!(windows.note("A/Plan"), Some("A/Plan.md"));
        assert_eq!(windows.note("a\\plan"), Some("A/Plan.md"));
    }

    #[test]
    fn other_files_are_found_by_path_then_by_name_shallowest_first() {
        let index = Index::new(&files(&[
            "Notes/photo.png.md",
            "attachments/deep/photo.png",
            "img/photo.png",
            "img/Diagram.SVG",
            "paper.pdf",
            "z/paper.pdf",
        ]));
        assert_eq!(index.wiki("img/photo.png"), Some("img/photo.png"));
        assert_eq!(index.wiki("attachments/deep/photo.png"), Some("attachments/deep/photo.png"));
        assert_eq!(index.wiki("photo.png"), Some("img/photo.png"));
        assert_eq!(index.wiki("PHOTO.PNG"), Some("img/photo.png"));
        // A path that is not there falls back to the name, as an embed does.
        assert_eq!(index.wiki("old/place/photo.png"), Some("img/photo.png"));
        assert_eq!(index.wiki("diagram.svg"), Some("img/Diagram.SVG"));
        assert_eq!(index.wiki("paper.pdf"), Some("paper.pdf"));
        assert_eq!(index.wiki("missing.png"), None);
        // A dot in a note's name is not a file extension.
        let notes = Index::new(&files(&["Notes/v1.2 plan.md", "Notes/report.final.md"]));
        assert_eq!(notes.wiki("v1.2 plan"), Some("Notes/v1.2 plan.md"));
        assert_eq!(notes.wiki("report.final"), Some("Notes/report.final.md"));
    }

    // ── Rewriting one note ──

    const VAULT: &[&str] = &[
        "Inbox.md",
        "Projects/Plan.md",
        "Projects/Deep/Spec.md",
        "Archive/Plan.md",
        "Notes/C# basics.md",
        "Notes/Daily.md",
        "attachments/photo.png",
        "attachments/paper.pdf",
        "img/logo.svg",
    ];

    /// The note most tests write their links in. It is at the top of the
    /// vault, where a path from the note and a path from the top are the same.
    const NOTE: &str = "Inbox.md";

    fn after(old: &str, new: &str, text: &str) -> String {
        after_in(NOTE, old, new, text)
    }

    /// `text`, written in `note`, after renaming `old` to `new`.
    fn after_in(note: &str, old: &str, new: &str, text: &str) -> String {
        let rename = Rename::new(&files(VAULT), old, new);
        rename
            .rewrite(note, text)
            .map(|r| r.text)
            .unwrap_or_else(|| text.to_string())
    }

    #[test]
    fn a_renamed_note_keeps_its_links_in_every_form() {
        let text = "\
See [[Inbox]] and [[inbox|my inbox]].
Heading [[Inbox#Today]], block [[Inbox#^abc]], nested [[Inbox#A#B|x]].
Embeds: ![[Inbox]] and ![[Inbox#Today]].
With the extension: [[Inbox.md]]. Spaced: [[ Inbox ]] and [[Inbox #Today]].
Untouched: [[Projects/Plan]], [[Missing]], [[#Top]], [[]].
";
        let expected = "\
See [[Home]] and [[Home|my inbox]].
Heading [[Home#Today]], block [[Home#^abc]], nested [[Home#A#B|x]].
Embeds: ![[Home]] and ![[Home#Today]].
With the extension: [[Home.md]]. Spaced: [[ Home ]] and [[Home #Today]].
Untouched: [[Projects/Plan]], [[Missing]], [[#Top]], [[]].
";
        assert_eq!(after("Inbox.md", "Home.md", text), expected);

        let rename = Rename::new(&files(VAULT), "Inbox.md", "Home.md");
        let rewritten = rename.rewrite(NOTE, text).unwrap();
        assert_eq!(rewritten.links, 10);
        assert!(rewritten
            .changes
            .contains(&("[[Inbox#Today]]".to_string(), "[[Home#Today]]".to_string())));
    }

    #[test]
    fn a_moved_note_only_changes_links_that_named_its_folder() {
        // By name it is still found, so those links are left exactly as written.
        let text = "[[Spec]] [[spec#Scope]] [[Projects/Deep/Spec]] [[projects/deep/spec.md|the spec]]";
        assert_eq!(
            after("Projects/Deep/Spec.md", "Archive/Spec.md", text),
            "[[Spec]] [[spec#Scope]] [[Archive/Spec]] [[Archive/Spec.md|the spec]]"
        );
        // Nothing to do at all.
        let rename = Rename::new(&files(VAULT), "Projects/Deep/Spec.md", "Archive/Spec.md");
        assert_eq!(rename.rewrite(NOTE, "[[Spec]] and [[Inbox]]"), None);
    }

    #[test]
    fn a_renamed_or_moved_folder_carries_the_links_into_it() {
        let text = "[[Projects/Plan]] [[Projects/Deep/Spec#Scope]] [[Spec]] [[Archive/Plan]]";
        assert_eq!(
            after("Projects", "Work", text),
            "[[Work/Plan]] [[Work/Deep/Spec#Scope]] [[Spec]] [[Archive/Plan]]"
        );
        assert_eq!(
            after("Projects/Deep", "Archive/Deep", text),
            "[[Projects/Plan]] [[Archive/Deep/Spec#Scope]] [[Spec]] [[Archive/Plan]]"
        );
    }

    #[test]
    fn a_link_stays_on_its_note_when_two_notes_share_a_name() {
        // "Plan" is two notes. By name it is the first in listing order: Archive/Plan.
        let text = "[[Plan]] [[Projects/Plan]] [[Archive/Plan]]";

        // Renaming the one the bare name pointed at renames that link only.
        assert_eq!(
            after("Archive/Plan.md", "Archive/Old plan.md", text),
            "[[Old plan]] [[Projects/Plan]] [[Archive/Old plan]]"
        );
        // Renaming the other one leaves the bare link where it was.
        assert_eq!(
            after("Projects/Plan.md", "Projects/Roadmap.md", text),
            "[[Plan]] [[Projects/Roadmap]] [[Archive/Plan]]"
        );
        // Moving the first one behind the second would hand the bare name to
        // the wrong note, so that link is written out as a path.
        assert_eq!(
            after("Archive/Plan.md", "Zebra/Plan.md", text),
            "[[Zebra/Plan]] [[Projects/Plan]] [[Zebra/Plan]]"
        );
        // A rename that takes a name another note's links were using. The
        // renamed note is now the first "Daily", so its links can use the bare
        // name, and links to the note that had the name are pinned to its path.
        assert_eq!(
            after("Inbox.md", "Archive/Daily.md", "[[Daily]] [[Inbox]]"),
            "[[Notes/Daily]] [[Daily]]"
        );
        // A note at the top of the vault that shares its name with a note
        // listed before it is not reached by its name or by a path from the
        // top: "Plan" is Archive/Plan. A path from the linking note is read
        // exactly, so the link becomes one instead of breaking.
        assert_eq!(after("Projects/Plan.md", "Plan.md", "[[Projects/Plan]]"), "[[./Plan]]");
        assert_eq!(
            after_in("Notes/Daily.md", "Projects/Plan.md", "Plan.md", "[[Projects/Plan#Scope|p]]"),
            "[[../Plan#Scope|p]]"
        );
    }

    #[test]
    fn a_note_with_a_hash_in_its_name_is_renamed_whole() {
        let text = "[[C# basics]] [[C# basics#Types]] [[C# basics|C sharp]]";
        assert_eq!(
            after("Notes/C# basics.md", "Notes/CSharp.md", text),
            "[[CSharp]] [[CSharp#Types]] [[CSharp|C sharp]]"
        );
        assert_eq!(
            after("Notes/Daily.md", "Notes/F# notes.md", "[[Daily#Morning]]"),
            "[[F# notes#Morning]]"
        );
    }

    #[test]
    fn an_escaped_pipe_inside_a_table_is_kept() {
        let text = "| Note | Link |\n|---|---|\n| a | [[Inbox\\|the inbox]] |\n";
        assert_eq!(
            after("Inbox.md", "Home.md", text),
            "| Note | Link |\n|---|---|\n| a | [[Home\\|the inbox]] |\n"
        );
    }

    #[test]
    fn a_note_that_links_to_itself_follows_its_own_rename() {
        let rename = Rename::new(&files(VAULT), "Inbox.md", "Home.md");
        let rewritten = rename.rewrite("Inbox.md", "Back to [[Inbox#Top]].").unwrap();
        assert_eq!(rewritten.text, "Back to [[Home#Top]].");
    }

    #[test]
    fn links_inside_code_are_examples_and_are_left_alone() {
        let text = "\
Real: [[Inbox]]
Inline: `[[Inbox]]` and ``a ` [[Inbox]]`` then [[Inbox]] again.
```md
[[Inbox]]
```
   ~~~
[[Inbox]]
~~~~
After the block: [[Inbox]]
An unclosed ` backtick does not hide [[Inbox]].
";
        let expected = "\
Real: [[Home]]
Inline: `[[Inbox]]` and ``a ` [[Inbox]]`` then [[Home]] again.
```md
[[Inbox]]
```
   ~~~
[[Inbox]]
~~~~
After the block: [[Home]]
An unclosed ` backtick does not hide [[Home]].
";
        assert_eq!(after("Inbox.md", "Home.md", text), expected);
    }

    #[test]
    fn line_endings_and_everything_else_are_kept_byte_for_byte() {
        let text = "---\r\ntitle: x\r\n---\r\n\r\nSee [[Inbox]].\r\n\r\n- [ ] task\r\nLast line without an ending [[Inbox|i]]";
        let out = after("Inbox.md", "Home.md", text);
        assert_eq!(
            out,
            "---\r\ntitle: x\r\n---\r\n\r\nSee [[Home]].\r\n\r\n- [ ] task\r\nLast line without an ending [[Home|i]]"
        );
        // Accented text around a link is not disturbed.
        assert_eq!(
            after("Inbox.md", "Café ☕.md", "Über [[Inbox]] naïve"),
            "Über [[Café ☕]] naïve"
        );
    }

    #[test]
    fn a_change_of_letter_case_alone_rewrites_nothing() {
        let rename = Rename::new(&files(VAULT), "Inbox.md", "INBOX.md");
        assert_eq!(rename.rewrite(NOTE, "[[Inbox]] [[inbox#x]] ![[Inbox]]"), None);
    }

    #[test]
    fn embedded_files_follow_a_rename_by_name_and_by_path() {
        let text = "![[photo.png]] ![[photo.png|160]] ![[attachments/photo.png|160x90]] [[paper.pdf]] ![[logo.svg]]";
        assert_eq!(
            after("attachments/photo.png", "attachments/team.png", text),
            "![[team.png]] ![[team.png|160]] ![[attachments/team.png|160x90]] [[paper.pdf]] ![[logo.svg]]"
        );
        // Moved, same name: found by name as before, so only the path form changes.
        assert_eq!(
            after("attachments/photo.png", "img/photo.png", text),
            "![[photo.png]] ![[photo.png|160]] ![[img/photo.png|160x90]] [[paper.pdf]] ![[logo.svg]]"
        );
        // The whole folder renamed.
        assert_eq!(
            after("attachments", "files", text),
            "![[photo.png]] ![[photo.png|160]] ![[files/photo.png|160x90]] [[paper.pdf]] ![[logo.svg]]"
        );
    }

    #[test]
    fn paths_the_app_inserts_for_attachments_follow_a_rename() {
        let text = "\
![photo.png](attachments/photo.png)
![alt text](attachments/photo.png \"A title\")
[paper.pdf](attachments/paper.pdf)
[the plan](Projects/Plan.md) and [a part](Projects/Plan.md#Scope)
Left alone: [site](https://example.com/attachments/photo.png) [mail](mailto:a@b.c) [top](#heading) ![missing](attachments/none.png)
";
        assert_eq!(
            after("attachments", "files", text),
            "\
![photo.png](files/photo.png)
![alt text](files/photo.png \"A title\")
[paper.pdf](files/paper.pdf)
[the plan](Projects/Plan.md) and [a part](Projects/Plan.md#Scope)
Left alone: [site](https://example.com/attachments/photo.png) [mail](mailto:a@b.c) [top](#heading) ![missing](attachments/none.png)
"
        );
        assert_eq!(
            after("Projects/Plan.md", "Projects/Road map.md", "[the plan](Projects/Plan.md) [a part](Projects/Plan.md#Scope)"),
            "[the plan](Projects/Road map.md) [a part](Projects/Road map.md#Scope)"
        );
        // A path that was written encoded stays encoded.
        let vault = files(&["My files/team photo.png", "Inbox.md"]);
        let rename = Rename::new(&vault, "My files", "Shared files");
        assert_eq!(
            rename.rewrite(NOTE, "![x](My%20files/team%20photo.png)").unwrap().text,
            "![x](Shared%20files/team%20photo.png)"
        );
    }

    #[test]
    fn a_markdown_link_follows_its_file_in_the_form_it_was_written_in() {
        // From Projects/Plan.md, every way of writing a link to the spec
        // beside it and to the photo two folders away.
        let note = "Projects/Plan.md";
        let text = "\
[top](/Projects/Deep/Spec.md) [from here](./Deep/Spec.md) [bare](Deep/Spec.md) [whole](Projects/Deep/Spec.md)
[no ending](Deep/Spec) [by name](Spec.md) [name only](Spec) [heading](./Deep/Spec.md#Scope \"The scope\")
![up](../attachments/photo.png) ![top](/attachments/photo.png) ![whole](attachments/photo.png) ![name](photo.png)
";
        // The file is renamed where it is.
        assert_eq!(
            after_in(note, "Projects/Deep/Spec.md", "Projects/Deep/Design doc.md", text),
            "\
[top](/Projects/Deep/Design doc.md) [from here](./Deep/Design doc.md) [bare](Deep/Design doc.md) [whole](Projects/Deep/Design doc.md)
[no ending](Deep/Design doc) [by name](Design doc.md) [name only](Design doc) [heading](./Deep/Design doc.md#Scope \"The scope\")
![up](../attachments/photo.png) ![top](/attachments/photo.png) ![whole](attachments/photo.png) ![name](photo.png)
"
        );
        // It moves to another folder: a path from the note stays one, a path
        // from the top stays one, and the name is still enough.
        assert_eq!(
            after_in(note, "Projects/Deep/Spec.md", "Archive/Spec.md", text),
            "\
[top](/Archive/Spec.md) [from here](../Archive/Spec.md) [bare](../Archive/Spec.md) [whole](Archive/Spec.md)
[no ending](../Archive/Spec) [by name](Spec.md) [name only](Spec) [heading](../Archive/Spec.md#Scope \"The scope\")
![up](../attachments/photo.png) ![top](/attachments/photo.png) ![whole](attachments/photo.png) ![name](photo.png)
"
        );
        // A folder is renamed: only the links that named it change.
        assert_eq!(
            after_in(note, "attachments", "files", text),
            "\
[top](/Projects/Deep/Spec.md) [from here](./Deep/Spec.md) [bare](Deep/Spec.md) [whole](Projects/Deep/Spec.md)
[no ending](Deep/Spec) [by name](Spec.md) [name only](Spec) [heading](./Deep/Spec.md#Scope \"The scope\")
![up](../files/photo.png) ![top](/files/photo.png) ![whole](files/photo.png) ![name](photo.png)
"
        );
        // A bare name that is no longer enough becomes a path from the top.
        let vault = files(&["Inbox.md", "Notes/Daily.md", "Archive/Daily.md", "Projects/Plan.md"]);
        let rename = Rename::new(&vault, "Archive/Daily.md", "Zebra/Daily.md");
        assert_eq!(
            rename.rewrite("Projects/Plan.md", "[d](Daily.md) [d](Daily)").unwrap().text,
            "[d](Zebra/Daily.md) [d](Zebra/Daily)"
        );
    }

    #[test]
    fn a_note_that_moves_keeps_its_own_links_on_their_files() {
        let text = "\
[from here](./Deep/Spec.md) [bare](Deep/Spec.md) [up](../Inbox.md) ![up](../attachments/photo.png)
[top](/Inbox.md) [whole](Projects/Deep/Spec.md) [by name](Daily.md) [[./Deep/Spec]] [[../Inbox|in]] [[Spec]]
[self](./Plan.md#Scope) [self](Plan.md) [[./Plan]] [site](https://example.com/./Deep/Spec.md)
";
        // Projects/Plan.md goes one folder down, then to the top, then away.
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Plan.md", "Projects/Deep/Plan.md", text),
            "\
[from here](./Spec.md) [bare](Spec.md) [up](../../Inbox.md) ![up](../../attachments/photo.png)
[top](/Inbox.md) [whole](Projects/Deep/Spec.md) [by name](Daily.md) [[./Spec]] [[../../Inbox|in]] [[Spec]]
[self](./Plan.md#Scope) [self](Plan.md) [[./Plan]] [site](https://example.com/./Deep/Spec.md)
"
        );
        // A path that went up and no longer has to is written bare when
        // that is read as a path from the note, as a new link would be.
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Plan.md", "Plan.md", text),
            "\
[from here](./Projects/Deep/Spec.md) [bare](Projects/Deep/Spec.md) [up](Inbox.md) ![up](attachments/photo.png)
[top](/Inbox.md) [whole](Projects/Deep/Spec.md) [by name](Daily.md) [[./Projects/Deep/Spec]] [[./Inbox|in]] [[Spec]]
[self](./Plan.md#Scope) [self](Plan.md) [[./Plan]] [site](https://example.com/./Deep/Spec.md)
"
        );
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Plan.md", "Archive/Old/Roadmap.md", text),
            "\
[from here](../../Projects/Deep/Spec.md) [bare](../../Projects/Deep/Spec.md) [up](../../Inbox.md) ![up](../../attachments/photo.png)
[top](/Inbox.md) [whole](Projects/Deep/Spec.md) [by name](Daily.md) [[../../Projects/Deep/Spec]] [[../../Inbox|in]] [[Spec]]
[self](./Roadmap.md#Scope) [self](Roadmap.md) [[./Roadmap]] [site](https://example.com/./Deep/Spec.md)
"
        );
        // The whole folder moves, and the links inside it still lead to each
        // other: nothing in the note has to change.
        let rename = Rename::new(&files(VAULT), "Projects", "Work/Projects");
        assert_eq!(
            rename.rewrite("Projects/Plan.md", "[a](./Deep/Spec.md) [b](Deep/Spec.md) [[./Deep/Spec]] [c](./Plan.md)"),
            None
        );
        // But its links out of the folder do.
        assert_eq!(
            rename.rewrite("Projects/Plan.md", "[up](../Inbox.md) [[../Inbox]]").unwrap().text,
            "[up](../../Inbox.md) [[../../Inbox]]"
        );
    }

    #[test]
    fn a_path_is_never_handed_to_another_file_by_a_rename() {
        // "Deep/Spec.md" in Projects/Plan.md is the spec beside it, because
        // nothing is at Deep/Spec.md at the top of the vault. A folder that
        // arrives there would take the link, so the link says "./".
        let vault = files(&["Projects/Plan.md", "Projects/Deep/Spec.md", "Old/Spec.md", "Inbox.md"]);
        let rename = Rename::new(&vault, "Old", "Deep");
        assert_eq!(
            rename.rewrite("Projects/Plan.md", "[spec](Deep/Spec.md) [spec](./Deep/Spec.md)").unwrap().text,
            "[spec](./Deep/Spec.md) [spec](./Deep/Spec.md)"
        );
        // The same for a note renamed onto the name a link beside it used.
        let rename = Rename::new(&vault, "Inbox.md", "Spec.md");
        assert_eq!(
            rename.rewrite("Projects/Deep/Notes.md", "[s](Spec.md) [gone](Missing.md)").unwrap().text,
            "[s](./Spec.md) [gone](Missing.md)"
        );
        // A link that led nowhere is not a link to keep, even when the
        // rename puts a file where it points.
        let rename = Rename::new(&vault, "Inbox.md", "Missing.md");
        assert_eq!(rename.rewrite("Projects/Plan.md", "[gone](Missing.md) [[Missing]]"), None);
        let rename = Rename::new(&vault, "Inbox.md", "Deep.md");
        assert_eq!(rename.rewrite("Projects/Plan.md", "[spec](Deep/Spec.md)"), None);
    }

    #[test]
    fn a_path_keeps_the_way_it_was_written() {
        let vault = files(&[
            "Inbox.md",
            "My files/team photo.png",
            "My files/notes (old).md",
            "Projects/Plan.md",
        ]);
        let text = "\
![a](My%20files/team%20photo.png) ![b](My files/team photo.png) ![c](<My files/team photo.png>)
![d](<My files/team photo.png> \"The team\") ![e](../My%20files/team%20photo.png#x 'y')
[f](My files/notes (old).md) [g](My%20files/notes%20%28old%29.md) [h](/My files/notes (old))
";
        let rename = Rename::new(&vault, "My files", "Shared files");
        assert_eq!(
            rename.rewrite("Projects/Plan.md", text).unwrap().text,
            "\
![a](Shared%20files/team%20photo.png) ![b](Shared files/team photo.png) ![c](<Shared files/team photo.png>)
![d](<Shared files/team photo.png> \"The team\") ![e](../Shared%20files/team%20photo.png#x 'y')
[f](Shared files/notes (old).md) [g](Shared%20files/notes%20%28old%29.md) [h](/Shared files/notes (old))
"
        );
        // A new name that cannot stand in a link as it is gets encoded.
        let rename = Rename::new(&vault, "Projects/Plan.md", "Projects/C# (v2).md");
        assert_eq!(
            rename.rewrite(NOTE, "[p](Projects/Plan.md) [p](Projects/Plan.md#Scope) [p](<Projects/Plan.md>)").unwrap().text,
            "[p](Projects/C%23%20%28v2%29.md) [p](Projects/C%23%20%28v2%29.md#Scope) [p](<Projects/C%23%20%28v2%29.md>)"
        );
        let rename = Rename::new(&vault, "Projects/Plan.md", "Projects/Plan (v2).md");
        assert_eq!(
            rename.rewrite(NOTE, "[p](Projects/Plan.md)").unwrap().text,
            "[p](Projects/Plan (v2).md)"
        );
        // "./" read from the top of the vault, as it was before relative
        // paths were understood, is still followed and still written "./".
        let rename = Rename::new(&vault, "My files", "Shared files");
        assert_eq!(
            rename.rewrite("Projects/Plan.md", "![x](./My files/team photo.png)").unwrap().text,
            "![x](./Shared files/team photo.png)"
        );
    }

    #[test]
    fn a_wiki_link_written_from_its_note_follows_both_ends() {
        let text = "[[./Deep/Spec]] [[./Deep/Spec.md#Scope|s]] ![[../attachments/photo.png|80]] [[../Inbox]]";
        // The file moves.
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Deep/Spec.md", "Archive/Spec.md", text),
            "[[../Archive/Spec]] [[../Archive/Spec.md#Scope|s]] ![[../attachments/photo.png|80]] [[../Inbox]]"
        );
        assert_eq!(
            after_in("Projects/Plan.md", "attachments/photo.png", "Projects/img/photo.png", text),
            "[[./Deep/Spec]] [[./Deep/Spec.md#Scope|s]] ![[./img/photo.png|80]] [[../Inbox]]"
        );
        // The note moves.
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Plan.md", "Plan.md", text),
            "[[./Projects/Deep/Spec]] [[./Projects/Deep/Spec.md#Scope|s]] ![[./attachments/photo.png|80]] [[./Inbox]]"
        );
        // A picture that was found by name, behind a path that led nowhere,
        // is left alone when nothing about it changes.
        assert_eq!(
            after_in("Projects/Plan.md", "Projects/Plan.md", "Plan.md", "![[./photo.png]]"),
            "![[./photo.png]]"
        );
    }

    #[test]
    fn every_link_resolves_to_the_same_file_after_any_rename() {
        let vault = files(VAULT);
        // Every form of link, written in every note in turn. What each one
        // points at depends on the note, and so does which of them point at
        // anything.
        let text = "\
[[Inbox]] [[inbox#h]] [[Plan]] [[Projects/Plan|p]] [[Archive/Plan#^b]] [[Spec]]
[[Projects/Deep/Spec]] [[C# basics]] [[C# basics#Types]] [[Daily]] [[Notes/Daily]]
![[photo.png]] ![[attachments/photo.png|80]] [[paper.pdf]] ![[logo.svg]] [[Missing]]
[[./Plan]] [[./Deep/Spec#Scope]] [[../Inbox]] [[./Spec]] [[../Plan|up]] [[./Daily]]
![[../attachments/photo.png]] [[../../Inbox]] ![[./photo.png]] [[./Missing]]
[a](Inbox.md) [b](/Inbox.md) [c](./Inbox.md) [d](../Inbox.md) [e](../../Inbox.md#Today) [f](Inbox)
[g](Projects/Plan.md) [h](Plan.md) [i](./Plan.md) [j](../Plan.md) [k](Deep/Spec.md) [l](./Deep/Spec.md \"t\")
[m](Spec.md) [n](Spec) [o](Notes/C%23%20basics.md#Types) [p](C%23%20basics.md) [q](./C%23%20basics.md)
[r](Daily.md) [s](<Notes/Daily.md>) [t](/Notes/Daily) [u](Projects/Deep/Spec) [v](../Deep/Spec.md)
![w](attachments/photo.png) ![x](/attachments/photo.png) ![y](../attachments/photo.png) ![z](photo.png)
![A](./attachments/photo.png) ![B](../img/logo.svg) [C](attachments/paper.pdf#page=2) [D](paper.pdf)
[E](Missing.md) [F](https://example.com/Inbox.md) [G](#Top) [H](../../../Inbox.md) [I](mailto:inbox@example.com)
";
        let renames = [
            ("Inbox.md", "Home.md"),
            ("Inbox.md", "Notes/Inbox.md"),
            ("Inbox.md", "Archive/Daily.md"),
            ("Inbox.md", "Aaa/Plan.md"),
            ("Inbox.md", "Spec.md"),
            ("Inbox.md", "Plan.md"),
            ("Projects/Plan.md", "Projects/Roadmap.md"),
            ("Projects/Plan.md", "Plan.md"),
            ("Projects/Plan.md", "Projects/Deep/Plan.md"),
            ("Projects/Plan.md", "Archive/Old/Roadmap.md"),
            ("Archive/Plan.md", "Zebra/Plan.md"),
            ("Archive/Plan.md", "Archive/Spec.md"),
            ("Projects/Deep/Spec.md", "Spec.md"),
            ("Projects/Deep/Spec.md", "Projects/Spec.md"),
            ("Notes/C# basics.md", "Notes/C.md"),
            ("Notes/Daily.md", "Notes/Inbox 2.md"),
            ("Notes/Daily.md", "Daily.md"),
            ("Notes/Daily.md", "Deep/Spec.md"),
            ("Notes/Daily.md", "Notes/Daily (old) #2.md"),
            ("Projects", "Work"),
            ("Projects", "Archive/Projects"),
            ("Projects/Deep", "Deep"),
            ("Archive", "Projects/Archive"),
            ("Archive", "Deep"),
            ("Notes", "Zz"),
            ("Notes", "Projects/Notes"),
            ("attachments", "files"),
            ("attachments", "Projects/attachments"),
            ("attachments/photo.png", "img/photo.png"),
            ("attachments/photo.png", "attachments/logo.svg.png"),
            ("attachments/photo.png", "Projects/team photo (1).png"),
            ("img/logo.svg", "attachments/logo.svg"),
            ("attachments/paper.pdf", "paper.pdf"),
        ];
        let notes: Vec<&str> = VAULT.iter().copied().filter(|rel| is_note(rel)).collect();
        let wiki_before = wiki_targets(text);
        let markdown_before = markdown_dests(text);
        let mut checked = 0;
        let mut followed = 0;
        for (old, new) in renames {
            let rename = Rename::new(&vault, old, new);
            for note in &notes {
                let note_after = rename.after(note);
                let out = rename
                    .rewrite(note, text)
                    .map(|r| r.text)
                    .unwrap_or_else(|| text.to_string());
                let place = format!("{old} -> {new}, in {note}");

                let wiki_after = wiki_targets(&out);
                assert_eq!(wiki_before.len(), wiki_after.len(), "{place}");
                for (was, is) in wiki_before.iter().zip(&wiki_after) {
                    let pointed_at = resolves(&rename.old, note, was);
                    let expected = pointed_at.as_deref().map(|rel| rename.after(rel).to_string());
                    if expected.is_some() {
                        assert_eq!(
                            resolves(&rename.new, note_after, is),
                            expected,
                            "{place}: [[{was}]] became [[{is}]]"
                        );
                        checked += 1;
                    } else {
                        // A link that pointed at nothing is not rewritten.
                        assert_eq!(was, is, "{place}");
                    }
                }

                let markdown_after = markdown_dests(&out);
                assert_eq!(markdown_before.len(), markdown_after.len(), "{place}");
                for (was, is) in markdown_before.iter().zip(&markdown_after) {
                    let pointed_at = leads_to(&rename.old, note, was);
                    let expected = pointed_at.as_deref().map(|rel| rename.after(rel).to_string());
                    if expected.is_some() {
                        assert_eq!(
                            leads_to(&rename.new, note_after, is),
                            expected,
                            "{place}: ]({was}) became ]({is})"
                        );
                        // One that still leads there as written is left alone.
                        if leads_to(&rename.new, note_after, was) == expected {
                            assert_eq!(was, is, "{place}");
                        } else {
                            followed += 1;
                        }
                        checked += 1;
                    } else {
                        assert_eq!(was, is, "{place}");
                    }
                }
            }
        }
        // The test is only worth something if most forms resolve somewhere
        // and a good many of them had to be rewritten.
        assert!(checked > 5000, "{checked}");
        assert!(followed > 500, "{followed}");
    }

    #[test]
    fn renaming_back_restores_every_note_byte_for_byte() {
        let vault = files(&[
            "Inbox.md",
            "Projects/Roadmap.md",
            "Projects/Deep/Spec.md",
            "Projects/img/chart.png",
            "attachments/photo.png",
        ]);
        let there_and_back = [
            ("Inbox.md", "Home.md"),
            ("Inbox.md", "Projects/Inbox.md"),
            ("Projects", "Work"),
            ("Projects/Deep", "Deep"),
            ("Projects/Deep/Spec.md", "Projects/Specification.md"),
            ("Projects/img/chart.png", "Projects/img/graph (2).png"),
            ("attachments", "files"),
            ("attachments/photo.png", "attachments/team.png"),
        ];
        // The note itself going to another folder.
        let the_note_moves = [
            ("Projects/Roadmap.md", "Projects/Deep/Roadmap.md"),
            ("Projects/Roadmap.md", "Archive/Roadmap.md"),
        ];
        // Written at the top of the vault: names, and paths from the top.
        let at_the_top = "[[Inbox]] [[Inbox#Today|t]] ![[Inbox]] [[Projects/Roadmap]] [[Spec]] [[Projects/Deep/Spec]]\r\n![[photo.png|120]] ![p](attachments/photo.png) `[[Inbox]]`\n[a](/Projects/Roadmap.md) [b](Projects/Deep/Spec) [c](Spec.md#Scope \"t\") ![d](<attachments/photo.png>)\r\n[e](./Projects/Roadmap.md) [f](Projects/Deep/Spec.md) [g](Projects/Deep/Spec.md#Scope) ![h](attachments/photo.png 'x')";
        // Written in a folder: paths from the note, in each way of writing one.
        let in_a_folder = "[a](Deep/Spec.md) ![b](../attachments/photo.png) [[./Deep/Spec|s]] [[../Inbox#Today]]\r\n![c](./img/chart.png) ![d](../attachments/photo.png \"A photo\") [e](/Inbox.md) [f](Roadmap.md) [[./Roadmap]]\n![g](img/chart.png) [[Spec]] `[x](Deep/Spec.md)`";
        // Not every link comes back as it was, and those are left out. A
        // link that still leads to its file is never touched, so one that
        // was rewritten on the way out and happens to work on the way back
        // stays as it is. And when the note moves away, `x.md` and `./x.md`
        // both become `../Old/x.md`; on the way back that is written as a
        // new link would be: bare, if that is read as a path from the note.
        let leaving_the_folder = "![a](../attachments/photo.png) [[../attachments/photo.png|80]] [[../Inbox#Today]] [b](/Inbox.md)\r\n[c](Roadmap.md) [[./Roadmap]] [d](Spec.md) ![e](../attachments/photo.png 'x') [[Spec]] [f](/Projects/Deep/Spec)";

        let there_and_back_again = |note: &str, text: &str, renames: &[(&str, &str)]| {
            let mut changed_at_all = 0;
            for (old, new) in renames {
                let forth = Rename::new(&vault, old, new);
                let moved: Vec<String> = vault.iter().map(|rel| forth.after(rel).to_string()).collect();
                let changed = forth
                    .rewrite(note, text)
                    .map(|r| r.text)
                    .unwrap_or_else(|| text.to_string());
                changed_at_all += usize::from(changed != text);
                let back = Rename::new(&moved, new, old);
                let restored = back
                    .rewrite(forth.after(note), &changed)
                    .map(|r| r.text)
                    .unwrap_or(changed);
                assert_eq!(restored, text, "{old} -> {new} and back, in {note}");
            }
            // Most of the renames have to change something, or nothing is shown.
            assert!(changed_at_all * 2 >= renames.len(), "{note}: {changed_at_all}");
        };
        there_and_back_again("Inbox.md", at_the_top, &there_and_back);
        there_and_back_again("Projects/Roadmap.md", in_a_folder, &there_and_back);
        there_and_back_again("Projects/Roadmap.md", leaving_the_folder, &the_note_moves);
    }

    // ── A real folder ──

    fn scratch(name: &str) -> PathBuf {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("noteriv-links-{}-{n}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dunce::canonicalize(dir).unwrap()
    }

    fn write(vault: &Path, rel: &str, text: &str) {
        let path = to_abs(vault, rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn read(vault: &Path, rel: &str) -> String {
        fs::read_to_string(to_abs(vault, rel)).unwrap_or_else(|_| panic!("{rel} is missing"))
    }

    #[test]
    fn renaming_a_note_in_a_vault_updates_the_notes_that_link_to_it() {
        let vault = scratch("rename");
        write(&vault, "Inbox.md", "self [[Inbox#Top]]\n");
        write(&vault, "Projects/Plan.md", "see [[Inbox]] and [[Inbox|again]]\n");
        write(&vault, "Notes/Other.md", "nothing to change, [[Plan]]\n");
        write(&vault, "Notes/Code.md", "`[[Inbox]]`\n");
        write(&vault, ".obsidian/workspace.md", "[[Inbox]]\n");
        write(&vault, "attachments/data.csv", "[[Inbox]]\n");
        let untouched = fs::metadata(to_abs(&vault, "Notes/Other.md")).unwrap().modified().unwrap();

        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Inbox.md"),
            &to_abs(&vault, "Home.md"),
            Vec::new(),
        )
        .unwrap();

        assert_eq!((report.notes, report.links, report.failed), (2, 3, 0));
        assert!(!to_abs(&vault, "Inbox.md").exists());
        assert_eq!(read(&vault, "Home.md"), "self [[Home#Top]]\n");
        assert_eq!(read(&vault, "Projects/Plan.md"), "see [[Home]] and [[Home|again]]\n");
        assert_eq!(read(&vault, "Notes/Code.md"), "`[[Inbox]]`\n");
        // Hidden folders and files that are not notes are not rewritten.
        assert_eq!(read(&vault, ".obsidian/workspace.md"), "[[Inbox]]\n");
        assert_eq!(read(&vault, "attachments/data.csv"), "[[Inbox]]\n");
        // A note with nothing to change is not written at all.
        assert_eq!(
            fs::metadata(to_abs(&vault, "Notes/Other.md")).unwrap().modified().unwrap(),
            untouched
        );
        // No working files are left behind.
        let leftovers: Vec<String> = fs::read_dir(to_abs(&vault, "Projects"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("noteriv-part"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn a_folder_rename_in_a_vault_moves_the_links_with_it() {
        let vault = scratch("folder");
        write(&vault, "Projects/Plan.md", "[[Projects/Deep/Spec]] ![p](Projects/img/pic.png)\n");
        write(&vault, "Projects/Deep/Spec.md", "up to [[Projects/Plan]]\n");
        write(&vault, "Projects/img/pic.png", "png");
        write(&vault, "Inbox.md", "[[Projects/Plan|plan]] [[Spec]] ![[pic.png]]\n");

        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Projects"),
            &to_abs(&vault, "Work"),
            Vec::new(),
        )
        .unwrap();

        assert_eq!((report.notes, report.links), (3, 4));
        assert_eq!(read(&vault, "Work/Plan.md"), "[[Work/Deep/Spec]] ![p](Work/img/pic.png)\n");
        assert_eq!(read(&vault, "Work/Deep/Spec.md"), "up to [[Work/Plan]]\n");
        assert_eq!(read(&vault, "Inbox.md"), "[[Work/Plan|plan]] [[Spec]] ![[pic.png]]\n");
    }

    #[test]
    fn moving_a_note_in_a_vault_rewrites_its_own_paths_and_the_paths_to_it() {
        let vault = scratch("move-note");
        write(
            &vault,
            "Projects/Plan.md",
            "[spec](Deep/Spec.md) ![p](../attachments/pic.png) [[./Deep/Spec]] [in](/Inbox.md)\n",
        );
        write(&vault, "Projects/Deep/Spec.md", "back to [the plan](../Plan.md) and [[../Plan]]\n");
        write(&vault, "Inbox.md", "[plan](Projects/Plan.md) [plan](./Projects/Plan.md#Scope) [[Plan]]\n");
        write(&vault, "Archive/Other.md", "nothing here\n");
        write(&vault, "attachments/pic.png", "png");
        let path = |rel: &str| to_abs(&vault, rel).to_string_lossy().into_owned();

        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Projects/Plan.md"),
            &to_abs(&vault, "Archive/Plan.md"),
            vec![OpenNote {
                path: path("Projects/Plan.md"),
                unsaved: Some("[spec](Deep/Spec.md)\ntyped since: [s](./Deep/Spec.md)\n".into()),
            }],
        )
        .unwrap();

        assert_eq!((report.notes, report.links, report.failed), (3, 6, 0));
        // The note's own paths lead to the same files from its new folder.
        // The picture is as far away as it was, so that path is untouched.
        assert_eq!(
            read(&vault, "Archive/Plan.md"),
            "[spec](../Projects/Deep/Spec.md) ![p](../attachments/pic.png) [[../Projects/Deep/Spec]] [in](/Inbox.md)\n"
        );
        // And the paths to it lead to where it is now.
        assert_eq!(
            read(&vault, "Projects/Deep/Spec.md"),
            "back to [the plan](../../Archive/Plan.md) and [[../../Archive/Plan]]\n"
        );
        assert_eq!(
            read(&vault, "Inbox.md"),
            "[plan](Archive/Plan.md) [plan](./Archive/Plan.md#Scope) [[Plan]]\n"
        );
        // The open tab's unsaved text is rewritten from the note's old folder too.
        let open = &report.open[0];
        assert_eq!(open.path, path("Projects/Plan.md"));
        assert_eq!(
            open.unsaved.as_deref(),
            Some("[spec](../Projects/Deep/Spec.md)\ntyped since: [s](../Projects/Deep/Spec.md)\n")
        );
        assert!(open
            .changes
            .contains(&("](./Deep/Spec.md)".into(), "](../Projects/Deep/Spec.md)".into())));
    }

    #[test]
    fn open_notes_get_the_same_changes_for_their_unsaved_text() {
        let vault = scratch("open");
        write(&vault, "Inbox.md", "inbox\n");
        write(&vault, "Draft.md", "saved: [[Inbox]]\n");
        write(&vault, "Clean.md", "clean: [[Inbox]]\n");
        write(&vault, "Unrelated.md", "no links\n");
        let path = |rel: &str| to_abs(&vault, rel).to_string_lossy().into_owned();

        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Inbox.md"),
            &to_abs(&vault, "Home.md"),
            vec![
                OpenNote {
                    path: path("Draft.md"),
                    unsaved: Some("saved: [[Inbox]]\nand typed since: [[Inbox#New]]\n".into()),
                },
                OpenNote { path: path("Clean.md"), unsaved: None },
                OpenNote { path: path("Unrelated.md"), unsaved: Some("still no links".into()) },
                // The renamed note itself, open with an unsaved self-link.
                OpenNote { path: path("Inbox.md"), unsaved: Some("inbox\n[[Inbox]]\n".into()) },
            ],
        )
        .unwrap();

        let find = |rel: &str| report.open.iter().find(|o| o.path == path(rel));
        let draft = find("Draft.md").expect("the draft is reported");
        assert_eq!(draft.saved.as_deref(), Some("saved: [[Home]]\n"));
        assert_eq!(
            draft.unsaved.as_deref(),
            Some("saved: [[Home]]\nand typed since: [[Home#New]]\n")
        );
        assert!(draft.changes.contains(&("[[Inbox]]".into(), "[[Home]]".into())));
        assert!(draft.changes.contains(&("[[Inbox#New]]".into(), "[[Home#New]]".into())));

        let clean = find("Clean.md").expect("the clean note is reported");
        assert_eq!(clean.saved.as_deref(), Some("clean: [[Home]]\n"));
        assert_eq!(clean.unsaved, None);

        assert!(find("Unrelated.md").is_none());

        // Reported under the path the app gave, though the file has moved.
        let renamed = find("Inbox.md").expect("the renamed note is reported");
        assert_eq!(renamed.saved, None);
        assert_eq!(renamed.unsaved.as_deref(), Some("inbox\n[[Home]]\n"));
        // The unsaved text is never written to disk by the rename.
        assert_eq!(read(&vault, "Draft.md"), "saved: [[Home]]\n");
        assert_eq!(read(&vault, "Home.md"), "inbox\n");
    }

    #[test]
    fn a_rename_onto_something_that_exists_is_refused_and_changes_nothing() {
        let vault = scratch("exists");
        write(&vault, "Inbox.md", "inbox\n");
        write(&vault, "Home.md", "already here\n");
        write(&vault, "Links.md", "[[Inbox]]\n");

        let err = rename_and_update(
            &vault,
            &to_abs(&vault, "Inbox.md"),
            &to_abs(&vault, "Home.md"),
            Vec::new(),
        )
        .unwrap_err();
        assert!(err.contains("already exists"), "{err}");
        assert_eq!(read(&vault, "Home.md"), "already here\n");
        assert_eq!(read(&vault, "Inbox.md"), "inbox\n");
        assert_eq!(read(&vault, "Links.md"), "[[Inbox]]\n");

        // Outside the vault, or already gone.
        let outside = scratch("exists-outside");
        assert!(rename_and_update(&vault, &to_abs(&vault, "Inbox.md"), &outside.join("x.md"), Vec::new()).is_err());
        assert!(rename_and_update(&vault, &to_abs(&vault, "Gone.md"), &to_abs(&vault, "New.md"), Vec::new()).is_err());
        assert_eq!(read(&vault, "Inbox.md"), "inbox\n");
    }

    /// Not a check of correctness: prints how long one rename takes in a
    /// large vault. Run with `-- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn timing_one_rename_in_a_vault_of_5000_notes() {
        let vault = scratch("timing");
        for i in 0..5000 {
            let folder = format!("Folder {:02}", i % 50);
            let body = format!(
                "# Note {i}\n\n{}\nSee [[Inbox]] and [[Note {}]].\n![p](attachments/pic.png)\n",
                "Some ordinary text on a line of its own.\n".repeat(40),
                (i + 1) % 5000
            );
            write(&vault, &format!("{folder}/Note {i}.md"), &body);
        }
        write(&vault, "Inbox.md", "inbox\n");
        write(&vault, "attachments/pic.png", "png");

        let started = std::time::Instant::now();
        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Inbox.md"),
            &to_abs(&vault, "Home.md"),
            Vec::new(),
        )
        .unwrap();
        let rewrite_all = started.elapsed();
        assert_eq!((report.notes, report.links, report.failed), (5000, 5000, 0));

        let started = std::time::Instant::now();
        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Folder 00/Note 0.md"),
            &to_abs(&vault, "Folder 00/Renamed.md"),
            Vec::new(),
        )
        .unwrap();
        let rewrite_one = started.elapsed();
        assert_eq!((report.notes, report.links), (1, 1));

        println!("5000 notes, every one rewritten: {rewrite_all:?}");
        println!("5000 notes, one rewritten:       {rewrite_one:?}");
        let _ = fs::remove_dir_all(&vault);
    }

    #[cfg(unix)]
    #[test]
    fn a_note_that_cannot_be_written_is_counted_and_the_rest_still_update() {
        use std::os::unix::fs::PermissionsExt;
        let vault = scratch("readonly");
        write(&vault, "Inbox.md", "inbox\n");
        write(&vault, "Open/A.md", "[[Inbox]]\n");
        write(&vault, "Locked/B.md", "[[Inbox]]\n");
        let locked = to_abs(&vault, "Locked");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o555)).unwrap();

        let report = rename_and_update(
            &vault,
            &to_abs(&vault, "Inbox.md"),
            &to_abs(&vault, "Home.md"),
            Vec::new(),
        );
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        let report = report.unwrap();

        assert_eq!((report.notes, report.failed), (1, 1));
        assert_eq!(read(&vault, "Open/A.md"), "[[Home]]\n");
        assert_eq!(read(&vault, "Locked/B.md"), "[[Inbox]]\n");
    }
}
