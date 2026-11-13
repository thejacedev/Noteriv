// Roam Research: the JSON export ("Export All", format JSON), as the
// `.json` file or the zip Roam downloads it in.
//
// The file is a list of pages. A page has a title and a tree of blocks;
// a block has its text (`string`), an id (`uid`) and child blocks:
//
//   [{ "title": "Project", "create-time": 1600000000000, "edit-time": ...,
//      "children": [{ "string": "text with [[Links]]", "uid": "a1B2c3D4e",
//                     "heading": 2, "children": [...] }] }]
//
// Each page becomes a note and each block a list item, nested as in Roam.
// Roam's own syntax is turned into what the app reads:
//
//   [[Page]], #[[Page]], [text]([[Page]])   links, by the note's final name
//   ((uid))                                 a link to the block, which gets
//                                           a `^id` so the link has a target
//   {{[[TODO]]}}, {{[[DONE]]}}              task boxes
//   {{[[embed]]: ((uid))}}                  an embed of the block
//   {{[[video]]: url}} and the like         the address
//   any other {{...}}                       kept as code, so nothing is lost
//   ^^text^^, __text__                      ==highlight==, *italics*
//   Name:: value                            **Name:** value
//
// A daily note is titled "January 21st, 2021" in Roam; it is named
// 2021-01-21 here, and links to it follow.
//
// A page with no text in it is not written. Roam makes a page for every
// name that was ever linked, and most of them are empty; a link to one
// stays a link to a note that does not exist yet, as it was in Roam.
//
// Not handled: pictures and files, which a Roam export only points at on
// Roam's servers (the links are kept), queries, and block text alignment.

use super::markdown::{
    code_mask, hold, plain_summary, release, replace_outside_code, rewrite_between, rewrite_links,
};
use super::output::{block_id, clean_name, from_millis, wikilink_to, Note, Output, Props, Slot};
use super::source::{decode_text, Nested, Source};
use chrono::NaiveDate;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Deserialize, Default)]
#[serde(default)]
struct Page {
    title: String,
    children: Vec<Block>,
    #[serde(rename = "create-time")]
    created: Option<i64>,
    #[serde(rename = "edit-time")]
    edited: Option<i64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Block {
    string: String,
    uid: String,
    children: Vec<Block>,
    heading: Option<u8>,
    #[serde(rename = "create-time")]
    created: Option<i64>,
    #[serde(rename = "edit-time")]
    edited: Option<i64>,
}

pub(crate) fn import(path: &Path, out: &mut Output) -> Result<(), String> {
    let pages = read_pages(path, out)?;

    // Names first: a block can link to any page, and to any block.
    let mut graph = Graph::default();
    for block in pages.iter().flat_map(|page| &page.children) {
        collect_references(block, &mut graph.referenced);
    }
    let mut planned: Vec<(&Page, Slot)> = Vec::new();
    for page in pages
        .iter()
        .filter(|page| page.children.iter().any(has_text))
    {
        let title = page.title.trim();
        let name = match roam_date(title) {
            Some(date) => date.format("%Y-%m-%d").to_string(),
            None => title.to_string(),
        };
        let slot = out.reserve::<&str>(&[], &name);
        graph
            .names
            .entry(title.to_string())
            .or_insert_with(|| slot.name.clone());
        graph
            .names_lower
            .entry(title.to_lowercase())
            .or_insert_with(|| slot.name.clone());
        for block in &page.children {
            index_blocks(block, &slot.name, &mut graph.blocks);
        }
        planned.push((page, slot));
    }

    for (page, slot) in planned {
        let mut lines = Vec::new();
        graph.render(&page.children, 0, &mut lines);
        let (first, last) = page.children.iter().fold((None, None), times);
        let created = page.created.or(first).and_then(from_millis);
        let updated = page.edited.or(last).and_then(from_millis);
        let mut props = Props::default();
        props.title_if_changed(&page.title, &slot);
        props.date("created", created);
        props.date("updated", updated);
        out.write(
            &slot,
            &Note {
                props,
                body: lines.join("\n"),
                modified: updated.or(created),
            },
        );
    }
    Ok(())
}

/// The pages of the export. One that is not shaped like a page is skipped.
fn read_pages(path: &Path, out: &mut Output) -> Result<Vec<Page>, String> {
    let is_json = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
    let mut documents: Vec<String> = Vec::new();
    if is_json && path.is_file() {
        let bytes = fs::read(path).map_err(|e| format!("The file could not be read: {e}."))?;
        documents.push(decode_text(&bytes));
    } else {
        let mut source = Source::open(path, Nested::Leave)?;
        for (name, reason) in source.take_rejected() {
            out.skip(&name, &reason);
        }
        for rel in source
            .files()
            .iter()
            .filter(|rel| rel.to_ascii_lowercase().ends_with(".json"))
        {
            match source.read_text(rel) {
                Ok(text) => documents.push(text),
                Err(reason) => out.skip(rel, &reason),
            }
        }
        if documents.is_empty() {
            return Err("No Roam Research export (.json) was found there.".to_string());
        }
    }

    let mut pages = Vec::new();
    for document in documents {
        let values: Vec<serde_json::Value> = serde_json::from_str(&document)
            .map_err(|e| format!("The file is not a Roam Research JSON export ({e})."))?;
        for (i, value) in values.into_iter().enumerate() {
            let title = value
                .get("title")
                .and_then(|title| title.as_str())
                .map(str::to_string);
            match serde_json::from_value::<Page>(value) {
                Ok(page) if title.is_some() => pages.push(page),
                Ok(_) => out.skip(
                    &format!("Page {}", i + 1),
                    "It has no title, so it is not a Roam page.",
                ),
                Err(e) => out.skip(
                    &title.unwrap_or_else(|| format!("Page {}", i + 1)),
                    &format!("The page could not be read ({e})."),
                ),
            }
        }
    }
    if pages.is_empty() {
        return Err("The export has no pages in it.".to_string());
    }
    Ok(pages)
}

fn has_text(block: &Block) -> bool {
    !block.string.trim().is_empty() || block.children.iter().any(has_text)
}

/// The earliest creation and the latest edit among a block and its children.
fn times(found: (Option<i64>, Option<i64>), block: &Block) -> (Option<i64>, Option<i64>) {
    let earliest = match (found.0, block.created) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    };
    let latest = match (found.1, block.edited) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (a, b) => a.or(b),
    };
    block.children.iter().fold((earliest, latest), times)
}

/// "January 21st, 2021", the title Roam gives a daily note.
fn roam_date(title: &str) -> Option<NaiveDate> {
    let (month_day, year) = title.split_once(", ")?;
    let (month, day) = month_day.split_once(' ')?;
    let day = day
        .strip_suffix("st")
        .or_else(|| day.strip_suffix("nd"))
        .or_else(|| day.strip_suffix("rd"))
        .or_else(|| day.strip_suffix("th"))?;
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let month = MONTHS.iter().position(|name| *name == month)? as u32 + 1;
    NaiveDate::from_ymd_opt(year.parse().ok()?, month, day.parse().ok()?)
}

/// The ids named by `((uid))` anywhere in a block or its children.
fn collect_references(block: &Block, referenced: &mut HashSet<String>) {
    let mut rest = block.string.as_str();
    while let Some(open) = rest.find("((") {
        rest = &rest[open + 2..];
        if let Some(close) = rest.find("))") {
            let uid = &rest[..close];
            if is_uid(uid) {
                referenced.insert(uid.to_string());
            }
        }
    }
    for child in &block.children {
        collect_references(child, referenced);
    }
}

fn is_uid(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 40
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn index_blocks<'a>(block: &'a Block, page: &str, blocks: &mut HashMap<String, Target<'a>>) {
    if !block.uid.is_empty() {
        blocks.entry(block.uid.clone()).or_insert_with(|| Target {
            page: page.to_string(),
            text: &block.string,
        });
    }
    for child in &block.children {
        index_blocks(child, page, blocks);
    }
}

/// A block as something to link to.
struct Target<'a> {
    /// The name of the note the block is in.
    page: String,
    text: &'a str,
}

impl Target<'_> {
    /// A `^id` at the end of a line that is a code fence would become part
    /// of the code, so such a block is linked to by its note alone.
    fn can_carry_id(&self) -> bool {
        !self.text.contains("```")
    }
}

/// A link made here, held back until the block is done so that no later
/// step takes it for one of Roam's own.
fn made_link(name: &str, anchor: &str, shown: Option<&str>) -> String {
    hold(&wikilink_to(name, anchor, shown))
}

#[derive(Default)]
struct Graph<'a> {
    /// A page's title to the name of its note, as written and in lower case.
    names: HashMap<String, String>,
    names_lower: HashMap<String, String>,
    blocks: HashMap<String, Target<'a>>,
    /// The blocks something refers to: only these need an id.
    referenced: HashSet<String>,
}

impl Graph<'_> {
    fn page_link(&self, title: &str, shown: Option<&str>) -> String {
        let title = title.trim();
        let name = self
            .names
            .get(title)
            .or_else(|| self.names_lower.get(&title.to_lowercase()))
            .cloned()
            // No such note: an empty page, which was not written. The link
            // still has to be a name the app can make a note from.
            .unwrap_or_else(|| match roam_date(title) {
                Some(date) => date.format("%Y-%m-%d").to_string(),
                None => clean_name(title),
            });
        made_link(&name, "", Some(shown.unwrap_or(title)))
    }

    fn block_link(&self, uid: &str, shown: Option<&str>, embed: bool) -> Option<String> {
        let target = self.blocks.get(uid)?;
        let anchor = if target.can_carry_id() {
            format!("#^{}", block_id(uid))
        } else {
            String::new()
        };
        if embed {
            return Some(format!("!{}", made_link(&target.page, &anchor, None)));
        }
        let summary = plain_summary(target.text);
        Some(made_link(
            &target.page,
            &anchor,
            Some(shown.unwrap_or(&summary)),
        ))
    }

    /// What `{{...}}` becomes.
    fn component(&self, inner: &str) -> Option<String> {
        let (keyword, argument) = match inner.split_once(':') {
            Some((keyword, argument)) => (keyword, argument.trim()),
            None => (inner, ""),
        };
        let keyword = keyword
            .trim()
            .trim_start_matches("[[")
            .trim_end_matches("]]")
            .trim()
            .to_ascii_lowercase();
        let between = |open: &str, close: &str| {
            argument
                .strip_prefix(open)
                .and_then(|rest| rest.strip_suffix(close))
        };
        match keyword.as_str() {
            "todo" => Some("[ ]".to_string()),
            "done" => Some("[x]".to_string()),
            "embed" | "embed-path" | "embed-children" => {
                if let Some(uid) = between("((", "))") {
                    self.block_link(uid, None, true)
                } else {
                    between("[[", "]]").map(|title| format!("!{}", self.page_link(title, None)))
                }
            }
            "video" | "youtube" | "iframe" | "pdf" | "audio" if argument.starts_with("http") => {
                Some(argument.to_string())
            }
            // Queries, tables, sliders: nothing the app can run. As code the
            // text is kept and left alone.
            _ if inner.contains('`') => None,
            _ => Some(format!("`{{{{{inner}}}}}`")),
        }
    }

    /// One block's text, with Roam's syntax turned into the app's.
    fn convert(&self, text: &str) -> String {
        let text = attribute(text);
        let text = replace_outside_code(&text, "#[[", "[[");
        let text = rewrite_components(&text, &mut |inner| self.component(inner));
        // "[shown]([[Page]])" and "[shown](((uid)))".
        let text = rewrite_links(&text, &mut |link| {
            if link.image {
                return None;
            }
            let target = link.target.trim();
            let page = target
                .strip_prefix("[[")
                .and_then(|rest| rest.strip_suffix("]]"));
            let block = target
                .strip_prefix("((")
                .and_then(|rest| rest.strip_suffix("))"));
            match (page, block) {
                (Some(title), _) => Some(self.page_link(title, Some(link.text))),
                (_, Some(uid)) => self.block_link(uid, Some(link.text), false),
                _ => None,
            }
        });
        let text = rewrite_between(&text, "((", "))", &mut |uid| {
            self.block_link(uid, None, false)
        });
        let text = rewrite_between(&text, "[[", "]]", &mut |title| {
            // A title with brackets in it may be a page of its own, or
            // just two links side by side; only a known page is taken whole.
            let known = self.names.contains_key(title.trim()) || !title.contains("[[");
            known.then(|| self.page_link(title, None))
        });
        let text = rewrite_between(&text, "^^", "^^", &mut |inner| Some(format!("=={inner}==")));
        let text = rewrite_between(&text, "__", "__", &mut |inner| Some(format!("*{inner}*")));
        release(&text)
    }

    fn render(&self, blocks: &[Block], depth: usize, lines: &mut Vec<String>) {
        let pad = "  ".repeat(depth);
        for block in blocks {
            if !has_text(block) {
                continue;
            }
            let mut text = self.convert(block.string.trim_end());
            let needs_id = self.referenced.contains(&block.uid) && !block.string.contains("```");
            if needs_id {
                text.push_str(&format!(" ^{}", block_id(&block.uid)));
            }
            let heading = match block.heading {
                Some(level @ 1..=3) => format!("{} ", "#".repeat(level.into())),
                _ => String::new(),
            };
            let mut text_lines = text.lines();
            lines.push(
                format!("{pad}- {heading}{}", text_lines.next().unwrap_or(""))
                    .trim_end()
                    .to_string(),
            );
            for line in text_lines {
                lines.push(if line.is_empty() {
                    String::new()
                } else {
                    format!("{pad}  {line}")
                });
            }
            self.render(&block.children, depth + 1, lines);
        }
    }
}

/// Rewrite Roam's `{{...}}` components. Braces inside one are counted, so
/// `{{[[query]]: {and: [[a]] [[b]]}}}` ends at its third closing brace.
fn rewrite_components(text: &str, rewrite: &mut dyn FnMut(&str) -> Option<String>) -> String {
    if !text.contains("{{") {
        return text.to_string();
    }
    let mask = code_mask(text);
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut at = 0;
    while let Some(found) = text[at..].find("{{") {
        let start = at + found;
        at = start + 2;
        if mask[start] {
            continue;
        }
        // The brace that balances the two that opened, on the same line.
        let mut depth = 2;
        let mut end = None;
        for (i, byte) in bytes.iter().enumerate().skip(start + 2) {
            match byte {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(i);
                        break;
                    }
                }
                b'\n' => break,
                _ => {}
            }
        }
        let Some(end) = end.filter(|end| bytes[end - 1] == b'}') else {
            continue;
        };
        if let Some(replacement) = rewrite(&text[start + 2..end - 1]) {
            out.push_str(&text[copied..start]);
            out.push_str(&replacement);
            copied = end + 1;
            at = end + 1;
        }
    }
    out.push_str(&text[copied..]);
    out
}

/// "Name:: value" at the start of a block is an attribute in Roam.
fn attribute(text: &str) -> String {
    let Some((name, value)) = text.split_once("::") else {
        return text.to_string();
    };
    let is_name = !name.is_empty()
        && name.len() <= 80
        && !name.contains(['\n', '`', ':', '[', '(', '{'])
        && name == name.trim()
        && (value.is_empty() || value.starts_with([' ', '\n']));
    if is_name {
        format!("**{name}:**{value}")
    } else {
        text.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;
    use chrono::{DateTime, Utc};
    use serde_json::json;

    /// So that a time in a test reads as a date.
    fn at(text: &str) -> i64 {
        text.parse::<DateTime<Utc>>().unwrap().timestamp_millis()
    }

    fn graph() -> serde_json::Value {
        json!([
            {
                "title": "Project",
                "uid": "pageuid01",
                "create-time": at("2021-01-31T12:34:56Z"),
                "edit-time": at("2021-02-01T08:00:00Z"),
                "children": [
                    { "string": "Goals for [[January 21st, 2021]] and #[[C# / F#: notes?]] and [[Nowhere/Yet]]", "uid": "blk_goals", "heading": 2, "children": [
                        { "string": "{{[[TODO]]}} write the ^^plan^^ with __care__", "uid": "blk-todo1" },
                        { "string": "{{[[DONE]]}} read ((blk_idea1))", "uid": "blk-done1", "children": [
                            { "string": "deeper, see [the idea](((blk_idea1))) and [notes]([[C# / F#: notes?]])", "uid": "blk-deep1" },
                        ] },
                        { "string": "", "uid": "blk-empty" },
                    ] },
                    { "string": "Status:: in progress", "uid": "blk-attr1" },
                    { "string": "```javascript\nlet x = [[1]];\n```", "uid": "blk-code1" },
                    { "string": "two\nlines and `((blk_idea1))` in code", "uid": "blk-lines" },
                    { "string": "{{[[embed]]: ((blk_idea1))}} {{[[video]]: https://youtu.be/x}} {{[[query]]: {and: [[a]] [[b]]}}} ((unknown00))", "uid": "blk-macro" },
                    { "string": "the code is at ((blk-code1)) and [[project]] is this page", "uid": "blk-ref2" },
                ],
            },
            {
                "title": "January 21st, 2021",
                "uid": "01-21-2021",
                "children": [
                    { "string": "An idea: [[Project]] needs a name with [[nested [[Project]] links]]", "uid": "blk_idea1", "create-time": at("2021-01-21T09:00:00Z"), "edit-time": at("2021-01-22T10:00:00Z") },
                ],
            },
            { "title": "C# / F#: notes?", "uid": "pageuid03", "children": [{ "string": "sharp", "uid": "blk-sharp" }] },
            { "title": "Nowhere/Yet", "uid": "pageuid04" },
            { "title": "Only empty blocks", "uid": "pageuid05", "children": [{ "string": "  ", "uid": "blk-blank" }] },
        ])
    }

    fn check(vault: &Path) {
        assert_eq!(
            files(vault),
            [
                "Roam/2021-01-21.md",
                "Roam/C - F notes.md",
                "Roam/Project.md"
            ]
        );
        assert_eq!(
            text(vault, "Roam/Project.md"),
            "---\n\
             created: 2021-01-31T12:34:56Z\n\
             updated: 2021-02-01T08:00:00Z\n\
             ---\n\
             \n\
             - ## Goals for [[2021-01-21|January 21st, 2021]] and [[C - F notes|C# / F#: notes?]] and [[Nowhere-Yet|Nowhere/Yet]]\n\
             \x20 - [ ] write the ==plan== with *care*\n\
             \x20 - [x] read [[2021-01-21#^blk-idea1|An idea: Project needs a name with nested Project links]]\n\
             \x20   - deeper, see [[2021-01-21#^blk-idea1|the idea]] and [[C - F notes|notes]]\n\
             - **Status:** in progress\n\
             - ```javascript\n\
             \x20 let x = [[1]];\n\
             \x20 ```\n\
             - two\n\
             \x20 lines and `((blk_idea1))` in code\n\
             - ![[2021-01-21#^blk-idea1]] https://youtu.be/x `{{[[query]]: {and: [[a]] [[b]]}}}` ((unknown00))\n\
             - the code is at [[Project|javascript]] and [[Project|project]] is this page\n"
        );
        assert_eq!(
            text(vault, "Roam/2021-01-21.md"),
            "---\n\
             title: January 21st, 2021\n\
             created: 2021-01-21T09:00:00Z\n\
             updated: 2021-01-22T10:00:00Z\n\
             ---\n\
             \n\
             - An idea: [[Project]] needs a name with [[nested [[Project]] links]] ^blk-idea1\n"
        );
        assert_eq!(
            text(vault, "Roam/C - F notes.md"),
            "---\ntitle: \"C# / F#: notes?\"\n---\n\n- sharp\n"
        );
    }

    #[test]
    fn pages_become_notes_and_blocks_become_nested_lists() {
        let dir = scratch("roam");
        write(&dir, "graph.json", graph().to_string());
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Roam").unwrap();
        import(&dir.join("graph.json"), &mut out).unwrap();
        let report = out.finish();
        assert_eq!(
            (report.notes, report.attachments, report.skipped.len()),
            (3, 0, 0)
        );
        check(&vault);
    }

    #[test]
    fn the_zip_roam_downloads_is_read_too() {
        let dir = scratch("roam-zip");
        write(
            &dir,
            "Roam-Export.zip",
            zip_bytes(&[("my-graph.json", graph().to_string().as_bytes())]),
        );
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Roam").unwrap();
        import(&dir.join("Roam-Export.zip"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 3);
        check(&vault);
    }

    #[test]
    fn a_page_that_cannot_be_read_is_skipped_and_the_rest_imported() {
        let dir = scratch("roam-bad");
        let export = json!([
            { "title": "Good", "children": [{ "string": "fine", "uid": "a" }] },
            { "title": "Bad", "children": "not a list" },
            { "no-title": true },
            { "title": "Good", "children": [{ "string": "also fine", "uid": "b" }] },
        ]);
        write(&dir, "graph.json", export.to_string());
        let mut out = Output::open(&dir, "R").unwrap();
        import(&dir.join("graph.json"), &mut out).unwrap();
        let report = out.finish();
        assert_eq!(files(&dir.join("R")), ["Good 2.md", "Good.md"]);
        let names: Vec<&str> = report.skipped.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Bad", "Page 3"]);
        assert!(report.skipped[0]
            .reason
            .starts_with("The page could not be read"));
    }

    #[test]
    fn a_file_that_is_not_an_export_is_refused() {
        let dir = scratch("roam-refused");
        write(&dir, "object.json", "{\"title\": \"not a list\"}");
        write(&dir, "empty.json", "[]");
        write(&dir, "only-empty.json", "[{\"title\": \"Empty\"}]");
        write(
            &dir,
            "notes.zip",
            zip_bytes(&[("readme.txt", b"no json".as_slice())]),
        );
        let mut out = Output::open(&dir, "R").unwrap();
        assert!(import(&dir.join("object.json"), &mut out)
            .unwrap_err()
            .starts_with("The file is not a Roam Research JSON export"));
        assert_eq!(
            import(&dir.join("empty.json"), &mut out).unwrap_err(),
            "The export has no pages in it."
        );
        assert_eq!(
            import(&dir.join("notes.zip"), &mut out).unwrap_err(),
            "No Roam Research export (.json) was found there."
        );
        // Pages, but nothing written on any of them: nothing to import, no error.
        import(&dir.join("only-empty.json"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 0);
    }

    #[test]
    fn dates_and_attributes_are_recognised() {
        assert_eq!(
            roam_date("January 21st, 2021"),
            NaiveDate::from_ymd_opt(2021, 1, 21)
        );
        assert_eq!(
            roam_date("March 3rd, 2020"),
            NaiveDate::from_ymd_opt(2020, 3, 3)
        );
        assert_eq!(roam_date("February 30th, 2021"), None);
        assert_eq!(roam_date("Project, 2021"), None);
        assert_eq!(attribute("Author:: Ann"), "**Author:** Ann");
        assert_eq!(attribute("Empty::"), "**Empty:**");
        assert_eq!(
            attribute("std::vec::Vec is a type"),
            "std::vec::Vec is a type"
        );
        assert_eq!(attribute("see [[a]]:: no"), "see [[a]]:: no");
    }
}
