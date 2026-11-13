// Importers: notes from other apps, turned into Markdown notes in a vault.
//
// Each app's export has an importer of its own:
//
//   evernote     .enex files
//   notion       the "Markdown & CSV" export, zipped or not
//   keep         Google Keep notes from a Google Takeout
//   roam         Roam Research's JSON export
//   logseq       a Logseq graph folder
//   textbundle   Textbundle, Textpack, and Bear's .bear2bk backups
//   html_files   one HTML file or a folder of them
//   csv          a table, one note per row
//
// and they share the parts that have to be right every time:
//
//   source       reads a folder or a zip the same way, and refuses any
//                archive entry whose path leaves the archive
//   output       writes into one folder of the vault, never over a file
//                that exists, with names that are valid everywhere and
//                unique in the vault, and writes the frontmatter
//   html         HTML to Markdown, for Evernote and HTML files
//   markdown     finds links in Markdown that another app wrote
//
// An import works in two steps. First every note is given its final name,
// which may differ from its title ("Plan 2", or a title with a slash in
// it). Then the notes are written, and every link between them is written
// with the name the other note really got. Attachments are saved to an
// `attachments` folder under the destination and linked the way the app
// links them: `![[photo.png]]` for a picture, `[[paper.pdf]]` for the rest.
//
// A note that cannot be read or written is recorded with the reason and
// the import goes on. An import fails as a whole only when there is nothing
// to import: the file is not what it was said to be, or holds no notes.

// The Tauri command that calls `import_notes` is added separately, with the
// dialog that uses it. Until then only the tests call into this module.
#![allow(dead_code)]

mod csv;
mod evernote;
mod html;
mod html_files;
mod keep;
mod logseq;
mod markdown;
mod md5;
mod notion;
mod output;
mod roam;
mod source;
mod textbundle;

use output::Output;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// The app or format an export comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Evernote,
    Notion,
    GoogleKeep,
    Roam,
    Logseq,
    Bear,
    Textbundle,
    Html,
    Csv,
}

impl Kind {
    /// The kind a name stands for. Case, dashes and spaces do not matter:
    /// "googleKeep", "google-keep" and "Google Keep" are the same.
    pub(crate) fn parse(name: &str) -> Option<Kind> {
        let key: String = name
            .chars()
            .filter(char::is_ascii_alphanumeric)
            .map(|c| c.to_ascii_lowercase())
            .collect();
        Some(match key.as_str() {
            "evernote" => Kind::Evernote,
            "notion" => Kind::Notion,
            "googlekeep" | "keep" => Kind::GoogleKeep,
            "roam" | "roamresearch" => Kind::Roam,
            "logseq" => Kind::Logseq,
            "bear" => Kind::Bear,
            "textbundle" | "textpack" => Kind::Textbundle,
            "html" => Kind::Html,
            "csv" => Kind::Csv,
            _ => return None,
        })
    }
}

/// Choices that only some importers have.
#[derive(Debug, Clone, Default)]
pub(crate) struct Options {
    /// CSV: the column that names each note. The first one when `None`.
    pub csv_title_column: Option<String>,
    /// Google Keep and Bear: import the notes in the trash too.
    pub include_trashed: bool,
}

/// A note, an attachment or a file that was left out, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Skipped {
    pub name: String,
    pub reason: String,
}

#[derive(Debug)]
pub(crate) struct Report {
    /// How many notes were written.
    pub notes: usize,
    /// How many attachments were saved.
    pub attachments: usize,
    pub skipped: Vec<Skipped>,
    /// The destination folder, as a path inside the vault with `/`.
    pub folder: String,
}

/// Import `source`, a file or folder exported from another app, into
/// `dest_folder` inside the vault. An error means nothing was imported.
pub(crate) fn run(
    kind: Kind,
    source: &Path,
    vault: &Path,
    dest_folder: &str,
    options: &Options,
) -> Result<Report, String> {
    if !source.exists() {
        return Err("The file or folder to import could not be found.".to_string());
    }
    let mut out = Output::open(vault, dest_folder)?;
    let imported = match kind {
        Kind::Evernote => evernote::import(source, &mut out),
        Kind::Notion => notion::import(source, &mut out),
        Kind::GoogleKeep => keep::import(source, options.include_trashed, &mut out),
        Kind::Roam => roam::import(source, &mut out),
        Kind::Logseq => logseq::import(source, &mut out),
        // A Bear backup is a zip of textbundles with a little more in each.
        Kind::Bear | Kind::Textbundle => {
            textbundle::import(source, options.include_trashed, &mut out)
        }
        Kind::Html => html_files::import(source, &mut out),
        Kind::Csv => csv::import(source, options.csv_title_column.as_deref(), &mut out),
    };
    match imported {
        Ok(()) => Ok(out.finish()),
        Err(reason) => {
            out.remove_root_if_unused();
            Err(reason)
        }
    }
}

// ============================================================
// The command
// ============================================================

/// What the frontend sends to start an import.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportInput {
    /// "evernote", "notion", "googleKeep", "roam", "logseq", "bear",
    /// "textbundle", "html" or "csv".
    pub kind: String,
    /// The exported file or folder, as a full path.
    pub source_path: String,
    pub vault_path: String,
    /// Where the notes go, as a path inside the vault: "Imported/Evernote".
    pub dest_folder: String,
    /// May be left out.
    #[serde(default)]
    pub options: Option<ImportOptions>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct ImportOptions {
    /// CSV: the name of the column that names each note.
    pub title_column: Option<String>,
    /// Google Keep and Bear: import the notes in the trash too.
    pub include_trashed: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct ImportResult {
    pub ok: bool,
    /// Why nothing was imported. `None` when `ok`.
    pub error: Option<String>,
    pub notes: usize,
    pub attachments: usize,
    pub skipped: Vec<Skipped>,
    /// The destination folder as a path inside the vault, or "" on an error.
    pub folder: String,
}

/// Run an import for the frontend. This never panics and never returns an
/// error of its own: what went wrong is in the result.
pub(crate) fn import_notes(args: ImportInput) -> ImportResult {
    let import = || -> Result<Report, String> {
        let kind = Kind::parse(&args.kind)
            .ok_or_else(|| format!("\"{}\" is not a format that can be imported.", args.kind))?;
        let chosen = args.options.as_ref();
        let options = Options {
            csv_title_column: chosen.and_then(|options| options.title_column.clone()),
            include_trashed: chosen.is_some_and(|options| options.include_trashed),
        };
        run(
            kind,
            Path::new(&args.source_path),
            Path::new(&args.vault_path),
            &args.dest_folder,
            &options,
        )
    };
    // Exports are other programs' files, read by a lot of code. Should any
    // of it fail in a way nobody foresaw, the app stays up and says so.
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(import)).unwrap_or_else(|_| {
        Err("The import stopped because of an unexpected error. Notes that were already imported are in the destination folder.".to_string())
    });
    match outcome {
        Ok(report) => ImportResult {
            ok: true,
            error: None,
            notes: report.notes,
            attachments: report.attachments,
            skipped: report.skipped,
            folder: report.folder,
        },
        Err(error) => ImportResult {
            ok: false,
            error: Some(error),
            notes: 0,
            attachments: 0,
            skipped: Vec::new(),
            folder: String::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::output::testing::{files, scratch, text, write};
    use super::*;
    use serde_json::json;

    fn keys(value: &serde_json::Value) -> Vec<String> {
        let mut keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        keys
    }

    #[test]
    fn the_import_command_reads_the_frontends_arguments_and_answers_in_its_field_names() {
        let dir = scratch("command");
        let vault = dir.join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        write(&dir, "people.csv", "id,Name\n1,Ann Lee\n2,Bo Chan\n");
        write(
            &dir,
            "Keep/Kept.json",
            json!({ "title": "Kept", "textContent": "still here", "userEditedTimestampUsec": 0 })
                .to_string(),
        );
        write(
            &dir,
            "Keep/Binned.json",
            json!({ "title": "Binned", "textContent": "thrown out", "isTrashed": true, "userEditedTimestampUsec": 0 }).to_string(),
        );
        let path = |name: &str| dir.join(name).to_string_lossy().into_owned();

        // The arguments exactly as the frontend sends them.
        let args: ImportInput = serde_json::from_value(json!({
            "kind": "csv",
            "sourcePath": path("people.csv"),
            "vaultPath": vault.to_string_lossy(),
            "destFolder": "Imported/People",
            "options": { "titleColumn": "Name" },
        }))
        .expect("the arguments are read");
        let result = import_notes(args);

        assert!(result.ok, "{:?}", result.error);
        assert_eq!((result.notes, result.attachments), (2, 0));
        assert_eq!(
            files(&vault),
            ["Imported/People/Ann Lee.md", "Imported/People/Bo Chan.md"]
        );
        assert_eq!(
            text(&vault, "Imported/People/Ann Lee.md"),
            "---\nid: 1\nName: Ann Lee\n---\n"
        );

        let value = serde_json::to_value(&result).unwrap();
        assert_eq!(
            keys(&value),
            ["attachments", "error", "folder", "notes", "ok", "skipped"]
        );
        assert_eq!(
            value,
            json!({ "ok": true, "error": null, "notes": 2, "attachments": 0, "skipped": [], "folder": "Imported/People" })
        );

        // The options may be left out or null, and what was skipped is listed.
        let result = import_notes(
            serde_json::from_value(json!({
                "kind": "googleKeep",
                "sourcePath": path("Keep"),
                "vaultPath": vault.to_string_lossy(),
                "destFolder": "Imported\\Keep",
                "options": null,
            }))
            .unwrap(),
        );
        let value = serde_json::to_value(&result).unwrap();
        assert_eq!(value["ok"], json!(true));
        assert_eq!(
            (value["notes"].clone(), value["folder"].clone()),
            (json!(1), json!("Imported/Keep"))
        );
        assert_eq!(keys(&value["skipped"][0]), ["name", "reason"]);
        assert_eq!(
            value["skipped"],
            json!([{ "name": "Binned", "reason": "It is in the trash in Google Keep." }])
        );

        let with_trash = import_notes(
            serde_json::from_value(json!({
                "kind": "google-keep",
                "sourcePath": path("Keep"),
                "vaultPath": vault.to_string_lossy(),
                "destFolder": "Imported/Keep again",
                "options": { "includeTrashed": true },
            }))
            .unwrap(),
        );
        assert_eq!(
            (with_trash.ok, with_trash.notes, with_trash.skipped.len()),
            (true, 2, 0)
        );
        // Nothing is ever overwritten: the same notes again get new names.
        assert_eq!(
            files(&vault.join("Imported/Keep again")),
            ["Binned.md", "Kept 2.md"]
        );
    }

    #[test]
    fn an_import_that_cannot_start_says_why_and_leaves_the_vault_alone() {
        let dir = scratch("command-refused");
        let vault = dir.join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        write(&dir, "notes.enex", "not an export");
        let call = |kind: &str, source: &str, dest: &str| {
            import_notes(
                serde_json::from_value(json!({
                    "kind": kind,
                    "sourcePath": dir.join(source).to_string_lossy(),
                    "vaultPath": vault.to_string_lossy(),
                    "destFolder": dest,
                }))
                .unwrap(),
            )
        };
        for (kind, source, dest, expected) in [
            (
                "onenote",
                "notes.enex",
                "In",
                "\"onenote\" is not a format that can be imported.",
            ),
            (
                "evernote",
                "missing.enex",
                "In",
                "The file or folder to import could not be found.",
            ),
            (
                "evernote",
                "notes.enex",
                "In",
                "No notes were found. The file does not look like an Evernote export (.enex).",
            ),
            (
                "evernote",
                "notes.enex",
                "../outside",
                "\"..\" cannot be used as a folder name in the destination folder.",
            ),
            (
                "notion",
                "notes.enex",
                "In",
                "The file is not a zip archive, or it is damaged.",
            ),
        ] {
            let refused = call(kind, source, dest);
            assert!(!refused.ok);
            assert_eq!(refused.error.as_deref(), Some(expected));
            let value = serde_json::to_value(&refused).unwrap();
            assert_eq!(
                keys(&value),
                ["attachments", "error", "folder", "notes", "ok", "skipped"]
            );
            assert_eq!(
                (value["notes"].clone(), value["folder"].clone()),
                (json!(0), json!(""))
            );
        }
        assert!(files(&vault).is_empty());
        assert!(!vault.join("In").exists());
        assert!(!dir.join("outside").exists());
    }

    #[test]
    fn every_format_has_a_name_the_frontend_can_send() {
        for (name, kind) in [
            ("evernote", Kind::Evernote),
            ("notion", Kind::Notion),
            ("googleKeep", Kind::GoogleKeep),
            ("google-keep", Kind::GoogleKeep),
            ("keep", Kind::GoogleKeep),
            ("roam", Kind::Roam),
            ("logseq", Kind::Logseq),
            ("bear", Kind::Bear),
            ("textbundle", Kind::Textbundle),
            ("Textpack", Kind::Textbundle),
            ("html", Kind::Html),
            ("HTML", Kind::Html),
            ("csv", Kind::Csv),
        ] {
            assert_eq!(Kind::parse(name), Some(kind), "{name}");
        }
        assert_eq!(Kind::parse("apple-notes"), None);
        assert_eq!(Kind::parse(""), None);
    }

    #[test]
    fn each_kind_reaches_its_importer() {
        // One small export of every kind, imported side by side into one vault.
        let dir = scratch("every-kind");
        let vault = dir.join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        write(&dir, "e.enex", "<en-export><note><title>From Evernote</title><content><![CDATA[<en-note><div>e</div></en-note>]]></content></note></en-export>");
        write(
            &dir,
            "notion/From Notion 0123456789abcdef0123456789abcdef.md",
            "# From Notion\n\nn\n",
        );
        write(
            &dir,
            "keep/k.json",
            json!({ "title": "From Keep", "textContent": "k" }).to_string(),
        );
        write(
            &dir,
            "roam.json",
            json!([{ "title": "From Roam", "children": [{ "string": "r", "uid": "u" }] }])
                .to_string(),
        );
        write(&dir, "logseq/pages/From Logseq.md", "- l\n");
        write(&dir, "bear/From Bear.textbundle/text.markdown", "b\n");
        write(&dir, "From Textbundle.textbundle/text.md", "t\n");
        write(&dir, "From HTML.html", "<p>h</p>");
        write(&dir, "c.csv", "Name\nFrom CSV\n");

        for (kind, source) in [
            (Kind::Evernote, "e.enex"),
            (Kind::Notion, "notion"),
            (Kind::GoogleKeep, "keep"),
            (Kind::Roam, "roam.json"),
            (Kind::Logseq, "logseq"),
            (Kind::Bear, "bear"),
            (Kind::Textbundle, "From Textbundle.textbundle"),
            (Kind::Html, "From HTML.html"),
            (Kind::Csv, "c.csv"),
        ] {
            let report = run(kind, &dir.join(source), &vault, "All", &Options::default())
                .unwrap_or_else(|e| panic!("{kind:?}: {e}"));
            assert_eq!(
                (report.notes, report.folder.as_str()),
                (1, "All"),
                "{kind:?}"
            );
            assert!(report.skipped.is_empty(), "{kind:?}: {:?}", report.skipped);
        }
        assert_eq!(
            files(&vault),
            [
                "All/From Bear.md",
                "All/From CSV.md",
                "All/From Evernote.md",
                "All/From HTML.md",
                "All/From Keep.md",
                "All/From Logseq.md",
                "All/From Notion.md",
                "All/From Roam.md",
                "All/From Textbundle.md",
            ]
        );
    }
}
