// Textbundle, Textpack and Bear backups.
//
// A textbundle is a folder that holds one note:
//
//   My note.textbundle/
//     text.md            the note (also text.markdown, text.txt)
//     info.json          about the note
//     assets/photo.png   the files it shows
//
// A textpack is that folder zipped. A Bear backup (`.bear2bk`) is a zip of
// many textbundles, and Bear writes more into `info.json`: when the note
// was made and changed, and whether it is pinned, archived or in the trash.
// So one importer reads all three, and a folder or zip of any mix of them.
//
// The note keeps its Markdown. What changes is where things point:
//
// - `![](assets/photo.png)` and `[paper](assets/paper.pdf)` become
//   attachments. A file in `assets` that the text never mentions is linked
//   at the end, so nothing is saved without a link to it.
// - Bear's `[[Other note]]` and `bear://x-callback-url/open-note?id=...`
//   links point at the other note's final name, when it is in the backup.
// - Bear writes a picture's size after it as `<!-- {"width":300} -->`,
//   which becomes `![[photo.png|300]]`.
//
// The note is named after its first line when that is a heading (Bear
// names the bundle after it too, with less care), otherwise after the
// bundle. A note in Bear's trash is left out unless the caller asks.
//
// Not handled: Bear's `ApplicationData.zip` from iOS, which is a database
// and not textbundles; Bear's `#tags with spaces#`, which stay as written;
// encrypted Bear notes, which a backup holds only in encrypted form.

use super::markdown::{hold, local_path, release, rewrite_between, rewrite_links};
use super::output::{embed, parse_iso, wikilink, wikilink_to, Note, Output, Props, Slot};
use super::source::{file_name, join, parent, resolve, Nested, Source};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::Path;

/// What `info.json` says about a note.
#[derive(Default)]
struct Info {
    created: Option<DateTime<Utc>>,
    modified: Option<DateTime<Utc>>,
    pinned: bool,
    archived: bool,
    trashed: bool,
    /// Bear's id for the note, which its links to the note carry.
    id: String,
    source_url: String,
}

struct Bundle {
    folder: String,
    text: String,
    title: String,
    info: Info,
    slot: Slot,
}

pub(crate) fn import(path: &Path, include_trashed: bool, out: &mut Output) -> Result<(), String> {
    let mut source = Source::open(path, Nested::AsFolder)?;
    for (name, reason) in source.take_rejected() {
        out.skip(&name, &reason);
    }
    let files = source.files();
    let text_files: Vec<&String> = files
        .iter()
        .filter(|rel| {
            matches!(
                file_name(rel).to_ascii_lowercase().as_str(),
                "text.md" | "text.markdown" | "text.txt"
            )
        })
        .collect();
    if text_files.is_empty() {
        return Err(
            "No notes were found. Choose a Bear backup (.bear2bk), a Textbundle or Textpack, or a folder or zip of them.".to_string(),
        );
    }

    // Settle every name first: Bear notes link to each other.
    let mut bundles: Vec<Bundle> = Vec::new();
    for rel in text_files {
        let folder = parent(rel).to_string();
        let name = bundle_name(&folder, source.name());
        let text = match source.read_text(rel) {
            Ok(text) => text.replace("\r\n", "\n"),
            Err(reason) => {
                out.skip(&name, &reason);
                continue;
            }
        };
        let info = source
            .read_text(&join(&folder, "info.json"))
            .map(|json| read_info(&json))
            .unwrap_or_default();
        let title = first_heading(&text).unwrap_or(name);
        if info.trashed && !include_trashed {
            out.skip(&title, "It is in the trash in Bear.");
            continue;
        }
        let slot = out.reserve::<&str>(&[], &title);
        bundles.push(Bundle {
            folder,
            text,
            title,
            info,
            slot,
        });
    }

    let mut by_title: HashMap<String, String> = HashMap::new();
    let mut by_id: HashMap<String, String> = HashMap::new();
    for bundle in &bundles {
        by_title
            .entry(bundle.title.to_lowercase())
            .or_insert_with(|| bundle.slot.name.clone());
        if !bundle.info.id.is_empty() {
            by_id
                .entry(bundle.info.id.to_lowercase())
                .or_insert_with(|| bundle.slot.name.clone());
        }
    }

    for bundle in &bundles {
        // The bundle's own files, to tell at the end which were never shown.
        let assets_folder = format!("{}/", join(&bundle.folder, "assets"));
        let assets: Vec<&String> = files
            .iter()
            .filter(|rel| rel.starts_with(&assets_folder))
            .collect();
        // The files saved for this note, by their path in the bundle.
        let mut saved: HashMap<String, String> = HashMap::new();

        let body = rewrite_links(&bundle.text, &mut |link| {
            if let Some(id) = bear_note_id(link.target) {
                let name = by_id.get(&id).filter(|_| !link.image)?;
                return Some(hold(&wikilink(name, Some(link.text))));
            }
            let path = local_path(link.target)?;
            // "assets/photo.png" from the note; Bear also writes the bare
            // file name, meaning the same file. Only the note's own files
            // count: a path into another bundle is left as it is.
            let found = resolve(&bundle.folder, &path)
                .and_then(|rel| source.find(&rel).map(str::to_string))
                .or_else(|| {
                    resolve(&assets_folder, &path)
                        .and_then(|rel| source.find(&rel).map(str::to_string))
                })
                .filter(|rel| rel.starts_with(&assets_folder))?;
            let name = save_asset(&found, &bundle.title, &mut saved, &mut source, out)?;
            Some(hold(&if link.image {
                embed(&name)
            } else {
                wikilink(&name, Some(link.text))
            }))
        });
        let body = rewrite_between(&body, "[[", "]]", &mut |inner| note_link(inner, &by_title));
        let mut body = picture_sizes(&release(&body));

        for rel in assets {
            if saved.contains_key(rel) {
                continue;
            }
            if let Some(name) = save_asset(rel, &bundle.title, &mut saved, &mut source, out) {
                body = format!("{}\n\n{}", body.trim_end(), embed(&name));
            }
        }

        let mut props = Props::default();
        props.date("created", bundle.info.created);
        props.date("updated", bundle.info.modified);
        props.flag("pinned", bundle.info.pinned);
        props.flag("archived", bundle.info.archived);
        props.flag("trashed", bundle.info.trashed);
        props.text("source", &bundle.info.source_url);
        let modified = bundle.info.modified.or(bundle.info.created);
        out.write(
            &bundle.slot,
            &Note {
                props,
                body,
                modified,
            },
        );
    }
    Ok(())
}

/// Copy one of a note's files to the attachments, once, and return the
/// name it was given.
fn save_asset(
    rel: &str,
    title: &str,
    saved: &mut HashMap<String, String>,
    source: &mut Source,
    out: &mut Output,
) -> Option<String> {
    if let Some(name) = saved.get(rel) {
        return Some(name.clone());
    }
    match out.attach_with(file_name(rel), &mut |file| source.copy_to(rel, file)) {
        Ok(name) => {
            saved.insert(rel.to_string(), name.clone());
            Some(name)
        }
        Err(reason) => {
            out.skip(&format!("{title} ({})", file_name(rel)), &reason);
            None
        }
    }
}

/// The name of a bundle: its folder's, without ".textbundle". A bundle
/// that is the whole of what was opened is named after that.
fn bundle_name(folder: &str, opened: &str) -> String {
    let last = file_name(folder);
    let name = if last.is_empty() { opened } else { last };
    let lower = name.to_ascii_lowercase();
    for extension in [".textbundle", ".textpack", ".bear2bk", ".zip"] {
        if lower.ends_with(extension) {
            return name[..name.len() - extension.len()].to_string();
        }
    }
    name.to_string()
}

fn read_info(json: &str) -> Info {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Info::default();
    };
    let bear = &value["net.shinyfrog.bear"];
    let time = |key: &str| bear[key].as_str().and_then(parse_iso);
    // Bear writes these as 0 and 1.
    let flag = |key: &str| bear[key].as_i64() == Some(1) || bear[key].as_bool() == Some(true);
    Info {
        created: time("creationDate"),
        modified: time("modificationDate"),
        pinned: flag("pinned"),
        archived: flag("archived"),
        trashed: flag("trashed"),
        id: bear["uniqueIdentifier"].as_str().unwrap_or("").to_string(),
        source_url: value["sourceURL"].as_str().unwrap_or("").to_string(),
    }
}

/// The title of a note: its first line, when that is a top-level heading.
fn first_heading(text: &str) -> Option<String> {
    let line = text.lines().find(|line| !line.trim().is_empty())?;
    let title = line.strip_prefix("# ")?.trim();
    (!title.is_empty()).then(|| title.to_string())
}

/// The id in a link Bear makes to one of its notes.
fn bear_note_id(target: &str) -> Option<String> {
    let query = target
        .trim()
        .strip_prefix("bear://x-callback-url/open-note?")?;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix("id="))
        .map(str::to_lowercase)
}

/// Bear's `[[Title]]`, `[[Title/Heading]]` and `[[Title|shown]]`, pointed
/// at the note's final name. A link to no note in the backup is left alone.
fn note_link(inner: &str, by_title: &HashMap<String, String>) -> Option<String> {
    let (target, shown) = match inner.split_once('|') {
        Some((target, shown)) => (target.trim(), Some(shown.trim())),
        None => (inner.trim(), None),
    };
    if let Some(name) = by_title.get(&target.to_lowercase()) {
        return Some(wikilink(name, Some(shown.unwrap_or(target))));
    }
    // A title can hold a slash itself, so the whole is tried first.
    let (title, heading) = target.rsplit_once('/')?;
    let name = by_title.get(&title.trim().to_lowercase())?;
    Some(wikilink_to(name, &format!("#{}", heading.trim()), shown))
}

/// `![[photo.png]]<!-- {"width":300} -->` is `![[photo.png|300]]`. Any
/// other note Bear leaves in such a comment after a file is dropped.
fn picture_sizes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("]]<!--") {
        let after = &rest[at + "]]<!--".len()..];
        let comment = after.find("-->").map(|end| &after[..end]);
        let settings = comment
            .and_then(|comment| serde_json::from_str::<serde_json::Value>(comment.trim()).ok());
        let Some(settings) = settings.filter(serde_json::Value::is_object) else {
            // Not one of Bear's: someone's own comment stays.
            out.push_str(&rest[..at + 2]);
            rest = &rest[at + 2..];
            continue;
        };
        out.push_str(&rest[..at]);
        let is_picture = rest[..at]
            .rfind("[[")
            .is_some_and(|open| rest[..open].ends_with('!'));
        if let Some(width) = settings["width"]
            .as_f64()
            .filter(|width| *width >= 1.0 && is_picture)
        {
            out.push_str(&format!("|{}", width.round() as u64));
        }
        out.push_str("]]");
        rest = &after[comment.map_or(0, str::len) + "-->".len()..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;
    use serde_json::json;
    use std::fs;

    fn bear_info(id: &str, trashed: i64, pinned: i64) -> Vec<u8> {
        json!({
            "net.shinyfrog.bear": {
                "creationDate": "2021-01-31T12:34:56Z",
                "modificationDate": "2021-02-01T09:00:00+0100",
                "uniqueIdentifier": id,
                "trashed": trashed, "archived": 0, "pinned": pinned,
            },
            "version": 2, "type": "net.daringfireball.markdown", "transient": true,
            "creatorIdentifier": "net.shinyfrog.bear",
        })
        .to_string()
        .into_bytes()
    }

    fn backup() -> Vec<(&'static str, Vec<u8>)> {
        let trip = "# Trip: plan\n\nSee [[Packing list]] and [[packing LIST/Shoes|the shoes]] and [[Not in backup]].\nAlso [by id](bear://x-callback-url/open-note?id=AAAA-1111&show_window=yes).\n\n![](assets/map.png)<!-- {\"width\":300} -->\n![](map.png) [the ticket](assets/Ticket%20(1).pdf)<!-- {\"preview\":\"true\"} -->\n![remote](https://example.com/x.png) ![other bundle](../Packing%20list.textbundle/assets/secret.png)\n\n`![](assets/map.png)` #travel\n";
        vec![
            (
                "Trip_ plan.textbundle/text.markdown",
                trip.as_bytes().to_vec(),
            ),
            (
                "Trip_ plan.textbundle/info.json",
                bear_info("BBBB-2222", 0, 1),
            ),
            (
                "Trip_ plan.textbundle/assets/map.png",
                b"map bytes".to_vec(),
            ),
            (
                "Trip_ plan.textbundle/assets/Ticket (1).pdf",
                b"ticket bytes".to_vec(),
            ),
            (
                "Trip_ plan.textbundle/assets/unused.jpg",
                b"never shown".to_vec(),
            ),
            (
                "Packing list.textbundle/text.markdown",
                b"No heading here, back to [[Trip: plan]].\n".to_vec(),
            ),
            (
                "Packing list.textbundle/info.json",
                bear_info("AAAA-1111", 0, 0),
            ),
            (
                "Packing list.textbundle/assets/secret.png",
                b"other note's file".to_vec(),
            ),
            (
                "Deleted.textbundle/text.markdown",
                b"# Deleted\n\ngone\n".to_vec(),
            ),
            ("Deleted.textbundle/info.json", bear_info("CCCC-3333", 1, 0)),
            ("tags.json", b"[]".to_vec()),
        ]
    }

    #[test]
    fn a_bear_backup_becomes_notes_with_their_links_and_files() {
        let entries = backup();
        let entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(name, bytes)| (*name, bytes.as_slice()))
            .collect();
        let dir = scratch("bear");
        write(&dir, "Notes.bear2bk", zip_bytes(&entries));
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Bear").unwrap();
        import(&dir.join("Notes.bear2bk"), false, &mut out).unwrap();
        let report = out.finish();

        assert_eq!((report.notes, report.attachments), (2, 4));
        let skipped: Vec<(&str, &str)> = report
            .skipped
            .iter()
            .map(|s| (s.name.as_str(), s.reason.as_str()))
            .collect();
        assert_eq!(skipped, [("Deleted", "It is in the trash in Bear.")]);
        assert_eq!(
            files(&vault),
            [
                "Bear/Packing list.md",
                "Bear/Trip plan.md",
                "Bear/attachments/Ticket (1).pdf",
                "Bear/attachments/map.png",
                "Bear/attachments/secret.png",
                "Bear/attachments/unused.jpg",
            ]
        );
        assert_eq!(
            text(&vault, "Bear/Trip plan.md"),
            "---\n\
             created: 2021-01-31T12:34:56Z\n\
             updated: 2021-02-01T08:00:00Z\n\
             pinned: true\n\
             ---\n\
             \n\
             # Trip: plan\n\
             \n\
             See [[Packing list]] and [[Packing list#Shoes|the shoes]] and [[Not in backup]].\n\
             Also [[Packing list|by id]].\n\
             \n\
             ![[map.png|300]]\n\
             ![[map.png]] [[Ticket (1).pdf|the ticket]]\n\
             ![remote](https://example.com/x.png) ![other bundle](../Packing%20list.textbundle/assets/secret.png)\n\
             \n\
             `![](assets/map.png)` #travel\n\
             \n\
             ![[unused.jpg]]\n"
        );
        assert_eq!(
            text(&vault, "Bear/Packing list.md"),
            "---\ncreated: 2021-01-31T12:34:56Z\nupdated: 2021-02-01T08:00:00Z\n---\n\nNo heading here, back to [[Trip plan|Trip: plan]].\n\n![[secret.png]]\n"
        );
    }

    #[test]
    fn a_lone_textbundle_folder_or_textpack_is_one_note() {
        let dir = scratch("textbundle");
        write(
            &dir,
            "My note.textbundle/text.md",
            "Just text with ![a picture](assets/a.png).\r\nSecond line.\r\n",
        );
        write(
            &dir,
            "My note.textbundle/info.json",
            "{\"version\": 2, \"sourceURL\": \"https://example.com/original\"}",
        );
        write(&dir, "My note.textbundle/assets/a.png", "png");
        write(
            &dir,
            "Packed.textpack",
            zip_bytes(&[
                (
                    "Inner name.textbundle/text.txt",
                    b"# Packed title\n\nbody\n".as_slice(),
                ),
                ("Inner name.textbundle/info.json", b"not json".as_slice()),
            ]),
        );
        write(
            &dir,
            "Flat.textpack",
            zip_bytes(&[("text.md", b"flat body\n".as_slice())]),
        );
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();

        let mut out = Output::open(&vault, "One").unwrap();
        import(&dir.join("My note.textbundle"), false, &mut out).unwrap();
        import(&dir.join("Packed.textpack"), false, &mut out).unwrap();
        import(&dir.join("Flat.textpack"), false, &mut out).unwrap();
        assert_eq!(out.finish().notes, 3);
        assert_eq!(
            files(&vault),
            [
                "One/Flat.md",
                "One/My note.md",
                "One/Packed title.md",
                "One/attachments/a.png"
            ]
        );
        assert_eq!(
            text(&vault, "One/My note.md"),
            "---\nsource: https://example.com/original\n---\n\nJust text with ![[a.png]].\nSecond line.\n"
        );
        assert_eq!(
            text(&vault, "One/Packed title.md"),
            "# Packed title\n\nbody\n"
        );
        assert_eq!(text(&vault, "One/Flat.md"), "flat body\n");
    }

    #[test]
    fn a_folder_or_zip_of_bundles_and_packs_is_read_whole() {
        let dir = scratch("textbundle-mix");
        let pack = zip_bytes(&[("B.textbundle/text.md", b"note b\n".as_slice())]);
        write(&dir, "mix/A.textbundle/text.md", "note a\n");
        write(&dir, "mix/sub/B.textpack", &pack);
        write(&dir, "mix/readme.md", "not a bundle");
        write(
            &dir,
            "mix.zip",
            zip_bytes(&[
                ("A.textbundle/text.md", b"note a\n".as_slice()),
                ("sub/B.textpack", &pack),
            ]),
        );
        for (source, dest) in [("mix", "FromFolder"), ("mix.zip", "FromZip")] {
            let mut out = Output::open(&dir, dest).unwrap();
            import(&dir.join(source), false, &mut out).unwrap();
            assert_eq!(out.finish().notes, 2, "{source}");
        }
        assert_eq!(files(&dir.join("FromFolder")), ["A.md", "B.md"]);
        // The names are taken by now, so the second import numbers its notes.
        assert_eq!(files(&dir.join("FromZip")), ["A 2.md", "B 2.md"]);

        let mut out = Output::open(&dir, "Nothing").unwrap();
        write(&dir, "plain/readme.md", "not a bundle");
        assert!(import(&dir.join("plain"), false, &mut out)
            .unwrap_err()
            .starts_with("No notes were found."));
    }

    #[test]
    fn the_trash_can_be_included() {
        let entries = backup();
        let entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(name, bytes)| (*name, bytes.as_slice()))
            .collect();
        let dir = scratch("bear-trash");
        write(&dir, "Notes.bear2bk", zip_bytes(&entries));
        let mut out = Output::open(&dir, "Bear").unwrap();
        import(&dir.join("Notes.bear2bk"), true, &mut out).unwrap();
        assert_eq!(out.finish().notes, 3);
        assert_eq!(
            text(&dir, "Bear/Deleted.md"),
            "---\ncreated: 2021-01-31T12:34:56Z\nupdated: 2021-02-01T08:00:00Z\ntrashed: true\n---\n\n# Deleted\n\ngone\n"
        );
    }

    #[test]
    fn only_bears_own_comments_after_a_file_are_taken_out() {
        assert_eq!(
            picture_sizes("![[a.png]]<!-- {\"width\":120.4,\"height\":80} --> x"),
            "![[a.png|120]] x"
        );
        assert_eq!(
            picture_sizes("[[a.pdf]]<!-- {\"width\":120} -->"),
            "[[a.pdf]]"
        );
        assert_eq!(
            picture_sizes("![[a.png]]<!--{\"embed\":\"true\"}-->"),
            "![[a.png]]"
        );
        assert_eq!(
            picture_sizes("![[a.png]]<!-- my own note --> ![[b.png]]<!-- {\"width\":5} -->"),
            "![[a.png]]<!-- my own note --> ![[b.png|5]]"
        );
        assert_eq!(
            picture_sizes("![[a.png]]<!-- never closed"),
            "![[a.png]]<!-- never closed"
        );
        assert_eq!(
            bear_note_id("bear://x-callback-url/open-note?id=AB-12&x=1").as_deref(),
            Some("ab-12")
        );
        assert_eq!(bear_note_id("bear://x-callback-url/open-tag?name=x"), None);
    }
}
