// HTML files: one page, or a folder (or zip) of them.
//
// Each `.html` file becomes a note with the file's name, in the same folder
// it was in. The page is converted to Markdown by `html`, and what it
// points at is brought along:
//
// - A picture that lies next to the page (`<img src="page_files/a.png">`)
//   is copied to the attachments. So is one written into the page itself
//   as a `data:` address. A picture on the web stays a link to the web.
// - A link to another page of the same import becomes a link to its note.
//   A link to any other file next to the page (a PDF, say) copies the file.
//
// "Next to the page" is meant strictly: only files inside the folder that
// was chosen (for a single page, the folder it is in) are ever read. A page
// that points at `../../somewhere/else` or at a `file:///` address gets its
// link left as it is, and nothing is copied. Pages come from the web, and a
// page must not be able to pull other files off the disk into the vault.
//
// The page's `<title>` is kept as a property when it says something other
// than the file name, and so is the address it was saved from when the
// page names one.
//
// A saved web page is mostly menus, sidebars and footers. When a page marks
// its content with exactly one `<main>` or one `<article>`, only that part
// is imported. A page that marks nothing, or several, is imported whole.
//
// Not handled: styling, scripts, forms, embedded video and audio. Text in
// an encoding other than UTF-8 is read as Windows-1252, the usual one for
// old pages in Western languages; other encodings come out wrong.

use super::html::{self, Document, Resolver};
use super::markdown::local_path;
use super::output::{
    embed, extension_for_mime, split_extension, wikilink, Note, Output, Props, Slot,
};
use super::source::{decode_text, file_name, parent, resolve, Nested, Source};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn is_page(name: &str) -> bool {
    let extension = split_extension(name).1.unwrap_or("").to_ascii_lowercase();
    matches!(extension.as_str(), "html" | "htm" | "xhtml")
}

pub(crate) fn import(path: &Path, out: &mut Output) -> Result<(), String> {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut around = if path.is_file() && is_page(&name) {
        let folder = path.parent().map(Path::to_path_buf).unwrap_or_default();
        Around::Folder { folder, page: name }
    } else {
        Around::Export(Source::open(path, Nested::Leave)?)
    };
    if let Around::Export(source) = &mut around {
        for (name, reason) in source.take_rejected() {
            out.skip(&name, &reason);
        }
    }

    // Settle every name first, so pages can link to each other.
    let mut pages: Vec<(String, Slot)> = Vec::new();
    let mut by_path: HashMap<String, String> = HashMap::new();
    for rel in around.pages() {
        let folders: Vec<&str> = parent(&rel)
            .split('/')
            .filter(|part| !part.is_empty())
            .collect();
        let slot = out.reserve(&folders, split_extension(file_name(&rel)).0);
        by_path.insert(rel.to_lowercase(), slot.name.clone());
        pages.push((rel, slot));
    }
    if pages.is_empty() {
        return Err("No HTML files were found there.".to_string());
    }

    let mut attachments: HashMap<String, String> = HashMap::new();
    for (rel, slot) in pages {
        let text = match around.read(&rel) {
            Ok(bytes) => decode_page(&bytes),
            Err(reason) => {
                out.skip(&rel, &reason);
                continue;
            }
        };
        let converted = {
            let mut resolver = Page {
                folder: parent(&rel),
                name: &slot.name,
                by_path: &by_path,
                around: &mut around,
                attachments: &mut attachments,
                out: &mut *out,
            };
            html::guarded(|| {
                let document = Document::parse(&text);
                (
                    document.title(),
                    document.canonical_url(),
                    document.article_to_markdown(&mut resolver),
                )
            })
        };
        let (title, address, body) = match converted {
            Ok(converted) => converted,
            Err(reason) => {
                out.skip(&rel, &reason);
                continue;
            }
        };
        if body.trim().is_empty() {
            out.skip(&rel, "The page has no text in it.");
            continue;
        }
        let mut props = Props::default();
        props.title_if_changed(&title.unwrap_or_default(), &slot);
        props.text("source", &address.unwrap_or_default());
        out.write(
            &slot,
            &Note {
                props,
                body,
                modified: None,
            },
        );
    }
    Ok(())
}

/// Where a page and the files around it are read from.
enum Around {
    /// One page on disk, and the folder it lies in.
    Folder { folder: PathBuf, page: String },
    /// A folder or zip of pages.
    Export(Source),
}

impl Around {
    /// The pages to import, as paths with `/`.
    fn pages(&self) -> Vec<String> {
        match self {
            Around::Folder { page, .. } => vec![page.clone()],
            Around::Export(source) => source
                .files()
                .into_iter()
                .filter(|rel| is_page(rel))
                .collect(),
        }
    }

    /// The file a path names, if it is a real file inside the folder.
    fn find(&self, rel: &str) -> Option<String> {
        match self {
            Around::Export(source) => source.find(rel).map(str::to_string),
            Around::Folder { folder, .. } => {
                let path = folder.join(rel);
                // Not a link, and not reached through one: the path as the
                // system resolves it has to stay inside the folder.
                let is_file = fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_file());
                let inside = dunce::canonicalize(&path)
                    .ok()
                    .zip(dunce::canonicalize(folder).ok())
                    .is_some_and(|(path, folder)| path.starts_with(folder));
                (is_file && inside).then(|| rel.to_string())
            }
        }
    }

    fn read(&mut self, rel: &str) -> Result<Vec<u8>, String> {
        match self {
            Around::Export(source) => source.read(rel),
            Around::Folder { folder, .. } => {
                fs::read(folder.join(rel)).map_err(|e| format!("The file could not be read: {e}."))
            }
        }
    }

    fn copy_to(&mut self, rel: &str, out: &mut fs::File) -> io::Result<()> {
        match self {
            Around::Export(source) => source.copy_to(rel, out),
            Around::Folder { folder, .. } => {
                io::copy(&mut fs::File::open(folder.join(rel))?, out).map(|_| ())
            }
        }
    }
}

/// Answers the converter's questions about one page's links and pictures.
struct Page<'a> {
    /// The folder the page is in, inside what was opened.
    folder: &'a str,
    /// The name of the page's note, for naming pictures that have no name.
    name: &'a str,
    /// Every page of the import, by its path in lower case, to its note.
    by_path: &'a HashMap<String, String>,
    around: &'a mut Around,
    /// Files already copied, by their path.
    attachments: &'a mut HashMap<String, String>,
    out: &'a mut Output,
}

impl Page<'_> {
    /// The file a link names, if it is one inside the import.
    fn local(&self, target: &str) -> Option<String> {
        let rel = resolve(self.folder, &local_path(target)?)?;
        self.around.find(&rel)
    }

    /// Copy a file to the attachments, once, and return its name there.
    fn attach(&mut self, rel: &str) -> Option<String> {
        if let Some(name) = self.attachments.get(rel) {
            return Some(name.clone());
        }
        let around = &mut *self.around;
        match self
            .out
            .attach_with(file_name(rel), &mut |file| around.copy_to(rel, file))
        {
            Ok(name) => {
                self.attachments.insert(rel.to_string(), name.clone());
                Some(name)
            }
            Err(reason) => {
                self.out.skip(rel, &reason);
                None
            }
        }
    }
}

impl Resolver for Page<'_> {
    fn image(&mut self, src: &str, _alt: &str) -> Option<String> {
        if let Some((mime, bytes)) = html::decode_data_uri(src) {
            if !mime.starts_with("image/") || bytes.is_empty() {
                return None;
            }
            let wanted = format!("{}.{}", self.name, extension_for_mime(&mime));
            return self
                .out
                .attach(&wanted, &bytes)
                .ok()
                .map(|name| embed(&name));
        }
        let rel = self.local(src)?;
        self.attach(&rel).map(|name| embed(&name))
    }

    fn link(&mut self, href: &str, text: &str) -> Option<String> {
        let rel = self.local(href)?;
        if let Some(note) = self.by_path.get(&rel.to_lowercase()) {
            return Some(wikilink(note, Some(text)));
        }
        // A page that is not part of this import is not an attachment
        // either: the link stays as it is.
        if is_page(&rel) {
            return None;
        }
        self.attach(&rel).map(|name| wikilink(&name, Some(text)))
    }
}

/// The text of a page. One that is not valid UTF-8 was most likely saved
/// in Windows-1252, where every byte is one character.
fn decode_page(bytes: &[u8]) -> String {
    let has_mark = bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]);
    if has_mark || std::str::from_utf8(bytes).is_ok() {
        return decode_text(bytes);
    }
    // The characters Windows-1252 puts where Latin-1 has control codes.
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž',
        '\u{8f}', '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}',
        'ž', 'Ÿ',
    ];
    bytes
        .iter()
        .map(|byte| match byte {
            0x80..=0x9F => HIGH[usize::from(byte - 0x80)],
            byte => char::from(*byte),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;

    #[test]
    fn a_saved_page_becomes_a_note_with_its_pictures() {
        let dir = scratch("html-one");
        let page = "<!DOCTYPE html><html><head><title>An Article — Example</title><link rel=\"canonical\" href=\"https://example.com/article\"></head><body><article><h1>An Article</h1><p>Text with <a href=\"https://example.com/more\">a link</a> and a picture:</p><p><img src=\"Article_files/photo%20one.jpg\" alt=\"Photo\"> <img src=\"./Article_files/photo%20one.jpg\"> <img src=\"https://example.com/remote.png\" alt=\"remote\"> <img src=\"data:image/png;base64,aGVsbG8=\"></p><p><a href=\"Article_files/paper.pdf\">The paper</a>, <a href=\"other.html\">not imported</a>, <a href=\"missing.pdf\">missing</a></p></article><footer>Footer</footer></body></html>";
        write(&dir, "saved/Article.html", page);
        write(&dir, "saved/Article_files/photo one.jpg", "jpeg bytes");
        write(&dir, "saved/Article_files/paper.pdf", "pdf bytes");
        write(&dir, "saved/other.html", "<p>another page, not chosen</p>");
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();

        let mut out = Output::open(&vault, "Web").unwrap();
        import(&dir.join("saved/Article.html"), &mut out).unwrap();
        let report = out.finish();
        assert_eq!(
            (report.notes, report.attachments, report.skipped.len()),
            (1, 3, 0)
        );
        assert_eq!(
            files(&vault),
            [
                "Web/Article.md",
                "Web/attachments/Article.png",
                "Web/attachments/paper.pdf",
                "Web/attachments/photo one.jpg"
            ]
        );
        assert_eq!(
            text(&vault, "Web/Article.md"),
            "---\n\
             title: An Article — Example\n\
             source: https://example.com/article\n\
             ---\n\
             \n\
             # An Article\n\
             \n\
             Text with [a link](https://example.com/more) and a picture:\n\
             \n\
             ![[photo one.jpg]] ![[photo one.jpg]] ![remote](https://example.com/remote.png) ![[Article.png]]\n\
             \n\
             [[paper.pdf|The paper]], [not imported](other.html), [missing](missing.pdf)\n"
        );
        assert_eq!(
            fs::read(vault.join("Web/attachments/Article.png")).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn a_folder_of_pages_keeps_its_folders_and_links_between_pages() {
        let entries: [(&str, &[u8]); 5] = [
            ("site/index.html", b"<h1>Home</h1><p>Go to <a href=\"docs/Guide.htm#install\">the guide</a> or <a href=\"docs/guide.htm\">Guide</a>.</p><img src=\"img/logo.png\">"),
            ("site/docs/Guide.htm", b"<p>Back <a href=\"../index.html\">home</a>. <img src=\"../img/logo.png\" alt=\"logo\"></p>"),
            ("site/docs/empty.html", b"<html><body><script>var x;</script></body></html>"),
            ("site/img/logo.png", b"logo bytes"),
            ("site/style.css", b"p { color: red }"),
        ];
        let dir = scratch("html-folder");
        for (name, bytes) in &entries {
            write(&dir, &format!("unzipped/{name}"), bytes);
        }
        write(&dir, "site.zip", zip_bytes(&entries));

        for (source, dest) in [("unzipped", "A"), ("site.zip", "B")] {
            let vault = dir.join(format!("vault-{dest}"));
            fs::create_dir_all(&vault).unwrap();
            let mut out = Output::open(&vault, dest).unwrap();
            import(&dir.join(source), &mut out).unwrap();
            let report = out.finish();
            assert_eq!((report.notes, report.attachments), (2, 1), "{source}");
            assert_eq!(report.skipped.len(), 1);
            assert_eq!(report.skipped[0].reason, "The page has no text in it.");
            assert_eq!(
                files(&vault),
                [
                    format!("{dest}/attachments/logo.png"),
                    format!("{dest}/site/docs/Guide.md"),
                    format!("{dest}/site/index.md")
                ]
            );
            assert_eq!(
                text(&vault, &format!("{dest}/site/index.md")),
                "# Home\n\nGo to [[Guide|the guide]] or [[Guide]].\n\n![[logo.png]]\n"
            );
            assert_eq!(
                text(&vault, &format!("{dest}/site/docs/Guide.md")),
                "Back [[index|home]]. ![[logo.png]]\n"
            );
        }
    }

    #[test]
    fn a_page_cannot_pull_in_files_from_outside_its_folder() {
        let dir = scratch("html-outside");
        write(&dir, "secret.txt", "private");
        write(&dir, "pages/inside.txt", "fine");
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join("secret.txt"), dir.join("pages/link.txt")).unwrap();
        let absolute = format!("file://{}", dir.join("secret.txt").display());
        let page = format!(
            "<p><a href=\"../secret.txt\">up</a> <a href=\"{absolute}\">absolute</a> <a href=\"link.txt\">through a link</a> <a href=\"inside.txt\">inside</a> <img src=\"../secret.txt\"></p>"
        );
        write(&dir, "pages/page.html", &page);
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();

        let mut out = Output::open(&vault, "In").unwrap();
        import(&dir.join("pages/page.html"), &mut out).unwrap();
        assert_eq!(out.finish().attachments, 1);
        assert_eq!(files(&vault), ["In/attachments/inside.txt", "In/page.md"]);
        assert_eq!(
            text(&vault, "In/page.md"),
            format!("[up](../secret.txt) [absolute]({absolute}) [through a link](link.txt) [[inside.txt|inside]] ![](../secret.txt)\n")
        );
    }

    #[test]
    fn nothing_to_import_says_so() {
        let dir = scratch("html-none");
        write(&dir, "folder/notes.txt", "no pages");
        let mut out = Output::open(&dir, "In").unwrap();
        assert_eq!(
            import(&dir.join("folder"), &mut out).unwrap_err(),
            "No HTML files were found there."
        );
        assert!(import(&dir.join("missing.html"), &mut out).is_err());
    }

    #[test]
    fn an_old_page_in_a_windows_encoding_is_still_readable() {
        assert_eq!(
            decode_page(b"caf\xE9 \x93quoted\x94 \x80 5"),
            "café “quoted” € 5"
        );
        assert_eq!(decode_page("café".as_bytes()), "café");
        assert_eq!(decode_page(b"\xFF\xFEh\x00i\x00"), "hi");
    }
}
