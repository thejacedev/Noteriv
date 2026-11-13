// Finding and rewriting links in Markdown that another app wrote.
//
// Notion, Logseq, Roam, Bear and Textbundle all hand over Markdown already;
// what an import has to change in it is where things point. These are the
// scanners the importers share. Each one leaves fenced code blocks and
// inline code alone: a link in code is an example, not a link.
//
// A scanner is given a function that sees each match and answers with the
// text to put in its place, or `None` to leave it exactly as written.

/// For each byte of `text`, whether it is inside a fenced code block or an
/// inline code span.
pub(crate) fn code_mask(text: &str) -> Vec<bool> {
    let mut mask = vec![false; text.len()];
    // The fence that opened the block we are inside, if any.
    let mut fence: Option<(u8, usize)> = None;
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = trimmed
            .bytes()
            .next()
            .filter(|byte| *byte == b'`' || *byte == b'~');
        let run = marker.map_or(0, |mark| {
            trimmed.bytes().take_while(|byte| *byte == mark).count()
        });
        let range = offset..offset + line.len();
        if let Some((open, length)) = fence {
            mask[range].fill(true);
            if marker == Some(open) && run >= length && trimmed[run..].trim().is_empty() {
                fence = None;
            }
        } else if run >= 3 && (marker != Some(b'`') || !trimmed[run..].contains('`')) {
            // A backtick fence cannot have a backtick in its info string.
            fence = marker.map(|mark| (mark, run));
            mask[range].fill(true);
        } else {
            mark_inline_code(line, offset, &mut mask);
        }
        offset += line.len();
    }
    mask
}

/// Mark the code spans of one line: a run of backticks up to the next run
/// of the same length.
fn mark_inline_code(line: &str, offset: usize, mask: &mut [bool]) {
    let bytes = line.as_bytes();
    let run_at = |at: usize| bytes[at..].iter().take_while(|byte| **byte == b'`').count();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'`' {
            i += 1;
            continue;
        }
        let run = run_at(i);
        let mut j = i + run;
        let mut close = None;
        while j < bytes.len() {
            if bytes[j] == b'`' {
                let length = run_at(j);
                if length == run {
                    close = Some(j + length);
                    break;
                }
                j += length;
            } else {
                j += 1;
            }
        }
        match close {
            Some(end) => {
                mask[offset + i..offset + end].fill(true);
                i = end;
            }
            None => i += run,
        }
    }
}

/// Replace every `from` that is not in code.
pub(crate) fn replace_outside_code(text: &str, from: &str, to: &str) -> String {
    if from.is_empty() || !text.contains(from) {
        return text.to_string();
    }
    let mask = code_mask(text);
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    for (start, _) in text.match_indices(from) {
        if !mask[start] && start >= copied {
            out.push_str(&text[copied..start]);
            out.push_str(to);
            copied = start + from.len();
        }
    }
    out.push_str(&text[copied..]);
    out
}

/// Rewrite spans written between two marks on one line, such as `[[...]]`
/// or `((...))`. The function sees the text between the marks. A span may
/// hold another one (`[[a [[b]] c]]`): the outer one is offered first, and
/// the inner one only if the outer was left as it is.
pub(crate) fn rewrite_between(
    text: &str,
    open: &str,
    close: &str,
    rewrite: &mut dyn FnMut(&str) -> Option<String>,
) -> String {
    if !text.contains(open) {
        return text.to_string();
    }
    let mask = code_mask(text);
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut at = 0;
    while let Some(found) = text[at..].find(open) {
        let start = at + found;
        let inner_start = start + open.len();
        at = inner_start;
        if mask[start] {
            continue;
        }
        let Some(inner_end) = find_close(text, inner_start, open, close) else {
            continue;
        };
        if let Some(replacement) = rewrite(&text[inner_start..inner_end]) {
            out.push_str(&text[copied..start]);
            out.push_str(&replacement);
            copied = inner_end + close.len();
            at = copied;
        }
    }
    out.push_str(&text[copied..]);
    out
}

/// Where the span that opened just before `from` closes: on the same line,
/// and after any spans that open inside it have closed.
fn find_close(text: &str, from: usize, open: &str, close: &str) -> Option<usize> {
    let line_end = text[from..].find('\n').map_or(text.len(), |n| from + n);
    let line = &text[..line_end];
    let mut depth = 0;
    let mut i = from;
    while i < line.len() {
        let rest = &line[i..];
        if rest.starts_with(close) {
            if depth == 0 {
                return Some(i);
            }
            depth -= 1;
            i += close.len();
        } else if open != close && rest.starts_with(open) {
            depth += 1;
            i += open.len();
        } else {
            i += rest.chars().next().map_or(1, char::len_utf8);
        }
    }
    None
}

/// A Markdown link or image as it is written: `[text](target)`.
pub(crate) struct Link<'a> {
    /// Written with a `!` in front.
    pub image: bool,
    pub text: &'a str,
    /// The destination as written, without a title or angle brackets.
    pub target: &'a str,
}

/// Rewrite Markdown links and images. The replacement stands for the whole
/// link, the `!` of an image included.
pub(crate) fn rewrite_links(
    text: &str,
    rewrite: &mut dyn FnMut(&Link) -> Option<String>,
) -> String {
    if !text.contains("](") {
        return text.to_string();
    }
    let mask = code_mask(text);
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut at = 0;
    while let Some(found) = text[at..].find('[') {
        let open = at + found;
        at = open + 1;
        if mask[open] || (open > 0 && bytes[open - 1] == b'\\') {
            continue;
        }
        let Some((text_end, target, end)) = parse_link(text, open) else {
            continue;
        };
        let image = open > copied && bytes[open - 1] == b'!';
        let link = Link {
            image,
            text: &text[open + 1..text_end],
            target,
        };
        if let Some(replacement) = rewrite(&link) {
            let from = if image { open - 1 } else { open };
            out.push_str(&text[copied..from]);
            out.push_str(&replacement);
            copied = end;
            at = end;
        }
    }
    out.push_str(&text[copied..]);
    out
}

/// Read the link whose `[` is at `open`: where its text ends, its target,
/// and where the whole link ends. Apps write targets more loosely than the
/// Markdown rules allow (spaces, brackets), so the target runs to the
/// bracket that balances the opening one.
fn parse_link(text: &str, open: usize) -> Option<(usize, &str, usize)> {
    let bytes = text.as_bytes();
    let mut depth = 0;
    let mut i = open + 1;
    loop {
        match bytes.get(i)? {
            b'\n' => return None,
            b'\\' => i += 1,
            b'[' => depth += 1,
            b']' if depth == 0 => break,
            b']' => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    let text_end = i;
    if bytes.get(text_end + 1) != Some(&b'(') {
        return None;
    }
    let start = text_end + 2;
    if bytes.get(start) == Some(&b'<') {
        let close = start + text[start..].find('>')?;
        let end = close + text[close..].find(')')?;
        if text[start..end].contains('\n') {
            return None;
        }
        return Some((text_end, &text[start + 1..close], end + 1));
    }
    let mut depth = 0;
    let mut i = start;
    loop {
        match bytes.get(i)? {
            b'\n' => return None,
            b'\\' => i += 1,
            b'(' => depth += 1,
            b')' if depth == 0 => break,
            b')' => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    let target = strip_title(text.get(start..i)?).trim();
    Some((text_end, target, i + 1))
}

/// `path "title"` without the title.
fn strip_title(target: &str) -> &str {
    for quote in ['"', '\''] {
        if let Some(without_end) = target.trim_end().strip_suffix(quote) {
            if let Some(open) = without_end.rfind(quote) {
                let before = &target[..open];
                if before.ends_with(char::is_whitespace) {
                    return before;
                }
            }
        }
    }
    target
}

/// Links an importer has made are written with these in place of `[[` and
/// `]]` while a block of text is still being worked on. An outliner's text
/// is full of its own `[[...]]`, rewritten one kind after another, and a
/// link that is already final must not be taken for one of those.
const HELD_OPEN: &str = "\u{E010}";
const HELD_CLOSE: &str = "\u{E011}";

/// A finished link, hidden from the scanners until `release`.
pub(crate) fn hold(link: &str) -> String {
    link.replace("[[", HELD_OPEN).replace("]]", HELD_CLOSE)
}

/// The text with every held link written out.
pub(crate) fn release(text: &str) -> String {
    text.replace(HELD_OPEN, "[[").replace(HELD_CLOSE, "]]")
}

/// The first line of a block of an outliner as plain words, for the text
/// shown by a link to that block.
pub(crate) fn plain_summary(text: &str) -> String {
    let line = text.lines().next().unwrap_or("");
    let plain = ["[[", "]]", "((", "))", "{{", "}}", "**", "__", "^^", "`"]
        .iter()
        .fold(line.to_string(), |text, mark| text.replace(mark, ""));
    let plain = plain.trim();
    if plain.chars().count() > 60 {
        format!("{}…", plain.chars().take(60).collect::<String>().trim_end())
    } else {
        plain.to_string()
    }
}

/// In a table row a `|` ends the cell, so the `|` of `[[Note|shown]]` has to
/// be written `\|` there. The app reads both the same.
pub(crate) fn table_safe(text: &str) -> String {
    if !text.contains("[[") || !text.contains('|') {
        return text.to_string();
    }
    let mask = code_mask(text);
    let mut out = String::with_capacity(text.len() + 8);
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let start = offset;
        offset += line.len();
        // A row of a table, which in an outline may follow a bullet.
        let trimmed = line.trim_start();
        let is_row = trimmed
            .strip_prefix("- ")
            .unwrap_or(trimmed)
            .starts_with('|');
        if !is_row || mask[start] {
            out.push_str(line);
            continue;
        }
        let mut rest = line;
        while let Some(open) = rest.find("[[") {
            let Some(close) = rest[open..].find("]]") else {
                break;
            };
            let (before, link) = rest.split_at(open);
            out.push_str(before);
            // Inside inline code it is not a link: step over the brackets.
            if mask[start + (line.len() - rest.len()) + open] {
                out.push_str("[[");
                rest = &link[2..];
                continue;
            }
            let (link, after) = link.split_at(close + 2);
            let mut escaped = false;
            for c in link.chars() {
                if c == '|' && !escaped {
                    out.push('\\');
                }
                escaped = c == '\\';
                out.push(c);
            }
            rest = after;
        }
        out.push_str(rest);
    }
    out
}

/// The file a link's target names when it points into the export rather
/// than out to the web: the path with `%20` and the like decoded, without
/// any `#heading` or `?query`. `None` for `https:`, `mailto:` and other
/// addresses, and for a link to a place in the same note.
pub(crate) fn local_path(target: &str) -> Option<String> {
    let target = target.trim();
    let scheme_end = target.find(':').unwrap_or(0);
    let has_scheme = scheme_end > 1
        && target[..scheme_end]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c));
    if target.is_empty() || target.starts_with('#') || target.starts_with("//") || has_scheme {
        return None;
    }
    let path = target.split(['#', '?']).next().unwrap_or("");
    let decoded = urlencoding::decode(path)
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|_| path.to_string());
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn links(text: &str) -> Vec<(bool, String, String)> {
        let mut seen = Vec::new();
        rewrite_links(text, &mut |link| {
            seen.push((link.image, link.text.to_string(), link.target.to_string()));
            None
        });
        seen
    }

    #[test]
    fn links_and_images_are_found_with_their_targets() {
        assert_eq!(
            links("see [the plan](Plan%20abc.md) and ![a pic](img/pic.png \"title\") and [x](<a b.md>)."),
            [
                (false, "the plan".to_string(), "Plan%20abc.md".to_string()),
                (true, "a pic".to_string(), "img/pic.png".to_string()),
                (false, "x".to_string(), "a b.md".to_string()),
            ]
        );
        // Brackets and spaces that a strict reader would stop at.
        assert_eq!(
            links("[Page (old)](Page%20(old)%20abc.md) ![](../assets/my image (1).png) [a [b] c](d.md)"),
            [
                (false, "Page (old)".to_string(), "Page%20(old)%20abc.md".to_string()),
                (true, String::new(), "../assets/my image (1).png".to_string()),
                (false, "a [b] c".to_string(), "d.md".to_string()),
            ]
        );
        assert!(
            links("[[wiki]] and [ref] and [open](unclosed and \\[not](a) and [two\nlines](x)")
                .is_empty()
        );
    }

    #[test]
    fn a_picture_inside_a_link_is_offered_after_the_link_around_it() {
        let seen = links("[![alt](small.png)](big.png)");
        assert_eq!(seen.len(), 2);
        assert_eq!(
            seen[0],
            (
                false,
                "![alt](small.png)".to_string(),
                "big.png".to_string()
            )
        );
        assert_eq!(seen[1], (true, "alt".to_string(), "small.png".to_string()));
    }

    #[test]
    fn rewriting_replaces_the_whole_link_and_nothing_else() {
        let rewritten = rewrite_links(
            "a ![p](x.png)![q](y.png) b [n](N.md) c [keep](https://x.test)",
            &mut |link| match link.target {
                "x.png" => Some("![[x.png]]".to_string()),
                "y.png" => Some("![[y 2.png]]".to_string()),
                "N.md" => Some(format!("[[N|{}]]", link.text)),
                _ => None,
            },
        );
        assert_eq!(
            rewritten,
            "a ![[x.png]]![[y 2.png]] b [[N|n]] c [keep](https://x.test)"
        );
    }

    #[test]
    fn code_is_left_alone() {
        let text = "[a](a.md) `[b](b.md)` ``[c](c.md) ` still``\n```\n[d](d.md)\n```\n  ~~~md\n[e](e.md)\n~~~\n[f](f.md) `unclosed [g](g.md)\n";
        let targets: Vec<String> = links(text)
            .into_iter()
            .map(|(_, _, target)| target)
            .collect();
        assert_eq!(targets, ["a.md", "f.md", "g.md"]);
        assert_eq!(
            replace_outside_code("#[[a]] `#[[b]]` #[[c]]", "#[[", "[["),
            "[[a]] `#[[b]]` [[c]]"
        );
        assert_eq!(
            replace_outside_code("nothing here", "#[[", "[["),
            "nothing here"
        );
    }

    #[test]
    fn spans_between_marks_are_rewritten_outside_code() {
        let upper = &mut |inner: &str| Some(inner.to_uppercase());
        assert_eq!(
            rewrite_between("a ((x)) b `((y))` ((z", "((", "))", upper),
            "a X b `((y))` ((z"
        );
        assert_eq!(
            rewrite_between("^^one^^ and ^^two^^ and ^^", "^^", "^^", upper),
            "ONE and TWO and ^^"
        );
        assert_eq!(
            rewrite_between("[[a\nb]] [[ü]]", "[[", "]]", upper),
            "[[a\nb]] Ü"
        );

        // An outer span that is left alone gives its inner spans a turn.
        let mut seen = Vec::new();
        let result = rewrite_between("[[a [[b]] c]] [[d]]", "[[", "]]", &mut |inner| {
            seen.push(inner.to_string());
            (inner == "b").then(|| "B".to_string())
        });
        assert_eq!(seen, ["a [[b]] c", "b", "d"]);
        assert_eq!(result, "[[a B c]] [[d]]");
    }

    #[test]
    fn a_held_link_is_not_seen_until_it_is_released() {
        let held = format!("{} and [[theirs]]", hold("[[ours|shown]]"));
        let rewritten = rewrite_between(&held, "[[", "]]", &mut |inner| Some(inner.to_uppercase()));
        assert_eq!(release(&rewritten), "[[ours|shown]] and THEIRS");
        assert_eq!(
            plain_summary("a **bold** [[link]] `code`\nsecond line"),
            "a bold link code"
        );
        assert_eq!(
            plain_summary(&"word ".repeat(30)),
            format!("{}…", "word ".repeat(12).trim_end())
        );
    }

    #[test]
    fn a_link_in_a_table_row_does_not_end_its_cell() {
        let text = "[[A|a]] outside\n| [[A|a]] | [[B]] and [[C\\|c]] | `[[D|d]]` [[D2|d]] |\n- | [[E|e]] |\n  | [[F|f]] | [[open | x |\n```\n| [[G|g]] |\n```\n";
        assert_eq!(
            table_safe(text),
            "[[A|a]] outside\n| [[A\\|a]] | [[B]] and [[C\\|c]] | `[[D|d]]` [[D2\\|d]] |\n- | [[E\\|e]] |\n  | [[F\\|f]] | [[open | x |\n```\n| [[G|g]] |\n```\n"
        );
        assert_eq!(table_safe("| no links | here |"), "| no links | here |");
    }

    #[test]
    fn a_target_is_a_file_in_the_export_or_an_address() {
        assert_eq!(
            local_path("Sub%20Page%20abc.md").as_deref(),
            Some("Sub Page abc.md")
        );
        assert_eq!(local_path("a/b.md#Heading").as_deref(), Some("a/b.md"));
        assert_eq!(
            local_path("../assets/x.png?raw=1").as_deref(),
            Some("../assets/x.png")
        );
        assert_eq!(local_path("100%.md").as_deref(), Some("100%.md"));
        for address in [
            "https://example.com/a.md",
            "mailto:a@b.c",
            "data:image/png;base64,AA",
            "bear://x",
            "#heading",
            "//cdn.test/x.png",
            "",
        ] {
            assert_eq!(local_path(address), None, "{address}");
        }
    }
}
