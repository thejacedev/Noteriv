// What an import reads from: a folder, or a zip archive read in place.
//
// Several apps hand over the same export either way (Notion, Google
// Takeout, Bear, Textbundle), so the importers see one thing: a list of
// files by their path inside the export, with `/` between folders, and a way
// to read one.
//
// An archive is never unpacked. Its entries are read one at a time and only
// their content is used; where a note or an attachment is written is decided
// by `output`, from names that were cleaned there. An entry whose path is
// absolute or climbs out with `..` is refused all the same and reported, so
// that nothing downstream ever sees such a path.
//
// A zip inside the export is opened too, one level deep: Notion splits a
// large export into "Part" archives, and a folder of Textpack files is a
// folder of zips.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{self, BufReader, Cursor, Read, Seek, Write};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

/// The most that is read into memory for one note or one data file. A real
/// note is far smaller; an archive made to exhaust memory is not.
const MAX_READ: u64 = 256 * 1024 * 1024;

/// An archive inside an archive has to be held in memory to be opened.
const MAX_INNER_ARCHIVE: u64 = 512 * 1024 * 1024;

pub(crate) trait ReadSeek: Read + Seek {}
impl<T: Read + Seek> ReadSeek for T {}

/// What to do with an archive found inside the export.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Nested {
    /// It is a file like any other.
    Leave,
    /// Its files are listed as if it had been unzipped where it lies.
    Merge,
    /// It is listed as a folder with its own name, extension included.
    AsFolder,
}

enum Place {
    Disk(PathBuf),
    Zip { archive: usize, entry: usize },
}

pub(crate) struct Source {
    archives: Vec<ZipArchive<Box<dyn ReadSeek>>>,
    files: BTreeMap<String, Place>,
    /// Lower-case path to the path as written, for links that differ in case.
    lower: HashMap<String, String>,
    /// Entries that were refused, each with the reason.
    rejected: Vec<(String, String)>,
    /// The name of the folder or file that was opened, without extension.
    name: String,
}

impl Source {
    pub(crate) fn open(path: &Path, nested: Nested) -> Result<Source, String> {
        let mut source = Source {
            archives: Vec::new(),
            files: BTreeMap::new(),
            lower: HashMap::new(),
            rejected: Vec::new(),
            name: path
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
                .unwrap_or_default(),
        };
        let meta = fs::metadata(path)
            .map_err(|_| "The file or folder to import could not be found.".to_string())?;
        if meta.is_dir() {
            source.add_folder(path, "", nested);
        } else {
            let file =
                File::open(path).map_err(|e| format!("The file could not be opened: {e}."))?;
            source
                .add_zip(Box::new(BufReader::new(file)), "", nested)
                .map_err(|_| "The file is not a zip archive, or it is damaged.".to_string())?;
        }
        Ok(source)
    }

    fn add_folder(&mut self, dir: &Path, prefix: &str, nested: Nested) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let rel = join(prefix, &name);
            // A link could point at any file on the machine: only real
            // files and folders are part of an export.
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if is_clutter(&name) {
                continue;
            }
            if file_type.is_dir() {
                self.add_folder(&entry.path(), &rel, nested);
            } else if file_type.is_file() {
                if nested != Nested::Leave && is_archive(&name) {
                    let mount = if nested == Nested::Merge {
                        prefix
                    } else {
                        rel.as_str()
                    };
                    let opened = File::open(entry.path()).ok().and_then(|file| {
                        self.add_zip(Box::new(BufReader::new(file)), mount, Nested::Leave)
                            .ok()
                    });
                    if opened.is_none() {
                        self.reject(&rel, "It is not a zip archive, or it is damaged.");
                    }
                } else {
                    self.insert(rel, Place::Disk(entry.path()));
                }
            }
        }
    }

    /// List the entries of an archive under `mount`, a folder path or "".
    fn add_zip(
        &mut self,
        reader: Box<dyn ReadSeek>,
        mount: &str,
        nested: Nested,
    ) -> Result<(), ()> {
        let mut archive = ZipArchive::new(reader).map_err(|_| ())?;
        let number = self.archives.len();
        let mut inner: Vec<(String, usize, u64)> = Vec::new();
        for entry in 0..archive.len() {
            let Ok(file) = archive.by_index_raw(entry) else {
                continue;
            };
            if file.is_dir() || file.is_symlink() {
                continue;
            }
            let raw = file.name().to_string();
            let size = file.size();
            drop(file);
            match safe_rel(&raw) {
                Err(reason) => self.reject(&raw, reason),
                Ok(rel) if rel.split('/').any(is_clutter) => {}
                Ok(rel) => {
                    let full = join(mount, &rel);
                    if nested != Nested::Leave && is_archive(&rel) {
                        inner.push((full, entry, size));
                    } else {
                        self.insert(
                            full,
                            Place::Zip {
                                archive: number,
                                entry,
                            },
                        );
                    }
                }
            }
        }
        self.archives.push(archive);

        for (full, entry, size) in inner {
            if size > MAX_INNER_ARCHIVE {
                self.reject(
                    &full,
                    "This archive inside the archive is too large to open in place. Unzip the export and import the folder.",
                );
                continue;
            }
            let mut bytes = Vec::new();
            let read = self.archives[number]
                .by_index(entry)
                .map_err(io::Error::other)
                .and_then(|file| file.take(MAX_INNER_ARCHIVE).read_to_end(&mut bytes));
            let mount = if nested == Nested::Merge {
                parent(&full)
            } else {
                full.as_str()
            };
            let opened = read.is_ok()
                && self
                    .add_zip(Box::new(Cursor::new(bytes)), mount, Nested::Leave)
                    .is_ok();
            if !opened {
                self.reject(&full, "It is not a zip archive, or it is damaged.");
            }
        }
        Ok(())
    }

    fn insert(&mut self, rel: String, place: Place) {
        // Two parts of one export should not hold the same file; the first wins.
        if self.files.contains_key(&rel) {
            return;
        }
        self.lower
            .entry(rel.to_lowercase())
            .or_insert_with(|| rel.clone());
        self.files.insert(rel, place);
    }

    fn reject(&mut self, name: &str, reason: &str) {
        self.rejected.push((name.to_string(), reason.to_string()));
    }

    /// The name of what was opened, without its extension.
    pub(crate) fn name(&self) -> &str {
        &self.name
    }

    /// Every file, as sorted paths with `/`.
    pub(crate) fn files(&self) -> Vec<String> {
        self.files.keys().cloned().collect()
    }

    #[cfg(test)]
    pub(crate) fn contains(&self, rel: &str) -> bool {
        self.files.contains_key(rel)
    }

    /// The path of a file as it is written in the export, found without
    /// regard to case.
    pub(crate) fn find(&self, rel: &str) -> Option<&str> {
        if let Some((found, _)) = self.files.get_key_value(rel) {
            return Some(found.as_str());
        }
        self.lower.get(&rel.to_lowercase()).map(String::as_str)
    }

    /// Entries that were refused when the export was opened. Taking them
    /// empties the list, so each is reported once.
    pub(crate) fn take_rejected(&mut self) -> Vec<(String, String)> {
        std::mem::take(&mut self.rejected)
    }

    fn reader(&mut self, rel: &str) -> io::Result<Box<dyn Read + '_>> {
        match self.files.get(rel) {
            None => Err(io::Error::new(
                io::ErrorKind::NotFound,
                "the file is not in the export",
            )),
            Some(Place::Disk(path)) => Ok(Box::new(File::open(path)?)),
            Some(Place::Zip { archive, entry }) => {
                let file = self.archives[*archive]
                    .by_index(*entry)
                    .map_err(io::Error::other)?;
                Ok(Box::new(file))
            }
        }
    }

    /// The whole content of a file that is going to be parsed.
    pub(crate) fn read(&mut self, rel: &str) -> Result<Vec<u8>, String> {
        let mut bytes = Vec::new();
        self.reader(rel)
            .and_then(|reader| reader.take(MAX_READ + 1).read_to_end(&mut bytes))
            .map_err(|e| format!("The file could not be read: {e}."))?;
        if bytes.len() as u64 > MAX_READ {
            return Err("The file is too large to read.".to_string());
        }
        Ok(bytes)
    }

    pub(crate) fn read_text(&mut self, rel: &str) -> Result<String, String> {
        self.read(rel).map(|bytes| decode_text(&bytes))
    }

    /// Copy a file out without holding it in memory, for attachments.
    pub(crate) fn copy_to(&mut self, rel: &str, out: &mut dyn Write) -> io::Result<()> {
        let mut reader = self.reader(rel)?;
        io::copy(&mut reader, out).map(|_| ())
    }
}

/// A path from an archive as a path inside it with `/`, or why it is refused.
pub(crate) fn safe_rel(name: &str) -> Result<String, &'static str> {
    let normalized = name.replace('\\', "/");
    let bytes = normalized.as_bytes();
    let has_drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    if normalized.starts_with('/') || has_drive {
        return Err("Its path is absolute, which an export never needs.");
    }
    if normalized.contains('\0') {
        return Err("Its name is not a valid file name.");
    }
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => return Err("Its path leads out of the archive."),
            part => parts.push(part),
        }
    }
    if parts.is_empty() {
        return Err("It has no name.");
    }
    Ok(parts.join("/"))
}

/// Files the system or an archiver adds, which are no part of the notes.
fn is_clutter(name: &str) -> bool {
    name.starts_with('.') || name == "__MACOSX" || name.eq_ignore_ascii_case("Thumbs.db")
}

fn is_archive(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".zip") || lower.ends_with(".textpack") || lower.ends_with(".bear2bk")
}

pub(crate) fn join(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    }
}

/// The folder a path is in, or "" at the top.
pub(crate) fn parent(rel: &str) -> &str {
    rel.rsplit_once('/').map_or("", |(folder, _)| folder)
}

pub(crate) fn file_name(rel: &str) -> &str {
    rel.rsplit_once('/').map_or(rel, |(_, name)| name)
}

/// Where a relative link written in a file in `folder` leads, as a path
/// inside the export. `None` when it leads out of it.
pub(crate) fn resolve(folder: &str, link: &str) -> Option<String> {
    let link = link.replace('\\', "/");
    let mut parts: Vec<&str> = if link.starts_with('/') {
        Vec::new()
    } else {
        folder.split('/').filter(|part| !part.is_empty()).collect()
    };
    for part in link.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

/// Text from a file: UTF-8 with or without a byte order mark, or UTF-16 with
/// one. Bytes that are not valid text become the replacement character.
pub(crate) fn decode_text(bytes: &[u8]) -> String {
    let utf16 = |bytes: &[u8], big_endian: bool| -> String {
        let units = bytes.chunks_exact(2).map(|pair| {
            if big_endian {
                u16::from_be_bytes([pair[0], pair[1]])
            } else {
                u16::from_le_bytes([pair[0], pair[1]])
            }
        });
        char::decode_utf16(units)
            .map(|unit| unit.unwrap_or(char::REPLACEMENT_CHARACTER))
            .collect()
    };
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        [0xFF, 0xFE, rest @ ..] => utf16(rest, false),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, true),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    /// A zip archive of the given files, compressed, built in memory.
    pub(crate) fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        zip_with(entries, CompressionMethod::Deflated)
    }

    pub(crate) fn zip_with(entries: &[(&str, &[u8])], method: CompressionMethod) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(method);
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(content).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{zip_bytes, zip_with};
    use super::*;
    use crate::importers::output::testing::{scratch, write};

    fn open_zip(name: &str, bytes: &[u8], nested: Nested) -> Source {
        let dir = scratch(name);
        write(&dir, "export.zip", bytes);
        Source::open(&dir.join("export.zip"), nested).unwrap()
    }

    #[test]
    fn a_path_that_leaves_the_archive_is_refused() {
        assert_eq!(safe_rel("Notes/a.md").unwrap(), "Notes/a.md");
        assert_eq!(safe_rel("Notes\\sub\\a.md").unwrap(), "Notes/sub/a.md");
        assert_eq!(safe_rel("./Notes//a.md").unwrap(), "Notes/a.md");
        assert_eq!(safe_rel("a..b/..c.md").unwrap(), "a..b/..c.md");
        for bad in [
            "../evil.md",
            "Notes/../../evil.md",
            "Notes/..",
            "..\\evil.md",
            "/etc/passwd",
            "\\\\server\\share\\x",
            "C:\\Windows\\x.md",
            "c:/x.md",
            "",
            "./",
            "a\0b",
        ] {
            assert!(safe_rel(bad).is_err(), "{bad:?} was accepted");
        }
    }

    #[test]
    fn an_archive_lists_only_the_entries_that_stay_inside_it() {
        let bytes = zip_bytes(&[
            ("Notes/a.md", b"a"),
            ("../evil.md", b"evil"),
            ("Notes/../../evil2.md", b"evil"),
            ("/abs.md", b"evil"),
            ("C:\\x.md", b"evil"),
            ("Notes\\b.md", b"b"),
            ("__MACOSX/Notes/._a.md", b"junk"),
            ("Notes/.DS_Store", b"junk"),
        ]);
        let mut source = open_zip("unsafe", &bytes, Nested::Leave);
        assert_eq!(source.files(), ["Notes/a.md", "Notes/b.md"]);
        assert_eq!(source.read_text("Notes/b.md").unwrap(), "b");
        assert!(source.read("../evil.md").is_err());

        let rejected = source.take_rejected();
        let names: Vec<&str> = rejected.iter().map(|(name, _)| name.as_str()).collect();
        assert_eq!(
            names,
            ["../evil.md", "Notes/../../evil2.md", "/abs.md", "C:\\x.md"]
        );
        assert_eq!(rejected[0].1, "Its path leads out of the archive.");
        assert_eq!(
            rejected[2].1,
            "Its path is absolute, which an export never needs."
        );
        assert!(source.take_rejected().is_empty());
    }

    #[test]
    fn a_folder_and_a_zip_of_it_read_the_same() {
        let content = "x".repeat(5000);
        let dir = scratch("same");
        write(&dir, "export/Top.md", "top");
        write(&dir, "export/Sub/Deep.md", &content);
        write(&dir, "export/.hidden/secret.md", "hidden");
        let mut folder = Source::open(&dir.join("export"), Nested::Leave).unwrap();

        for method in [
            zip::CompressionMethod::Deflated,
            zip::CompressionMethod::Stored,
        ] {
            let bytes = zip_with(
                &[("Top.md", b"top"), ("Sub/Deep.md", content.as_bytes())],
                method,
            );
            let mut zipped = open_zip("same-zip", &bytes, Nested::Leave);
            assert_eq!(zipped.files(), folder.files());
            assert_eq!(zipped.files(), ["Sub/Deep.md", "Top.md"]);
            assert_eq!(
                zipped.read("Sub/Deep.md").unwrap(),
                folder.read("Sub/Deep.md").unwrap()
            );
            let mut copied = Vec::new();
            zipped.copy_to("Sub/Deep.md", &mut copied).unwrap();
            assert_eq!(copied, content.as_bytes());
        }
        assert_eq!(folder.name(), "export");
        assert_eq!(folder.find("sub/deep.MD"), Some("Sub/Deep.md"));
        assert_eq!(folder.find("missing.md"), None);
    }

    #[test]
    fn an_archive_inside_the_export_is_opened_one_level_deep() {
        let deepest = zip_bytes(&[("too-deep.md", b"x")]);
        let part = zip_bytes(&[("Page/Child.md", b"child"), ("Page/more.zip", &deepest)]);
        let outer = zip_bytes(&[
            ("Export/Page.md", b"page"),
            ("Export/Part-1.zip", &part),
            ("Export/broken.zip", b"not a zip"),
        ]);

        let mut merged = open_zip("nested-merge", &outer, Nested::Merge);
        assert_eq!(
            merged.files(),
            [
                "Export/Page.md",
                "Export/Page/Child.md",
                "Export/Page/more.zip"
            ]
        );
        assert_eq!(merged.read_text("Export/Page/Child.md").unwrap(), "child");
        assert_eq!(merged.take_rejected()[0].0, "Export/broken.zip");

        let mut as_folder = open_zip("nested-folder", &outer, Nested::AsFolder);
        assert!(as_folder.contains("Export/Part-1.zip/Page/Child.md"));
        assert_eq!(
            as_folder
                .read_text("Export/Part-1.zip/Page/Child.md")
                .unwrap(),
            "child"
        );

        let left = open_zip("nested-leave", &outer, Nested::Leave);
        assert_eq!(
            left.files(),
            ["Export/Page.md", "Export/Part-1.zip", "Export/broken.zip"]
        );

        // The same archives lying in a folder.
        let dir = scratch("nested-on-disk");
        write(&dir, "Export/Part-1.zip", &part);
        write(&dir, "Export/Page.md", "page");
        let mut on_disk = Source::open(&dir, Nested::Merge).unwrap();
        assert_eq!(
            on_disk.files(),
            [
                "Export/Page.md",
                "Export/Page/Child.md",
                "Export/Page/more.zip"
            ]
        );
        assert_eq!(on_disk.read_text("Export/Page/Child.md").unwrap(), "child");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_in_a_folder_is_not_followed() {
        let dir = scratch("links");
        let secret = scratch("links-secret");
        write(&secret, "key.txt", "secret");
        write(&dir, "real.md", "real");
        std::os::unix::fs::symlink(secret.join("key.txt"), dir.join("key.txt")).unwrap();
        std::os::unix::fs::symlink(&secret, dir.join("folder")).unwrap();
        let source = Source::open(&dir, Nested::Leave).unwrap();
        assert_eq!(source.files(), ["real.md"]);
    }

    #[test]
    fn something_that_is_not_an_archive_says_so() {
        let dir = scratch("not-zip");
        write(&dir, "notes.zip", "plain text");
        let refused = Source::open(&dir.join("notes.zip"), Nested::Leave)
            .err()
            .unwrap();
        assert_eq!(refused, "The file is not a zip archive, or it is damaged.");
        let missing = Source::open(&dir.join("missing.zip"), Nested::Leave)
            .err()
            .unwrap();
        assert_eq!(missing, "The file or folder to import could not be found.");
    }

    #[test]
    fn relative_links_are_followed_inside_the_export_only() {
        assert_eq!(resolve("a/b", "c.png").unwrap(), "a/b/c.png");
        assert_eq!(resolve("a/b", "../c.png").unwrap(), "a/c.png");
        assert_eq!(resolve("a/b", "./x/../c.png").unwrap(), "a/b/c.png");
        assert_eq!(resolve("", "assets/c.png").unwrap(), "assets/c.png");
        assert_eq!(resolve("a", "/top.png").unwrap(), "top.png");
        assert_eq!(resolve("a", "../../c.png"), None);
        assert_eq!(resolve("", ".."), None);
        assert_eq!((parent("a/b/c.md"), parent("c.md")), ("a/b", ""));
        assert_eq!((file_name("a/b/c.md"), file_name("c.md")), ("c.md", "c.md"));
    }

    #[test]
    fn text_is_read_with_or_without_a_byte_order_mark() {
        assert_eq!(decode_text(b"plain"), "plain");
        assert_eq!(decode_text(b"\xEF\xBB\xBFwith mark"), "with mark");
        assert_eq!(decode_text(b"\xFF\xFEh\x00i\x00"), "hi");
        assert_eq!(decode_text(b"\xFE\xFF\x00h\x00i"), "hi");
        assert_eq!(decode_text(b"bad \xFF byte"), "bad \u{FFFD} byte");
    }
}
