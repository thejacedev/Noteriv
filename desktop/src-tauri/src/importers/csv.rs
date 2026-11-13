// CSV: a table as text, one note per row.
//
// The first row names the columns. Every later row becomes a note named
// after one column (the first, unless the caller picks another), with each
// column as a property in its frontmatter. An empty cell is left out, and a
// number or true/false stays one instead of becoming text.
//
// The parser is also what reads Notion's database files. It follows RFC
// 4180 (quoted cells, `""` for a quote, line breaks inside quotes) and
// guesses the separator from the first line, because spreadsheets in many
// countries write `;` where others write `,`.
//
// Given a folder, every `.csv` file in it is imported into a folder named
// after the file.

use super::output::{Note, Output, Props};
use super::source::decode_text;
use std::fs;
use std::path::{Path, PathBuf};

/// The rows of a CSV text, each a list of cells. Lines with nothing on them
/// are skipped.
pub(crate) fn parse(text: &str) -> Vec<Vec<String>> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let separator = guess_separator(text);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    // Inside a quoted cell, and whether the cell being read was quoted at
    // all (an empty quoted cell at the end of the text is still a cell).
    let mut in_quotes = false;
    let mut was_quoted = false;
    let mut end_row = |row: &mut Vec<String>| {
        let blank = row.len() == 1 && row[0].is_empty();
        if !blank && !row.is_empty() {
            rows.push(std::mem::take(row));
        }
        row.clear();
    };

    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    cell.push('"');
                    chars.next();
                }
                '"' => in_quotes = false,
                c => cell.push(c),
            }
        } else if c == '"' && cell.is_empty() && !was_quoted {
            in_quotes = true;
            was_quoted = true;
        } else if c == separator {
            row.push(std::mem::take(&mut cell));
            was_quoted = false;
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            row.push(std::mem::take(&mut cell));
            was_quoted = false;
            end_row(&mut row);
        } else {
            cell.push(c);
        }
    }
    if !cell.is_empty() || was_quoted || !row.is_empty() {
        row.push(cell);
        end_row(&mut row);
    }
    rows
}

/// Whichever of comma, semicolon and tab the first line uses most outside
/// quotes. A comma when none appears.
fn guess_separator(text: &str) -> char {
    let mut counts = [(',', 0usize), (';', 0), ('\t', 0)];
    let mut in_quotes = false;
    for c in text.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            '\n' | '\r' if !in_quotes => break,
            c if !in_quotes => {
                if let Some(count) = counts.iter_mut().find(|(separator, _)| *separator == c) {
                    count.1 += 1;
                }
            }
            _ => {}
        }
    }
    // The earliest wins a tie, so a comma is the answer when nothing is found.
    let most = counts.iter().map(|(_, count)| *count).max().unwrap_or(0);
    counts
        .iter()
        .find(|(_, count)| *count == most)
        .map_or(',', |(separator, _)| *separator)
}

/// The names of the columns: an unnamed one is "Column 3".
pub(crate) fn column_names(header: &[String]) -> Vec<String> {
    header
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
            if name.is_empty() {
                format!("Column {}", i + 1)
            } else {
                name
            }
        })
        .collect()
}

pub(crate) fn import(
    source: &Path,
    title_column: Option<&str>,
    out: &mut Output,
) -> Result<(), String> {
    if !source.is_dir() {
        return import_file(source, &[], title_column, out);
    }
    let mut files: Vec<PathBuf> = fs::read_dir(source)
        .map_err(|e| format!("The folder could not be read: {e}."))?
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("csv"))
        })
        .collect();
    files.sort();
    if files.is_empty() {
        return Err("The folder has no CSV files in it.".to_string());
    }
    for file in files {
        let name = file
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        // One file that cannot be used does not stop the others.
        if let Err(reason) = import_file(&file, std::slice::from_ref(&name), title_column, out) {
            out.skip(&format!("{name}.csv"), &reason);
        }
    }
    Ok(())
}

fn import_file(
    file: &Path,
    folders: &[String],
    title_column: Option<&str>,
    out: &mut Output,
) -> Result<(), String> {
    let bytes = fs::read(file).map_err(|e| format!("The file could not be read: {e}."))?;
    let rows = parse(&decode_text(&bytes));
    let Some((header, rows)) = rows.split_first() else {
        return Err("The file is empty.".to_string());
    };
    if rows.is_empty() {
        return Err("The file has a header row and no rows below it.".to_string());
    }
    let columns = column_names(header);
    let title_index = match title_column
        .map(str::trim)
        .filter(|wanted| !wanted.is_empty())
    {
        None => 0,
        Some(wanted) => columns
            .iter()
            .position(|name| name.eq_ignore_ascii_case(wanted))
            .ok_or_else(|| format!("The file has no column named \"{wanted}\"."))?,
    };

    for row in rows {
        if row.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }
        let title = row.get(title_index).map_or("", |cell| cell.trim());
        let slot = out.reserve(folders, title);
        let mut props = Props::default();
        for (name, value) in columns.iter().zip(row) {
            props.cell(name, value);
        }
        // Cells beyond the last named column are kept rather than dropped.
        for (i, value) in row.iter().enumerate().skip(columns.len()) {
            props.cell(&format!("Column {}", i + 1), value);
        }
        out.write(
            &slot,
            &Note {
                props,
                ..Note::default()
            },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importers::output::testing::{files, scratch, text, write};

    fn rows(text: &str) -> Vec<Vec<String>> {
        parse(text)
    }

    #[test]
    fn quoted_cells_keep_their_commas_quotes_and_line_breaks() {
        assert_eq!(
            rows("name,note\r\n\"Smith, Ann\",\"said \"\"hi\"\"\"\n\"two\nlines\",plain \"quote\" inside\n"),
            [
                vec!["name", "note"],
                vec!["Smith, Ann", "said \"hi\""],
                vec!["two\nlines", "plain \"quote\" inside"],
            ]
        );
        assert_eq!(
            rows("a,,c\n,,\n\n\r\nlast,\"\""),
            [vec!["a", "", "c"], vec!["", "", ""], vec!["last", ""]]
        );
        assert_eq!(rows("\u{feff}only"), [vec!["only"]]);
        assert_eq!(
            rows("old mac\rline two\r"),
            [vec!["old mac"], vec!["line two"]]
        );
        assert!(rows("").is_empty());
        assert!(rows("\n\n").is_empty());
    }

    #[test]
    fn the_separator_is_guessed_from_the_first_line() {
        assert_eq!(
            rows("a;b;c\n1,5;2;3"),
            [vec!["a", "b", "c"], vec!["1,5", "2", "3"]]
        );
        assert_eq!(rows("a\tb\n1\t2"), [vec!["a", "b"], vec!["1", "2"]]);
        assert_eq!(rows("\"a;b\",c\n1,2"), [vec!["a;b", "c"], vec!["1", "2"]]);
    }

    #[test]
    fn each_row_becomes_a_note_with_its_columns_as_properties() {
        let dir = scratch("csv");
        write(
            &dir,
            "books.csv",
            "Title,Author,Year,Read,Notes: mine,\nDune,Frank Herbert,1965,TRUE,\"Long, but good\",extra\nDune,Someone Else,,false,\n,No Title,2001,,\n,,,,\n\"What is 1/2?\",A: B,007,yes,\"two\nlines\"\n",
        );
        let mut out = Output::open(&dir, "Books").unwrap();
        import(&dir.join("books.csv"), None, &mut out).unwrap();
        let report = out.finish();
        assert_eq!((report.notes, report.skipped.len()), (4, 0));
        assert_eq!(
            files(&dir.join("Books")),
            ["Dune 2.md", "Dune.md", "Untitled.md", "What is 1-2.md"]
        );
        assert_eq!(
            text(&dir, "Books/Dune.md"),
            "---\nTitle: Dune\nAuthor: Frank Herbert\nYear: 1965\nRead: true\nNotes mine: Long, but good\nColumn 6: extra\n---\n"
        );
        assert_eq!(
            text(&dir, "Books/Dune 2.md"),
            "---\nTitle: Dune\nAuthor: Someone Else\nRead: false\n---\n"
        );
        assert_eq!(
            text(&dir, "Books/Untitled.md"),
            "---\nAuthor: No Title\nYear: 2001\n---\n"
        );
        assert_eq!(
            text(&dir, "Books/What is 1-2.md"),
            "---\nTitle: What is 1/2?\nAuthor: \"A: B\"\nYear: \"007\"\nRead: \"yes\"\nNotes mine: \"two\\nlines\"\n---\n"
        );
    }

    #[test]
    fn another_column_can_name_the_notes() {
        let dir = scratch("csv-title");
        write(&dir, "people.csv", "id;Full Name\n1;Ann Lee\n2;Bo Chan\n");
        let mut out = Output::open(&dir, "People").unwrap();
        import(&dir.join("people.csv"), Some(" full name "), &mut out).unwrap();
        assert_eq!(out.finish().notes, 2);
        assert_eq!(files(&dir.join("People")), ["Ann Lee.md", "Bo Chan.md"]);
        assert_eq!(
            text(&dir, "People/Ann Lee.md"),
            "---\nid: 1\nFull Name: Ann Lee\n---\n"
        );

        let mut out = Output::open(&dir, "Other").unwrap();
        let refused = import(&dir.join("people.csv"), Some("Email"), &mut out).unwrap_err();
        assert_eq!(refused, "The file has no column named \"Email\".");
    }

    #[test]
    fn a_file_with_nothing_to_import_says_so() {
        let dir = scratch("csv-empty");
        write(&dir, "empty.csv", "");
        write(&dir, "header.csv", "a,b\n");
        let mut out = Output::open(&dir, "In").unwrap();
        assert_eq!(
            import(&dir.join("empty.csv"), None, &mut out).unwrap_err(),
            "The file is empty."
        );
        assert_eq!(
            import(&dir.join("header.csv"), None, &mut out).unwrap_err(),
            "The file has a header row and no rows below it."
        );
        assert!(import(&dir.join("missing.csv"), None, &mut out)
            .unwrap_err()
            .starts_with("The file could not be read"));
    }

    #[test]
    fn a_folder_of_files_becomes_a_folder_per_file() {
        let dir = scratch("csv-folder");
        write(&dir, "tables/Books.csv", "Title\nDune\n");
        write(&dir, "tables/Films.CSV", "Title\nAlien\n");
        write(&dir, "tables/Empty.csv", "Title\n");
        write(&dir, "tables/notes.txt", "ignored");
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let mut out = Output::open(&vault, "Tables").unwrap();
        import(&dir.join("tables"), None, &mut out).unwrap();
        let report = out.finish();
        assert_eq!(
            files(&vault),
            ["Tables/Books/Dune.md", "Tables/Films/Alien.md"]
        );
        assert_eq!(report.skipped.len(), 1);
        assert_eq!(report.skipped[0].name, "Empty.csv");
    }
}
