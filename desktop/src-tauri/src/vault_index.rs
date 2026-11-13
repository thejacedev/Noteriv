// What the app needs to know about every note at once: its properties, tags
// and links, and the file's size and dates.
//
// Features that look across the vault (links by alias, unlinked mentions,
// the property list, search by tag or property, bases, the graph) used to
// have no source but reading each note over the bridge, one call per note.
// This reads them all in one pass and hands back only what those features
// use: the frontmatter as written, for the frontend to parse as YAML, and
// the tags and links found in the body.
//
// Code is skipped when looking for tags and links: a `#define` in a code
// block is not a tag.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Frontmatter longer than this is not returned. Nothing sensible is that
/// long, and one malformed note should not bloat the whole answer.
const MAX_FRONTMATTER_BYTES: usize = 64 * 1024;

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct NoteMeta {
    /// The note's full path, as the app's other listings give it.
    #[serde(rename = "filePath")]
    pub file_path: String,
    /// Its path inside the vault, with `/` between folders.
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    /// The file name without its extension.
    pub name: String,
    pub size: u64,
    /// Modified and created, in milliseconds. Created falls back to
    /// modified where the system does not record it.
    pub mtime: u64,
    pub ctime: u64,
    /// The YAML between the `---` lines, without them.
    pub frontmatter: Option<String>,
    /// `#tags` in the body, without the `#`, each once, in order of appearance.
    pub tags: Vec<String>,
    /// The file part of each `[[link]]` and `![[embed]]`, as written.
    pub links: Vec<String>,
    /// Open and completed `- [ ]` tasks.
    #[serde(rename = "tasksOpen")]
    pub tasks_open: usize,
    #[serde(rename = "tasksDone")]
    pub tasks_done: usize,
}

/// Split a note into its frontmatter and the rest.
pub(crate) fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    let Some(rest) = content.strip_prefix("---") else {
        return (None, content);
    };
    // The opening line has to be `---` alone.
    let Some(after_open) = rest.strip_prefix("\r\n").or_else(|| rest.strip_prefix('\n')) else {
        return (None, content);
    };
    let mut offset = 0;
    for line in after_open.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "---" || trimmed == "..." {
            let yaml = &after_open[..offset];
            let body = &after_open[offset + line.len()..];
            return (Some(yaml.trim_end_matches(['\r', '\n'])), body);
        }
        offset += line.len();
    }
    (None, content)
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// The inline code on a line, as byte ranges, so nothing inside it is read
/// as a tag or a link.
fn code_spans(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'`' {
            i += 1;
            continue;
        }
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
        match close {
            Some(end) => {
                spans.push((i, end));
                i = end;
            }
            None => i += run,
        }
    }
    spans
}

/// Tags, links and tasks in a note's body.
pub(crate) fn scan_body(body: &str, meta: &mut NoteMeta) {
    let mut fence: Option<(char, usize)> = None;
    for line in body.lines() {
        let trimmed = line.trim_start();
        let marker = trimmed.chars().next().filter(|c| *c == '`' || *c == '~');
        let run = marker.map_or(0, |m| trimmed.chars().take_while(|c| *c == m).count());
        if let Some((open, length)) = fence {
            if marker == Some(open) && run >= length && trimmed[run..].trim().is_empty() {
                fence = None;
            }
            continue;
        }
        if run >= 3 && line.len() - trimmed.len() <= 3 {
            fence = marker.map(|m| (m, run));
            continue;
        }

        // Tasks: "- [ ] text" and "- [x] text", with any list marker.
        let item = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
            .or_else(|| trimmed.strip_prefix("+ "))
            .or_else(|| {
                let digits = trimmed.chars().take_while(char::is_ascii_digit).count();
                if digits == 0 {
                    return None;
                }
                trimmed[digits..]
                    .strip_prefix(". ")
                    .or_else(|| trimmed[digits..].strip_prefix(") "))
            });
        if let Some(item) = item {
            if item.starts_with("[ ] ") || item == "[ ]" {
                meta.tasks_open += 1;
            } else if item.len() >= 3
                && item.starts_with('[')
                && item.as_bytes().get(2) == Some(&b']')
                && !item.starts_with("[ ]")
            {
                meta.tasks_done += 1;
            }
        }

        let code = code_spans(line);
        let in_code = |pos: usize| code.iter().any(|(from, to)| pos >= *from && pos < *to);
        let bytes = line.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'[' if bytes.get(i + 1) == Some(&b'[') && !in_code(i) => {
                    let start = i + 2;
                    match line[start..].find(']') {
                        Some(k) if k > 0 && bytes.get(start + k + 1) == Some(&b']') => {
                            let inner = &line[start..start + k];
                            let target = inner.split('|').next().unwrap_or("");
                            let target = target.trim_end_matches('\\');
                            let file = match target.find('#') {
                                // "[[#Heading]]" is a link within the note itself.
                                Some(0) => "",
                                Some(h) => &target[..h],
                                None => target,
                            }
                            .trim();
                            if !file.is_empty() && !meta.links.iter().any(|l| l == file) {
                                meta.links.push(file.to_string());
                            }
                            i = start + k + 2;
                        }
                        _ => i += 2,
                    }
                }
                b'#' if !in_code(i) => {
                    // A tag starts a word: "#tag", not "a#b" or a heading's "# ".
                    let starts_word = i == 0
                        || line[..i]
                            .chars()
                            .next_back()
                            .is_some_and(|c| c.is_whitespace() || matches!(c, '(' | '[' | ',' | ';'));
                    let rest = &line[i + 1..];
                    let end = rest
                        .char_indices()
                        .find(|(_, c)| !is_tag_char(*c))
                        .map_or(rest.len(), |(at, _)| at);
                    let tag = rest[..end].trim_end_matches('/');
                    // All digits is an issue number or a count, not a tag.
                    let is_tag = starts_word
                        && !tag.is_empty()
                        && tag.chars().any(|c| !c.is_ascii_digit() && c != '/');
                    if is_tag && !meta.tags.iter().any(|t| t == tag) {
                        meta.tags.push(tag.to_string());
                    }
                    i += 1 + end;
                }
                _ => i += 1,
            }
        }
    }
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    time.ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// Read one note. `rel` is its path inside the vault with `/`.
fn read_note(path: &Path, rel: &str) -> Option<NoteMeta> {
    let content = fs::read_to_string(path).ok()?;
    let stat = fs::metadata(path).ok()?;
    let mtime = millis(stat.modified()).unwrap_or(0);
    let file_name = rel.rsplit('/').next().unwrap_or(rel);
    let lower = file_name.to_ascii_lowercase();
    let name = if lower.ends_with(".markdown") {
        &file_name[..file_name.len() - 9]
    } else if lower.ends_with(".md") {
        &file_name[..file_name.len() - 3]
    } else {
        file_name
    };
    let (frontmatter, body) = split_frontmatter(&content);
    let mut meta = NoteMeta {
        file_path: path.to_string_lossy().into_owned(),
        relative_path: rel.to_string(),
        name: name.to_string(),
        size: stat.len(),
        mtime,
        ctime: millis(stat.created()).unwrap_or(mtime),
        frontmatter: frontmatter
            .filter(|yaml| yaml.len() <= MAX_FRONTMATTER_BYTES)
            .map(str::to_string),
        ..NoteMeta::default()
    };
    scan_body(body, &mut meta);
    Some(meta)
}

/// Every note in the vault, in the order the app lists notes in.
pub(crate) fn index_vault(vault: &Path) -> Vec<NoteMeta> {
    crate::links::list_vault(vault)
        .into_iter()
        .filter(|rel| {
            let lower = rel.to_ascii_lowercase();
            lower.ends_with(".md") || lower.ends_with(".markdown")
        })
        .filter_map(|rel| {
            let mut path = vault.to_path_buf();
            for part in rel.split('/') {
                path.push(part);
            }
            read_note(&path, &rel)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(body: &str) -> NoteMeta {
        let mut meta = NoteMeta::default();
        scan_body(body, &mut meta);
        meta
    }

    #[test]
    fn frontmatter_is_split_from_the_body() {
        let (yaml, body) = split_frontmatter("---\ntitle: A\ntags: [x]\n---\n# Body\n");
        assert_eq!(yaml, Some("title: A\ntags: [x]"));
        assert_eq!(body, "# Body\n");

        let (yaml, body) = split_frontmatter("---\r\ntitle: A\r\n---\r\nBody");
        assert_eq!(yaml, Some("title: A"));
        assert_eq!(body, "Body");

        // An empty block, and the YAML document end marker.
        assert_eq!(split_frontmatter("---\n---\nBody"), (Some(""), "Body"));
        assert_eq!(split_frontmatter("---\na: 1\n...\nBody"), (Some("a: 1"), "Body"));
    }

    #[test]
    fn a_note_without_frontmatter_is_all_body() {
        for text in [
            "# Title\n",
            "--- not frontmatter\n",
            "---\nnever closed\n",
            "text\n---\na: 1\n---\n",
            "",
        ] {
            assert_eq!(split_frontmatter(text), (None, text), "{text:?}");
        }
    }

    #[test]
    fn tags_are_found_where_a_word_starts() {
        let meta = scan("Text #work and #project/alpha, (#in-brackets) #work again.\n#日本語 #a_b");
        assert_eq!(meta.tags, ["work", "project/alpha", "in-brackets", "日本語", "a_b"]);
    }

    #[test]
    fn headings_numbers_and_code_are_not_tags() {
        let meta = scan(
            "# Heading\n## Another #real\nIssue #123 and a#b and C# code\n`#inline` then ``a `#x` b``\n```\n#include <stdio.h>\n```\n~~~\n#also-code\n~~~\nurl.com/#anchor",
        );
        assert_eq!(meta.tags, ["real"]);
    }

    #[test]
    fn links_are_collected_by_their_file_part() {
        let meta = scan(
            "[[Inbox]] [[Inbox#Today|today]] ![[photo.png|160]] [[Projects/Plan]] [[#Top]] [[ Spaced ]]\n| t | [[Table\\|alias]] |\n`[[Code]]`\n```\n[[Fenced]]\n```\n[[]] [[unclosed",
        );
        assert_eq!(meta.links, ["Inbox", "photo.png", "Projects/Plan", "Spaced", "Table"]);
    }

    #[test]
    fn tasks_are_counted_by_state() {
        let meta = scan("- [ ] open\n- [x] done\n* [X] done too\n1. [ ] numbered\n  - [-] cancelled counts as done\n- not a task\n- [link](x)\n```\n- [ ] in code\n```\n");
        assert_eq!((meta.tasks_open, meta.tasks_done), (2, 3));
    }

    #[test]
    fn a_vault_is_indexed_in_listing_order_with_file_details() {
        let vault = std::env::temp_dir().join(format!("noteriv-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&vault);
        fs::create_dir_all(vault.join("Projects")).unwrap();
        fs::create_dir_all(vault.join(".obsidian")).unwrap();
        fs::write(vault.join("Inbox.md"), "---\naliases: [In]\n---\n#tag and [[Projects/Plan]]\n").unwrap();
        fs::write(vault.join("Projects/Plan.markdown"), "- [ ] one\n").unwrap();
        fs::write(vault.join("Projects/pic.png"), "png").unwrap();
        fs::write(vault.join(".obsidian/hidden.md"), "x").unwrap();
        let vault = dunce::canonicalize(&vault).unwrap();

        let index = index_vault(&vault);
        let rels: Vec<&str> = index.iter().map(|n| n.relative_path.as_str()).collect();
        assert_eq!(rels, ["Inbox.md", "Projects/Plan.markdown"]);

        let inbox = &index[0];
        assert_eq!(inbox.name, "Inbox");
        assert_eq!(inbox.frontmatter.as_deref(), Some("aliases: [In]"));
        assert_eq!(inbox.tags, ["tag"]);
        assert_eq!(inbox.links, ["Projects/Plan"]);
        assert!(inbox.size > 0 && inbox.mtime > 0 && inbox.ctime > 0);
        assert_eq!(std::path::Path::new(&inbox.file_path), vault.join("Inbox.md"));

        let plan = &index[1];
        assert_eq!((plan.name.as_str(), plan.tasks_open), ("Plan", 1));
        assert_eq!(plan.frontmatter, None);

        // The field names the frontend reads.
        let json = serde_json::to_value(inbox).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            ["ctime", "filePath", "frontmatter", "links", "mtime", "name", "relativePath", "size", "tags", "tasksDone", "tasksOpen"]
        );
        let _ = fs::remove_dir_all(&vault);
    }
}
