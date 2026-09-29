//! Plain-text extraction from Markdown for search indexing and previews.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

/// Characters used by the search layer to mark highlights; stripped from content.
pub const HIGHLIGHT_START: char = '\u{2}';
pub const HIGHLIGHT_END: char = '\u{3}';

const PREVIEW_CHARS: usize = 180;

/// Readable text content of a Markdown document (markup removed).
pub fn plain_text(markdown: &str) -> String {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS | Options::ENABLE_FOOTNOTES;
    let mut out = String::with_capacity(markdown.len());
    for event in Parser::new_ext(markdown, options) {
        match event {
            Event::Text(text) | Event::Code(text) => out.push_str(&text),
            Event::SoftBreak | Event::HardBreak => out.push(' '),
            Event::Start(Tag::Item) | Event::Start(Tag::TableCell) => out.push(' '),
            Event::End(
                TagEnd::Paragraph
                | TagEnd::Heading(_)
                | TagEnd::CodeBlock
                | TagEnd::Item
                | TagEnd::TableRow
                | TagEnd::TableHead
                | TagEnd::BlockQuote(_),
            ) => out.push('\n'),
            _ => {}
        }
    }
    out.retain(|c| c != HIGHLIGHT_START && c != HIGHLIGHT_END);
    out
}

/// Short single-line preview shown in the notes list.
pub fn preview(plain: &str, title: &str) -> String {
    let mut lines = plain.lines().map(str::trim).filter(|l| !l.is_empty()).peekable();
    // Skip a leading heading that just repeats the title.
    if lines.peek().is_some_and(|first| first.eq_ignore_ascii_case(title.trim())) {
        lines.next();
    }
    let mut out = String::new();
    for line in lines {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(line);
        if out.chars().count() > PREVIEW_CHARS {
            break;
        }
    }
    let collapsed: String = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > PREVIEW_CHARS {
        let cut: String = collapsed.chars().take(PREVIEW_CHARS).collect();
        format!("{}…", cut.trim_end())
    } else {
        collapsed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_markup() {
        let md = "# Title\n\nSome **bold** and `code` with [a link](https://x.y).\n\n- [ ] task\n- item\n\n```rust\nfn main() {}\n```\n";
        let text = plain_text(md);
        assert!(text.contains("Some bold and code with a link."));
        assert!(text.contains("task"));
        assert!(text.contains("fn main() {}"));
        assert!(!text.contains("**"));
        assert!(!text.contains("https://x.y"));
    }

    #[test]
    fn preview_skips_repeated_title_and_truncates() {
        let plain = plain_text("# Groceries\n\nMilk, eggs\n\nBread\n");
        assert_eq!(preview(&plain, "Groceries"), "Milk, eggs Bread");
        let long = "word ".repeat(100);
        let p = preview(&long, "");
        assert!(p.ends_with('…'));
        assert!(p.chars().count() <= PREVIEW_CHARS + 1);
    }

    #[test]
    fn strips_highlight_markers() {
        assert_eq!(plain_text("a\u{2}b\u{3}c").trim(), "abc");
    }
}
