// Google Keep: the Keep part of a Google Takeout, as the zip or unzipped.
//
// Takeout writes every note twice, as `.html` and as `.json`, next to the
// pictures and recordings attached to it. Only the `.json` files are read:
//
//   { "title": "...", "textContent": "...",            a text note, or
//     "listContent": [{ "text": "...", "isChecked": false }],   a checklist
//     "labels": [{ "name": "..." }],
//     "attachments": [{ "filePath": "abc.jpg", "mimetype": "image/jpeg" }],
//     "annotations": [{ "title": "...", "url": "..." }],        link previews
//     "isPinned": false, "isArchived": false, "isTrashed": false,
//     "color": "DEFAULT",
//     "createdTimestampUsec": 1600000000000000,
//     "userEditedTimestampUsec": 1600000000000000 }
//
// Labels become tags; pinned, archived and the colour become properties. A
// note in the trash is left out unless the caller asks for it. A note
// without a title is named after its first line, as Keep itself shows it.
//
// Keep exports neither the indentation of checklist items nor reminders,
// so those are lost. Who a note was shared with is not imported.

use super::output::{embed, from_millis, split_extension, Note, Output, Props};
use super::source::{file_name, parent, resolve, Nested, Source};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct KeepNote {
    title: String,
    text_content: String,
    list_content: Vec<KeepItem>,
    labels: Vec<KeepLabel>,
    attachments: Vec<KeepAttachment>,
    annotations: Vec<KeepAnnotation>,
    color: String,
    is_pinned: bool,
    is_archived: bool,
    is_trashed: bool,
    created_timestamp_usec: i64,
    user_edited_timestamp_usec: i64,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct KeepItem {
    text: String,
    is_checked: bool,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct KeepLabel {
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct KeepAttachment {
    file_path: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct KeepAnnotation {
    title: String,
    url: String,
}

/// The fields one of which every Keep note has. Other products in a
/// Takeout write `.json` files too.
const KEEP_FIELDS: [&str; 4] = [
    "textContent",
    "listContent",
    "userEditedTimestampUsec",
    "createdTimestampUsec",
];

pub(crate) fn import(path: &Path, include_trashed: bool, out: &mut Output) -> Result<(), String> {
    let mut source = Source::open(path, Nested::Leave)?;
    for (name, reason) in source.take_rejected() {
        out.skip(&name, &reason);
    }
    let files = source.files();
    let is_json = |rel: &&String| rel.to_ascii_lowercase().ends_with(".json");
    // A Takeout of several products keeps Keep's notes in a folder of that
    // name. Where there is none (the name is translated), every `.json`
    // file is looked at.
    let in_keep = |rel: &&String| parent(rel).split('/').any(|folder| folder == "Keep");
    let mut note_files: Vec<&String> = files.iter().filter(is_json).filter(in_keep).collect();
    if note_files.is_empty() {
        note_files = files.iter().filter(is_json).collect();
    }
    if note_files.is_empty() {
        return Err(
            "No Google Keep notes were found. Choose the Takeout zip file, or the folder it was unzipped into.".to_string(),
        );
    }

    for rel in note_files {
        let note = match read_note(&mut source, rel) {
            Ok(note) => note,
            Err(reason) => {
                out.skip(file_name(rel), &reason);
                continue;
            }
        };
        let title = title_of(&note, rel);
        if note.is_trashed && !include_trashed {
            out.skip(&title, "It is in the trash in Google Keep.");
            continue;
        }
        write_note(&note, &title, rel, &mut source, out);
    }
    Ok(())
}

fn read_note(source: &mut Source, rel: &str) -> Result<KeepNote, String> {
    let text = source.read_text(rel)?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("The file is not valid JSON ({e})."))?;
    let is_note = value
        .as_object()
        .is_some_and(|fields| KEEP_FIELDS.iter().any(|field| fields.contains_key(*field)));
    if !is_note {
        return Err("It is not a Google Keep note.".to_string());
    }
    serde_json::from_value(value).map_err(|e| format!("The note could not be read ({e})."))
}

/// The note's title, or the start of its first line, or the name of its file.
fn title_of(note: &KeepNote, rel: &str) -> String {
    let first_line = note
        .text_content
        .lines()
        .chain(note.list_content.iter().map(|item| item.text.as_str()))
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    let short: String = first_line.chars().take(60).collect();
    let candidates = [
        note.title.trim(),
        short.trim(),
        split_extension(file_name(rel)).0,
    ];
    let title = candidates.iter().find(|candidate| !candidate.is_empty());
    title.map_or(String::new(), |title| title.to_string())
}

fn write_note(note: &KeepNote, title: &str, rel: &str, source: &mut Source, out: &mut Output) {
    let slot = out.reserve::<&str>(&[], title);
    let mut parts: Vec<String> = Vec::new();

    let text = note.text_content.trim();
    if !text.is_empty() {
        parts.push(text.replace("\r\n", "\n"));
    }
    if !note.list_content.is_empty() {
        let items: Vec<String> = note
            .list_content
            .iter()
            .map(|item| {
                let mark = if item.is_checked { 'x' } else { ' ' };
                let text = item.text.split_whitespace().collect::<Vec<_>>().join(" ");
                format!("- [{mark}] {text}").trim_end().to_string()
            })
            .collect();
        parts.push(items.join("\n"));
    }
    for attachment in &note.attachments {
        let found = find_attachment(source, parent(rel), &attachment.file_path);
        let saved = match &found {
            Some(found) => {
                out.attach_with(file_name(found), &mut |file| source.copy_to(found, file))
            }
            None => Err("The attachment is missing from the export.".to_string()),
        };
        match saved {
            Ok(name) => parts.push(embed(&name)),
            Err(reason) => out.skip(&format!("{title} ({})", attachment.file_path), &reason),
        }
    }
    let links: Vec<String> = note
        .annotations
        .iter()
        .filter(|annotation| !annotation.url.trim().is_empty())
        .map(|annotation| {
            let url = annotation.url.trim();
            let shown = annotation
                .title
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if shown.is_empty() {
                format!("- <{url}>")
            } else {
                format!("- [{}]({url})", shown.replace('[', "(").replace(']', ")"))
            }
        })
        .collect();
    if !links.is_empty() {
        parts.push(links.join("\n"));
    }

    let created = from_millis(note.created_timestamp_usec / 1000);
    let updated = from_millis(note.user_edited_timestamp_usec / 1000);
    let mut props = Props::default();
    props.title_if_changed(note.title.trim(), &slot);
    props.tags(note.labels.iter().map(|label| label.name.as_str()));
    props.date("created", created);
    props.date("updated", updated);
    props.flag("pinned", note.is_pinned);
    props.flag("archived", note.is_archived);
    props.flag("trashed", note.is_trashed);
    let color = note.color.trim().to_lowercase();
    if color != "default" {
        props.text("color", &color);
    }
    out.write(
        &slot,
        &Note {
            props,
            body: parts.join("\n\n"),
            modified: updated.or(created),
        },
    );
}

/// The file an attachment names, next to the note. Takeout is known to
/// name a `.jpg` file as `.jpeg` in the note, so the same name with another
/// extension is accepted when the exact one is missing.
fn find_attachment(source: &Source, folder: &str, file_path: &str) -> Option<String> {
    let wanted = resolve(folder, file_path)?;
    if let Some(found) = source.find(&wanted) {
        return Some(found.to_string());
    }
    let (stem, _) = split_extension(&wanted);
    let prefix = format!("{}.", stem.to_lowercase());
    source.files().into_iter().find(|rel| {
        let lower = rel.to_lowercase();
        lower.starts_with(&prefix)
            && !lower[prefix.len()..].contains(['/', '.'])
            && !lower.ends_with(".json")
            && !lower.ends_with(".html")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;
    use serde_json::json;
    use std::fs;

    fn takeout() -> Vec<(&'static str, Vec<u8>)> {
        let shopping = json!({
            "title": "Shopping: weekend",
            "listContent": [
                { "text": "Milk", "isChecked": true },
                { "text": "Bread\nand butter", "isChecked": false },
                { "text": "", "isChecked": false },
            ],
            "labels": [{ "name": "Home" }, { "name": "To Do" }],
            "isPinned": true, "isArchived": false, "isTrashed": false,
            "color": "TEAL",
            "createdTimestampUsec": 1_612_096_496_000_000_i64,
            "userEditedTimestampUsec": 1_612_168_800_123_456_i64,
            "sharees": [{ "isOwner": true, "type": "USER", "email": "someone@example.com" }],
        });
        let untitled = json!({
            "title": "",
            "textContent": "\nAn idea worth keeping\nsecond line with #tag\n",
            "attachments": [
                { "filePath": "1a2b3c.jpeg", "mimetype": "image/jpeg" },
                { "filePath": "voice.3gp", "mimetype": "audio/3gp" },
                { "filePath": "lost.png", "mimetype": "image/png" },
            ],
            "annotations": [
                { "description": "A site", "source": "WEBLINK", "title": "Example [site]", "url": "https://example.com/" },
                { "source": "WEBLINK", "title": "", "url": "https://example.org/x" },
            ],
            "isPinned": false, "isArchived": true, "isTrashed": false,
            "color": "DEFAULT",
            "createdTimestampUsec": 1_612_096_496_000_000_i64,
            "userEditedTimestampUsec": 1_612_096_496_000_000_i64,
        });
        let trashed = json!({ "title": "Old", "textContent": "thrown away", "isTrashed": true, "userEditedTimestampUsec": 1 });
        vec![
            (
                "Takeout/Keep/Shopping_ weekend.json",
                shopping.to_string().into_bytes(),
            ),
            (
                "Takeout/Keep/Shopping_ weekend.html",
                b"<html>the same note</html>".to_vec(),
            ),
            (
                "Takeout/Keep/2021-01-31T12_34_56.000Z.json",
                untitled.to_string().into_bytes(),
            ),
            ("Takeout/Keep/1a2b3c.jpg", b"jpeg bytes".to_vec()),
            ("Takeout/Keep/voice.3gp", b"audio bytes".to_vec()),
            ("Takeout/Keep/Old.json", trashed.to_string().into_bytes()),
            ("Takeout/Keep/Broken.json", b"{ not json".to_vec()),
            ("Takeout/Keep/Labels.txt", b"Home\nTo Do\n".to_vec()),
            (
                "Takeout/Chrome/History.json",
                b"{\"Browser History\": []}".to_vec(),
            ),
            ("Takeout/archive_browser.html", b"<html></html>".to_vec()),
        ]
    }

    fn check(vault: &Path, include_trashed: bool) {
        let mut expected = vec![
            "Keep/An idea worth keeping.md",
            "Keep/Shopping weekend.md",
            "Keep/attachments/1a2b3c.jpg",
            "Keep/attachments/voice.3gp",
        ];
        if include_trashed {
            expected.insert(1, "Keep/Old.md");
        }
        assert_eq!(files(vault), expected);
        assert_eq!(
            text(vault, "Keep/Shopping weekend.md"),
            "---\n\
             title: \"Shopping: weekend\"\n\
             tags: [Home, To-Do]\n\
             created: 2021-01-31T12:34:56Z\n\
             updated: 2021-02-01T08:40:00Z\n\
             pinned: true\n\
             color: teal\n\
             ---\n\
             \n\
             - [x] Milk\n\
             - [ ] Bread and butter\n\
             - [ ]\n"
        );
        assert_eq!(
            text(vault, "Keep/An idea worth keeping.md"),
            "---\n\
             created: 2021-01-31T12:34:56Z\n\
             updated: 2021-01-31T12:34:56Z\n\
             archived: true\n\
             ---\n\
             \n\
             An idea worth keeping\n\
             second line with #tag\n\
             \n\
             ![[1a2b3c.jpg]]\n\
             \n\
             [[voice.3gp]]\n\
             \n\
             - [Example (site)](https://example.com/)\n\
             - <https://example.org/x>\n"
        );
    }

    #[test]
    fn a_takeout_folder_becomes_notes_with_labels_lists_and_attachments() {
        let dir = scratch("keep-folder");
        for (name, bytes) in takeout() {
            write(&dir, &format!("unzipped/{name}"), bytes);
        }
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Keep").unwrap();
        import(&dir.join("unzipped"), false, &mut out).unwrap();
        let report = out.finish();
        assert_eq!((report.notes, report.attachments), (2, 2));
        check(&vault, false);

        let skipped: Vec<(&str, &str)> = report
            .skipped
            .iter()
            .map(|s| (s.name.as_str(), s.reason.as_str()))
            .collect();
        assert_eq!(skipped.len(), 3, "{skipped:?}");
        assert_eq!(
            skipped[0],
            (
                "An idea worth keeping (lost.png)",
                "The attachment is missing from the export."
            )
        );
        assert_eq!(skipped[1].0, "Broken.json");
        assert!(skipped[1].1.starts_with("The file is not valid JSON"));
        assert_eq!(skipped[2], ("Old", "It is in the trash in Google Keep."));
    }

    #[test]
    fn a_takeout_zip_reads_the_same_and_the_trash_can_be_included() {
        let entries = takeout();
        let entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(name, bytes)| (*name, bytes.as_slice()))
            .collect();
        let dir = scratch("keep-zip");
        write(&dir, "takeout.zip", zip_bytes(&entries));
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Keep").unwrap();
        import(&dir.join("takeout.zip"), true, &mut out).unwrap();
        let report = out.finish();
        assert_eq!(
            (report.notes, report.attachments, report.skipped.len()),
            (3, 2, 2)
        );
        check(&vault, true);
        assert_eq!(
            text(&vault, "Keep/Old.md"),
            "---\ntrashed: true\n---\n\nthrown away\n"
        );
    }

    #[test]
    fn notes_outside_a_keep_folder_are_found_and_other_json_is_named() {
        let dir = scratch("keep-loose");
        write(
            &dir,
            "Notizen/Einkauf.json",
            json!({ "title": "Einkauf", "textContent": "Brot", "userEditedTimestampUsec": 0 })
                .to_string(),
        );
        write(&dir, "Notizen/settings.json", "{\"theme\": \"dark\"}");
        write(&dir, "Notizen/list.json", "[1, 2, 3]");
        let mut out = Output::open(&dir, "K").unwrap();
        import(&dir.join("Notizen"), false, &mut out).unwrap();
        let report = out.finish();
        assert_eq!(report.notes, 1);
        assert_eq!(text(&dir, "K/Einkauf.md"), "Brot\n");
        let names: Vec<&str> = report.skipped.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["list.json", "settings.json"]);
        assert_eq!(report.skipped[0].reason, "It is not a Google Keep note.");

        let empty = scratch("keep-none");
        write(&empty, "photo.png", "x");
        let mut out = Output::open(&dir, "K2").unwrap();
        assert!(import(&empty, false, &mut out)
            .unwrap_err()
            .starts_with("No Google Keep notes were found."));
    }
}
