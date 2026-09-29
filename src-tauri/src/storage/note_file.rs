//! The on-disk note format: optional YAML frontmatter followed by Markdown.
//!
//! ```text
//! ---
//! id: 0b6f7c1e-4c1a-4a5e-9d7e-3d1f0a2b9c11
//! title: Meeting notes
//! created: 2026-09-29T08:15:00Z
//! updated: 2026-09-29T09:02:41Z
//! favorite: true
//! ---
//!
//! Body in Markdown…
//! ```
//!
//! Linotes only manages the keys in [`MANAGED_KEYS`]. Everything else in the
//! frontmatter (tags, aliases, comments, other tools' keys) is preserved
//! byte-for-byte, because edits are done line-by-line rather than by
//! re-emitting the whole YAML document. A byte-order mark and CRLF line
//! endings are also preserved.

use chrono::{DateTime, NaiveDate, Utc};
use yaml_rust2::{Yaml, YamlLoader};

pub const KEY_ID: &str = "id";
pub const KEY_TITLE: &str = "title";
pub const KEY_CREATED: &str = "created";
pub const KEY_UPDATED: &str = "updated";
pub const KEY_FAVORITE: &str = "favorite";
pub const KEY_TRASHED_FROM: &str = "trashed_from";
pub const KEY_TRASHED_AT: &str = "trashed_at";

/// Keys owned by Linotes, in the order they are written.
pub const MANAGED_KEYS: &[&str] =
    &[KEY_ID, KEY_TITLE, KEY_CREATED, KEY_UPDATED, KEY_FAVORITE, KEY_TRASHED_FROM, KEY_TRASHED_AT];

const BOM: &str = "\u{feff}";

/// A parsed note file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteFile {
    pub bom: bool,
    pub crlf: bool,
    /// Raw frontmatter lines (without the `---` fences), if the file has frontmatter.
    pub frontmatter: Option<Vec<String>>,
    /// Markdown body with `\n` line endings.
    pub body: String,
}

/// Values of the managed keys, as read from the frontmatter.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NoteMeta {
    pub id: Option<String>,
    pub title: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub favorite: bool,
    pub trashed_from: Option<String>,
    pub trashed_at: Option<String>,
}

impl NoteFile {
    pub fn parse(content: &str) -> Self {
        let (bom, content) = match content.strip_prefix(BOM) {
            Some(rest) => (true, rest),
            None => (false, content),
        };
        let crlf = content.contains("\r\n");
        let normalized = if crlf { content.replace("\r\n", "\n") } else { content.to_string() };

        if let Some((frontmatter, body)) = split_frontmatter(&normalized) {
            return NoteFile { bom, crlf, frontmatter: Some(frontmatter), body };
        }
        NoteFile { bom, crlf, frontmatter: None, body: normalized }
    }

    /// A brand-new note file with a fresh frontmatter block.
    pub fn new(body: &str) -> Self {
        NoteFile { bom: false, crlf: false, frontmatter: Some(Vec::new()), body: body.to_string() }
    }

    pub fn meta(&self) -> NoteMeta {
        let Some(lines) = &self.frontmatter else { return NoteMeta::default() };
        let text = lines.join("\n");
        let Ok(docs) = YamlLoader::load_from_str(&text) else {
            log::warn!("Frontmatter is not valid YAML; Linotes will only update its own keys");
            return NoteMeta::default();
        };
        let Some(Yaml::Hash(map)) = docs.into_iter().next() else { return NoteMeta::default() };
        let get = |key: &str| map.get(&Yaml::String(key.to_string()));
        let string = |key: &str| get(key).and_then(yaml_scalar_to_string).filter(|s| !s.trim().is_empty());
        NoteMeta {
            id: string(KEY_ID).filter(|id| is_valid_id(id)),
            title: string(KEY_TITLE),
            created: string(KEY_CREATED).and_then(|s| normalize_timestamp(&s)),
            updated: string(KEY_UPDATED).and_then(|s| normalize_timestamp(&s)),
            favorite: matches!(get(KEY_FAVORITE), Some(Yaml::Boolean(true))),
            trashed_from: string(KEY_TRASHED_FROM),
            trashed_at: string(KEY_TRASHED_AT).and_then(|s| normalize_timestamp(&s)),
        }
    }

    /// Set (or with `None`, remove) a managed key, leaving all other lines untouched.
    pub fn set(&mut self, key: &str, value: Option<Scalar>) {
        debug_assert!(MANAGED_KEYS.contains(&key));
        let lines = self.frontmatter.get_or_insert_with(Vec::new);
        let range = find_entry(lines, key);
        match (range, value) {
            (Some((start, end)), Some(value)) => {
                lines.splice(start..=end, [format!("{key}: {}", value.emit())]);
            }
            (Some((start, end)), None) => {
                lines.drain(start..=end);
            }
            (None, Some(value)) => {
                let line = format!("{key}: {}", value.emit());
                // Keep managed keys grouped in canonical order where possible.
                let order = MANAGED_KEYS.iter().position(|k| *k == key).unwrap_or(usize::MAX);
                let insert_at = MANAGED_KEYS
                    .iter()
                    .skip(order + 1)
                    .filter_map(|later| find_entry(lines, later).map(|(start, _)| start))
                    .min()
                    .unwrap_or(lines.len());
                lines.insert(insert_at, line);
            }
            (None, None) => {}
        }
    }

    pub fn serialize(&self) -> String {
        let mut out = String::new();
        if self.bom {
            out.push_str(BOM);
        }
        if let Some(lines) = &self.frontmatter {
            out.push_str("---\n");
            for line in lines {
                out.push_str(line);
                out.push('\n');
            }
            out.push_str("---\n");
            if !self.body.is_empty() {
                out.push('\n');
            }
        }
        out.push_str(&self.body);
        if self.crlf { out.replace('\n', "\r\n") } else { out }
    }
}

/// Normalise body text before saving: `\n` endings, exactly one trailing newline.
pub fn normalize_body(body: &str) -> String {
    let unified = body.replace("\r\n", "\n");
    let trimmed = unified.trim_end_matches('\n');
    if trimmed.trim().is_empty() { String::new() } else { format!("{trimmed}\n") }
}

fn split_frontmatter(content: &str) -> Option<(Vec<String>, String)> {
    let rest = content.strip_prefix("---\n")?;
    let mut lines = Vec::new();
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        offset += line.len();
        if bare.trim_end() == "---" || bare.trim_end() == "..." {
            let body = &rest[offset..];
            // One blank line conventionally separates frontmatter from the body.
            let body = body.strip_prefix('\n').unwrap_or(body);
            return Some((lines, body.to_string()));
        }
        lines.push(bare.to_string());
    }
    None
}

/// Find the line range of a top-level `key:` entry including continuation lines.
fn find_entry(lines: &[String], key: &str) -> Option<(usize, usize)> {
    let start = lines.iter().position(|line| is_key_line(line, key))?;
    let mut end = start;
    for (i, line) in lines.iter().enumerate().skip(start + 1) {
        if line.trim().is_empty() {
            continue;
        }
        if line.starts_with(' ') || line.starts_with('\t') || line.starts_with("- ") || line == "-" {
            end = i;
        } else {
            break;
        }
    }
    Some((start, end))
}

fn is_key_line(line: &str, key: &str) -> bool {
    let candidates = [key.to_string(), format!("\"{key}\""), format!("'{key}'")];
    candidates.iter().any(|k| {
        line.strip_prefix(k.as_str())
            .map(|rest| rest.trim_start_matches([' ', '\t']))
            .is_some_and(|rest| rest.starts_with(':'))
    })
}

fn yaml_scalar_to_string(value: &Yaml) -> Option<String> {
    match value {
        Yaml::String(s) => Some(s.clone()),
        Yaml::Integer(i) => Some(i.to_string()),
        Yaml::Real(r) => Some(r.clone()),
        Yaml::Boolean(b) => Some(b.to_string()),
        _ => None,
    }
}

pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Parse common timestamp spellings into canonical `YYYY-MM-DDTHH:MM:SSZ`.
pub fn normalize_timestamp(input: &str) -> Option<String> {
    let s = input.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(format_utc(dt.with_timezone(&Utc)));
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(format_utc(dt.and_utc()));
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(format_utc(dt.and_utc()));
    }
    if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return date.and_hms_opt(0, 0, 0).map(|dt| format_utc(dt.and_utc()));
    }
    None
}

pub fn format_utc(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn now_utc() -> String {
    format_utc(Utc::now())
}

/// A YAML scalar Linotes writes into frontmatter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scalar {
    Str(String),
    Bool(bool),
}

impl Scalar {
    pub fn str(value: impl Into<String>) -> Self {
        Scalar::Str(value.into())
    }

    fn emit(&self) -> String {
        match self {
            Scalar::Bool(b) => b.to_string(),
            Scalar::Str(s) if is_plain_safe(s) => s.clone(),
            // A JSON string literal is a valid YAML double-quoted scalar.
            Scalar::Str(s) => serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into()),
        }
    }
}

/// Whether a string can be written as an unquoted YAML scalar and read back unchanged.
fn is_plain_safe(s: &str) -> bool {
    if s.is_empty() || s.trim() != s || s.len() > 200 {
        return false;
    }
    let first = s.chars().next().unwrap_or(' ');
    if "-?:,[]{}#&*!|>'\"%@`".contains(first) {
        return false;
    }
    if s.contains(": ") || s.contains(" #") || s.ends_with(':') || s.chars().any(|c| c.is_control()) {
        return false;
    }
    let lower = s.to_ascii_lowercase();
    if ["true", "false", "yes", "no", "on", "off", "null", "~", "y", "n"].contains(&lower.as_str()) {
        return false;
    }
    if s.parse::<f64>().is_ok() || s.starts_with("0x") || s.starts_with("0o") || lower == ".inf" || lower == ".nan" {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_file_without_frontmatter() {
        let file = NoteFile::parse("# Hello\n\nWorld\n");
        assert!(file.frontmatter.is_none());
        assert_eq!(file.body, "# Hello\n\nWorld\n");
        assert_eq!(file.meta(), NoteMeta::default());
        assert_eq!(file.serialize(), "# Hello\n\nWorld\n");
    }

    #[test]
    fn parses_managed_keys() {
        let file = NoteFile::parse(
            "---\nid: abc-123\ntitle: \"Quoted: title\"\ncreated: 2026-01-02\nupdated: 2026-01-03T04:05:06+02:00\nfavorite: true\ntags: [a, b]\n---\n\nBody\n",
        );
        let meta = file.meta();
        assert_eq!(meta.id.as_deref(), Some("abc-123"));
        assert_eq!(meta.title.as_deref(), Some("Quoted: title"));
        assert_eq!(meta.created.as_deref(), Some("2026-01-02T00:00:00Z"));
        assert_eq!(meta.updated.as_deref(), Some("2026-01-03T02:05:06Z"));
        assert!(meta.favorite);
        assert_eq!(file.body, "Body\n");
    }

    #[test]
    fn unknown_keys_and_comments_survive_edits() {
        let original = "---\n# my comment\nid: x1\ntags:\n  - rust\n  - notes\ntitle: Old\naliases: [a]\n---\n\nText\n";
        let mut file = NoteFile::parse(original);
        file.set(KEY_TITLE, Some(Scalar::str("New title")));
        file.set(KEY_FAVORITE, Some(Scalar::Bool(true)));
        let out = file.serialize();
        assert_eq!(
            out,
            "---\n# my comment\nid: x1\ntags:\n  - rust\n  - notes\ntitle: New title\naliases: [a]\nfavorite: true\n---\n\nText\n"
        );
        let mut again = NoteFile::parse(&out);
        again.set(KEY_FAVORITE, None);
        assert!(!again.serialize().contains("favorite"));
        assert!(again.serialize().contains("tags:\n  - rust\n  - notes"));
    }

    #[test]
    fn replaces_multiline_values_of_managed_keys() {
        let mut file = NoteFile::parse("---\ntitle: |\n  line one\n  line two\nother: 1\n---\nBody\n");
        assert_eq!(file.meta().title.as_deref(), Some("line one\nline two\n"));
        file.set(KEY_TITLE, Some(Scalar::str("Single")));
        assert_eq!(file.frontmatter.as_ref().unwrap(), &vec!["title: Single".to_string(), "other: 1".to_string()]);
    }

    #[test]
    fn invalid_yaml_is_preserved() {
        let mut file = NoteFile::parse("---\ntitle: [unclosed\nid: keep\n---\nBody\n");
        assert_eq!(file.meta(), NoteMeta::default());
        file.set(KEY_UPDATED, Some(Scalar::str("2026-01-01T00:00:00Z")));
        assert!(file.serialize().contains("title: [unclosed"));
    }

    #[test]
    fn preserves_bom_and_crlf() {
        let original = "\u{feff}---\r\nid: a\r\n---\r\n\r\nLine 1\r\nLine 2\r\n";
        let mut file = NoteFile::parse(original);
        assert!(file.bom && file.crlf);
        assert_eq!(file.body, "Line 1\nLine 2\n");
        assert_eq!(file.serialize(), original);
        file.body = "Changed\n".into();
        assert_eq!(file.serialize(), "\u{feff}---\r\nid: a\r\n---\r\n\r\nChanged\r\n");
    }

    #[test]
    fn quotes_unsafe_scalars() {
        let mut file = NoteFile::new("");
        for (title, expected) in [
            ("Plain title", "title: Plain title"),
            ("Title: with colon", "title: \"Title: with colon\""),
            ("true", "title: \"true\""),
            ("2026", "title: \"2026\""),
            ("- dash", "title: \"- dash\""),
            ("#hash", "title: \"#hash\""),
            ("Say \"hi\"", "title: Say \"hi\""),
            ("Ünïcödé başlık", "title: Ünïcödé başlık"),
        ] {
            file.set(KEY_TITLE, Some(Scalar::str(title)));
            let line = file.frontmatter.as_ref().unwrap()[0].clone();
            assert_eq!(line, expected);
            let reparsed = NoteFile::parse(&file.serialize());
            assert_eq!(reparsed.meta().title.as_deref(), Some(title), "round trip of {title:?}");
        }
    }

    #[test]
    fn unterminated_frontmatter_is_body() {
        let file = NoteFile::parse("---\nnot closed\n");
        assert!(file.frontmatter.is_none());
        assert_eq!(file.body, "---\nnot closed\n");
    }

    #[test]
    fn new_keys_follow_canonical_order() {
        let mut file = NoteFile::new("Body\n");
        file.set(KEY_UPDATED, Some(Scalar::str("2026-01-02T00:00:00Z")));
        file.set(KEY_ID, Some(Scalar::str("abc")));
        file.set(KEY_TITLE, Some(Scalar::str("T")));
        assert_eq!(file.serialize(), "---\nid: abc\ntitle: T\nupdated: 2026-01-02T00:00:00Z\n---\n\nBody\n");
    }

    #[test]
    fn normalizes_body() {
        assert_eq!(normalize_body("a\r\nb\n\n\n"), "a\nb\n");
        assert_eq!(normalize_body("  \n"), "");
        assert_eq!(normalize_body("x"), "x\n");
    }
}
