// Logseq: a graph kept as files (not the newer database graphs), as its
// folder or a zip of it.
//
//   pages/Project.md                a page
//   pages/books___Dune.md           the page "books/Dune", a namespace
//   journals/2023_01_15.md          a daily note
//   assets/photo.png                files the pages show
//   logseq/config.edn               settings, read for the date format
//
// A page is an outline: every line that starts with "- " is a block, its
// depth is its indentation, and lines under it without a dash continue it.
// A "key:: value" line is a property, of the page when it stands at the top
// and of a block otherwise.
//
// What an import does with it:
//
// - Pages go into the destination folder, a namespace becoming folders:
//   "books/Dune" is the note Dune in the folder books. Journals go into a
//   folder Journals, named 2023-01-15.
// - Page properties become frontmatter: `tags` and `alias` as lists, the
//   rest as text. Block properties stay as lines of the block, apart from
//   the ones only Logseq reads (collapsed, logseq.*).
// - The outline is kept as a nested list. TODO, DOING, LATER and the like
//   become open task boxes, DONE and CANCELED ticked ones.
// - `[[Page]]`, `#[[Page]]`, `[text]([[Page]])` and links to an alias point
//   at the note's final name. A journal is linked by its title in Logseq
//   ("Jan 15th, 2023"); those links follow the note to its new name.
// - `((id))` links to the block with that `id::`, which gets a `^id`.
//   `{{embed ...}}` becomes an embed, `{{video ...}}` the address, any
//   other `{{...}}` (queries, renderers) is kept as code.
// - `#+BEGIN_QUOTE`, `_SRC`, `_NOTE` and the other blocks of that kind
//   become quotes, code blocks and callouts. `:LOGBOOK:` drawers are dropped.
// - A file under assets that a page shows or links is copied to the
//   attachments folder. Files nothing points at are not.
//
// Names are settled for every page before any is written.
//
// Not handled: Org-mode pages (skipped and reported), whiteboards and
// drawings, flashcard scheduling, PDF highlight data, and queries, which
// stay as their text.

use super::markdown::{
    hold, local_path, plain_summary, release, replace_outside_code, rewrite_between, rewrite_links,
};
use super::output::{
    clean_name, embed, from_millis, split_extension, wikilink_to, Note, Output, Props, Slot,
};
use super::source::{file_name, join, parent, resolve, Nested, Source};
use chrono::{Datelike, NaiveDate};
use std::collections::HashMap;
use std::path::Path;

pub(crate) fn import(path: &Path, out: &mut Output) -> Result<(), String> {
    let mut source = Source::open(path, Nested::Leave)?;
    for (name, reason) in source.take_rejected() {
        out.skip(&name, &reason);
    }
    let files = source.files();
    let root = graph_root(&files).ok_or_else(|| {
        "No Logseq graph was found. Choose the folder that holds the \"pages\" and \"journals\" folders.".to_string()
    })?;
    let config = match source.read_text(&join(&root, "logseq/config.edn")) {
        Ok(text) => Config::read(&text),
        Err(_) => Config::default(),
    };
    let pages_folder = format!("{}/", join(&root, &config.pages));
    let journals_folder = format!("{}/", join(&root, &config.journals));

    // Settle every name first.
    let mut index = Index::default();
    let mut planned: Vec<Planned> = Vec::new();
    for rel in &files {
        let is_journal = rel.starts_with(&journals_folder);
        if !is_journal && !rel.starts_with(&pages_folder) {
            continue;
        }
        let (stem, extension) = split_extension(file_name(rel));
        match extension.unwrap_or("").to_ascii_lowercase().as_str() {
            "md" | "markdown" => {}
            "org" => {
                out.skip(rel, "Org-mode pages are not supported.");
                continue;
            }
            _ => continue,
        }
        let parsed = match source.read_text(rel) {
            Ok(text) => parse_page(&text),
            Err(reason) => {
                out.skip(rel, &reason);
                continue;
            }
        };
        if parsed.is_empty() {
            continue;
        }

        let date = if is_journal { journal_date(stem) } else { None };
        let title = match date {
            Some(date) => format_date(date, &config.journal_title),
            None => parsed
                .title()
                .unwrap_or_else(|| title_from_file(stem, config.triple_lowbar)),
        };
        let mut folders: Vec<String> = Vec::new();
        if is_journal {
            folders.push("Journals".to_string());
        }
        let name = match date {
            Some(date) => date.format("%Y-%m-%d").to_string(),
            None => {
                // A namespace is a path: all of it but the last part is folders.
                let mut parts: Vec<&str> = title
                    .split('/')
                    .map(str::trim)
                    .filter(|part| !part.is_empty())
                    .collect();
                let name = parts.pop().unwrap_or("").to_string();
                folders.extend(parts.into_iter().map(str::to_string));
                name
            }
        };
        let slot = out.reserve(&folders, &name);
        index.files.insert(rel.to_lowercase(), slot.name.clone());
        for block in &parsed.blocks {
            if let Some(id) = &block.id {
                index
                    .blocks
                    .entry(id.clone())
                    .or_insert_with(|| BlockTarget {
                        page: slot.name.clone(),
                        summary: plain_summary(&task_marker(
                            block.lines.first().map_or("", String::as_str),
                        )),
                        carries_id: block.can_carry_id(),
                    });
            }
        }
        planned.push(Planned {
            rel: rel.clone(),
            slot,
            title,
            is_journal,
            date,
            parsed,
        });
    }
    if planned.is_empty() {
        return Err("The graph has no pages with anything written on them.".to_string());
    }

    // What a link can name, most certain first: a page by its title, then
    // by an alias, then a journal by its date. A title always wins, so a
    // page called "notes" is not hidden by "alpha/notes" or by an alias.
    for page in &planned {
        index
            .pages
            .entry(page.title.to_lowercase())
            .or_insert_with(|| page.slot.name.clone());
    }
    for page in &planned {
        let aliases = page.parsed.list("alias").into_iter();
        for alias in aliases.chain(page.parsed.list("aliases")) {
            index
                .pages
                .entry(alias.to_lowercase())
                .or_insert_with(|| page.slot.name.clone());
        }
    }
    for page in &planned {
        if let Some(date) = page.date {
            index
                .pages
                .entry(date.format("%Y-%m-%d").to_string())
                .or_insert_with(|| page.slot.name.clone());
        }
    }

    let mut writer = Writer {
        index: &index,
        source: &mut source,
        out,
        root: &root,
        attachments: HashMap::new(),
    };
    for page in &planned {
        writer.write(page);
    }
    Ok(())
}

/// The folder of the graph inside what was opened: "" when the folder that
/// was chosen is the graph, or the folder above "pages" or "journals" when
/// the graph lies deeper (a zip often wraps it in one folder).
fn graph_root(files: &[String]) -> Option<String> {
    files
        .iter()
        .filter_map(|rel| {
            let folders: Vec<&str> = parent(rel).split('/').collect();
            let at = folders
                .iter()
                .position(|folder| matches!(*folder, "pages" | "journals" | "logseq"))?;
            Some(folders[..at].join("/"))
        })
        .min_by_key(|root| root.matches('/').count() + usize::from(!root.is_empty()))
}

// ============================================================
// Settings
// ============================================================

struct Config {
    /// How a journal's title is written, in Logseq's date pattern.
    journal_title: String,
    /// Whether "a___b.md" is the page "a/b" (the current file naming), or
    /// "a.b.md" is (the old one).
    triple_lowbar: bool,
    pages: String,
    journals: String,
}

impl Default for Config {
    fn default() -> Config {
        Config {
            journal_title: "MMM do, yyyy".to_string(),
            triple_lowbar: true,
            pages: "pages".to_string(),
            journals: "journals".to_string(),
        }
    }
}

impl Config {
    /// Read the few settings that matter from `config.edn`. The file is
    /// Clojure data; each of these is a key followed by a string or a
    /// keyword on the same line, which is all that is looked for.
    fn read(edn: &str) -> Config {
        let value = |key: &str| -> Option<String> {
            edn.lines()
                .map(str::trim_start)
                .filter(|line| !line.starts_with(';'))
                .find_map(|line| {
                    let rest = line[line.find(key)? + key.len()..].trim_start();
                    if let Some(text) = rest.strip_prefix('"') {
                        return text.split('"').next().map(str::to_string);
                    }
                    let word = rest.strip_prefix(':')?;
                    word.split(|c: char| c.is_whitespace() || c == '}')
                        .next()
                        .map(str::to_string)
                })
                .filter(|value| !value.is_empty())
        };
        let defaults = Config::default();
        Config {
            journal_title: value(":journal/page-title-format ").unwrap_or(defaults.journal_title),
            // A graph made before the setting existed uses the old naming.
            triple_lowbar: value(":file/name-format ")
                .is_some_and(|format| format == "triple-lowbar"),
            pages: value(":pages-directory ").unwrap_or(defaults.pages),
            journals: value(":journals-directory ").unwrap_or(defaults.journals),
        }
    }
}

/// The page a file name stands for: "books___Dune" is "books/Dune", and
/// characters a file name cannot hold are written as `%3A` and the like.
fn title_from_file(stem: &str, triple_lowbar: bool) -> String {
    let separated = if triple_lowbar {
        stem.replace("___", "/")
    } else {
        stem.replace('.', "/")
    };
    urlencoding::decode(&separated)
        .map(|decoded| decoded.into_owned())
        .unwrap_or(separated)
}

/// The date in a journal's file name: "2023_01_15", or with dashes.
fn journal_date(stem: &str) -> Option<NaiveDate> {
    let mut parts = stem.split(['_', '-']);
    let year = parts.next().filter(|year| year.len() == 4)?.parse().ok()?;
    let month = parts.next()?.parse().ok()?;
    let day = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    NaiveDate::from_ymd_opt(year, month, day)
}

/// A date written with one of Logseq's patterns, such as "MMM do, yyyy"
/// for "Jan 15th, 2023". Text in single quotes is copied as it is.
fn format_date(date: NaiveDate, pattern: &str) -> String {
    const TOKENS: [&str; 13] = [
        "yyyy", "yy", "MMMM", "MMM", "MM", "M", "do", "dd", "d", "EEEE", "EEE", "EE", "E",
    ];
    let mut out = String::new();
    let mut rest = pattern;
    while let Some(c) = rest.chars().next() {
        if c == '\'' {
            let end = rest[1..].find('\'').map_or(rest.len(), |end| end + 1);
            out.push_str(&rest[1..end]);
            rest = &rest[(end + 1).min(rest.len())..];
            continue;
        }
        let Some(token) = TOKENS.iter().find(|token| rest.starts_with(**token)) else {
            out.push(c);
            rest = &rest[c.len_utf8()..];
            continue;
        };
        let written = match *token {
            "yyyy" => date.format("%Y").to_string(),
            "yy" => date.format("%y").to_string(),
            "MMMM" => date.format("%B").to_string(),
            "MMM" => date.format("%b").to_string(),
            "MM" => date.format("%m").to_string(),
            "M" => date.month().to_string(),
            "do" => ordinal(date.day()),
            "dd" => date.format("%d").to_string(),
            "d" => date.day().to_string(),
            "EEEE" => date.format("%A").to_string(),
            _ => date.format("%a").to_string(),
        };
        out.push_str(&written);
        rest = &rest[token.len()..];
    }
    out
}

fn ordinal(day: u32) -> String {
    let suffix = match (day % 10, day % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{day}{suffix}")
}

/// A date written out as a journal title, for a link to a day that has no
/// journal file: "Jan 15th, 2023", "January 15, 2023".
fn loose_date(title: &str) -> Option<NaiveDate> {
    const MONTHS: [&str; 12] = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    let lower = title.trim().to_lowercase();
    let mut words = lower.split([' ', ',']).filter(|word| !word.is_empty());
    // The whole name of a month, or the start of it: "jan", "sept".
    let month_word = words.next().filter(|word| word.len() >= 3)?;
    let month = MONTHS
        .iter()
        .position(|month| month.starts_with(month_word))? as u32
        + 1;
    let day = words
        .next()?
        .trim_end_matches(|c: char| c.is_ascii_alphabetic())
        .parse()
        .ok()?;
    let year = words.next().filter(|year| year.len() == 4)?.parse().ok()?;
    if words.next().is_some() {
        return None;
    }
    NaiveDate::from_ymd_opt(year, month, day)
}

// ============================================================
// Reading a page
// ============================================================

#[derive(Default)]
struct Parsed {
    /// A YAML block at the top of the file, kept as it is written.
    front: Option<String>,
    /// The page's "key:: value" properties.
    properties: Vec<(String, String)>,
    /// Text above the first block.
    preamble: Vec<String>,
    blocks: Vec<Block>,
}

struct Block {
    /// How deep the block is nested; 0 at the top.
    level: usize,
    /// Its text, without the dash and the indentation.
    lines: Vec<String>,
    /// The `id::` other blocks refer to it by.
    id: Option<String>,
    /// Part of a numbered list.
    numbered: bool,
}

impl Block {
    fn has_text(&self) -> bool {
        self.lines.iter().any(|line| !line.trim().is_empty())
    }

    /// A `^id` at the end of a code fence would become part of the code.
    fn can_carry_id(&self) -> bool {
        self.has_text()
            && !self
                .lines
                .iter()
                .any(|line| opens_or_closes_code(line.trim_start()))
    }
}

impl Parsed {
    fn is_empty(&self) -> bool {
        self.front.is_none()
            && self.properties.is_empty()
            && self.preamble.iter().all(|line| line.trim().is_empty())
            && !self.blocks.iter().any(Block::has_text)
    }

    fn property(&self, key: &str) -> Option<&str> {
        self.properties
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, value)| value.as_str())
    }

    /// A property that is a list: "a, [[b c]], #d" is a, b c and d.
    fn list(&self, key: &str) -> Vec<String> {
        self.property(key)
            .unwrap_or("")
            .split(',')
            .map(|item| {
                item.trim()
                    .trim_start_matches('#')
                    .trim_start_matches("[[")
                    .trim_end_matches("]]")
                    .trim()
                    .to_string()
            })
            .filter(|item| !item.is_empty())
            .collect()
    }

    /// The title the page gives itself, in a property or in a YAML block.
    fn title(&self) -> Option<String> {
        let from_yaml = || {
            self.front.as_ref()?.lines().find_map(|line| {
                let value = line.strip_prefix("title:")?.trim();
                Some(value.trim_matches(['"', '\'']).to_string())
            })
        };
        self.property("title")
            .map(str::to_string)
            .or_else(from_yaml)
            .filter(|title| !title.trim().is_empty())
    }
}

/// "key:: value", as Logseq writes a property.
fn property(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once("::")?;
    let is_key = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_alphanumeric() || "-_.?/".contains(c))
        && (value.is_empty() || value.starts_with(' '));
    is_key.then(|| (key, value.trim()))
}

fn opens_or_closes_code(line: &str) -> bool {
    line.starts_with("```") || line.starts_with("~~~")
}

fn parse_page(text: &str) -> Parsed {
    let text = text.replace("\r\n", "\n");
    let mut parsed = Parsed::default();
    let mut body = text.as_str();
    if let Some(rest) = body.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let after = &rest[end + 4..];
            if after.is_empty() || after.starts_with('\n') {
                parsed.front = Some(format!("---\n{}\n---", &rest[..end]));
                body = after;
            }
        }
    }

    // The indentation of the block being read and of each block it is in.
    let mut open: Vec<usize> = Vec::new();
    // Inside a code or Org block, where a line starting with a dash is not
    // a new block.
    let mut in_code = false;
    for line in body.lines() {
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        let starts_block = !in_code && (trimmed == "-" || trimmed.starts_with("- "));
        if starts_block {
            while open.last().is_some_and(|outer| *outer >= indent) {
                open.pop();
            }
            let first = trimmed[1..].trim_start();
            in_code =
                opens_or_closes_code(first) || first.to_ascii_uppercase().starts_with("#+BEGIN_");
            parsed.blocks.push(Block {
                level: open.len(),
                lines: vec![first.to_string()],
                id: None,
                numbered: false,
            });
            open.push(indent);
        } else if let (Some(block), Some(indent_of_block)) = (parsed.blocks.last_mut(), open.last())
        {
            // A line that continues a block is indented to line up with
            // the block's text, two columns past its dash.
            let lined_up = line
                .char_indices()
                .take(indent_of_block + 2)
                .take_while(|(_, c)| c.is_whitespace())
                .last()
                .map_or(0, |(i, c)| i + c.len_utf8());
            let content = &line[lined_up..];
            let upper = content.trim_start().to_ascii_uppercase();
            if opens_or_closes_code(content.trim_start()) {
                in_code = !in_code;
            } else if upper.starts_with("#+BEGIN_") {
                in_code = true;
            } else if upper.starts_with("#+END_") {
                in_code = false;
            }
            block.lines.push(content.to_string());
        } else if let Some((key, value)) = property(trimmed) {
            parsed.properties.push((key.to_string(), value.to_string()));
        } else {
            parsed.preamble.push(line.to_string());
        }
    }

    // A first block made only of properties holds the page's properties.
    let first_is_properties = parsed.blocks.first().is_some_and(|block| {
        block.has_text()
            && block
                .lines
                .iter()
                .all(|line| line.trim().is_empty() || property(line.trim()).is_some())
    });
    if first_is_properties {
        let block = parsed.blocks.remove(0);
        for line in &block.lines {
            if let Some((key, value)) = property(line.trim()) {
                parsed.properties.push((key.to_string(), value.to_string()));
            }
        }
    }
    for block in &mut parsed.blocks {
        take_block_properties(block);
    }
    parsed
}

/// Take out the properties that only mean something to Logseq, and note
/// what they said. Other properties stay as lines of the block.
fn take_block_properties(block: &mut Block) {
    let mut in_code = false;
    let mut kept = Vec::with_capacity(block.lines.len());
    for line in std::mem::take(&mut block.lines) {
        let trimmed = line.trim();
        if opens_or_closes_code(trimmed) {
            in_code = !in_code;
        }
        let found = if in_code { None } else { property(trimmed) };
        match found {
            Some(("id", value)) => block.id = Some(value.to_string()),
            Some(("logseq.order-list-type", value)) => block.numbered = value == "number",
            Some((key, _)) if key == "collapsed" || key.starts_with("logseq.") => {}
            _ => kept.push(line),
        }
    }
    while kept.last().is_some_and(|line| line.trim().is_empty()) {
        kept.pop();
    }
    block.lines = kept;
}

// ============================================================
// Writing
// ============================================================

struct Planned {
    rel: String,
    slot: Slot,
    title: String,
    is_journal: bool,
    /// The day a journal is for.
    date: Option<NaiveDate>,
    parsed: Parsed,
}

#[derive(Default)]
struct Index {
    /// A page's title or alias, in lower case, to the name of its note.
    pages: HashMap<String, String>,
    /// A page's file, by its path in lower case, to the name of its note.
    files: HashMap<String, String>,
    /// A block by its id.
    blocks: HashMap<String, BlockTarget>,
}

struct BlockTarget {
    page: String,
    summary: String,
    carries_id: bool,
}

struct Writer<'a> {
    index: &'a Index,
    source: &'a mut Source,
    out: &'a mut Output,
    root: &'a str,
    /// Files already copied, by their path in the graph.
    attachments: HashMap<String, String>,
}

impl Writer<'_> {
    fn write(&mut self, page: &Planned) {
        let folder = parent(&page.rel).to_string();
        let mut parts: Vec<String> = Vec::new();
        if let Some(front) = &page.parsed.front {
            parts.push(front.clone());
        }
        let preamble = page.parsed.preamble.join("\n");
        if !preamble.trim().is_empty() {
            parts.push(self.inline(preamble.trim(), &folder));
        }
        let outline = self.outline(&page.parsed.blocks, &folder);
        if !outline.is_empty() {
            parts.push(outline);
        }

        let mut props = Props::default();
        if !page.is_journal {
            props.title_if_changed(&page.title, &page.slot);
        }
        props.tags(page.parsed.list("tags"));
        let mut aliases = page.parsed.list("alias");
        aliases.extend(page.parsed.list("aliases"));
        props.list("aliases", aliases);
        for (key, value) in &page.parsed.properties {
            let time = value.parse::<i64>().ok().and_then(from_millis);
            match key.to_ascii_lowercase().as_str() {
                "title" | "tags" | "alias" | "aliases" | "id" | "collapsed" | "filters" => {}
                "created-at" if time.is_some() => props.date("created", time),
                "updated-at" if time.is_some() => props.date("updated", time),
                key if key.starts_with("logseq.") => {}
                _ => props.text(key, value),
            }
        }
        self.out.write(
            &page.slot,
            &Note {
                props,
                body: parts.join("\n\n"),
                modified: None,
            },
        );
    }

    /// The blocks as a nested list.
    fn outline(&mut self, blocks: &[Block], folder: &str) -> String {
        let mut lines: Vec<String> = Vec::new();
        // The indentation of an item at each depth, and the last number
        // given at each depth of a numbered list.
        let mut pads: Vec<String> = vec![String::new()];
        let mut numbers: Vec<usize> = Vec::new();
        for (i, block) in blocks.iter().enumerate() {
            let has_children = blocks
                .get(i + 1)
                .is_some_and(|next| next.level > block.level);
            if !block.has_text() && !has_children {
                continue;
            }
            let level = block.level.min(pads.len() - 1);
            pads.truncate(level + 1);
            numbers.resize(level + 1, 0);
            let marker = if block.numbered {
                numbers[level] += 1;
                format!("{}. ", numbers[level])
            } else {
                numbers[level] = 0;
                "- ".to_string()
            };
            let pad = pads[level].clone();
            let under = format!("{pad}{}", " ".repeat(marker.len()));

            let mut text = self.block_text(block, folder);
            if let Some(id) = block.id.as_ref().filter(|_| block.can_carry_id()) {
                text.push_str(&format!(" ^{id}"));
            }
            let mut text_lines = text.lines();
            lines.push(
                format!("{pad}{marker}{}", text_lines.next().unwrap_or(""))
                    .trim_end()
                    .to_string(),
            );
            for line in text_lines {
                lines.push(if line.is_empty() {
                    String::new()
                } else {
                    format!("{under}{line}")
                });
            }
            pads.push(under);
        }
        lines.join("\n")
    }

    fn block_text(&mut self, block: &Block, folder: &str) -> String {
        let mut lines = org_blocks(without_logbook(&block.lines));
        if let Some(first) = lines.first_mut() {
            *first = task_marker(first);
        }
        self.inline(&lines.join("\n"), folder)
    }

    /// Text with Logseq's links and macros turned into the app's.
    fn inline(&mut self, text: &str, folder: &str) -> String {
        let text = without_image_sizes(text);
        let text = replace_outside_code(&text, "#[[", "[[");
        let text = rewrite_between(&text, "{{", "}}", &mut |inner| self.macro_text(inner));
        let text = rewrite_links(&text, &mut |link| {
            let target = link.target.trim();
            let page = target
                .strip_prefix("[[")
                .and_then(|rest| rest.strip_suffix("]]"));
            let block = target
                .strip_prefix("((")
                .and_then(|rest| rest.strip_suffix("))"));
            match (page, block) {
                (Some(title), _) if !link.image => Some(self.page_link(title, Some(link.text))),
                (_, Some(id)) if !link.image => self.block_link(id, Some(link.text), false),
                _ => self.file_link(target, link.text, link.image, folder),
            }
        });
        let text = rewrite_between(&text, "((", "))", &mut |id| {
            self.block_link(id.trim(), None, false)
        });
        let text = rewrite_between(&text, "[[", "]]", &mut |title| {
            Some(self.page_link(title, None))
        });
        let text = rewrite_between(&text, "^^", "^^", &mut |inner| Some(format!("=={inner}==")));
        release(&text)
    }

    fn page_link(&self, title: &str, shown: Option<&str>) -> String {
        let title = title.trim();
        let name = self
            .index
            .pages
            .get(&title.to_lowercase())
            .cloned()
            .unwrap_or_else(|| {
                // No such page. A day without a journal still gets the name
                // its journal would have; anything else a name the app can use.
                match loose_date(title) {
                    Some(date) => date.format("%Y-%m-%d").to_string(),
                    None => clean_name(title),
                }
            });
        hold(&wikilink_to(&name, "", Some(shown.unwrap_or(title))))
    }

    fn block_link(&self, id: &str, shown: Option<&str>, embed: bool) -> Option<String> {
        let target = self.index.blocks.get(id)?;
        let anchor = if target.carries_id {
            format!("#^{id}")
        } else {
            String::new()
        };
        if embed {
            return Some(format!(
                "!{}",
                hold(&wikilink_to(&target.page, &anchor, None))
            ));
        }
        Some(hold(&wikilink_to(
            &target.page,
            &anchor,
            Some(shown.unwrap_or(&target.summary)),
        )))
    }

    /// What `{{name arguments}}` becomes.
    fn macro_text(&self, inner: &str) -> Option<String> {
        let (name, argument) = match inner.trim().split_once(char::is_whitespace) {
            Some((name, argument)) => (name, argument.trim()),
            None => (inner.trim(), ""),
        };
        let between = |open: &str, close: &str| {
            argument
                .strip_prefix(open)
                .and_then(|rest| rest.strip_suffix(close))
        };
        match name.to_ascii_lowercase().as_str() {
            "embed" => {
                if let Some(id) = between("((", "))") {
                    self.block_link(id.trim(), None, true)
                } else {
                    between("[[", "]]").map(|title| format!("!{}", self.page_link(title, None)))
                }
            }
            "video" | "youtube" | "vimeo" | "bilibili" | "tweet" | "twitter"
                if argument.starts_with("http") =>
            {
                Some(argument.to_string())
            }
            "cloze" => Some(argument.to_string()),
            _ if inner.contains('`') => None,
            _ => Some(format!("`{{{{{inner}}}}}`")),
        }
    }

    /// A link to a file of the graph: a picture or a document under assets,
    /// or another page by its path.
    fn file_link(&mut self, target: &str, text: &str, image: bool, folder: &str) -> Option<String> {
        let path = local_path(target)?;
        // Usually "../assets/x.png" from the page; some graphs write the
        // path from the top of the graph instead.
        let in_assets = path
            .rsplit_once("assets/")
            .map(|(_, rest)| join(self.root, &format!("assets/{rest}")));
        let found = resolve(folder, &path)
            .and_then(|rel| self.source.find(&rel).map(str::to_string))
            .or_else(|| in_assets.and_then(|rel| self.source.find(&rel).map(str::to_string)))?;
        if let Some(note) = self.index.files.get(&found.to_lowercase()) {
            return Some(hold(&wikilink_to(note, "", Some(text))));
        }
        let name = match self.attachments.get(&found) {
            Some(name) => name.clone(),
            None => {
                let source = &mut *self.source;
                match self
                    .out
                    .attach_with(file_name(&found), &mut |file| source.copy_to(&found, file))
                {
                    Ok(name) => {
                        self.attachments.insert(found, name.clone());
                        name
                    }
                    Err(reason) => {
                        self.out.skip(&found, &reason);
                        return None;
                    }
                }
            }
        };
        Some(hold(&if image {
            embed(&name)
        } else {
            wikilink_to(&name, "", Some(text))
        }))
    }
}

/// "TODO write" is an open task, "DONE write" a ticked one.
fn task_marker(line: &str) -> String {
    let (word, rest) = line.split_once(' ').unwrap_or((line, ""));
    match word {
        "TODO" | "DOING" | "NOW" | "LATER" | "WAIT" | "WAITING" | "IN-PROGRESS" => {
            format!("[ ] {rest}")
        }
        "DONE" => format!("[x] {rest}"),
        "CANCELED" | "CANCELLED" if !rest.trim().is_empty() => format!("[x] ~~{}~~", rest.trim()),
        _ => line.to_string(),
    }
}

/// The lines of a block without its `:LOGBOOK:` drawer, the record of when
/// a task was worked on.
fn without_logbook(lines: &[String]) -> Vec<String> {
    let mut kept = Vec::with_capacity(lines.len());
    let mut in_drawer = false;
    for line in lines {
        match line.trim() {
            ":LOGBOOK:" => in_drawer = true,
            ":END:" if in_drawer => in_drawer = false,
            _ if in_drawer => {}
            _ => kept.push(line.clone()),
        }
    }
    kept
}

/// Org-style blocks, which Logseq accepts in Markdown pages, as Markdown:
/// a source block as a code fence, a quote as a quote, a note or warning
/// as a callout.
fn org_blocks(lines: Vec<String>) -> Vec<String> {
    #[derive(PartialEq)]
    enum Inside {
        Nothing,
        Code,
        Quote,
        Comment,
    }
    let mut out = Vec::with_capacity(lines.len());
    let mut inside = Inside::Nothing;
    for line in lines {
        let trimmed = line.trim();
        let upper = trimmed.to_ascii_uppercase();
        if inside == Inside::Nothing && upper.starts_with("#+BEGIN_") {
            let rest = &trimmed["#+BEGIN_".len()..];
            let (kind, argument) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
            match kind.to_ascii_uppercase().as_str() {
                "SRC" | "EXAMPLE" | "EXPORT" | "QUERY" => {
                    out.push(format!(
                        "```{}",
                        argument.split_whitespace().next().unwrap_or("")
                    ));
                    inside = Inside::Code;
                }
                "QUOTE" | "VERSE" | "CENTER" => inside = Inside::Quote,
                "COMMENT" => inside = Inside::Comment,
                kind => {
                    let callout = match kind {
                        "TIP" => "tip",
                        "IMPORTANT" => "important",
                        "WARNING" => "warning",
                        "CAUTION" => "caution",
                        _ => "note",
                    };
                    out.push(format!("> [!{callout}]"));
                    inside = Inside::Quote;
                }
            }
        } else if inside != Inside::Nothing && upper.starts_with("#+END_") {
            if inside == Inside::Code {
                out.push("```".to_string());
            }
            inside = Inside::Nothing;
        } else {
            match inside {
                Inside::Quote if trimmed.is_empty() => out.push(">".to_string()),
                Inside::Quote => out.push(format!("> {line}")),
                Inside::Comment => {}
                _ => out.push(line),
            }
        }
    }
    if inside == Inside::Code {
        out.push("```".to_string());
    }
    out
}

/// Logseq writes a picture's size after it: `![x](a.png){:height 30, :width 40}`.
fn without_image_sizes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("){:") {
        let Some(end) = rest[at..].find('}') else {
            break;
        };
        out.push_str(&rest[..=at]);
        rest = &rest[at + end + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;
    use std::fs;

    const IDEA: &str = "64f8a1b2-1111-4222-8333-444455556666";
    const CODE: &str = "64f8a1b2-aaaa-4bbb-8ccc-ddddeeeeffff";

    fn graph() -> Vec<(String, Vec<u8>)> {
        let project = format!(
            "title:: Project X\ntags:: work, [[Big Idea]], #planning\nalias:: PX, The Project\ntype:: [[Plan]]\ncreated-at:: 1612096496000\ncollapsed:: true\n\n- ## Goals for [[Jan 15th, 2023]] and [[books/Dune]] and #[[Reading List]] and [[Jan 16th, 2023]] and [[New/Idea?]]\n\t- TODO write the ^^plan^^ with [[px]]\n\t  SCHEDULED: <2023-01-20 Fri>\n\t  :LOGBOOK:\n\t  CLOCK: [2023-01-15 Sun 10:00:00]--[2023-01-15 Sun 11:00:00] =>  01:00:00\n\t  :END:\n\t\t- DONE read (({IDEA})) and [the idea]((({IDEA})))\n\t\t  collapsed:: true\n\t- LATER [#A] ask [Sam]([[Sam Lee]])\n\t- CANCELED trip\n- ![diagram](../assets/diagram_1673775000000_0.png){{:height 200, :width 300}} and [the paper](../assets/Paper%20(final).pdf) and ![remote](https://example.com/r.png) and ![gone](../assets/missing.png)\n- ```clojure\n  - not a block\n  (def x [[1]])\n  ```\n  id:: {CODE}\n- {{{{embed (({IDEA}))}}}} {{{{embed [[Reading List]]}}}} {{{{video https://youtu.be/x}}}} {{{{query (and [[a]] [[b]])}}}} {{{{cloze hidden}}}}\n- see the code at (({CODE})) and ((00000000-0000-0000-0000-000000000000))\n- #+BEGIN_QUOTE\n  quoted [[px]]\n\n  more\n  #+END_QUOTE\n- #+BEGIN_SRC python\n  - print(1)\n  #+END_SRC\n- #+BEGIN_WARNING\n  careful\n  #+END_WARNING\n- steps\n  logseq.order-list-type:: number\n- more steps\n  logseq.order-list-type:: number\n\t- inside\n-\n- price:: 12\n  a block with its own property\n"
        );
        let journal = format!("- An idea about [[Project X]]\n  id:: {IDEA}\n- plain\n");
        vec![
            ("graph/pages/Project X.md".to_string(), project.into_bytes()),
            ("graph/pages/books___Dune.md".to_string(), b"- tags:: book\n  author:: Frank Herbert\n- A long book. See [[Books/dune]].\n".to_vec()),
            ("graph/pages/Reading List.md".to_string(), b"Some text before any block, with [[PX]].\n\n- [[books/Dune]]\n".to_vec()),
            ("graph/pages/With%3AColon.md".to_string(), b"---\ntitle: Front matter page\ntags: [a]\n---\n\n- body\n".to_vec()),
            ("graph/pages/empty.md".to_string(), b"-\n".to_vec()),
            ("graph/pages/old.org".to_string(), b"* Org page\n".to_vec()),
            ("graph/journals/2023_01_15.md".to_string(), journal.into_bytes()),
            ("graph/journals/notes.md".to_string(), b"- not a date\n".to_vec()),
            ("graph/assets/diagram_1673775000000_0.png".to_string(), b"png bytes".to_vec()),
            ("graph/assets/Paper (final).pdf".to_string(), b"pdf bytes".to_vec()),
            ("graph/assets/unused.png".to_string(), b"nothing shows this".to_vec()),
            ("graph/logseq/config.edn".to_string(), b"{:meta/version 1\n ;; :journal/page-title-format \"yyyy-MM-dd\"\n :journal/page-title-format \"MMM do, yyyy\"\n :file/name-format :triple-lowbar}\n".to_vec()),
            ("graph/logseq/pages-metadata.edn".to_string(), b"[]".to_vec()),
            ("graph/whiteboards/board.edn".to_string(), b"{}".to_vec()),
        ]
    }

    fn check(vault: &Path) {
        assert_eq!(
            files(vault),
            [
                "Logseq/Front matter page.md",
                "Logseq/Journals/2023-01-15.md",
                "Logseq/Journals/notes.md",
                "Logseq/Project X.md",
                "Logseq/Reading List.md",
                "Logseq/attachments/Paper (final).pdf",
                "Logseq/attachments/diagram_1673775000000_0.png",
                "Logseq/books/Dune.md",
            ]
        );
        assert_eq!(
            text(vault, "Logseq/Project X.md"),
            format!(
                "---\n\
                 tags: [work, Big-Idea, planning]\n\
                 aliases: [PX, The Project]\n\
                 type: \"[[Plan]]\"\n\
                 created: 2021-01-31T12:34:56Z\n\
                 ---\n\
                 \n\
                 - ## Goals for [[2023-01-15|Jan 15th, 2023]] and [[Dune|books/Dune]] and [[Reading List]] and [[2023-01-16|Jan 16th, 2023]] and [[New-Idea|New/Idea?]]\n\
                 \x20 - [ ] write the ==plan== with [[Project X|px]]\n\
                 \x20   SCHEDULED: <2023-01-20 Fri>\n\
                 \x20   - [x] read [[2023-01-15#^{IDEA}|An idea about Project X]] and [[2023-01-15#^{IDEA}|the idea]]\n\
                 \x20 - [ ] [#A] ask [[Sam Lee|Sam]]\n\
                 \x20 - [x] ~~trip~~\n\
                 - ![[diagram_1673775000000_0.png]] and [[Paper (final).pdf|the paper]] and ![remote](https://example.com/r.png) and ![gone](../assets/missing.png)\n\
                 - ```clojure\n\
                 \x20 - not a block\n\
                 \x20 (def x [[1]])\n\
                 \x20 ```\n\
                 - ![[2023-01-15#^{IDEA}]] ![[Reading List]] https://youtu.be/x `{{{{query (and [[a]] [[b]])}}}}` hidden\n\
                 - see the code at [[Project X|clojure]] and ((00000000-0000-0000-0000-000000000000))\n\
                 - > quoted [[Project X|px]]\n\
                 \x20 >\n\
                 \x20 > more\n\
                 - ```python\n\
                 \x20 - print(1)\n\
                 \x20 ```\n\
                 - > [!warning]\n\
                 \x20 > careful\n\
                 1. steps\n\
                 2. more steps\n\
                 \x20  - inside\n\
                 - price:: 12\n\
                 \x20 a block with its own property\n"
            )
        );
        assert_eq!(
            text(vault, "Logseq/Journals/2023-01-15.md"),
            format!("- An idea about [[Project X]] ^{IDEA}\n- plain\n")
        );
        assert_eq!(
            text(vault, "Logseq/books/Dune.md"),
            "---\ntitle: books/Dune\ntags: [book]\nauthor: Frank Herbert\n---\n\n- A long book. See [[Dune|Books/dune]].\n"
        );
        assert_eq!(
            text(vault, "Logseq/Reading List.md"),
            "Some text before any block, with [[Project X|PX]].\n\n- [[Dune|books/Dune]]\n"
        );
        assert_eq!(
            text(vault, "Logseq/Front matter page.md"),
            "---\ntitle: Front matter page\ntags: [a]\n---\n\n- body\n"
        );
        assert_eq!(
            fs::read(vault.join("Logseq/attachments/Paper (final).pdf")).unwrap(),
            b"pdf bytes"
        );
    }

    #[test]
    fn a_graph_folder_becomes_notes_with_its_outline_links_and_assets() {
        let dir = scratch("logseq");
        for (name, bytes) in graph() {
            write(&dir, &name, bytes);
        }
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Logseq").unwrap();
        import(&dir.join("graph"), &mut out).unwrap();
        let report = out.finish();
        assert_eq!((report.notes, report.attachments), (6, 2));
        let skipped: Vec<(&str, &str)> = report
            .skipped
            .iter()
            .map(|s| (s.name.as_str(), s.reason.as_str()))
            .collect();
        assert_eq!(
            skipped,
            [("pages/old.org", "Org-mode pages are not supported.")]
        );
        check(&vault);
    }

    #[test]
    fn a_zipped_graph_is_found_inside_its_folder() {
        let entries = graph();
        let entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
            .collect();
        let dir = scratch("logseq-zip");
        write(&dir, "graph.zip", zip_bytes(&entries));
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Logseq").unwrap();
        import(&dir.join("graph.zip"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 6);
        check(&vault);
    }

    #[test]
    fn a_link_goes_to_the_page_with_that_title_before_any_other() {
        // "alpha/notes" is named "notes" as a file and is read first; the
        // page really called "notes" comes later and gets a number. So does
        // a page that has "notes" as an alias of its own.
        let dir = scratch("logseq-same-name");
        write(&dir, "g/pages/alpha___notes.md", "- in the namespace\n");
        write(
            &dir,
            "g/pages/aaa.md",
            "alias:: notes, Other\n\n- has the alias\n",
        );
        write(&dir, "g/pages/notes.md", "- the page itself\n");
        write(
            &dir,
            "g/pages/zzz.md",
            "- [[notes]] [[alpha/notes]] [[other]] [[2024-02-03]] [[Feb 3rd, 2024]]\n",
        );
        write(&dir, "g/journals/2024_02_03.md", "- a day\n");
        write(
            &dir,
            "g/logseq/config.edn",
            "{:file/name-format :triple-lowbar}",
        );
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        // A note with the journal's name is already in the vault.
        write(&vault, "2024-02-03.md", "mine\n");
        let mut out = Output::open(&vault, "L").unwrap();
        import(&dir.join("g"), &mut out).unwrap();
        out.finish();
        assert_eq!(
            files(&vault),
            [
                "2024-02-03.md",
                "L/Journals/2024-02-03 2.md",
                "L/aaa.md",
                "L/alpha/notes.md",
                "L/notes 2.md",
                "L/zzz.md",
            ]
        );
        assert_eq!(text(&vault, "L/notes 2.md"), "- the page itself\n");
        assert_eq!(
            text(&vault, "L/zzz.md"),
            "- [[notes 2|notes]] [[notes|alpha/notes]] [[aaa|other]] [[2024-02-03 2|2024-02-03]] [[2024-02-03 2|Feb 3rd, 2024]]\n"
        );
    }

    #[test]
    fn a_folder_that_is_not_a_graph_is_refused() {
        let dir = scratch("logseq-refused");
        write(&dir, "notes/a.md", "- a\n");
        write(&dir, "blank/pages/a.md", "-\n");
        let mut out = Output::open(&dir, "L").unwrap();
        assert!(import(&dir.join("notes"), &mut out)
            .unwrap_err()
            .starts_with("No Logseq graph was found."));
        assert_eq!(
            import(&dir.join("blank"), &mut out).unwrap_err(),
            "The graph has no pages with anything written on them."
        );
    }

    #[test]
    fn an_outline_is_read_by_its_indentation() {
        let parsed = parse_page(
            "- a\n  - b\n      - c\n  continues b? no: c\n  - d\n- e\n\t- f\n\t\t- g\n\t- h\n",
        );
        let levels: Vec<(usize, &str)> = parsed
            .blocks
            .iter()
            .map(|block| (block.level, block.lines[0].as_str()))
            .collect();
        assert_eq!(
            levels,
            [
                (0, "a"),
                (1, "b"),
                (2, "c"),
                (1, "d"),
                (0, "e"),
                (1, "f"),
                (2, "g"),
                (1, "h")
            ]
        );
        assert_eq!(parsed.blocks[2].lines, ["c", "continues b? no: c"]);

        // Spaces inside the text of a continued line are kept.
        let parsed = parse_page("- code:\n  ```\n      indented\n  - dash\n  ```\n- next\n");
        assert_eq!(
            parsed.blocks[0].lines,
            ["code:", "```", "    indented", "- dash", "```"]
        );
        assert_eq!(parsed.blocks.len(), 2);
    }

    #[test]
    fn dates_are_written_and_read_in_logseq_patterns() {
        let date = NaiveDate::from_ymd_opt(2023, 1, 5).unwrap();
        assert_eq!(format_date(date, "MMM do, yyyy"), "Jan 5th, 2023");
        assert_eq!(
            format_date(date, "EEEE, MMMM d, yyyy"),
            "Thursday, January 5, 2023"
        );
        assert_eq!(format_date(date, "yyyy-MM-dd EEE"), "2023-01-05 Thu");
        assert_eq!(format_date(date, "dd/M/yy 'at' x"), "05/1/23 at x");
        assert_eq!(
            [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31]
                .map(ordinal)
                .join(" "),
            "1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 31st"
        );
        assert_eq!(journal_date("2023_01_05"), Some(date));
        assert_eq!(journal_date("2023-1-5"), Some(date));
        assert_eq!(journal_date("notes"), None);
        assert_eq!(journal_date("2023_13_05"), None);
        assert_eq!(loose_date("Jan 5th, 2023"), Some(date));
        assert_eq!(loose_date("January 5, 2023"), Some(date));
        assert_eq!(loose_date("Janet 5th, 2023"), None);
        assert_eq!(loose_date("Jan 5th, 2023 and more"), None);
        assert_eq!(loose_date("Project X"), None);
    }

    #[test]
    fn settings_and_file_names_follow_the_graph() {
        let old = Config::read(
            "{:journal/page-title-format \"yyyy-MM-dd\"\n :pages-directory \"notes\"}",
        );
        assert_eq!(
            (
                old.journal_title.as_str(),
                old.triple_lowbar,
                old.pages.as_str(),
                old.journals.as_str()
            ),
            ("yyyy-MM-dd", false, "notes", "journals")
        );
        assert!(Config::read("{:file/name-format :triple-lowbar}").triple_lowbar);
        assert_eq!(title_from_file("a___b%3A c.d", true), "a/b: c.d");
        assert_eq!(title_from_file("a.b%2Fc", false), "a/b/c");
        assert_eq!(property("key:: value"), Some(("key", "value")));
        assert_eq!(property("empty::"), Some(("empty", "")));
        assert_eq!(property("std::vec"), None);
        assert_eq!(property("not a key:: x"), None);
    }
}
