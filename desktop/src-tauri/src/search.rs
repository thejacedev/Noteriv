// Searching the vault with Obsidian's query language.
//
//   meeting notes            both words, anywhere in the note or its path
//   "exact phrase"           the words together
//   work OR home             either
//   -draft                   not containing
//   (a OR b) c               grouping
//   /regex/                  a regular expression
//   file:plan  path:work/    in the file name, in the path
//   content:cat              in the text only
//   tag:#work                the tag, or one nested under it
//   line:(mix flour)         both on one line
//   section:(dog cat)        both between two headings
//   block:(dog cat)          both in one paragraph
//   task:call  task-todo:call  task-done:call
//   match-case:Cat  ignore-case:cat
//   [status]  [status:done]  a property, or a property with a value
//
// A query is parsed into a small tree and each note is tested against it.
// The lines to show for a matching note are found afterwards, from the plain
// words and patterns the query asks for.

use regex::{Regex, RegexBuilder};
use serde::Serialize;
use std::fs;
use std::path::Path;

/// How many notes are returned, and how many lines per note.
const MAX_FILES: usize = 500;
const MAX_LINES_PER_FILE: usize = 30;
/// A longer line is cut here, so one minified line cannot bloat the answer.
const MAX_LINE_CHARS: usize = 400;

// ============================================================
// The query
// ============================================================

#[derive(Debug)]
enum Matcher {
    /// Plain text, kept as written and in lower case.
    Text { exact: String, lower: String },
    Pattern { sensitive: Regex, insensitive: Regex },
}

impl Matcher {
    fn text(text: &str) -> Matcher {
        Matcher::Text {
            exact: text.to_string(),
            lower: text.to_lowercase(),
        }
    }

    fn pattern(source: &str) -> Result<Matcher, String> {
        let build = |insensitive: bool| {
            RegexBuilder::new(source)
                .case_insensitive(insensitive)
                .size_limit(1 << 20)
                .build()
                .map_err(|e| format!("The regular expression /{source}/ is not valid: {e}"))
        };
        Ok(Matcher::Pattern {
            sensitive: build(false)?,
            insensitive: build(true)?,
        })
    }

    fn found_in(&self, text: &str, case_sensitive: bool) -> bool {
        match self {
            Matcher::Text { exact, lower } => {
                if case_sensitive {
                    text.contains(exact.as_str())
                } else {
                    text.to_lowercase().contains(lower.as_str())
                }
            }
            Matcher::Pattern { sensitive, insensitive } => {
                if case_sensitive { sensitive } else { insensitive }.is_match(text)
            }
        }
    }

    /// Where the matcher is found in `text`, as byte ranges.
    fn ranges_in(&self, text: &str, case_sensitive: bool, out: &mut Vec<(usize, usize)>) {
        match self {
            Matcher::Text { exact, lower } => {
                if exact.is_empty() {
                    return;
                }
                if case_sensitive {
                    out.extend(text.match_indices(exact.as_str()).map(|(i, m)| (i, i + m.len())));
                    return;
                }
                // Lower-casing can change a string's length, so match
                // character by character against the original text.
                let needle: Vec<char> = lower.chars().collect();
                let chars: Vec<(usize, char)> = text.char_indices().collect();
                let mut i = 0;
                while i + needle.len() <= chars.len() {
                    let hit = needle.iter().enumerate().all(|(k, want)| {
                        let mut folded = chars[i + k].1.to_lowercase();
                        folded.next() == Some(*want) && folded.next().is_none()
                    });
                    if hit {
                        let end = chars
                            .get(i + needle.len())
                            .map_or(text.len(), |(at, _)| *at);
                        out.push((chars[i].0, end));
                        i += needle.len().max(1);
                    } else {
                        i += 1;
                    }
                }
            }
            Matcher::Pattern { sensitive, insensitive } => {
                let re = if case_sensitive { sensitive } else { insensitive };
                out.extend(re.find_iter(text).filter(|m| !m.is_empty()).map(|m| (m.start(), m.end())));
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Scope {
    File,
    Path,
    Content,
    Tag,
    Line,
    Section,
    Block,
    Task,
    TaskTodo,
    TaskDone,
}

#[derive(Debug)]
enum Node {
    And(Vec<Node>),
    Or(Vec<Node>),
    Not(Box<Node>),
    Term(Matcher),
    Scoped(Scope, Box<Node>),
    /// `match-case:` and `ignore-case:`.
    Case(bool, Box<Node>),
    Property { name: String, value: Option<Box<Node>> },
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Open,
    Close,
    Or,
    Minus,
    Word(String),
    Quoted(String),
    Pattern(String),
    /// `name:` directly before its argument.
    Operator(String),
    /// `[name]` or `[name:value]`, the inside as written.
    Property(String),
}

const OPERATORS: &[(&str, Option<Scope>)] = &[
    ("file", Some(Scope::File)),
    ("path", Some(Scope::Path)),
    ("content", Some(Scope::Content)),
    ("tag", Some(Scope::Tag)),
    ("line", Some(Scope::Line)),
    ("section", Some(Scope::Section)),
    ("block", Some(Scope::Block)),
    ("task", Some(Scope::Task)),
    ("task-todo", Some(Scope::TaskTodo)),
    ("task-done", Some(Scope::TaskDone)),
    ("match-case", None),
    ("ignore-case", None),
];

fn tokenize(query: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = query.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        // What may start a new term: the start, a space, or an opening bracket.
        let at_start = i == 0 || chars[i - 1].is_whitespace() || matches!(chars[i - 1], '(' | ':' | '-');
        match c {
            '(' => {
                tokens.push(Token::Open);
                i += 1;
            }
            ')' => {
                tokens.push(Token::Close);
                i += 1;
            }
            '-' if at_start && chars.get(i + 1).is_some_and(|n| !n.is_whitespace()) => {
                tokens.push(Token::Minus);
                i += 1;
            }
            '"' => {
                let mut text = String::new();
                i += 1;
                let mut closed = false;
                while i < chars.len() {
                    if chars[i] == '\\' && chars.get(i + 1) == Some(&'"') {
                        text.push('"');
                        i += 2;
                    } else if chars[i] == '"' {
                        closed = true;
                        i += 1;
                        break;
                    } else {
                        text.push(chars[i]);
                        i += 1;
                    }
                }
                if !closed {
                    return Err("A quote is not closed.".into());
                }
                tokens.push(Token::Quoted(text));
            }
            '/' if at_start => {
                let mut source = String::new();
                i += 1;
                let mut closed = false;
                while i < chars.len() {
                    if chars[i] == '\\' && chars.get(i + 1) == Some(&'/') {
                        source.push('/');
                        i += 2;
                    } else if chars[i] == '/' {
                        closed = true;
                        i += 1;
                        break;
                    } else {
                        source.push(chars[i]);
                        i += 1;
                    }
                }
                if !closed {
                    return Err("A regular expression is not closed: end it with /.".into());
                }
                tokens.push(Token::Pattern(source));
            }
            '[' if at_start => {
                let mut inside = String::new();
                i += 1;
                let mut closed = false;
                while i < chars.len() {
                    if chars[i] == ']' {
                        closed = true;
                        i += 1;
                        break;
                    }
                    inside.push(chars[i]);
                    i += 1;
                }
                if !closed {
                    return Err("A property search is not closed: end it with ].".into());
                }
                tokens.push(Token::Property(inside));
            }
            _ => {
                let start = i;
                while i < chars.len() && !chars[i].is_whitespace() && !matches!(chars[i], '(' | ')' | '"') {
                    // "name:" before something is an operator; a colon elsewhere is text.
                    if chars[i] == ':' {
                        let name: String = chars[start..i].iter().collect();
                        let has_argument = chars.get(i + 1).is_some_and(|n| !n.is_whitespace());
                        if has_argument && OPERATORS.iter().any(|(op, _)| *op == name.to_lowercase()) {
                            break;
                        }
                    }
                    i += 1;
                }
                let word: String = chars[start..i].iter().collect();
                if chars.get(i) == Some(&':') && OPERATORS.iter().any(|(op, _)| *op == word.to_lowercase()) {
                    tokens.push(Token::Operator(word.to_lowercase()));
                    i += 1;
                } else if word == "OR" {
                    tokens.push(Token::Or);
                } else if !word.is_empty() {
                    tokens.push(Token::Word(word));
                }
            }
        }
    }
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn or(&mut self) -> Result<Node, String> {
        let mut options = vec![self.and()?];
        while self.peek() == Some(&Token::Or) {
            self.pos += 1;
            options.push(self.and()?);
        }
        Ok(if options.len() == 1 { options.remove(0) } else { Node::Or(options) })
    }

    fn and(&mut self) -> Result<Node, String> {
        let mut parts = Vec::new();
        while !matches!(self.peek(), None | Some(Token::Close) | Some(Token::Or)) {
            parts.push(self.unary()?);
        }
        if parts.is_empty() {
            return Err("Part of the search is empty.".into());
        }
        Ok(if parts.len() == 1 { parts.remove(0) } else { Node::And(parts) })
    }

    fn unary(&mut self) -> Result<Node, String> {
        if self.peek() == Some(&Token::Minus) {
            self.pos += 1;
            return Ok(Node::Not(Box::new(self.unary()?)));
        }
        self.primary()
    }

    fn primary(&mut self) -> Result<Node, String> {
        let token = self.tokens.get(self.pos).cloned().ok_or("The search ends too soon.")?;
        self.pos += 1;
        match &token {
            Token::Open => {
                let inner = self.or()?;
                if self.peek() != Some(&Token::Close) {
                    return Err("A bracket is not closed.".into());
                }
                self.pos += 1;
                Ok(inner)
            }
            Token::Word(word) => Ok(Node::Term(Matcher::text(word))),
            Token::Quoted(text) => Ok(Node::Term(Matcher::text(text))),
            Token::Pattern(source) => Ok(Node::Term(Matcher::pattern(source)?)),
            Token::Operator(name) => {
                let name = name.clone();
                let argument = Box::new(self.unary()?);
                Ok(match name.as_str() {
                    "match-case" => Node::Case(true, argument),
                    "ignore-case" => Node::Case(false, argument),
                    _ => {
                        let scope = OPERATORS
                            .iter()
                            .find(|(op, _)| *op == name)
                            .and_then(|(_, scope)| *scope)
                            .ok_or("Unknown search operator.")?;
                        Node::Scoped(scope, argument)
                    }
                })
            }
            Token::Property(inside) => {
                let (name, value) = match inside.split_once(':') {
                    Some((name, value)) => (name.trim(), Some(value.trim())),
                    None => (inside.trim(), None),
                };
                if name.is_empty() {
                    return Err("A property search needs a name: [name] or [name:value].".into());
                }
                let value = match value {
                    Some(v) if !v.is_empty() => Some(Box::new(parse(v)?)),
                    _ => None,
                };
                Ok(Node::Property {
                    name: name.to_lowercase(),
                    value,
                })
            }
            Token::Close => Err("There is a closing bracket with nothing to close.".into()),
            Token::Or => Err("OR needs something on both sides.".into()),
            Token::Minus => Err("A minus needs something after it.".into()),
        }
    }
}

fn parse(query: &str) -> Result<Node, String> {
    let tokens = tokenize(query)?;
    if tokens.is_empty() {
        return Err("The search is empty.".into());
    }
    let mut parser = Parser { tokens, pos: 0 };
    let node = parser.or()?;
    match parser.peek() {
        None => Ok(node),
        Some(Token::Close) => Err("There is a closing bracket with nothing to close.".into()),
        Some(_) => Err("The search could not be read.".into()),
    }
}

// ============================================================
// One note
// ============================================================

/// A note laid out for searching.
struct Doc<'a> {
    /// File name with its extension, and path inside the vault.
    name: &'a str,
    rel: &'a str,
    lines: Vec<&'a str>,
    tags: Vec<String>,
    properties: Vec<(String, Vec<String>)>,
    /// Line ranges, end exclusive.
    sections: Vec<(usize, usize)>,
    blocks: Vec<(usize, usize)>,
    /// Task lines, and whether each is done.
    tasks: Vec<(usize, bool)>,
}

/// Top-level `key: value` pairs of frontmatter, enough for a property search:
/// plain values, `[a, b]` lists, and `- item` lists under a key.
pub(crate) fn flat_properties(yaml: &str) -> Vec<(String, Vec<String>)> {
    fn clean(value: &str) -> String {
        let value = value.trim();
        let unquoted = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value);
        unquoted.to_string()
    }
    let mut out: Vec<(String, Vec<String>)> = Vec::new();
    for line in yaml.lines() {
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        if indented || line.starts_with("- ") {
            // An item of the list that the last key opened.
            if let (Some(item), Some(last)) = (line.trim_start().strip_prefix("- "), out.last_mut()) {
                let item = clean(item);
                if !item.is_empty() {
                    last.1.push(item);
                }
            }
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        let values = if let Some(list) = value.strip_prefix('[').and_then(|v| v.strip_suffix(']')) {
            list.split(',').map(clean).filter(|v| !v.is_empty()).collect()
        } else if value.is_empty() {
            Vec::new()
        } else {
            vec![clean(value)]
        };
        out.push((key.trim().to_lowercase(), values));
    }
    out
}

impl<'a> Doc<'a> {
    fn new(rel: &'a str, content: &'a str) -> Doc<'a> {
        let name = rel.rsplit('/').next().unwrap_or(rel);
        let lines: Vec<&str> = content.lines().collect();
        let (frontmatter, body) = crate::vault_index::split_frontmatter(content);

        let mut meta = crate::vault_index::NoteMeta::default();
        crate::vault_index::scan_body(body, &mut meta);
        let properties = frontmatter.map(flat_properties).unwrap_or_default();
        let mut tags: Vec<String> = meta.tags.iter().map(|t| t.to_lowercase()).collect();
        for (key, values) in &properties {
            if key == "tags" || key == "tag" {
                for value in values {
                    for tag in value.split([' ', ',']) {
                        let tag = tag.trim().trim_start_matches('#').to_lowercase();
                        if !tag.is_empty() && !tags.contains(&tag) {
                            tags.push(tag);
                        }
                    }
                }
            }
        }

        let mut sections = Vec::new();
        let mut blocks = Vec::new();
        let mut tasks = Vec::new();
        let mut section_start = 0;
        let mut block_start: Option<usize> = None;
        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with('#') && trimmed.trim_start_matches('#').starts_with(' ') && i > section_start {
                sections.push((section_start, i));
                section_start = i;
            }
            if line.trim().is_empty() {
                if let Some(start) = block_start.take() {
                    blocks.push((start, i));
                }
            } else if block_start.is_none() {
                block_start = Some(i);
            }
            let item = trimmed
                .strip_prefix("- ")
                .or_else(|| trimmed.strip_prefix("* "))
                .or_else(|| trimmed.strip_prefix("+ "));
            if let Some(item) = item {
                if item.starts_with("[ ]") {
                    tasks.push((i, false));
                } else if item.len() >= 3 && item.starts_with('[') && item.as_bytes().get(2) == Some(&b']') {
                    tasks.push((i, true));
                }
            }
        }
        if section_start < lines.len() {
            sections.push((section_start, lines.len()));
        }
        if let Some(start) = block_start {
            blocks.push((start, lines.len()));
        }

        Doc {
            name,
            rel,
            lines,
            tags,
            properties,
            sections,
            blocks,
            tasks,
        }
    }

    fn text_of(&self, range: (usize, usize)) -> String {
        self.lines[range.0..range.1].join("\n")
    }
}

/// Test a query against one piece of text, with scopes inside it ignored:
/// inside `line:( ... )` everything is about that line.
fn on_text(node: &Node, text: &str, case: bool) -> bool {
    match node {
        Node::And(parts) => parts.iter().all(|p| on_text(p, text, case)),
        Node::Or(parts) => parts.iter().any(|p| on_text(p, text, case)),
        Node::Not(inner) => !on_text(inner, text, case),
        Node::Term(matcher) => matcher.found_in(text, case),
        Node::Scoped(_, inner) => on_text(inner, text, case),
        Node::Case(sensitive, inner) => on_text(inner, text, *sensitive),
        Node::Property { .. } => false,
    }
}

fn matches(node: &Node, doc: &Doc, case: bool) -> bool {
    match node {
        Node::And(parts) => parts.iter().all(|p| matches(p, doc, case)),
        Node::Or(parts) => parts.iter().any(|p| matches(p, doc, case)),
        Node::Not(inner) => !matches(inner, doc, case),
        Node::Case(sensitive, inner) => matches(inner, doc, *sensitive),
        // A bare word is looked for in the text and in the path.
        Node::Term(matcher) => {
            matcher.found_in(doc.rel, case) || doc.lines.iter().any(|l| matcher.found_in(l, case))
        }
        Node::Scoped(scope, inner) => match scope {
            Scope::File => on_text(inner, doc.name, case),
            Scope::Path => on_text(inner, doc.rel, case),
            Scope::Content => {
                // Each word somewhere in the text, not all on one line.
                fn in_content(node: &Node, doc: &Doc, case: bool) -> bool {
                    match node {
                        Node::And(parts) => parts.iter().all(|p| in_content(p, doc, case)),
                        Node::Or(parts) => parts.iter().any(|p| in_content(p, doc, case)),
                        Node::Not(inner) => !in_content(inner, doc, case),
                        Node::Case(sensitive, inner) => in_content(inner, doc, *sensitive),
                        Node::Term(matcher) => doc.lines.iter().any(|l| matcher.found_in(l, case)),
                        other => matches(other, doc, case),
                    }
                }
                in_content(inner, doc, case)
            }
            Scope::Tag => doc.tags.iter().any(|tag| tag_matches(inner, tag)),
            Scope::Line => doc.lines.iter().any(|l| on_text(inner, l, case)),
            Scope::Section => doc.sections.iter().any(|s| on_text(inner, &doc.text_of(*s), case)),
            Scope::Block => doc.blocks.iter().any(|b| on_text(inner, &doc.text_of(*b), case)),
            Scope::Task | Scope::TaskTodo | Scope::TaskDone => doc.tasks.iter().any(|(line, done)| {
                let wanted = match scope {
                    Scope::TaskTodo => !*done,
                    Scope::TaskDone => *done,
                    _ => true,
                };
                wanted && on_text(inner, doc.lines[*line], case)
            }),
        },
        Node::Property { name, value } => doc.properties.iter().any(|(key, values)| {
            key == name
                && match value {
                    None => true,
                    Some(value) => values.iter().any(|v| on_text(value, v, case)),
                }
        }),
    }
}

/// `tag:#work` finds the tag "work" and tags nested under it, such as
/// "work/meetings", but not "homework" or "myjob/work".
fn tag_matches(node: &Node, tag: &str) -> bool {
    match node {
        Node::And(parts) => parts.iter().all(|p| tag_matches(p, tag)),
        Node::Or(parts) => parts.iter().any(|p| tag_matches(p, tag)),
        Node::Not(inner) => !tag_matches(inner, tag),
        Node::Case(_, inner) | Node::Scoped(_, inner) => tag_matches(inner, tag),
        Node::Term(Matcher::Text { lower, .. }) => {
            let wanted = lower.trim_start_matches('#');
            !wanted.is_empty()
                && (tag == wanted || tag.strip_prefix(wanted).is_some_and(|rest| rest.starts_with('/')))
        }
        Node::Term(pattern) => pattern.found_in(tag, false),
        Node::Property { .. } => false,
    }
}

/// The words and patterns whose places in the text are worth showing: those
/// the query asks for in the content, not the ones it excludes or looks for
/// in names, tags and properties.
fn highlights<'n>(node: &'n Node, case: bool, out: &mut Vec<(&'n Matcher, bool)>) {
    match node {
        Node::And(parts) | Node::Or(parts) => parts.iter().for_each(|p| highlights(p, case, out)),
        Node::Not(_) | Node::Property { .. } => {}
        Node::Term(matcher) => out.push((matcher, case)),
        Node::Case(sensitive, inner) => highlights(inner, *sensitive, out),
        Node::Scoped(scope, inner) => {
            if !matches!(scope, Scope::File | Scope::Path | Scope::Tag) {
                highlights(inner, case, out);
            }
        }
    }
}

// ============================================================
// The vault
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Sort {
    NameAsc,
    NameDesc,
    ModifiedNew,
    ModifiedOld,
    CreatedNew,
    CreatedOld,
}

impl Sort {
    pub(crate) fn from_name(name: &str) -> Sort {
        match name {
            "nameDesc" => Sort::NameDesc,
            "modifiedNew" => Sort::ModifiedNew,
            "modifiedOld" => Sort::ModifiedOld,
            "createdNew" => Sort::CreatedNew,
            "createdOld" => Sort::CreatedOld,
            _ => Sort::NameAsc,
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LineHit {
    /// 1-based.
    pub line: usize,
    pub text: String,
    /// Where in `text` the matches are, in UTF-16 units, as JavaScript counts.
    pub ranges: Vec<(usize, usize)>,
}

#[derive(Debug, Serialize)]
pub struct FileHit {
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    pub name: String,
    pub mtime: u64,
    pub ctime: u64,
    pub lines: Vec<LineHit>,
    /// Matching lines beyond the ones returned.
    #[serde(rename = "moreLines")]
    pub more_lines: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct SearchResult {
    pub files: Vec<FileHit>,
    /// Notes that matched, including any beyond the ones returned.
    #[serde(rename = "totalFiles")]
    pub total_files: usize,
    /// Set when the query could not be read. No files are returned then.
    pub error: Option<String>,
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// The lines of a note to show for a query, with the matches marked.
fn line_hits(node: &Node, doc: &Doc, case: bool) -> (Vec<LineHit>, usize) {
    let mut wanted = Vec::new();
    highlights(node, case, &mut wanted);
    let mut hits = Vec::new();
    let mut more = 0;
    if wanted.is_empty() {
        return (hits, more);
    }
    for (index, line) in doc.lines.iter().enumerate() {
        let mut ranges: Vec<(usize, usize)> = Vec::new();
        for (matcher, case) in &wanted {
            matcher.ranges_in(line, *case, &mut ranges);
        }
        if ranges.is_empty() {
            continue;
        }
        if hits.len() >= MAX_LINES_PER_FILE {
            more += 1;
            continue;
        }
        ranges.sort();
        ranges.dedup();
        // Cut a very long line, keeping whole characters.
        let cut = line
            .char_indices()
            .nth(MAX_LINE_CHARS)
            .map_or(line.len(), |(at, _)| at);
        let text = &line[..cut];
        let ranges = ranges
            .into_iter()
            .filter(|(_, to)| *to <= cut)
            .map(|(from, to)| (utf16_len(&line[..from]), utf16_len(&line[..to])))
            .collect();
        hits.push(LineHit {
            line: index + 1,
            text: text.to_string(),
            ranges,
        });
    }
    (hits, more)
}

/// Search every note in the vault.
pub(crate) fn search_vault(vault: &Path, query: &str, case_sensitive: bool, sort: Sort) -> SearchResult {
    let node = match parse(query.trim()) {
        Ok(node) => node,
        Err(error) => {
            return SearchResult {
                error: Some(error),
                ..SearchResult::default()
            }
        }
    };

    let mut files: Vec<FileHit> = Vec::new();
    for meta_rel in crate::links::list_vault(vault) {
        let lower = meta_rel.to_ascii_lowercase();
        if !(lower.ends_with(".md") || lower.ends_with(".markdown")) {
            continue;
        }
        let mut path = vault.to_path_buf();
        for part in meta_rel.split('/') {
            path.push(part);
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let doc = Doc::new(&meta_rel, &content);
        if !matches(&node, &doc, case_sensitive) {
            continue;
        }
        let (lines, more_lines) = line_hits(&node, &doc, case_sensitive);
        let stat = fs::metadata(&path).ok();
        let millis = |time: std::io::Result<std::time::SystemTime>| {
            time.ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64)
        };
        let mtime = stat.as_ref().map_or(0, |s| millis(s.modified()));
        let ctime = stat.as_ref().map_or(mtime, |s| {
            let created = millis(s.created());
            if created == 0 { mtime } else { created }
        });
        files.push(FileHit {
            file_path: path.to_string_lossy().into_owned(),
            name: doc.name.to_string(),
            relative_path: meta_rel.clone(),
            mtime,
            ctime,
            lines,
            more_lines,
        });
    }

    match sort {
        Sort::NameAsc => files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        Sort::NameDesc => files.sort_by(|a, b| b.name.to_lowercase().cmp(&a.name.to_lowercase())),
        Sort::ModifiedNew => files.sort_by(|a, b| b.mtime.cmp(&a.mtime)),
        Sort::ModifiedOld => files.sort_by(|a, b| a.mtime.cmp(&b.mtime)),
        Sort::CreatedNew => files.sort_by(|a, b| b.ctime.cmp(&a.ctime)),
        Sort::CreatedOld => files.sort_by(|a, b| a.ctime.cmp(&b.ctime)),
    }
    let total_files = files.len();
    files.truncate(MAX_FILES);
    SearchResult {
        files,
        total_files,
        error: None,
    }
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    const NOTE: &str = "\
---
status: done
tags: [work, project/alpha]
people:
  - Ada
  - \"Grace Hopper\"
rating: 5
---
# Baking Day

Mix flour and water, then knead.
The CAT sat with the dog.

## Shopping

- [ ] call the baker
- [x] buy flour
A happy cat lives here. #kitchen

Dog only in this block.
Water is far from here.
";

    fn hit(query: &str) -> bool {
        hit_in(query, "Recipes/Baking Day.md", NOTE, false)
    }

    fn hit_in(query: &str, rel: &str, content: &str, case: bool) -> bool {
        let node = parse(query).unwrap_or_else(|e| panic!("{query}: {e}"));
        matches(&node, &Doc::new(rel, content), case)
    }

    #[test]
    fn words_are_each_looked_for_and_all_must_be_found() {
        assert!(hit("flour"));
        assert!(hit("flour baker"));
        assert!(hit("FLOUR Baker"));
        assert!(!hit("flour unicorn"));
        // In the path too.
        assert!(hit("recipes"));
        assert!(hit("\"mix flour\""));
        assert!(!hit("\"flour mix\""));
        assert!(hit("\"cat sat\""));
    }

    #[test]
    fn or_not_and_brackets_combine_them() {
        assert!(hit("unicorn OR flour"));
        assert!(!hit("unicorn OR dragon"));
        assert!(hit("flour -unicorn"));
        assert!(!hit("flour -baker"));
        assert!(hit("(unicorn OR flour) baker"));
        assert!(!hit("(unicorn OR dragon) baker"));
        assert!(hit("-(unicorn dragon)"));
        // "or" in lower case is just a word.
        assert!(!hit("unicorn or flour"));
    }

    #[test]
    fn regular_expressions_match_text() {
        assert!(hit("/fl[aeiou]+r/"));
        assert!(hit("/^## shop/"));
        assert!(!hit("/^shop/"));
        assert!(hit("/\\d+/"));
        assert!(hit_in("/a\\/b/", "x.md", "see a/b here", false));
    }

    #[test]
    fn operators_narrow_where_to_look() {
        assert!(hit("file:baking"));
        assert!(!hit("file:recipes"));
        assert!(hit("path:recipes"));
        assert!(hit("path:\"Recipes/Baking\""));
        assert!(hit("content:flour"));
        assert!(!hit("content:recipes"));
        // A space after the colon makes it a plain word, not an operator.
        assert!(!hit("file: unicorn"));
    }

    #[test]
    fn tags_match_themselves_and_what_is_nested_under_them() {
        assert!(hit("tag:#work"));
        assert!(hit("tag:work"));
        assert!(hit("tag:#project"));
        assert!(hit("tag:#project/alpha"));
        assert!(hit("tag:#kitchen"));
        assert!(!hit("tag:#alpha"));
        assert!(!hit("tag:#wor"));
        assert!(hit("tag:#work tag:#kitchen"));
        assert!(!hit("-tag:#work"));
    }

    #[test]
    fn line_section_and_block_keep_the_words_together() {
        assert!(hit("line:(mix flour)"));
        assert!(hit("line:(cat dog)"));
        assert!(!hit("line:(flour dog)"));
        // "dog" and "water" share a paragraph only at the end.
        assert!(hit("block:(dog water)"));
        assert!(hit("block:(knead dog)"));
        assert!(!hit("block:(knead baker)"));
        assert!(hit("section:(baker happy)"));
        assert!(!hit("section:(knead baker)"));
        assert!(hit("line:(cat -dog)"));
    }

    #[test]
    fn tasks_are_searched_by_state() {
        assert!(hit("task:flour"));
        assert!(hit("task:baker"));
        assert!(hit("task-todo:baker"));
        assert!(!hit("task-todo:flour"));
        assert!(hit("task-done:flour"));
        assert!(!hit("task-done:baker"));
        assert!(!hit("task:knead"));
    }

    #[test]
    fn case_can_be_set_for_a_search_or_for_one_part() {
        assert!(hit_in("cat", "x.md", "The CAT sat", false));
        assert!(!hit_in("cat", "x.md", "The CAT sat", true));
        assert!(hit_in("CAT", "x.md", "The CAT sat", true));
        assert!(!hit("match-case:cat match-case:Flour"));
        assert!(hit("match-case:CAT"));
        assert!(hit_in("ignore-case:cat", "x.md", "The CAT sat", true));
        assert!(hit_in("/cat/", "x.md", "The CAT sat", false));
        assert!(!hit_in("/cat/", "x.md", "The CAT sat", true));
    }

    #[test]
    fn properties_are_found_by_name_and_by_value() {
        assert!(hit("[status]"));
        assert!(hit("[Status]"));
        assert!(!hit("[missing]"));
        assert!(hit("[status:done]"));
        assert!(!hit("[status:open]"));
        assert!(hit("[people:ada]"));
        assert!(hit("[people:\"Grace Hopper\"]"));
        assert!(hit("[rating:5]"));
        assert!(hit("[status:done OR open]"));
        assert!(hit("[status:done] flour"));
        assert!(!hit("-[status]"));
    }

    #[test]
    fn frontmatter_is_read_flat() {
        let props = flat_properties("title: \"A: B\"\ntags: [a, 'b c']\nlist:\n  - one\n  - two\nempty:\n# comment\nnum: 3");
        assert_eq!(
            props,
            vec![
                ("title".to_string(), vec!["A: B".to_string()]),
                ("tags".to_string(), vec!["a".to_string(), "b c".to_string()]),
                ("list".to_string(), vec!["one".to_string(), "two".to_string()]),
                ("empty".to_string(), vec![]),
                ("num".to_string(), vec!["3".to_string()]),
            ]
        );
    }

    #[test]
    fn a_query_that_cannot_be_read_says_why() {
        for (query, expected) in [
            ("", "empty"),
            ("\"open quote", "quote"),
            ("/open regex", "regular expression"),
            ("/[/", "not valid"),
            ("(a b", "bracket"),
            ("a )", "closing bracket"),
            ("a OR", "empty"),
            ("[", "property"),
            ("[:x]", "name"),
        ] {
            let err = parse(query).err().unwrap_or_else(|| panic!("{query:?} was accepted"));
            assert!(err.contains(expected), "{query:?}: {err}");
        }
    }

    #[test]
    fn punctuation_on_its_own_is_searched_for_as_text() {
        assert!(hit_in("-", "x.md", "a - b", false));
        assert!(hit_in("a:b", "x.md", "ratio a:b", false));
        assert!(hit_in("http://example.com", "x.md", "see http://example.com", false));
    }

    #[test]
    fn the_lines_shown_mark_what_was_searched_for() {
        let doc = Doc::new("Recipes/Baking Day.md", NOTE);
        let node = parse("flour -unicorn file:baking tag:#work").unwrap();
        let (lines, more) = line_hits(&node, &doc, false);
        assert_eq!(more, 0);
        let shown: Vec<(usize, &str)> = lines.iter().map(|l| (l.line, l.text.as_str())).collect();
        assert_eq!(
            shown,
            [(11, "Mix flour and water, then knead."), (17, "- [x] buy flour")]
        );
        assert_eq!(lines[0].ranges, [(4, 9)]);

        // Positions are counted the way JavaScript counts them.
        let doc = Doc::new("x.md", "naïve 🎉 Flour and FLOUR");
        let node = parse("flour").unwrap();
        let (lines, _) = line_hits(&node, &doc, false);
        assert_eq!(lines[0].ranges, [(9, 14), (19, 24)]);

        // A search that only names a file or a tag has no lines to show.
        let node = parse("file:baking").unwrap();
        assert!(line_hits(&node, &Doc::new("Recipes/Baking Day.md", NOTE), false).0.is_empty());
    }

    #[test]
    fn a_vault_is_searched_and_sorted() {
        let vault = std::env::temp_dir().join(format!("noteriv-search-{}", std::process::id()));
        let _ = fs::remove_dir_all(&vault);
        fs::create_dir_all(vault.join("Sub")).unwrap();
        fs::write(vault.join("Beta.md"), "flour here\n").unwrap();
        fs::write(vault.join("Sub/alpha.md"), "---\ntags: [work]\n---\nflour and flour\n").unwrap();
        fs::write(vault.join("Gamma.md"), "nothing\n").unwrap();
        fs::write(vault.join("notes.txt"), "flour\n").unwrap();

        let result = search_vault(&vault, "flour", false, Sort::NameAsc);
        assert_eq!(result.error, None);
        assert_eq!(result.total_files, 2);
        let names: Vec<&str> = result.files.iter().map(|f| f.relative_path.as_str()).collect();
        assert_eq!(names, ["Sub/alpha.md", "Beta.md"]);
        assert_eq!(result.files[0].lines[0].ranges, [(0, 5), (10, 15)]);

        let result = search_vault(&vault, "flour", false, Sort::NameDesc);
        assert_eq!(result.files[0].relative_path, "Beta.md");

        let result = search_vault(&vault, "tag:#work", false, Sort::NameAsc);
        assert_eq!(result.total_files, 1);
        assert!(result.files[0].lines.is_empty());

        let result = search_vault(&vault, "(broken", false, Sort::NameAsc);
        assert!(result.error.is_some());
        assert!(result.files.is_empty());

        // The field names the frontend reads.
        let json = serde_json::to_value(search_vault(&vault, "flour", false, Sort::ModifiedNew)).unwrap();
        let keys = |v: &serde_json::Value| {
            let mut k: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
            k.sort();
            k
        };
        assert_eq!(keys(&json), ["error", "files", "totalFiles"]);
        assert_eq!(
            keys(&json["files"][0]),
            ["ctime", "filePath", "lines", "moreLines", "mtime", "name", "relativePath"]
        );
        assert_eq!(keys(&json["files"][0]["lines"][0]), ["line", "ranges", "text"]);
        let _ = fs::remove_dir_all(&vault);
    }
}
