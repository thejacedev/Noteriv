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
// Three kinds of link are understood, each resolved the way the app resolves
// it when it is clicked or drawn:
//
//   [[Note]]  ![[Note#Heading|alias]]   a note, by name or by its whole path
//                                       inside the vault (the first note in
//                                       listing order wins a shared name)
//   ![[photo.png]]  [[paper.pdf]]       any other file, by its path, or by
//                                       name with the shallowest file winning
//   ![alt](attachments/photo.png)       a path from the top of the vault,
//   [text](Folder/Note.md)              which is what the app inserts for an
//                                       attachment
//
// Links inside fenced code blocks and inline code are examples, not links,
// and are never touched.
//
// The note resolver is a second copy of `findLinkedNote` in
// `src/lib/wiki-link-utils.ts`. Both are tested against
// `src/lib/__fixtures__/link-resolution.json`; change them together.

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

    /// What the file part of a `[[...]]` link points at. A target written
    /// with a file extension that is not a note's is looked up among the
    /// other files first, as an embed of it is.
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

    /// Where the file part of a target ends and its `#heading` or `#^block`
    /// begins. The app tries the whole target, so a note with "#" in its name
    /// is found, and then the part before the first "#". A later "#" is
    /// tried after that, longest name first, for a heading link to a note
    /// with "#" in its name.
    fn split_target<'t>(&self, target: &'t str) -> Option<(&'t str, &'t str)> {
        if self.wiki(target).is_some() {
            return Some((target, ""));
        }
        let hashes: Vec<usize> = target.match_indices('#').map(|(i, _)| i).collect();
        let (first, later) = hashes.split_first()?;
        std::iter::once(first)
            .chain(later.iter().rev())
            .map(|i| target.split_at(*i))
            .find(|(file, _)| self.wiki(file.trim()).is_some())
    }

    /// A file by its path from the top of the vault, as `![](path)` finds it.
    fn at(&self, rel: &str) -> Option<&str> {
        self.exact
            .get(rel)
            .or_else(|| self.exact_lower.get(&rel.to_lowercase()))
            .map(String::as_str)
    }
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
    fn wiki_inner(&self, inner: &str) -> Option<String> {
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

        let (file, fragment) = self.old.split_target(core)?;
        let file_trimmed = file.trim();
        let before = self.old.wiki(file_trimmed)?;
        let expected = self.after(before);
        let has_path = file_trimmed.contains('/') || file_trimmed.contains('\\');
        // A path to a file that moved has to be its new path. Still being
        // found by name alone would leave a path that leads nowhere.
        let still_right = if has_path && self.moved.contains_key(before) {
            self.new.wiki_exact(file_trimmed) == Some(expected)
        } else {
            self.new.wiki(file_trimmed) == Some(expected)
        };
        if still_right {
            return None;
        }

        // The least change that lands on the file: its name if the link was
        // a bare name and the name is enough, otherwise its path.
        let keep_ext = !is_note(expected) || is_note(file_trimmed);
        let shown = |rel: &str| -> String {
            if keep_ext {
                rel.to_string()
            } else {
                strip_note_ext(rel).to_string()
            }
        };
        let by_name = shown(file_name(expected));
        let by_path = shown(expected);
        let candidates = if has_path {
            vec![by_path]
        } else {
            vec![by_name, by_path]
        };
        // No candidate lands on the file when a note at the top of the vault
        // shares its name with one that is listed earlier: nothing the app
        // can resolve names it. The link is then left as it was, broken,
        // rather than pointed at the wrong note.
        let new_file = candidates
            .into_iter()
            .find(|c| self.new.wiki_exact(c) == Some(expected))?;

        // Spaces between the name and a "#" are kept where they were.
        let gap = &file[file.trim_end().len()..];
        Some(format!("{lead}{new_file}{gap}{fragment}{trail}{suffix}"))
    }

    /// The text between `](` and `)`, rewritten, or `None` to leave it.
    fn markdown_dest(&self, dest: &str) -> Option<String> {
        // `path "title"`: only the path is a link.
        let split = dest.find(char::is_whitespace).unwrap_or(dest.len());
        let (path, rest) = dest.split_at(split);
        if path.is_empty()
            || path.starts_with('#')
            || path.starts_with('<')
            || path.starts_with('/')
            || path.contains("://")
            || path.starts_with("mailto:")
            || path.starts_with("data:")
        {
            return None;
        }
        let (file, fragment) = match path.find('#') {
            Some(i) => path.split_at(i),
            None => (path, ""),
        };
        let decoded = urlencoding::decode(file).ok()?.into_owned();
        let encoded = decoded != file;
        let rel = decoded.strip_prefix("./").unwrap_or(&decoded);

        let before = self.old.at(rel)?;
        let expected = self.moved.get(before)?;
        let new_path = if encoded {
            // Written encoded, so kept encoded: each part of the path on its own.
            expected
                .split('/')
                .map(|part| urlencoding::encode(part).into_owned())
                .collect::<Vec<_>>()
                .join("/")
        } else {
            expected.clone()
        };
        if new_path == file {
            return None;
        }
        Some(format!("{new_path}{fragment}{rest}"))
    }

    /// A note's text with its links rewritten, or `None` when no link in it
    /// needs to change.
    pub(crate) fn rewrite(&self, content: &str) -> Option<Rewritten> {
        if !content.contains("[[") && !content.contains("](") {
            return None;
        }
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
            links += self.rewrite_line(line, &mut out, &mut changes);
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
    fn rewrite_line(&self, line: &str, out: &mut String, changes: &mut Vec<(String, String)>) -> usize {
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
                            if let Some(new_inner) = self.wiki_inner(inner) {
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
                    match line[start..].find(')').map(|k| start + k) {
                        Some(end) if end > start => {
                            let dest = &line[start..end];
                            if let Some(new_dest) = self.markdown_dest(dest) {
                                out.push_str(&line[copied..start]);
                                out.push_str(&new_dest);
                                copied = end;
                                links += 1;
                                changes.push((format!("]({dest})"), format!("]({new_dest})")));
                            }
                            i = end + 1;
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
    for rel in files.iter().map(|rel| rename.after(rel)).filter(|rel| is_note(rel)) {
        let path = to_abs(vault, rel);
        let open_note = open_by_rel.remove(rel);
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        let on_disk = rename.rewrite(&content);
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
                .and_then(|text| rename.rewrite(text))
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

    /// What a `[[target]]` resolves to.
    fn resolves(index: &Index, target: &str) -> Option<String> {
        let (file, _) = index.split_target(target)?;
        index.wiki(file.trim()).map(str::to_string)
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

    fn after(old: &str, new: &str, text: &str) -> String {
        let rename = Rename::new(&files(VAULT), old, new);
        rename
            .rewrite(text)
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
        let rewritten = rename.rewrite(text).unwrap();
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
        assert_eq!(rename.rewrite("[[Spec]] and [[Inbox]]"), None);
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
        // listed before it cannot be named by any link the app resolves, so
        // the link is left as written instead of being pointed at the wrong note.
        assert_eq!(after("Projects/Plan.md", "Plan.md", "[[Projects/Plan]]"), "[[Projects/Plan]]");
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
        let rewritten = rename.rewrite("Back to [[Inbox#Top]].").unwrap();
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
        assert_eq!(rename.rewrite("[[Inbox]] [[inbox#x]] ![[Inbox]]"), None);
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
Left alone: [site](https://example.com/attachments/photo.png) [mail](mailto:a@b.c) [top](#heading) ![x](/attachments/photo.png) ![missing](attachments/none.png)
";
        assert_eq!(
            after("attachments", "files", text),
            "\
![photo.png](files/photo.png)
![alt text](files/photo.png \"A title\")
[paper.pdf](files/paper.pdf)
[the plan](Projects/Plan.md) and [a part](Projects/Plan.md#Scope)
Left alone: [site](https://example.com/attachments/photo.png) [mail](mailto:a@b.c) [top](#heading) ![x](/attachments/photo.png) ![missing](attachments/none.png)
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
            rename.rewrite("![x](My%20files/team%20photo.png)").unwrap().text,
            "![x](Shared%20files/team%20photo.png)"
        );
    }

    #[test]
    fn every_link_resolves_to_the_same_file_after_any_rename() {
        let vault = files(VAULT);
        let text = "\
[[Inbox]] [[inbox#h]] [[Plan]] [[Projects/Plan|p]] [[Archive/Plan#^b]] [[Spec]]
[[Projects/Deep/Spec]] [[C# basics]] [[C# basics#Types]] [[Daily]] [[Notes/Daily]]
![[photo.png]] ![[attachments/photo.png|80]] [[paper.pdf]] ![[logo.svg]] [[Missing]]
";
        let renames = [
            ("Inbox.md", "Home.md"),
            ("Inbox.md", "Notes/Inbox.md"),
            ("Inbox.md", "Archive/Daily.md"),
            ("Inbox.md", "Aaa/Plan.md"),
            ("Projects/Plan.md", "Projects/Roadmap.md"),
            ("Projects/Plan.md", "Plan.md"),
            ("Archive/Plan.md", "Zebra/Plan.md"),
            ("Archive/Plan.md", "Archive/Spec.md"),
            ("Projects/Deep/Spec.md", "Spec.md"),
            ("Notes/C# basics.md", "Notes/C.md"),
            ("Notes/Daily.md", "Notes/Inbox 2.md"),
            ("Projects", "Work"),
            ("Projects/Deep", "Deep"),
            ("Archive", "Projects/Archive"),
            ("Notes", "Zz"),
            ("attachments", "files"),
            ("attachments/photo.png", "img/photo.png"),
            ("attachments/photo.png", "attachments/logo.svg.png"),
            ("img/logo.svg", "attachments/logo.svg"),
            ("attachments/paper.pdf", "paper.pdf"),
        ];
        let before_targets = wiki_targets(text);
        for (old, new) in renames {
            let rename = Rename::new(&vault, old, new);
            let out = rename.rewrite(text).map(|r| r.text).unwrap_or_else(|| text.to_string());
            let after_targets = wiki_targets(&out);
            assert_eq!(before_targets.len(), after_targets.len(), "{old} -> {new}");
            for (was, is) in before_targets.iter().zip(&after_targets) {
                let pointed_at = resolves(&rename.old, was);
                let expected = pointed_at.as_deref().map(|rel| rename.after(rel).to_string());
                // The one file no link can name: see the shared-name test.
                let unreachable = expected.as_deref().is_some_and(|rel| {
                    rename.new.wiki_exact(rel) != Some(rel)
                        && rename.new.wiki_exact(strip_note_ext(rel)) != Some(rel)
                });
                if unreachable {
                    assert_eq!((old, new), ("Projects/Plan.md", "Plan.md"));
                    assert_eq!(was, is, "{old} -> {new}");
                } else if expected.is_some() {
                    assert_eq!(
                        resolves(&rename.new, is),
                        expected,
                        "{old} -> {new}: [[{was}]] became [[{is}]]"
                    );
                } else {
                    // A link that pointed at nothing is not rewritten.
                    assert_eq!(was, is, "{old} -> {new}");
                }
            }
        }
    }

    #[test]
    fn renaming_back_restores_every_note_byte_for_byte() {
        let vault = files(&[
            "Inbox.md",
            "Projects/Roadmap.md",
            "Projects/Deep/Spec.md",
            "attachments/photo.png",
        ]);
        let text = "[[Inbox]] [[Inbox#Today|t]] ![[Inbox]] [[Projects/Roadmap]] [[Spec]] [[Projects/Deep/Spec]]\r\n![[photo.png|120]] ![p](attachments/photo.png) `[[Inbox]]`\n";
        let there_and_back = [
            ("Inbox.md", "Home.md"),
            ("Inbox.md", "Projects/Inbox.md"),
            ("Projects", "Work"),
            ("Projects/Deep", "Deep"),
            ("Projects/Deep/Spec.md", "Projects/Specification.md"),
            ("attachments", "files"),
            ("attachments/photo.png", "attachments/team.png"),
        ];
        for (old, new) in there_and_back {
            let forth = Rename::new(&vault, old, new);
            let moved: Vec<String> = vault.iter().map(|rel| forth.after(rel).to_string()).collect();
            let changed = forth.rewrite(text).map(|r| r.text).unwrap_or_else(|| text.to_string());
            let back = Rename::new(&moved, new, old);
            let restored = back.rewrite(&changed).map(|r| r.text).unwrap_or(changed);
            assert_eq!(restored, text, "{old} -> {new} and back");
        }
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
