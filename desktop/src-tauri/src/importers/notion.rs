// Notion: the "Markdown & CSV" export, as the zip Notion makes or as the
// folder it unzips to.
//
// What the export looks like:
//
//   Home 0123456789abcdef0123456789abcdef.md       a page
//   Home 0123456789abcdef0123456789abcdef/         what the page holds
//     Sub Page fedc...3210.md                        a page inside it
//     diagram.png                                    a file it shows
//     Tasks 89ab...4567.csv                          a database, as a table
//     Tasks 89ab...4567_all.csv                      the same, every row
//     Tasks 89ab...4567/                             the database's rows
//       Write draft 4567...89ab.md                     one row, as a page
//
// Every page and folder carries Notion's 32-character id after its name.
// The import keeps the hierarchy and drops the ids, so the page above
// becomes `Home.md` beside a folder `Home`. Links in the pages are relative,
// percent-encoded paths that include the ids, so every one of them has to
// be rewritten: to `[[Note]]` for a page or a database, and to an
// attachment for anything else. A link to notion.so that names an exported
// page by its id is rewritten too.
//
// A database becomes a note with a Markdown table, taken from the `_all`
// file when there is one (the other holds only what the default view
// shows). The first cell of a row links to the row's page when it has one.
// The csv itself is not copied. A row's page starts with its properties as
// "Name: value" lines under the title; those that name a column of the
// database become frontmatter.
//
// Names are settled for every page before any page is written, since a
// link can point at a page that comes later.
//
// Not handled: Notion's HTML export (refused with a message saying so),
// comments, and files nothing links to.

use super::csv;
use super::markdown::{local_path, rewrite_links, Link};
use super::output::{embed, split_extension, wikilink, Note, Output, Props, Slot};
use super::source::{file_name, parent, resolve, Nested, Source};
use std::collections::HashMap;
use std::path::Path;

pub(crate) fn import(path: &Path, out: &mut Output) -> Result<(), String> {
    let mut source = Source::open(path, Nested::Merge)?;
    for (name, reason) in source.take_rejected() {
        out.skip(&name, &reason);
    }
    let files = source.files();
    let has_ext = |rel: &str, ext: &str| rel.to_ascii_lowercase().ends_with(ext);
    let page_files: Vec<&String> = files.iter().filter(|rel| has_ext(rel, ".md")).collect();
    let database_files = database_files(&files);
    if page_files.is_empty() && database_files.is_empty() {
        return Err(if files.iter().any(|rel| has_ext(rel, ".html")) {
            "This is Notion's HTML export. Export from Notion again and choose \"Markdown & CSV\" as the format.".to_string()
        } else {
            "No Notion pages were found. Choose the zip file Notion made, or the folder it was unzipped into.".to_string()
        });
    }
    let top = export_folder(&files);

    // Settle every name first.
    let mut plan = Plan::default();
    let mut pages: Vec<(String, Slot, String)> = Vec::new();
    for rel in page_files {
        let text = match source.read_text(rel) {
            Ok(text) => text,
            Err(reason) => {
                out.skip(rel, &reason);
                continue;
            }
        };
        let (stem, _) = split_extension(file_name(rel));
        let (name, id) = split_id(stem);
        let title = first_heading(&text).unwrap_or_else(|| name.to_string());
        let slot = out.reserve(&folders_of(rel, top.as_deref()), &title);
        plan.by_path.insert(rel.to_lowercase(), slot.name.clone());
        if let Some(id) = id {
            plan.by_id
                .entry(id.to_lowercase())
                .or_insert_with(|| slot.name.clone());
        }
        plan.by_title
            .entry((parent(rel).to_lowercase(), title.to_lowercase()))
            .or_insert_with(|| slot.name.clone());
        pages.push((rel.clone(), slot, text));
    }

    let mut databases: Vec<(Database, Slot)> = Vec::new();
    for (chosen, variants) in database_files {
        let rows = match source.read_text(&chosen) {
            Ok(text) => csv::parse(&text),
            Err(reason) => {
                out.skip(&chosen, &reason);
                continue;
            }
        };
        let rows_folder = database_key(&chosen);
        let (name, id) = split_id(file_name(&rows_folder));
        let slot = out.reserve(&folders_of(&chosen, top.as_deref()), name);
        for variant in variants {
            plan.by_path
                .insert(variant.to_lowercase(), slot.name.clone());
        }
        if let Some(id) = id {
            plan.by_id
                .entry(id.to_lowercase())
                .or_insert_with(|| slot.name.clone());
        }
        let columns = rows
            .first()
            .map(|header| csv::column_names(header))
            .unwrap_or_default();
        plan.columns.insert(rows_folder.to_lowercase(), columns);
        databases.push((
            Database {
                rel: chosen,
                rows_folder,
                rows,
            },
            slot,
        ));
    }

    // Then write, with every link able to find where it leads.
    let mut attachments: HashMap<String, String> = HashMap::new();
    for (rel, slot, text) in pages {
        let folder = parent(&rel);
        let (properties, body) = match plan.columns.get(&folder.to_lowercase()) {
            Some(columns) => take_properties(&text, columns),
            None => (Vec::new(), text),
        };
        let body = rewrite_links(&body, &mut |link| {
            link_for(link, folder, &plan, &mut source, &mut attachments, out)
        });
        let mut props = Props::default();
        for (name, value) in &properties {
            props.cell(name, value);
        }
        out.write(
            &slot,
            &Note {
                props,
                body,
                modified: None,
            },
        );
    }
    for (database, slot) in databases {
        match database_table(&database, &plan) {
            Some(body) => {
                out.write(
                    &slot,
                    &Note {
                        body,
                        ..Note::default()
                    },
                );
            }
            None => out.skip(&database.rel, "The database file is empty."),
        }
    }
    Ok(())
}

/// Where everything in the export ended up.
#[derive(Default)]
struct Plan {
    /// A page or database file, by its path in the export in lower case,
    /// to the name of its note.
    by_path: HashMap<String, String>,
    /// The same by Notion id, for links that carry only the id.
    by_id: HashMap<String, String>,
    /// A page by the folder it is in and its title, both in lower case: how
    /// a row of a database finds its page.
    by_title: HashMap<(String, String), String>,
    /// The column names of each database, by the folder its rows are in.
    columns: HashMap<String, Vec<String>>,
}

struct Database {
    rel: String,
    /// The folder that holds the pages of the rows.
    rows_folder: String,
    rows: Vec<Vec<String>>,
}

/// "My Page 0123456789abcdef0123456789abcdef" is ("My Page", the id). A
/// name that is nothing but an id has no title.
fn split_id(name: &str) -> (&str, Option<&str>) {
    let Some(cut) = name
        .len()
        .checked_sub(32)
        .filter(|cut| name.is_char_boundary(*cut))
    else {
        return (name, None);
    };
    let (head, id) = name.split_at(cut);
    let is_id =
        id.bytes().all(|byte| byte.is_ascii_hexdigit()) && (head.is_empty() || head.ends_with(' '));
    if is_id {
        (head.trim_end(), Some(id))
    } else {
        (name, None)
    }
}

/// The path of a database without ".csv" and "_all": the folder its rows'
/// pages are in, and what both of its files have in common.
fn database_key(rel: &str) -> String {
    let without_ext = &rel[..rel.len() - ".csv".len()];
    without_ext
        .strip_suffix("_all")
        .unwrap_or(without_ext)
        .to_string()
}

/// The database files to read, each with every file that is the same
/// database. Notion writes a database twice: "X.csv" with the rows the
/// default view shows and "X_all.csv" with all of them.
fn database_files(files: &[String]) -> Vec<(String, Vec<String>)> {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for rel in files
        .iter()
        .filter(|rel| rel.to_ascii_lowercase().ends_with(".csv"))
    {
        let key = database_key(rel).to_lowercase();
        match groups.iter_mut().find(|(group, _)| *group == key) {
            Some((_, variants)) => variants.push(rel.clone()),
            None => groups.push((key, vec![rel.clone()])),
        }
    }
    groups
        .into_iter()
        .map(|(_, variants)| {
            let all = variants
                .iter()
                .find(|rel| rel[..rel.len() - 4].ends_with("_all"));
            (all.unwrap_or(&variants[0]).clone(), variants)
        })
        .collect()
}

/// The single folder everything is in when the export wraps its pages in
/// one named "Export-...". It is not part of the hierarchy of the pages.
fn export_folder(files: &[String]) -> Option<String> {
    let first = files.first()?.split_once('/')?.0;
    let shared = first.starts_with("Export-")
        && files
            .iter()
            .all(|rel| rel.split_once('/').is_some_and(|(top, _)| top == first));
    shared.then(|| first.to_string())
}

/// The folders a file's note goes in: the folders of the file, without
/// their ids.
fn folders_of(rel: &str, top: Option<&str>) -> Vec<String> {
    let mut folders: Vec<&str> = parent(rel)
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if top.is_some() && folders.first().copied() == top {
        folders.remove(0);
    }
    folders
        .into_iter()
        .map(|folder| split_id(folder).0.to_string())
        .collect()
}

/// The title of a page: its first line, when that is a top-level heading.
fn first_heading(text: &str) -> Option<String> {
    let line = text.lines().find(|line| !line.trim().is_empty())?;
    let title = line.strip_prefix("# ")?.trim();
    (!title.is_empty()).then(|| title.to_string())
}

/// Take the properties off the top of a database row's page. They are the
/// "Name: value" lines right under the title, as long as each names a
/// column of the database. Returns them and the page without them.
fn take_properties(text: &str, columns: &[String]) -> (Vec<(String, String)>, String) {
    let lines: Vec<&str> = text.lines().collect();
    let skip_blank = |mut at: usize| {
        while lines.get(at).is_some_and(|line| line.trim().is_empty()) {
            at += 1;
        }
        at
    };
    let mut at = skip_blank(0);
    if lines.get(at).is_some_and(|line| line.starts_with("# ")) {
        at += 1;
    }
    let heading_end = at;
    at = skip_blank(at);

    let mut properties = Vec::new();
    while let Some(line) = lines.get(at) {
        // The longest column name the line starts with: "Due" must not
        // claim a line that belongs to "Due date".
        let column = columns
            .iter()
            .filter(|column| {
                line.strip_prefix(column.as_str())
                    .is_some_and(|rest| rest.starts_with(':'))
            })
            .max_by_key(|column| column.len());
        let Some(column) = column else {
            break;
        };
        properties.push((column.clone(), line[column.len() + 1..].trim().to_string()));
        at += 1;
    }
    if properties.is_empty() {
        return (properties, text.to_string());
    }
    let mut body = lines[..heading_end].join("\n");
    let rest = skip_blank(at);
    if rest < lines.len() {
        if !body.is_empty() {
            body.push_str("\n\n");
        }
        body.push_str(&lines[rest..].join("\n"));
    }
    (properties, body)
}

/// The id at the end of a notion.so address: "Page-Title-0123...cdef", or
/// the same id written with dashes.
fn notion_url_id(target: &str) -> Option<String> {
    let rest = target
        .strip_prefix("https://")
        .or_else(|| target.strip_prefix("http://"))?;
    let (host, path) = rest.split_once('/')?;
    let is_notion =
        host == "notion.so" || host.ends_with(".notion.so") || host.ends_with(".notion.site");
    if !is_notion {
        return None;
    }
    let last = path
        .split(['?', '#'])
        .next()?
        .trim_end_matches('/')
        .rsplit('/')
        .next()?;
    let compact: String = last.chars().filter(|c| *c != '-').collect();
    let cut = compact
        .len()
        .checked_sub(32)
        .filter(|cut| compact.is_char_boundary(*cut))?;
    let id = &compact[cut..];
    id.bytes()
        .all(|byte| byte.is_ascii_hexdigit())
        .then(|| id.to_lowercase())
}

/// What a link in a page becomes, or `None` to leave it as written.
fn link_for(
    link: &Link,
    folder: &str,
    plan: &Plan,
    source: &mut Source,
    attachments: &mut HashMap<String, String>,
    out: &mut Output,
) -> Option<String> {
    if let Some(id) = notion_url_id(link.target) {
        return plan
            .by_id
            .get(&id)
            .map(|name| wikilink(name, Some(link.text)));
    }
    let rel = resolve(folder, &local_path(link.target)?)?;

    // A page or a database: by its path, or by its id if the path is off.
    let id_in_name = || {
        split_id(database_key_or_stem(file_name(&rel)))
            .1
            .map(str::to_lowercase)
    };
    let note = plan
        .by_path
        .get(&rel.to_lowercase())
        .or_else(|| id_in_name().and_then(|id| plan.by_id.get(&id)));
    if let Some(name) = note {
        return Some(if link.image {
            format!("![[{name}]]")
        } else {
            wikilink(name, Some(link.text))
        });
    }

    // Anything else in the export is an attachment, copied the first time
    // something links to it.
    let found = source.find(&rel)?.to_string();
    let name = match attachments.get(&found) {
        Some(name) => name.clone(),
        None => {
            match out.attach_with(file_name(&found), &mut |file| source.copy_to(&found, file)) {
                Ok(name) => {
                    attachments.insert(found, name.clone());
                    name
                }
                Err(reason) => {
                    out.skip(&found, &reason);
                    return None;
                }
            }
        }
    };
    Some(if link.image {
        embed(&name)
    } else {
        wikilink(&name, Some(link.text))
    })
}

/// A file name without ".md", or without ".csv" and "_all".
fn database_key_or_stem(name: &str) -> &str {
    let (stem, _) = split_extension(name);
    stem.strip_suffix("_all").unwrap_or(stem)
}

/// The note for a database: its rows as a Markdown table.
fn database_table(database: &Database, plan: &Plan) -> Option<String> {
    let (header, rows) = database.rows.split_first()?;
    let columns = csv::column_names(header);
    let cell = |text: &str| {
        text.trim()
            .replace("\r\n", "\n")
            .replace('\n', "<br>")
            .replace('|', "\\|")
    };
    let line = |cells: Vec<String>| format!("| {} |", cells.join(" | "));

    let mut lines = vec![
        line(columns.iter().map(|name| cell(name)).collect()),
        format!("|{}", " --- |".repeat(columns.len())),
    ];
    let folder = database.rows_folder.to_lowercase();
    for row in rows {
        let mut cells: Vec<String> = (0..columns.len())
            .map(|i| cell(row.get(i).map_or("", String::as_str)))
            .collect();
        // The first column is the title: link it to the row's page.
        let title = row.first().map_or("", |title| title.trim());
        if let Some(name) = plan.by_title.get(&(folder.clone(), title.to_lowercase())) {
            cells[0] = format!("[[{name}]]");
        }
        lines.push(line(cells));
    }
    Some(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};
    use crate::importers::source::testing::zip_bytes;
    use std::fs;

    const HOME: &str = "0123456789abcdef0123456789abcdef";
    const SUB: &str = "fedcba9876543210fedcba9876543210";
    const TASKS: &str = "89abcdef0123456789abcdef01234567";
    const ROW: &str = "456789abcdef0123456789abcdef0123";
    const GONE: &str = "99999999999999999999999999999999";

    /// A small export with everything the importer handles in it.
    fn export() -> Vec<(String, Vec<u8>)> {
        let home = format!(
            "# Home\n\nSee [Sub Page](Home%20{HOME}/Sub%20Page%20{SUB}.md) and [the tasks](Home%20{HOME}/Tasks%20{TASKS}.csv).\n\n![diagram](Home%20{HOME}/diagram.png)\n\n[My report](Home%20{HOME}/My%20report%20(final).pdf) and again [My report (final).pdf](Home%20{HOME}/My%20report%20(final).pdf)\n\n[Elsewhere](https://example.com/page.md) and [by address](https://www.notion.so/workspace/Sub-Page-{SUB}?pvs=4) and [gone](Home%20{HOME}/Missing%20{GONE}.md)\n\n```\n[code](Home%20{HOME}/Sub%20Page%20{SUB}.md)\n```\n"
        );
        let sub = format!("# Sub Page: the *real* title\n\nBack to [Home](../Home%20{HOME}.md) and a [row](Tasks%20{TASKS}/Write%20draft%20{ROW}.md).\n");
        let row = "# Write draft\n\nStatus: Done\nDue date: March 3, 2023\nDue: 5\nEstimate: 2.5\n\nThe body of the row.\n\nStatus: not a property down here\n";
        let csv = "Name,Status,Due,Due date,Estimate\nWrite draft,Done,5,\"March 3, 2023\",2.5\n";
        let csv_all = "Name,Status,Due,Due date,Estimate\nWrite draft,Done,5,\"March 3, 2023\",2.5\nNo page | yet,Todo,,,\n\"Two\nlines\",,,,\n";
        vec![
            (format!("Export-abc/Home {HOME}.md"), home.into_bytes()),
            (
                format!("Export-abc/Home {HOME}/Sub Page {SUB}.md"),
                sub.into_bytes(),
            ),
            (
                format!("Export-abc/Home {HOME}/diagram.png"),
                b"png bytes".to_vec(),
            ),
            (
                format!("Export-abc/Home {HOME}/unused.png"),
                b"never linked".to_vec(),
            ),
            (
                format!("Export-abc/Home {HOME}/My report (final).pdf"),
                b"pdf bytes".to_vec(),
            ),
            (
                format!("Export-abc/Home {HOME}/Tasks {TASKS}.csv"),
                csv.as_bytes().to_vec(),
            ),
            (
                format!("Export-abc/Home {HOME}/Tasks {TASKS}_all.csv"),
                csv_all.as_bytes().to_vec(),
            ),
            (
                format!("Export-abc/Home {HOME}/Tasks {TASKS}/Write draft {ROW}.md"),
                row.as_bytes().to_vec(),
            ),
        ]
    }

    fn check(vault: &Path) {
        assert_eq!(
            files(vault),
            [
                "Notion/Home.md",
                "Notion/Home/Sub Page the real title.md",
                "Notion/Home/Tasks.md",
                "Notion/Home/Tasks/Write draft.md",
                "Notion/attachments/My report (final).pdf",
                "Notion/attachments/diagram.png",
            ]
        );
        assert_eq!(
            text(vault, "Notion/Home.md"),
            format!(
                "# Home\n\nSee [[Sub Page the real title|Sub Page]] and [[Tasks|the tasks]].\n\n![[diagram.png]]\n\n[[My report (final).pdf|My report]] and again [[My report (final).pdf]]\n\n[Elsewhere](https://example.com/page.md) and [[Sub Page the real title|by address]] and [gone](Home%20{HOME}/Missing%20{GONE}.md)\n\n```\n[code](Home%20{HOME}/Sub%20Page%20{SUB}.md)\n```\n"
            )
        );
        assert_eq!(
            text(vault, "Notion/Home/Sub Page the real title.md"),
            "# Sub Page: the *real* title\n\nBack to [[Home]] and a [[Write draft|row]].\n"
        );
        assert_eq!(
            text(vault, "Notion/Home/Tasks/Write draft.md"),
            "---\nStatus: Done\nDue date: March 3, 2023\nDue: 5\nEstimate: 2.5\n---\n\n# Write draft\n\nThe body of the row.\n\nStatus: not a property down here\n"
        );
        assert_eq!(
            text(vault, "Notion/Home/Tasks.md"),
            "| Name | Status | Due | Due date | Estimate |\n| --- | --- | --- | --- | --- |\n| [[Write draft]] | Done | 5 | March 3, 2023 | 2.5 |\n| No page \\| yet | Todo |  |  |  |\n| Two<br>lines |  |  |  |  |\n"
        );
        assert_eq!(
            fs::read(vault.join("Notion/attachments/diagram.png")).unwrap(),
            b"png bytes"
        );
    }

    #[test]
    fn a_zipped_export_keeps_its_pages_links_and_databases() {
        let entries = export();
        let entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
            .collect();
        let dir = scratch("notion-zip");
        write(&dir, "export.zip", zip_bytes(&entries));
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Notion").unwrap();
        import(&dir.join("export.zip"), &mut out).unwrap();
        let report = out.finish();
        assert_eq!((report.notes, report.attachments), (4, 2));
        assert!(report.skipped.is_empty(), "{:?}", report.skipped);
        check(&vault);
    }

    #[test]
    fn an_unzipped_export_gives_the_same_notes() {
        let dir = scratch("notion-folder");
        for (name, bytes) in export() {
            write(&dir, &format!("unzipped/{name}"), bytes);
        }
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Notion").unwrap();
        import(&dir.join("unzipped"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 4);
        check(&vault);
    }

    #[test]
    fn an_export_split_into_parts_is_read_as_one() {
        let part_one = zip_bytes(&[(
            &format!("Home {HOME}.md"),
            format!("# Home\n\n[Sub](Home%20{HOME}/Sub%20{SUB}.md)\n").as_bytes(),
        )]);
        let part_two = zip_bytes(&[(
            &format!("Home {HOME}/Sub {SUB}.md"),
            b"# Sub\n\ntext\n".as_slice(),
        )]);
        let dir = scratch("notion-parts");
        write(
            &dir,
            "export.zip",
            zip_bytes(&[
                ("Export-x-Part-1.zip", &part_one),
                ("Export-x-Part-2.zip", &part_two),
            ]),
        );
        let mut out = Output::open(&dir, "Notion").unwrap();
        import(&dir.join("export.zip"), &mut out).unwrap();
        assert_eq!(out.finish().notes, 2);
        assert_eq!(text(&dir, "Notion/Home.md"), "# Home\n\n[[Sub]]\n");
        assert_eq!(text(&dir, "Notion/Home/Sub.md"), "# Sub\n\ntext\n");
    }

    #[test]
    fn pages_that_share_a_title_get_different_names_and_the_right_links() {
        let a = "11111111111111111111111111111111";
        let b = "22222222222222222222222222222222";
        let dir = scratch("notion-same");
        write(
            &dir,
            "export.zip",
            zip_bytes(&[
                (&format!("Work {a}/Notes {HOME}.md"), b"# Notes\n\nwork notes\n".as_slice()),
                (&format!("Home {b}/Notes {SUB}.md"), b"# Notes\n\nhome notes\n".as_slice()),
                (&format!("Index {ROW}.md"), format!("[w](Work%20{a}/Notes%20{HOME}.md) [h](Home%20{b}/Notes%20{SUB}.md) ![[untouched]]\n").as_bytes()),
                (&format!("{TASKS}.md"), b"no heading, no title\n".as_slice()),
            ]),
        );
        let mut out = Output::open(&dir, "N").unwrap();
        import(&dir.join("export.zip"), &mut out).unwrap();
        out.finish();
        assert_eq!(
            files(&dir.join("N")),
            [
                "Home/Notes.md",
                "Index.md",
                "Untitled.md",
                "Work/Notes 2.md"
            ]
        );
        assert_eq!(
            text(&dir, "N/Index.md"),
            "[[Notes 2|w]] [[Notes|h]] ![[untouched]]\n"
        );
    }

    #[test]
    fn an_export_in_another_format_is_refused_with_a_reason() {
        let dir = scratch("notion-refused");
        write(
            &dir,
            "html.zip",
            zip_bytes(&[("Home 0123.html", b"<html></html>".as_slice())]),
        );
        write(
            &dir,
            "other.zip",
            zip_bytes(&[("photo.png", b"x".as_slice())]),
        );
        let mut out = Output::open(&dir, "N").unwrap();
        assert!(import(&dir.join("html.zip"), &mut out)
            .unwrap_err()
            .starts_with("This is Notion's HTML export."));
        assert!(import(&dir.join("other.zip"), &mut out)
            .unwrap_err()
            .starts_with("No Notion pages were found."));
    }

    #[test]
    fn ids_are_recognised_in_names_and_addresses() {
        assert_eq!(
            split_id(&format!("My Page {HOME}")),
            ("My Page", Some(HOME))
        );
        assert_eq!(split_id(HOME), ("", Some(HOME)));
        assert_eq!(split_id("No id here"), ("No id here", None));
        assert_eq!(split_id(&format!("Glued{HOME}")).1, None);
        assert_eq!(
            split_id("ünïcödé ñämé thät ïs löng enough to cut"),
            ("ünïcödé ñämé thät ïs löng enough to cut", None)
        );
        assert_eq!(
            notion_url_id(&format!("https://www.notion.so/Some-Title-{HOME}")).as_deref(),
            Some(HOME)
        );
        assert_eq!(
            notion_url_id(
                "https://team.notion.site/a/Title-01234567-89AB-cdef-0123-456789abcdef#block"
            )
            .as_deref(),
            Some(HOME)
        );
        assert_eq!(notion_url_id(&format!("https://example.com/{HOME}")), None);
        assert_eq!(notion_url_id("https://www.notion.so/pricing"), None);
    }
}
