// HTML to Markdown, for Evernote notes and HTML files.
//
// The page is parsed by html5ever, which follows the rules browsers follow,
// so broken markup comes out as the tree a browser would build. The tree is
// then written out in two kinds of pieces: a block element (a paragraph,
// heading, list, table, quote or code block) becomes a block of Markdown,
// and the inline content between blocks (text, bold, links, images) becomes
// paragraphs.
//
// Choices that are not obvious:
//
// - A `<br>` becomes a plain line break. The app shows a line break as one,
//   and trailing spaces or backslashes would be noise in every note.
// - Lists that follow each other stay separate lists. Evernote's older
//   checkboxes are the exception: it writes each task as a paragraph of its
//   own, and tasks in a row are put back together as one list.
// - Text is escaped only where Markdown would read it as syntax: emphasis
//   marks, a "#" or "-" that starts a line, "[[", HTML tags. Escaping every
//   character that could ever matter makes notes unreadable.
// - A table that holds another table is page layout, not data. Its cells
//   are written one after another instead.
// - An element that Markdown has no word for (underline, font, colour)
//   keeps its text and loses the styling.
//
// What a link or an image points at is the caller's business: a `Resolver`
// is asked first, and can answer with a link to a note or an attachment.
//
// Nothing here recurses deeper than `MAX_DEPTH`. A page nested deeper than
// that keeps its text and loses its structure below that point, rather than
// overflowing the stack.

use html5ever::tendril::{StrTendril, TendrilSink};
use html5ever::tree_builder::{ElementFlags, NodeOrText, QuirksMode, TreeSink};
use html5ever::{
    parse_document, Attribute, ExpandedName, LocalName, Namespace, ParseOpts, QualName,
};
use std::borrow::Cow;
use std::cell::RefCell;
use std::rc::{Rc, Weak};

const MAX_DEPTH: usize = 200;

/// Stand-ins for a checkbox while a line is put together. They are private
/// use characters, removed from any text that is read.
const BOX_OPEN: char = '\u{E000}';
const BOX_TICKED: char = '\u{E001}';

// ============================================================
// The tree
// ============================================================

#[derive(PartialEq, Eq)]
enum Kind {
    Document,
    Element,
    Text,
    /// Comments, processing instructions: nothing that is shown.
    Other,
}

struct Node {
    kind: Kind,
    /// The element's name. Empty for anything that is not an element.
    name: QualName,
    attrs: RefCell<Vec<(String, String)>>,
    text: RefCell<String>,
    children: RefCell<Vec<Rc<Node>>>,
    parent: RefCell<Weak<Node>>,
}

type Handle = Rc<Node>;

impl Node {
    fn new(kind: Kind, name: QualName, attrs: Vec<(String, String)>, text: &str) -> Handle {
        Rc::new(Node {
            kind,
            name,
            attrs: RefCell::new(attrs),
            text: RefCell::new(text.to_string()),
            children: RefCell::new(Vec::new()),
            parent: RefCell::new(Weak::new()),
        })
    }

    fn plain(kind: Kind, text: &str) -> Handle {
        let no_name = QualName::new(None, Namespace::from(""), LocalName::from(""));
        Node::new(kind, no_name, Vec::new(), text)
    }

    /// The tag in lower case, or "" for anything that is not an element.
    fn tag(&self) -> &str {
        &self.name.local
    }

    fn is(&self, tag: &str) -> bool {
        self.kind == Kind::Element && self.tag() == tag
    }

    fn attr(&self, name: &str) -> Option<String> {
        self.attrs
            .borrow()
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    }

    /// The `style` attribute without spaces, in lower case, so that
    /// "font-weight: Bold" is found as "font-weight:bold".
    fn style(&self) -> String {
        self.attr("style")
            .unwrap_or_default()
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase()
    }

    fn children(&self) -> Vec<Handle> {
        self.children.borrow().clone()
    }
}

/// A long chain of only children would otherwise be freed by a function
/// calling itself once per level.
impl Drop for Node {
    fn drop(&mut self) {
        let mut waiting: Vec<Handle> = std::mem::take(self.children.get_mut());
        while let Some(node) = waiting.pop() {
            if Rc::strong_count(&node) == 1 {
                waiting.append(&mut node.children.borrow_mut());
            }
        }
    }
}

fn detach(node: &Handle) {
    let parent = node.parent.replace(Weak::new()).upgrade();
    if let Some(parent) = parent {
        parent
            .children
            .borrow_mut()
            .retain(|child| !Rc::ptr_eq(child, node));
    }
}

fn append_node(parent: &Handle, node: Handle) {
    detach(&node);
    *node.parent.borrow_mut() = Rc::downgrade(parent);
    parent.children.borrow_mut().push(node);
}

fn append_text(parent: &Handle, text: &str) {
    if let Some(last) = parent.children.borrow().last() {
        if last.kind == Kind::Text {
            last.text.borrow_mut().push_str(text);
            return;
        }
    }
    append_node(parent, Node::plain(Kind::Text, text));
}

/// Receives the tree from html5ever as it parses.
struct Sink {
    document: Handle,
}

impl TreeSink for Sink {
    type Handle = Handle;
    type Output = Handle;
    type ElemName<'a> = ExpandedName<'a>;

    fn finish(self) -> Handle {
        self.document
    }

    fn parse_error(&self, _message: Cow<'static, str>) {}

    fn get_document(&self) -> Handle {
        self.document.clone()
    }

    fn elem_name<'a>(&'a self, target: &'a Handle) -> ExpandedName<'a> {
        target.name.expanded()
    }

    fn create_element(
        &self,
        name: QualName,
        attrs: Vec<Attribute>,
        _flags: ElementFlags,
    ) -> Handle {
        let attrs = attrs
            .into_iter()
            .map(|attr| (attr.name.local.to_string(), attr.value.to_string()))
            .collect();
        Node::new(Kind::Element, name, attrs, "")
    }

    fn create_comment(&self, _text: StrTendril) -> Handle {
        Node::plain(Kind::Other, "")
    }

    fn create_pi(&self, _target: StrTendril, _data: StrTendril) -> Handle {
        Node::plain(Kind::Other, "")
    }

    fn append(&self, parent: &Handle, child: NodeOrText<Handle>) {
        match child {
            NodeOrText::AppendNode(node) => append_node(parent, node),
            NodeOrText::AppendText(text) => append_text(parent, &text),
        }
    }

    fn append_based_on_parent_node(
        &self,
        element: &Handle,
        prev_element: &Handle,
        child: NodeOrText<Handle>,
    ) {
        if element.parent.borrow().upgrade().is_some() {
            self.append_before_sibling(element, child);
        } else {
            self.append(prev_element, child);
        }
    }

    fn append_doctype_to_document(
        &self,
        _name: StrTendril,
        _public_id: StrTendril,
        _system_id: StrTendril,
    ) {
    }

    /// A template is never shown, so its contents can live in it.
    fn get_template_contents(&self, target: &Handle) -> Handle {
        target.clone()
    }

    fn same_node(&self, x: &Handle, y: &Handle) -> bool {
        Rc::ptr_eq(x, y)
    }

    fn set_quirks_mode(&self, _mode: QuirksMode) {}

    fn append_before_sibling(&self, sibling: &Handle, new_node: NodeOrText<Handle>) {
        let Some(parent) = sibling.parent.borrow().upgrade() else {
            return;
        };
        let node = match new_node {
            NodeOrText::AppendNode(node) => {
                detach(&node);
                node
            }
            NodeOrText::AppendText(text) => {
                let children = parent.children.borrow();
                let before = children
                    .iter()
                    .position(|child| Rc::ptr_eq(child, sibling))
                    .and_then(|index| index.checked_sub(1))
                    .map(|index| &children[index]);
                if let Some(before) = before.filter(|node| node.kind == Kind::Text) {
                    before.text.borrow_mut().push_str(&text);
                    return;
                }
                drop(children);
                Node::plain(Kind::Text, &text)
            }
        };
        *node.parent.borrow_mut() = Rc::downgrade(&parent);
        let mut children = parent.children.borrow_mut();
        let index = children
            .iter()
            .position(|child| Rc::ptr_eq(child, sibling))
            .unwrap_or(children.len());
        children.insert(index, node);
    }

    fn add_attrs_if_missing(&self, target: &Handle, attrs: Vec<Attribute>) {
        let mut existing = target.attrs.borrow_mut();
        for attr in attrs {
            let name = attr.name.local.to_string();
            if !existing.iter().any(|(key, _)| *key == name) {
                existing.push((name, attr.value.to_string()));
            }
        }
    }

    fn remove_from_parent(&self, target: &Handle) {
        detach(target);
    }

    fn reparent_children(&self, node: &Handle, new_parent: &Handle) {
        let moved = std::mem::take(&mut *node.children.borrow_mut());
        for child in moved {
            *child.parent.borrow_mut() = Rc::downgrade(new_parent);
            new_parent.children.borrow_mut().push(child);
        }
    }
}

/// Every element under `root` with this tag, in document order. Written
/// with a list instead of a function calling itself, for deep pages.
fn find_all(root: &Handle, tag: &str) -> Vec<Handle> {
    let mut found = Vec::new();
    let mut waiting = vec![root.clone()];
    while let Some(node) = waiting.pop() {
        if node.is(tag) {
            found.push(node.clone());
        }
        waiting.extend(node.children.borrow().iter().rev().cloned());
    }
    found
}

/// All the text under a node, as written. Hidden elements inside it are
/// left out; the node itself may be one (a `<title>` is asked for its text).
fn text_of(root: &Handle) -> String {
    let mut text = root.text.borrow().clone();
    let mut waiting: Vec<Handle> = root.children.borrow().iter().rev().cloned().collect();
    while let Some(node) = waiting.pop() {
        if node.kind == Kind::Text {
            text.push_str(&node.text.borrow());
        } else if !is_hidden(node.tag()) {
            waiting.extend(node.children.borrow().iter().rev().cloned());
        }
    }
    text
}

fn collapse(text: &str) -> String {
    text.split(|c: char| c.is_whitespace() || c == '\u{a0}')
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

// ============================================================
// What the caller decides
// ============================================================

/// Asked what a link, an image or an Evernote attachment should become.
/// Answering `None` keeps an ordinary Markdown link or image.
pub(crate) trait Resolver {
    fn image(&mut self, _src: &str, _alt: &str) -> Option<String> {
        None
    }
    fn link(&mut self, _href: &str, _text: &str) -> Option<String> {
        None
    }
    /// An `<en-media>` element, by the hash of the attachment it shows.
    fn media(&mut self, _hash: &str, _mime: &str) -> Option<String> {
        None
    }
}

/// Keeps every link and image as it is written.
pub(crate) struct KeepLinks;
impl Resolver for KeepLinks {}

// ============================================================
// A parsed page
// ============================================================

pub(crate) struct Document {
    root: Handle,
}

impl Document {
    pub(crate) fn parse(html: &str) -> Document {
        let sink = Sink {
            document: Node::plain(Kind::Document, ""),
        };
        let root = parse_document(sink, ParseOpts::default()).one(html);
        Document { root }
    }

    /// The page's `<title>`, if it has one with text in it.
    pub(crate) fn title(&self) -> Option<String> {
        find_all(&self.root, "title")
            .first()
            .map(|title| collapse(&text_of(title)))
            .filter(|title| !title.is_empty())
    }

    /// The address the page says it was saved from.
    pub(crate) fn canonical_url(&self) -> Option<String> {
        find_all(&self.root, "link")
            .iter()
            .find(|link| {
                link.attr("rel")
                    .is_some_and(|rel| rel.eq_ignore_ascii_case("canonical"))
            })
            .and_then(|link| link.attr("href"))
            .map(|href| href.trim().to_string())
            .filter(|href| href.starts_with("http://") || href.starts_with("https://"))
    }

    fn body(&self) -> Handle {
        find_all(&self.root, "body")
            .into_iter()
            .next()
            .unwrap_or_else(|| self.root.clone())
    }

    fn render(&self, from: &Handle, resolver: &mut dyn Resolver) -> String {
        let mut renderer = Renderer { resolver };
        join_blocks(&renderer.blocks_in(from, 0))
    }

    /// Everything the page shows, as Markdown.
    pub(crate) fn to_markdown(&self, resolver: &mut dyn Resolver) -> String {
        self.render(&self.body(), resolver)
    }

    /// The part of a web page that is its content, as Markdown: the one
    /// `<main>` or `<article>` if there is exactly one, without the menus
    /// and footers around it. Otherwise everything the page shows.
    pub(crate) fn article_to_markdown(&self, resolver: &mut dyn Resolver) -> String {
        let only_one = ["main", "article"].iter().find_map(|tag| {
            let found = find_all(&self.root, tag);
            match found.as_slice() {
                [only] => Some(only.clone()),
                _ => None,
            }
        });
        self.render(&only_one.unwrap_or_else(|| self.body()), resolver)
    }
}

pub(crate) fn to_markdown(html: &str, resolver: &mut dyn Resolver) -> String {
    Document::parse(html).to_markdown(resolver)
}

/// Run a conversion so that a failure in it costs one note and not the
/// import. Pages come from anywhere, and a panic on one of them should be
/// reported like any other note that could not be read.
pub(crate) fn guarded<T>(convert: impl FnOnce() -> T) -> Result<T, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(convert))
        .map_err(|_| "Its content could not be converted to Markdown.".to_string())
}

/// The media type and the bytes of a `data:` address, as some pages use
/// for pictures written into the page itself.
pub(crate) fn decode_data_uri(uri: &str) -> Option<(String, Vec<u8>)> {
    use base64::Engine;
    let (header, data) = uri.strip_prefix("data:")?.split_once(',')?;
    let mut parts = header.split(';');
    let mime = parts.next().unwrap_or("").trim().to_ascii_lowercase();
    let bytes = if parts.any(|part| part.trim().eq_ignore_ascii_case("base64")) {
        let compact: Vec<u8> = data
            .bytes()
            .filter(|byte| !byte.is_ascii_whitespace())
            .collect();
        base64::engine::general_purpose::STANDARD
            .decode(compact)
            .ok()?
    } else {
        urlencoding::decode_binary(data.as_bytes()).into_owned()
    };
    Some((mime, bytes))
}

// ============================================================
// Blocks
// ============================================================

#[derive(Clone, Copy, PartialEq, Eq)]
enum Shape {
    /// A paragraph, a heading, a table: anything with space around it.
    Plain,
    /// A list. Inside a list item it follows the item's text directly.
    List,
    /// Task lines made from a paragraph that starts with a checkbox.
    /// Evernote writes each task as a paragraph of its own, so ones that
    /// follow each other are put back together as one list.
    Tasks,
}

struct Block {
    text: String,
    shape: Shape,
}

impl Block {
    fn plain(text: String) -> Block {
        Block {
            text,
            shape: Shape::Plain,
        }
    }

    fn list(text: String) -> Block {
        Block {
            text,
            shape: Shape::List,
        }
    }
}

fn join_blocks(blocks: &[Block]) -> String {
    let mut out = String::new();
    for (i, block) in blocks.iter().enumerate() {
        if i > 0 {
            let tight = block.shape == Shape::Tasks && blocks[i - 1].shape == Shape::Tasks;
            out.push_str(if tight { "\n" } else { "\n\n" });
        }
        out.push_str(&block.text);
    }
    out
}

/// Never shown by a browser, or nothing Markdown can hold.
fn is_hidden(tag: &str) -> bool {
    matches!(
        tag,
        "script"
            | "style"
            | "head"
            | "title"
            | "meta"
            | "link"
            | "base"
            | "noscript"
            | "template"
            | "svg"
            | "math"
            | "object"
            | "embed"
            | "iframe"
            | "canvas"
            | "audio"
            | "video"
            | "select"
            | "button"
            | "textarea"
            | "datalist"
            | "map"
            | "area"
    )
}

fn is_block_tag(tag: &str) -> bool {
    matches!(
        tag,
        "address"
            | "article"
            | "aside"
            | "blockquote"
            | "body"
            | "caption"
            | "center"
            | "dd"
            | "details"
            | "dialog"
            | "dir"
            | "div"
            | "dl"
            | "dt"
            | "en-note"
            | "fieldset"
            | "figcaption"
            | "figure"
            | "footer"
            | "form"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "header"
            | "hgroup"
            | "hr"
            | "html"
            | "li"
            | "main"
            | "menu"
            | "nav"
            | "ol"
            | "p"
            | "pre"
            | "section"
            | "summary"
            | "table"
            | "tbody"
            | "td"
            | "tfoot"
            | "th"
            | "thead"
            | "tr"
            | "ul"
    )
}

#[derive(Clone, Copy, Default)]
struct Style {
    bold: bool,
    italic: bool,
    strike: bool,
    highlight: bool,
    /// Inside the text of a link, where a "]" would end it.
    link: bool,
}

/// Picks out the field of a `Style` that says whether one kind of mark is
/// already open.
type Flag = fn(&mut Style) -> &mut bool;

struct Renderer<'r> {
    resolver: &'r mut dyn Resolver,
}

impl Renderer<'_> {
    /// Whether a node starts a block of its own. An inline element that
    /// wraps blocks (a link around paragraphs, a span around a list) is
    /// treated as a plain container, which loses its styling and keeps the
    /// structure.
    fn is_block(&self, node: &Handle, depth: usize) -> bool {
        if node.kind != Kind::Element || is_hidden(node.tag()) {
            return false;
        }
        if is_block_tag(node.tag()) {
            return true;
        }
        depth < MAX_DEPTH
            && node
                .children
                .borrow()
                .iter()
                .any(|child| self.is_block(child, depth + 1))
    }

    /// The blocks made by the children of a container.
    fn blocks_in(&mut self, node: &Handle, depth: usize) -> Vec<Block> {
        let mut blocks = Vec::new();
        if depth >= MAX_DEPTH {
            push_paragraphs(&mut blocks, &escape_text(&collapse(&text_of(node))));
            return blocks;
        }
        // Inline nodes in a row wait here until a block, or the end, makes
        // a paragraph of them.
        let mut run: Vec<Handle> = Vec::new();
        for child in node.children() {
            if self.is_block(&child, depth) {
                self.flush(&mut run, &mut blocks, depth);
                self.block(&child, &mut blocks, depth + 1);
            } else {
                run.push(child);
            }
        }
        self.flush(&mut run, &mut blocks, depth);
        blocks
    }

    fn flush(&mut self, run: &mut Vec<Handle>, blocks: &mut Vec<Block>, depth: usize) {
        if run.is_empty() {
            return;
        }
        let mut text = String::new();
        for node in run.drain(..) {
            self.inline(&node, Style::default(), depth + 1, &mut text);
        }
        push_paragraphs(blocks, &text);
    }

    fn block(&mut self, node: &Handle, blocks: &mut Vec<Block>, depth: usize) {
        let tag = node.tag();
        match tag {
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                let level = usize::from(tag.as_bytes()[1] - b'0');
                let text = self.inline_text(node, depth).replace('\n', " ");
                let text = text.trim();
                if !text.is_empty() {
                    blocks.push(Block::plain(format!("{} {text}", "#".repeat(level))));
                }
            }
            "hr" => blocks.push(Block::plain("---".to_string())),
            "blockquote" => {
                let inner = join_blocks(&self.blocks_in(node, depth));
                if !inner.is_empty() {
                    let quoted: Vec<String> = inner
                        .lines()
                        .map(|line| {
                            if line.is_empty() {
                                ">".to_string()
                            } else {
                                format!("> {line}")
                            }
                        })
                        .collect();
                    blocks.push(Block::plain(quoted.join("\n")));
                }
            }
            "pre" => blocks.extend(code_block(node, language_of(node))),
            "ul" | "ol" | "menu" | "dir" => blocks.extend(self.list(node, tag == "ol", depth)),
            // An item outside any list is still an item.
            "li" => {
                let item = self.item(node, "- ", depth);
                blocks.push(Block::list(item));
            }
            "table" => self.table(node, blocks, depth),
            "dt" => {
                let text = self.inline_text(node, depth).replace('\n', " ");
                if !text.trim().is_empty() {
                    blocks.push(Block::plain(format!("**{}**", text.trim())));
                }
            }
            // Evernote marks a code block with a style on a div.
            "div" if node.style().contains("-en-codeblock:true") => {
                blocks.extend(code_block(node, evernote_language(&node.style())));
            }
            _ => blocks.extend(self.blocks_in(node, depth)),
        }
    }

    // ---------- Lists ----------

    fn list(&mut self, node: &Handle, ordered: bool, depth: usize) -> Option<Block> {
        let mut number: u64 = node
            .attr("start")
            .and_then(|start| start.trim().parse().ok())
            .unwrap_or(1);
        let mut items: Vec<String> = Vec::new();
        for child in node.children() {
            if child.kind != Kind::Element || is_hidden(child.tag()) {
                continue;
            }
            // A list placed straight inside a list, without an item around
            // it, belongs under the item before it.
            if matches!(child.tag(), "ul" | "ol") {
                if let Some(nested) = self.list(&child, child.tag() == "ol", depth + 1) {
                    match items.last_mut() {
                        Some(last) => {
                            let width = last.find(' ').map_or(2, |space| space + 1);
                            last.push('\n');
                            last.push_str(&indent(&nested.text, width));
                        }
                        None => items.push(nested.text),
                    }
                }
                continue;
            }
            let marker = if ordered {
                format!("{number}. ")
            } else {
                "- ".to_string()
            };
            number += 1;
            items.push(self.item(&child, &marker, depth + 1));
        }
        if items.is_empty() {
            return None;
        }
        Some(Block::list(items.join("\n")))
    }

    /// One list item: its marker, its first line, and everything else it
    /// holds indented under the text of the first line.
    fn item(&mut self, node: &Handle, marker: &str, depth: usize) -> String {
        let blocks = self.blocks_in(node, depth);
        let mut body = String::new();
        for (i, block) in blocks.iter().enumerate() {
            if i > 0 {
                body.push_str(if block.shape == Shape::Plain {
                    "\n\n"
                } else {
                    "\n"
                });
            }
            body.push_str(&block.text);
        }
        // A checkbox at the start of the item already made a task line of
        // its own; the item's marker takes the place of that line's.
        let starts_with_box = |text: &str| text.starts_with("[ ] ") || text.starts_with("[x] ");
        let mut body = match body.strip_prefix("- ") {
            Some(rest) if starts_with_box(rest) => rest.to_string(),
            _ => body,
        };
        if !starts_with_box(&body) {
            if let Some(ticked) = item_checkbox(node) {
                body = format!("[{}] {body}", if ticked { 'x' } else { ' ' });
            }
        }
        let rest = indent(&body, marker.chars().count());
        format!("{marker}{}", rest.trim_start())
            .trim_end()
            .to_string()
    }

    // ---------- Tables ----------

    fn table(&mut self, node: &Handle, blocks: &mut Vec<Block>, depth: usize) {
        let rows = table_rows(node);
        let is_layout = rows.iter().all(|row| row.len() <= 1)
            || rows
                .iter()
                .flatten()
                .any(|cell| !find_all(cell, "table").is_empty());
        if is_layout {
            for caption in node.children().iter().filter(|child| child.is("caption")) {
                blocks.extend(self.blocks_in(caption, depth));
            }
            for cell in rows.iter().flatten() {
                blocks.extend(self.blocks_in(cell, depth));
            }
            return;
        }

        let mut lines: Vec<Vec<String>> = Vec::new();
        for row in &rows {
            let mut cells = Vec::new();
            for cell in row {
                let inner = self.blocks_in(cell, depth);
                let text = inner
                    .iter()
                    .map(|block| block.text.replace('\n', "<br>"))
                    .collect::<Vec<_>>()
                    .join("<br>");
                cells.push(text.replace('|', "\\|"));
                // A cell that spans columns leaves the ones it covers empty.
                let span: usize = cell
                    .attr("colspan")
                    .and_then(|span| span.trim().parse().ok())
                    .unwrap_or(1);
                for _ in 1..span.min(50) {
                    cells.push(String::new());
                }
            }
            lines.push(cells);
        }
        let width = lines.iter().map(Vec::len).max().unwrap_or(0);
        let row_text = |cells: &[String]| {
            let mut padded = cells.to_vec();
            padded.resize(width, String::new());
            format!("| {} |", padded.join(" | "))
        };
        let mut text = Vec::new();
        for caption in node.children().iter().filter(|child| child.is("caption")) {
            blocks.extend(self.blocks_in(caption, depth));
        }
        // Markdown has no table without a header, so the first row is it.
        text.push(row_text(&lines[0]));
        text.push(format!("|{}", " --- |".repeat(width)));
        text.extend(lines[1..].iter().map(|cells| row_text(cells)));
        blocks.push(Block::plain(text.join("\n")));
    }

    // ---------- Inline ----------

    /// The inline content of a block such as a heading, as one string.
    fn inline_text(&mut self, node: &Handle, depth: usize) -> String {
        let mut text = String::new();
        self.inline_children(node, Style::default(), depth, &mut text);
        text.replace([BOX_OPEN, BOX_TICKED], "")
    }

    fn inline_children(&mut self, node: &Handle, style: Style, depth: usize, out: &mut String) {
        for child in node.children() {
            self.inline(&child, style, depth + 1, out);
        }
    }

    fn inline(&mut self, node: &Handle, style: Style, depth: usize, out: &mut String) {
        if node.kind == Kind::Text {
            push_text(out, &node.text.borrow(), style.link);
            return;
        }
        if node.kind != Kind::Element || is_hidden(node.tag()) {
            return;
        }
        if depth >= MAX_DEPTH {
            push_text(out, &text_of(node), style.link);
            return;
        }
        match node.tag() {
            "br" => {
                trim_line_end(out);
                out.push('\n');
            }
            "img" => self.image(node, out),
            "a" => self.link(node, style, depth, out),
            "code" | "kbd" | "samp" | "tt" => push_code(out, &text_of(node)),
            "input" => {
                let is_checkbox = node
                    .attr("type")
                    .is_some_and(|kind| kind.eq_ignore_ascii_case("checkbox"));
                if is_checkbox {
                    out.push(if node.attr("checked").is_some() {
                        BOX_TICKED
                    } else {
                        BOX_OPEN
                    });
                }
            }
            // Evernote writes these two as empty elements, which the HTML
            // parser reads as opening tags: what follows ends up inside.
            "en-todo" => {
                let ticked = node
                    .attr("checked")
                    .is_some_and(|value| value.eq_ignore_ascii_case("true"));
                out.push(if ticked { BOX_TICKED } else { BOX_OPEN });
                self.inline_children(node, style, depth, out);
            }
            "en-media" => {
                let hash = node.attr("hash").unwrap_or_default();
                let mime = node.attr("type").unwrap_or_default();
                if let Some(markdown) = self.resolver.media(hash.trim(), mime.trim()) {
                    out.push_str(&markdown);
                }
                self.inline_children(node, style, depth, out);
            }
            "en-crypt" => {
                out.push_str("*(Encrypted text: decrypt it in Evernote and copy it here.)*")
            }
            "q" => {
                out.push('"');
                self.inline_children(node, style, depth, out);
                out.push('"');
            }
            tag @ ("sup" | "sub") => {
                let mut inner = String::new();
                self.inline_children(node, style, depth, &mut inner);
                if !inner.trim().is_empty() {
                    out.push_str(&format!("<{tag}>{}</{tag}>", inner.trim()));
                }
            }
            tag => {
                let css = node.style();
                let mut marks: Vec<(&str, Flag)> = Vec::new();
                if matches!(tag, "b" | "strong") || is_bold(&css) {
                    marks.push(("**", |style| &mut style.bold));
                }
                if matches!(tag, "i" | "em" | "cite") || css.contains("font-style:italic") {
                    marks.push(("*", |style| &mut style.italic));
                }
                if matches!(tag, "s" | "strike" | "del") || css.contains("line-through") {
                    marks.push(("~~", |style| &mut style.strike));
                }
                if tag == "mark"
                    || css.contains("-evernote-highlight:true")
                    || css.contains("--en-highlight:")
                {
                    marks.push(("==", |style| &mut style.highlight));
                }
                // A mark that is already open is not opened again: "**a
                // **b** c**" is not bold twice, it is broken.
                let mut inner_style = style;
                marks.retain(|(_, flag)| !std::mem::replace(flag(&mut inner_style), true));
                let mut inner = String::new();
                self.inline_children(node, inner_style, depth, &mut inner);
                for (mark, _) in marks.iter().rev() {
                    inner = wrap(&inner, mark);
                }
                push_marked(out, &inner);
            }
        }
    }

    fn image(&mut self, node: &Handle, out: &mut String) {
        let src = node
            .attr("src")
            .or_else(|| node.attr("data-src"))
            .unwrap_or_default();
        let src = src.trim();
        let alt = collapse(&node.attr("alt").unwrap_or_default());
        if src.is_empty() {
            return;
        }
        if let Some(markdown) = self.resolver.image(src, &alt) {
            out.push_str(&markdown);
        } else if !src.starts_with("data:") {
            // A picture written into the page itself would be a wall of
            // letters in the note, so one nobody saved is left out.
            let alt = alt.replace('[', "(").replace(']', ")");
            out.push_str(&format!("![{alt}]({})", link_target(src)));
        }
    }

    fn link(&mut self, node: &Handle, style: Style, depth: usize, out: &mut String) {
        let href = node.attr("href").unwrap_or_default();
        let href = href.trim();
        let mut inner = String::new();
        let inner_style = Style {
            link: true,
            ..style
        };
        self.inline_children(node, inner_style, depth, &mut inner);
        let shown = inner.trim().replace('\n', " ");

        // A link to a place in the same page, or one that runs a script,
        // leads nowhere from a note.
        let is_dead = href.is_empty()
            || href.starts_with('#')
            || href.to_ascii_lowercase().starts_with("javascript:");
        if shown.is_empty() || is_dead {
            push_marked(out, &inner);
            return;
        }
        let plain = collapse(&text_of(node));
        let markdown = match self.resolver.link(href, &plain) {
            Some(markdown) => markdown,
            None if plain == href => format!("<{href}>"),
            None => format!("[{shown}]({})", link_target(href)),
        };
        let lead = &inner[..inner.len() - inner.trim_start().len()];
        let trail = &inner[inner.trim_end().len()..];
        push_marked(out, &format!("{lead}{markdown}{trail}"));
    }
}

/// The rows of a table as lists of cells, not counting tables inside it.
fn table_rows(table: &Handle) -> Vec<Vec<Handle>> {
    let mut rows = Vec::new();
    let mut sections = vec![table.clone()];
    sections.extend(
        table
            .children()
            .into_iter()
            .filter(|child| matches!(child.tag(), "thead" | "tbody" | "tfoot")),
    );
    // The head comes first wherever it was written.
    sections.sort_by_key(|section| match section.tag() {
        "thead" => 0,
        "tfoot" => 2,
        _ => 1,
    });
    for section in sections {
        for row in section
            .children()
            .into_iter()
            .filter(|child| child.is("tr"))
        {
            let cells: Vec<Handle> = row
                .children()
                .into_iter()
                .filter(|child| child.is("td") || child.is("th"))
                .collect();
            if !cells.is_empty() {
                rows.push(cells);
            }
        }
    }
    rows
}

/// Whether a list item is a task, and if so whether it is done. Evernote
/// says it in the style, other pages in an attribute; a checkbox inside the
/// item is found when its text is put together.
fn item_checkbox(node: &Handle) -> Option<bool> {
    let css = node.style();
    if css.contains("--en-checked:true") {
        return Some(true);
    }
    if css.contains("--en-checked:false") {
        return Some(false);
    }
    node.attr("data-checked")
        .map(|value| value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("checked"))
}

fn is_bold(css: &str) -> bool {
    ["bold", "bolder", "600", "700", "800", "900"]
        .iter()
        .any(|weight| css.contains(&format!("font-weight:{weight}")))
}

// ---------- Code ----------

/// The language named on a `<pre>` or the `<code>` inside it, as in
/// `class="language-rust"`.
fn language_of(pre: &Handle) -> String {
    let mut classes = pre.attr("class").unwrap_or_default();
    if let Some(code) = pre.children().iter().find(|child| child.is("code")) {
        classes.push(' ');
        classes.push_str(&code.attr("class").unwrap_or_default());
    }
    classes
        .split_whitespace()
        .find_map(|class| {
            class
                .strip_prefix("language-")
                .or_else(|| class.strip_prefix("lang-"))
        })
        .map(clean_language)
        .unwrap_or_default()
}

fn evernote_language(css: &str) -> String {
    ["-en-syntaxlanguage:", "-en-codeblocklanguage:"]
        .iter()
        .find_map(|flag| css.split_once(flag))
        .map(|(_, rest)| clean_language(rest.split(';').next().unwrap_or("")))
        .unwrap_or_default()
}

fn clean_language(raw: &str) -> String {
    let language = raw.trim().to_ascii_lowercase();
    let usable = !language.is_empty()
        && language
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "+#._-".contains(c))
        && !matches!(language.as_str(), "plaintext" | "text" | "none");
    if usable {
        language
    } else {
        String::new()
    }
}

/// The text of a code block: as written, with a line for each `<br>` and
/// each line-like element inside it.
fn code_text(root: &Handle) -> String {
    enum Step {
        Enter(Handle),
        LineEnd,
    }
    let mut code = String::new();
    let mut waiting = vec![Step::Enter(root.clone())];
    while let Some(step) = waiting.pop() {
        let node = match step {
            Step::LineEnd => {
                if !code.is_empty() && !code.ends_with('\n') {
                    code.push('\n');
                }
                continue;
            }
            Step::Enter(node) => node,
        };
        if node.kind == Kind::Text {
            code.push_str(&node.text.borrow());
        } else if node.is("br") {
            code.push('\n');
        } else if node.kind == Kind::Element && !is_hidden(node.tag()) {
            let is_line = matches!(node.tag(), "div" | "p" | "li" | "tr");
            if is_line {
                if !code.is_empty() && !code.ends_with('\n') {
                    code.push('\n');
                }
                waiting.push(Step::LineEnd);
            }
            waiting.extend(
                node.children
                    .borrow()
                    .iter()
                    .rev()
                    .cloned()
                    .map(Step::Enter),
            );
        }
    }
    code.replace('\u{a0}', " ").replace("\r\n", "\n")
}

fn code_block(node: &Handle, language: String) -> Option<Block> {
    let code = code_text(node);
    let code = code.trim_matches('\n');
    if code.trim().is_empty() {
        return None;
    }
    // The fence has to be longer than any run of backticks in the code.
    let longest = code.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let fence = "`".repeat(longest.max(2) + 1);
    Some(Block::plain(format!("{fence}{language}\n{code}\n{fence}")))
}

fn push_code(out: &mut String, raw: &str) {
    let code = collapse(raw);
    if code.is_empty() {
        return;
    }
    let longest = code.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let ticks = "`".repeat(longest + 1);
    let pad = if code.starts_with('`') || code.ends_with('`') {
        " "
    } else {
        ""
    };
    push_marked(out, &format!("{ticks}{pad}{code}{pad}{ticks}"));
}

// ---------- Text ----------

fn trim_line_end(out: &mut String) {
    while out.ends_with(' ') {
        out.pop();
    }
}

/// Add already-written Markdown to a line, minding the space before it.
/// (A space at the very start is kept: this may be the inside of a bold
/// run, whose spaces are moved outside the marks later. Whole lines are
/// trimmed when the paragraph is put together.)
fn push_marked(out: &mut String, markdown: &str) {
    let markdown = if out.ends_with([' ', '\n']) {
        markdown.trim_start_matches(' ')
    } else {
        markdown
    };
    // "**a****b**" reads as a and b with four stars between them, so two
    // marked runs that touch become one.
    for mark in ["**", "~~", "==", "*"] {
        let longer = format!("{mark}{}", &mark[..1]);
        let closes_here = out.ends_with(mark)
            && !out.ends_with(&longer)
            && !out[..out.len() - mark.len()].ends_with('\\');
        if closes_here && markdown.starts_with(mark) && !markdown.starts_with(&longer) {
            out.truncate(out.len() - mark.len());
            out.push_str(&markdown[mark.len()..]);
            return;
        }
    }
    out.push_str(markdown);
}

/// Put `mark` around the text, inside any spaces at its ends, line by line.
fn wrap(inner: &str, mark: &str) -> String {
    inner
        .split('\n')
        .map(|line| {
            let core = line.trim();
            if core.is_empty() || core.chars().all(|c| c == BOX_OPEN || c == BOX_TICKED) {
                return line.to_string();
            }
            let lead = &line[..line.len() - line.trim_start().len()];
            let trail = &line[line.trim_end().len()..];
            format!("{lead}{mark}{core}{mark}{trail}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Add text from the page to a line: runs of white space become one space,
/// and characters Markdown would read as syntax are escaped.
fn push_text(out: &mut String, text: &str, in_link: bool) {
    let mut pending_space = false;
    let mut words = String::new();
    for c in text.chars() {
        if c.is_whitespace() || c == '\u{a0}' {
            pending_space = true;
            continue;
        }
        if c == BOX_OPEN || c == BOX_TICKED {
            continue;
        }
        if pending_space {
            words.push(' ');
            pending_space = false;
        }
        words.push(c);
    }
    if pending_space {
        words.push(' ');
    }
    let after_space = out.ends_with([' ', '\n']);
    let words = if after_space {
        words.trim_start()
    } else {
        words.as_str()
    };
    let before = out.chars().next_back();
    let escaped = escape_with(words, before, in_link);
    out.push_str(&escaped);
}

fn escape_text(text: &str) -> String {
    escape_with(text, None, false)
}

/// Escape what Markdown would read as syntax in running text. `before` is
/// the character the text follows, which decides whether an underscore is
/// inside a word.
fn escape_with(text: &str, before: Option<char>, in_link: bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len() + 8);
    for (i, &c) in chars.iter().enumerate() {
        let prev = if i == 0 { before } else { Some(chars[i - 1]) };
        let next = chars.get(i + 1).copied();
        let escape = match c {
            '\\' | '`' | '*' => true,
            // snake_case is left alone: an underscore inside a word is not emphasis.
            '_' => {
                let inside_word = prev.is_some_and(char::is_alphanumeric)
                    && next.is_some_and(char::is_alphanumeric);
                !inside_word
            }
            '[' => in_link || next == Some('[') || prev == Some('[') || prev == Some('!'),
            ']' => in_link || next == Some('(') || next == Some(']') || prev == Some(']'),
            // A tag, a comment or a processing instruction.
            '<' => next.is_some_and(|n| n.is_ascii_alphabetic() || matches!(n, '/' | '!' | '?')),
            '~' => next == Some('~') || prev == Some('~'),
            '=' => next == Some('=') && prev != Some('='),
            // "&lt;" written out in a page is those four characters, not "<".
            '&' => {
                let rest: String = chars[i + 1..].iter().take(12).collect();
                rest.split_once(';').is_some_and(|(name, _)| {
                    !name.is_empty() && name.chars().all(|n| n.is_ascii_alphanumeric() || n == '#')
                })
            }
            _ => false,
        };
        if escape {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A link's destination: in angle brackets if a space or a bracket would
/// otherwise end it early.
fn link_target(href: &str) -> String {
    if href.contains([' ', '(', ')', '<', '>']) {
        format!("<{}>", href.replace('<', "%3C").replace('>', "%3E"))
    } else {
        href.to_string()
    }
}

/// Turn a run of inline content into paragraphs. An empty line in it (two
/// line breaks in a row) separates two paragraphs; a line that starts with a
/// checkbox becomes a task.
fn push_paragraphs(blocks: &mut Vec<Block>, text: &str) {
    let mut lines: Vec<String> = Vec::new();
    let mut is_list = false;
    let end = |lines: &mut Vec<String>, is_list: &mut bool, blocks: &mut Vec<Block>| {
        if !lines.is_empty() {
            blocks.push(Block {
                text: lines.join("\n"),
                shape: if *is_list { Shape::Tasks } else { Shape::Plain },
            });
            lines.clear();
        }
        *is_list = false;
    };
    for line in text.split('\n') {
        let line = line.trim();
        if line.is_empty() {
            end(&mut lines, &mut is_list, blocks);
            continue;
        }
        let task = match line.chars().next() {
            Some(BOX_OPEN) => Some("- [ ] "),
            Some(BOX_TICKED) => Some("- [x] "),
            _ => None,
        };
        let written = match task {
            Some(prefix) => {
                // A task after ordinary lines starts a list of its own.
                if !is_list {
                    end(&mut lines, &mut is_list, blocks);
                }
                is_list = true;
                let rest: String = line.chars().skip(1).collect();
                format!("{prefix}{}", rest.trim_start())
            }
            None => {
                if is_list {
                    end(&mut lines, &mut is_list, blocks);
                }
                escape_line_start(line)
            }
        };
        // A checkbox in the middle of a line stays where it is, as text.
        lines.push(
            written
                .replace(BOX_OPEN, "[ ] ")
                .replace(BOX_TICKED, "[x] "),
        );
    }
    end(&mut lines, &mut is_list, blocks);
}

/// Escape the start of a line of text that Markdown would read as a
/// heading, a list item, a quote or a rule.
fn escape_line_start(line: &str) -> String {
    let after = |n: usize| line[n..].chars().next();
    let space_or_end = |c: Option<char>| c.map_or(true, |c| c == ' ');
    let first = line.chars().next();
    let hashes = line.chars().take_while(|c| *c == '#').count();
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    let only = |c: char| line.chars().all(|x| x == c);
    let is_heading = (1..=6).contains(&hashes) && space_or_end(after(hashes));
    let is_bullet_or_rule =
        matches!(first, Some('-' | '+')) && (space_or_end(after(1)) || only('-'));
    let is_quote_or_underline = first == Some('>') || (first == Some('=') && only('='));
    let is_numbered = (1..=9).contains(&digits)
        && matches!(after(digits), Some('.' | ')'))
        && space_or_end(after(digits + 1));
    let escape_at = if is_heading || is_bullet_or_rule || is_quote_or_underline {
        Some(0)
    } else if is_numbered {
        Some(digits)
    } else {
        None
    };
    match escape_at {
        Some(at) => format!("{}\\{}", &line[..at], &line[at..]),
        None => line.to_string(),
    }
}

/// Indent every line but leave empty lines empty.
fn indent(text: &str, width: usize) -> String {
    let pad = " ".repeat(width);
    text.lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("{pad}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn md(html: &str) -> String {
        to_markdown(html, &mut KeepLinks)
    }

    #[test]
    fn headings_paragraphs_and_line_breaks() {
        assert_eq!(
            md("<h1>Title</h1><p>First   paragraph\n with  spaces.</p><p>Second<br>line<br/>three</p><h3> Sub <b>head</b> </h3>"),
            "# Title\n\nFirst paragraph with spaces.\n\nSecond\nline\nthree\n\n### Sub **head**"
        );
        // Two breaks in a row end the paragraph.
        assert_eq!(md("one<br><br>two<br><br><br>three"), "one\n\ntwo\n\nthree");
        // Text straight in the body, and a div per line as Evernote writes.
        assert_eq!(
            md("loose <div>line one</div><div>line two</div><div><br></div> tail"),
            "loose\n\nline one\n\nline two\n\ntail"
        );
        assert_eq!(md("<h2></h2><p> </p><div>\n</div>"), "");
    }

    #[test]
    fn bold_italic_strike_highlight_and_code() {
        assert_eq!(
            md("<p>a <b>bold</b> and <strong>strong</strong> word</p>"),
            "a **bold** and **strong** word"
        );
        assert_eq!(
            md("<p><i>it</i> <em>em</em> <s>gone</s> <del>del</del> <mark>hi</mark></p>"),
            "*it* *em* ~~gone~~ ~~del~~ ==hi=="
        );
        assert_eq!(
            md("<p>use <code>cargo test</code> or <kbd>Ctrl</kbd></p>"),
            "use `cargo test` or `Ctrl`"
        );
        assert_eq!(md("<p><code>a `tick` b</code></p>"), "``a `tick` b``");
        // Spaces move outside the marks, and nothing is marked twice.
        assert_eq!(md("<p>a<b> bold </b>b</p>"), "a **bold** b");
        assert_eq!(
            md("<p><b>one <b>two</b> three</b></p>"),
            "**one two three**"
        );
        assert_eq!(
            md("<p><b>one</b><b>two</b> <i>x</i><i>y</i></p>"),
            "**onetwo** *xy*"
        );
        assert_eq!(
            md("<p>2 *<i>x</i> and <b>b</b><i>i</i></p>"),
            "2 \\**x* and **b***i*"
        );
        assert_eq!(
            md("<p><b><i>both</i></b> <b></b><i> </i>end</p>"),
            "***both*** end"
        );
        assert_eq!(
            md("<p><b>line one<br>line two</b></p>"),
            "**line one**\n**line two**"
        );
        assert_eq!(
            md("<p>H<sub>2</sub>O and x<sup>2</sup>, <u>under</u>, <q>quoted</q></p>"),
            "H<sub>2</sub>O and x<sup>2</sup>, under, \"quoted\""
        );
    }

    #[test]
    fn styles_written_as_css_count_too() {
        assert_eq!(
            md("<span style=\"font-weight: bold;\">b</span> <span style=\"font-style:italic\">i</span> <span style=\"text-decoration: line-through\">s</span> <span style=\"font-weight:700; font-style: italic\">bi</span> <span style=\"background-color: rgb(255, 250, 165);-evernote-highlight:true;\">hl</span> <span style=\"--en-highlight:yellow;background-color: #ffef9e;\">hl2</span>"),
            "**b** *i* ~~s~~ ***bi*** ==hl== ==hl2=="
        );
    }

    #[test]
    fn links_and_images() {
        assert_eq!(
            md("<a href=\"https://example.com/a\">site</a>"),
            "[site](https://example.com/a)"
        );
        assert_eq!(
            md("see <a href=\"https://example.com/a b(1)\"> the <b>page</b> </a>now"),
            "see [the **page**](<https://example.com/a b(1)>) now"
        );
        assert_eq!(
            md("<a href=\"https://example.com\">https://example.com</a>"),
            "<https://example.com>"
        );
        assert_eq!(md("<a href=\"#top\">top</a> <a href=\"javascript:void(0)\">run</a> <a>bare</a> <a href=\"x\"></a>end"), "top run bare end");
        assert_eq!(md("<a href=\"u\">a [b] c</a>"), "[a \\[b\\] c](u)");
        assert_eq!(
            md("<img src=\"pic.png\" alt=\"A [nice]  pic\">"),
            "![A (nice) pic](pic.png)"
        );
        assert_eq!(md("<img src=\"my pic.png\"><img alt=\"no source\"><img src=\"data:image/png;base64,AAAA\">"), "![](<my pic.png>)");
        assert_eq!(
            md("<a href=\"big.png\"><img src=\"small.png\" alt=\"x\"></a>"),
            "[![x](small.png)](big.png)"
        );
    }

    #[test]
    fn the_resolver_decides_what_links_and_images_become() {
        struct Vault;
        impl Resolver for Vault {
            fn image(&mut self, src: &str, _alt: &str) -> Option<String> {
                (src == "local.png").then(|| "![[local.png]]".to_string())
            }
            fn link(&mut self, href: &str, text: &str) -> Option<String> {
                (href == "other.html").then(|| format!("[[Other|{text}]]"))
            }
            fn media(&mut self, hash: &str, mime: &str) -> Option<String> {
                Some(format!("<{hash} {mime}>"))
            }
        }
        let html = "<p><img src=\"local.png\"> <img src=\"https://x.test/remote.png\"> <a href=\"other.html\">the  <i>other</i></a> <a href=\"https://x.test\">out</a> <en-media hash=\"abc\" type=\"image/png\"></en-media></p>";
        assert_eq!(
            to_markdown(html, &mut Vault),
            "![[local.png]] ![](https://x.test/remote.png) [[Other|the other]] [out](https://x.test) <abc image/png>"
        );
    }

    #[test]
    fn lists_nest_and_number() {
        let html = "<ul><li>one</li><li>two<ul><li>inner a</li><li>inner b<ol><li>deep</li></ol></li></ul></li><li><p>para one</p><p>para two</p></li></ul>";
        assert_eq!(
            md(html),
            "- one\n- two\n  - inner a\n  - inner b\n    1. deep\n- para one\n\n  para two"
        );
        assert_eq!(md("<ol start=\"9\"><li>nine</li><li>ten<ul><li>sub</li></ul></li><li>eleven</li></ol>"), "9. nine\n10. ten\n    - sub\n11. eleven");
        // A list written straight inside a list goes under the item before it.
        assert_eq!(
            md("<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>"),
            "- a\n  - b\n- c"
        );
        assert_eq!(
            md("<p>before</p><ul><li>a</li></ul><ol><li>b</li></ol><p>after</p>"),
            "before\n\n- a\n\n1. b\n\nafter"
        );
        assert_eq!(md("<ul></ul><ul><li></li></ul>"), "-");
    }

    #[test]
    fn checkboxes_become_tasks() {
        assert_eq!(
            md("<ul><li><input type=\"checkbox\"> open</li><li><input type=\"checkbox\" checked> done</li><li data-checked=\"true\">attr</li><li>plain</li></ul>"),
            "- [ ] open\n- [x] done\n- [x] attr\n- plain"
        );
        // Evernote's checklist: the state is in the item's style.
        assert_eq!(
            md("<ul style=\"--en-todo:true;\"><li style=\"--en-checked:true;\"><div>bought</div></li><li style=\"--en-checked:false;\"><div>to buy</div></li></ul>"),
            "- [x] bought\n- [ ] to buy"
        );
        // Evernote's older checkboxes: one per line, anywhere in the text.
        assert_eq!(
            md("<en-note><div><en-todo checked=\"true\"></en-todo>Packed</div><div><en-todo></en-todo>Tickets <b>today</b></div><div>and a line</div><div>mid <en-todo></en-todo>line</div></en-note>"),
            "- [x] Packed\n- [ ] Tickets **today**\n\nand a line\n\nmid [ ] line"
        );
        // Written as an empty element, the parser nests what follows inside it.
        assert_eq!(
            md("<en-note><div><en-todo checked=\"false\"/>One</div><div><en-todo checked=\"true\"/>Two</div></en-note>"),
            "- [ ] One\n- [x] Two"
        );
        assert_eq!(
            md("<p><input type=\"checkbox\">a<br><input type=\"checkbox\" checked>b<br>c</p>"),
            "- [ ] a\n- [x] b\n\nc"
        );
    }

    #[test]
    fn quotes_rules_and_code_blocks() {
        assert_eq!(
            md("<blockquote><p>one</p><p>two</p><ul><li>x</li></ul></blockquote>"),
            "> one\n>\n> two\n>\n> - x"
        );
        assert_eq!(md("<p>a</p><hr><p>b</p>"), "a\n\n---\n\nb");
        assert_eq!(
            md("<pre><code class=\"language-rust\">fn main() {\n    let x = 1 &lt; 2; // *not* bold\n}\n</code></pre>"),
            "```rust\nfn main() {\n    let x = 1 < 2; // *not* bold\n}\n```"
        );
        assert_eq!(
            md("<pre>line 1<br>line 2\n  indented</pre>"),
            "```\nline 1\nline 2\n  indented\n```"
        );
        assert_eq!(
            md("<pre>has ``` inside</pre>"),
            "````\nhas ``` inside\n````"
        );
        assert_eq!(md("<pre>  \n</pre>"), "");
        // Evernote's code block: a styled div with a div per line.
        assert_eq!(
            md("<div style=\"box-sizing: border-box; -en-codeblock: true; -en-syntaxLanguage: Python;\"><div>def f():</div><div>\u{a0} \u{a0} return 1</div><div><br></div><div>f()</div></div>"),
            "```python\ndef f():\n    return 1\n\nf()\n```"
        );
    }

    #[test]
    fn tables_become_pipe_tables() {
        let html = "<table><caption>Scores</caption><tbody><tr><td>Ann</td><td>3 | 4</td></tr><tr><td>Bob<br>B.</td><td><ul><li>x</li><li>y</li></ul></td><td>extra</td></tr></tbody><thead><tr><th>Name</th><th colspan=\"2\">Score</th></tr></thead></table>";
        assert_eq!(
            md(html),
            "Scores\n\n| Name | Score |  |\n| --- | --- | --- |\n| Ann | 3 \\| 4 |  |\n| Bob<br>B. | - x<br>- y | extra |"
        );
        // No header in the page: the first row stands in for it.
        assert_eq!(
            md("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>"),
            "| a | b |\n| --- | --- |\n| c | d |"
        );
    }

    #[test]
    fn a_table_used_for_layout_is_unwrapped() {
        let nested = "<table><tr><td><p>left</p></td><td><table><tr><td>a</td><td>b</td></tr></table></td></tr></table>";
        assert_eq!(md(nested), "left\n\n| a | b |\n| --- | --- |");
        assert_eq!(
            md("<table><tr><td>only</td></tr><tr><td><h2>cells</h2></td></tr></table>"),
            "only\n\n## cells"
        );
        assert_eq!(md("<table></table>"), "");
    }

    #[test]
    fn text_is_escaped_only_where_markdown_would_misread_it() {
        assert_eq!(
            md("<p>2 * 3 * 4 and snake_case and _lead and `tick` and back\\slash</p>"),
            "2 \\* 3 \\* 4 and snake_case and \\_lead and \\`tick\\` and back\\\\slash"
        );
        assert_eq!(
            md("<p>&lt;script&gt;alert(1)&lt;/script&gt; a &lt; b &amp;amp; c &amp; d</p>"),
            "\\<script>alert(1)\\</script> a < b \\&amp; c & d"
        );
        assert_eq!(
            md("<p>[[not a link]] and [1] and [text](url) and ![img]</p>"),
            "\\[\\[not a link\\]\\] and [1] and [text\\](url) and !\\[img]"
        );
        assert_eq!(
            md("<p>a == b and ~~no~~</p>"),
            "a \\== b and \\~\\~no\\~\\~"
        );
        assert_eq!(md("<p># not a heading</p><p>#tag stays</p><p>- not a list</p><p>+ nor this</p><p>1. nor this</p><p>2) nor this</p><p>&gt; not a quote</p><p>---</p><p>===</p><p>1.5 is fine</p><p>-5 too</p>"),
            "\\# not a heading\n\n#tag stays\n\n\\- not a list\n\n\\+ nor this\n\n1\\. nor this\n\n2\\) nor this\n\n\\> not a quote\n\n\\---\n\n\\===\n\n1.5 is fine\n\n-5 too");
        assert_eq!(
            md("<p>first<br># second line</p>"),
            "first\n\\# second line"
        );
    }

    #[test]
    fn what_a_browser_would_not_show_is_left_out() {
        let html = "<html><head><title> My  page </title><style>p{color:red}</style><link rel=\"canonical\" href=\"https://example.com/post\"></head><body><script>alert(1)</script><!-- note --><p>shown</p><noscript>no</noscript><template><p>tpl</p></template><svg><text>svg</text></svg><button>Click</button></body></html>";
        let doc = Document::parse(html);
        assert_eq!(doc.title().as_deref(), Some("My page"));
        assert_eq!(
            doc.canonical_url().as_deref(),
            Some("https://example.com/post")
        );
        assert_eq!(doc.to_markdown(&mut KeepLinks), "shown");
        assert_eq!(Document::parse("<p>x</p>").title(), None);
    }

    #[test]
    fn the_one_main_part_of_a_page_is_the_content() {
        let article = |html: &str| Document::parse(html).article_to_markdown(&mut KeepLinks);
        let page = "<body><nav><a href=\"/\">Home</a></nav><main><h1>Post</h1><p>Body.</p></main><footer>(c)</footer></body>";
        assert_eq!(article(page), "# Post\n\nBody.");
        let two = "<body><article><p>one</p></article><article><p>two</p></article><footer>foot</footer></body>";
        assert_eq!(article(two), "one\n\ntwo\n\nfoot");
        // Only a web page is cut down like this. A note that happens to
        // hold such an element keeps everything around it.
        assert_eq!(md(page), "[Home](/)\n\n# Post\n\nBody.\n\n(c)");
        assert_eq!(
            md("<en-note><div>before</div><article><div>clipped</div></article><div>after</div></en-note>"),
            "before\n\nclipped\n\nafter"
        );
    }

    #[test]
    fn broken_and_odd_markup_still_gives_its_text() {
        assert_eq!(
            md("<p>unclosed <b>bold <i>both</p><p>next</p>"),
            "unclosed **bold *both***\n\n***next***"
        );
        assert_eq!(
            md("<a href=\"u\"><div>block one</div><div>block two</div></a>"),
            "block one\n\nblock two"
        );
        assert_eq!(
            md("<span><p>inside span</p></span> tail"),
            "inside span\n\ntail"
        );
        assert_eq!(
            md("<dl><dt>Term</dt><dd>Meaning</dd></dl>"),
            "**Term**\n\nMeaning"
        );
        assert_eq!(md("<li>stray item</li>"), "- stray item");
        assert_eq!(
            md("plain \u{E000}text\u{E001} &nbsp; here"),
            "plain text here"
        );
        assert_eq!(md(""), "");
    }

    #[test]
    fn a_page_nested_far_too_deep_keeps_its_text() {
        let depth = 5000;
        let html = format!(
            "{}deep *text*{}<p>after</p>",
            "<div><span>".repeat(depth),
            "</span></div>".repeat(depth)
        );
        assert_eq!(md(&html), "deep \\*text\\*\n\nafter");
        let bold = format!(
            "<p>{}x{}</p>",
            "<b><i>".repeat(depth),
            "</i></b>".repeat(depth)
        );
        assert_eq!(md(&bold), "***x***");
    }

    #[test]
    fn a_conversion_that_fails_is_an_error_and_not_a_crash() {
        struct Broken;
        impl Resolver for Broken {
            fn link(&mut self, _href: &str, _text: &str) -> Option<String> {
                panic!("a resolver that cannot cope")
            }
        }
        let failed = guarded(|| to_markdown("<a href=\"x\">y</a>", &mut Broken));
        assert_eq!(
            failed.unwrap_err(),
            "Its content could not be converted to Markdown."
        );
        assert_eq!(
            guarded(|| to_markdown("<p>fine</p>", &mut Broken)).unwrap(),
            "fine"
        );
    }

    #[test]
    fn a_picture_written_into_the_page_can_be_taken_out() {
        let (mime, bytes) = decode_data_uri("data:image/PNG;base64,aGVs\nbG8=").unwrap();
        assert_eq!(
            (mime.as_str(), bytes.as_slice()),
            ("image/png", b"hello".as_slice())
        );
        let (mime, bytes) = decode_data_uri("data:text/plain,a%20b").unwrap();
        assert_eq!(
            (mime.as_str(), bytes.as_slice()),
            ("text/plain", b"a b".as_slice())
        );
        assert!(decode_data_uri("data:image/png;base64,***").is_none());
        assert!(decode_data_uri("https://example.com/x.png").is_none());
    }
}
