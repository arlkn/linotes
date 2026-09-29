//! Full-text search over the FTS5 index.
//!
//! User input is never passed to FTS5 as query syntax. Each word becomes a
//! quoted prefix term (`"word"*`), so characters like `"`, `*`, `-`, `NEAR`
//! or `:` cannot produce syntax errors or unexpected operators.

use crate::database::repo::NoteSummary;
use crate::error::{AppError, AppResult};
use crate::storage::markdown::{HIGHLIGHT_END, HIGHLIGHT_START};
use rusqlite::{Connection, params_from_iter, types::Value};
use serde::{Deserialize, Serialize};

pub const MAX_QUERY_CHARS: usize = 256;
pub const MAX_RESULTS: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    #[serde(default)]
    pub scope: SearchScope,
    /// Folder for `SearchScope::Folder` (includes subfolders).
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchScope {
    #[default]
    All,
    Favorites,
    Folder,
    Trash,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note: NoteSummary,
    /// Title with matches wrapped in U+0002 … U+0003.
    pub title_highlight: String,
    /// Excerpt of the body with matches wrapped in U+0002 … U+0003.
    pub snippet: String,
}

/// Build a safe FTS5 MATCH expression, or `None` if the input has no searchable words.
pub fn build_match_expression(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .chars()
        .take(MAX_QUERY_CHARS)
        .collect::<String>()
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .take(16)
        .map(|word| format!("\"{}\"*", word.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() { None } else { Some(terms.join(" ")) }
}

pub fn search(conn: &Connection, query: &SearchQuery) -> AppResult<Vec<SearchHit>> {
    let Some(expression) = build_match_expression(&query.text) else {
        return Ok(Vec::new());
    };
    let mut sql = String::from(
        "SELECT n.id, n.title, n.preview, n.folder, n.favorite, n.trashed, n.trashed_at, n.created_at, n.updated_at,
                highlight(notes_fts, 0, char(2), char(3)),
                snippet(notes_fts, 1, char(2), char(3), '…', 14)
         FROM notes_fts JOIN notes n ON n.seq = notes_fts.rowid
         WHERE notes_fts MATCH ?1",
    );
    let mut args: Vec<Value> = vec![Value::Text(expression)];
    match query.scope {
        SearchScope::All => sql.push_str(" AND n.trashed = 0"),
        SearchScope::Favorites => sql.push_str(" AND n.trashed = 0 AND n.favorite = 1"),
        SearchScope::Trash => sql.push_str(" AND n.trashed = 1"),
        SearchScope::Folder => {
            let folder =
                query.folder.clone().ok_or_else(|| AppError::invalid("A folder is required for folder search"))?;
            crate::filesystem::safe_path::validate_folder_path(&folder)?;
            sql.push_str(" AND n.trashed = 0 AND (n.folder = ?2 OR substr(n.folder, 1, length(?2) + 1) = ?2 || '/')");
            args.push(Value::Text(folder));
        }
    }
    // Title matches weigh most, then folder names, then body text.
    sql.push_str(&format!(" ORDER BY bm25(notes_fts, 10.0, 1.0, 3.0, 1.0) LIMIT {MAX_RESULTS}"));

    let mut stmt = conn.prepare(&sql)?;
    let hits = stmt
        .query_map(params_from_iter(args.iter()), |r| {
            Ok(SearchHit {
                note: NoteSummary {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    preview: r.get(2)?,
                    folder: r.get(3)?,
                    favorite: r.get(4)?,
                    trashed: r.get(5)?,
                    trashed_at: r.get(6)?,
                    created_at: r.get(7)?,
                    updated_at: r.get(8)?,
                },
                title_highlight: r.get(9)?,
                snippet: r.get::<_, String>(10)?.replace('\n', " "),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    debug_assert!(
        hits.iter().all(|h| !h.note.title.contains(HIGHLIGHT_START) && !h.note.title.contains(HIGHLIGHT_END))
    );
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::database::repo::{self, tests::sample};

    fn index(db: &Database, id: &str, folder: &str, title: &str, body: &str) {
        let mut row = sample(id, &format!("{folder}/{id}.md"), folder);
        row.summary.title = title.into();
        repo::upsert(&db.conn, &row, body).unwrap();
    }

    fn q(text: &str) -> SearchQuery {
        SearchQuery { text: text.into(), scope: SearchScope::All, folder: None }
    }

    #[test]
    fn match_expression_is_quoted() {
        assert_eq!(build_match_expression("hello world").unwrap(), "\"hello\"* \"world\"*");
        assert_eq!(build_match_expression("say \"hi\"").unwrap(), "\"say\"* \"\"\"hi\"\"\"*");
        assert_eq!(build_match_expression("NEAR( OR -x").unwrap(), "\"NEAR(\"* \"OR\"* \"-x\"*");
        assert!(build_match_expression("  *** --- ").is_none());
        assert!(build_match_expression("").is_none());
    }

    #[test]
    fn finds_prefixes_and_highlights() {
        let db = Database::open_in_memory().unwrap();
        index(&db, "a", "Work", "Quarterly planning", "Discuss the roadmap and budget");
        index(&db, "b", "Home", "Groceries", "Milk, eggs, bread");
        let hits = search(&db.conn, &q("road")).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].note.id, "a");
        assert!(hits[0].snippet.contains("\u{2}roadmap\u{3}"));
        let hits = search(&db.conn, &q("plan")).unwrap();
        assert_eq!(hits[0].title_highlight, "Quarterly \u{2}planning\u{3}");
    }

    #[test]
    fn hostile_input_does_not_error() {
        let db = Database::open_in_memory().unwrap();
        index(&db, "a", "Work", "Title", "body");
        for input in ["\"", "a\"b", "(", "NOT", "a:b", "*", "title:x", "^", "\u{0}"] {
            search(&db.conn, &q(input)).unwrap_or_else(|e| panic!("{input:?} failed: {e}"));
        }
    }

    #[test]
    fn diacritics_and_case_are_folded() {
        let db = Database::open_in_memory().unwrap();
        index(&db, "a", "Notlar", "Toplantı", "Çalışma günü özeti");
        assert_eq!(search(&db.conn, &q("calisma")).unwrap().len(), 1);
        assert_eq!(search(&db.conn, &q("ÖZET")).unwrap().len(), 1);
        assert_eq!(search(&db.conn, &q("toplanti")).unwrap().len(), 1);
        // Typing the exact letters still highlights the original title.
        let hits = search(&db.conn, &q("toplantı")).unwrap();
        assert_eq!(hits[0].title_highlight, "\u{2}Toplantı\u{3}");
    }

    #[test]
    fn scopes_filter_results() {
        let db = Database::open_in_memory().unwrap();
        index(&db, "a", "Work", "Alpha", "shared");
        index(&db, "b", "Work/Sub", "Beta", "shared");
        index(&db, "c", "Workshop", "Gamma", "shared");
        let mut fav = sample("d", "Home/d.md", "Home");
        fav.summary.favorite = true;
        repo::upsert(&db.conn, &fav, "shared").unwrap();
        let mut trashed = sample("e", ".trash/e.md", "Home");
        trashed.summary.trashed = true;
        trashed.trashed_from = Some("Home".into());
        repo::upsert(&db.conn, &trashed, "shared").unwrap();

        let ids = |query: SearchQuery| {
            let mut ids: Vec<String> = search(&db.conn, &query).unwrap().into_iter().map(|h| h.note.id).collect();
            ids.sort();
            ids
        };
        assert_eq!(ids(q("shared")), vec!["a", "b", "c", "d"]);
        assert_eq!(ids(SearchQuery { scope: SearchScope::Favorites, ..q("shared") }), vec!["d"]);
        assert_eq!(ids(SearchQuery { scope: SearchScope::Trash, ..q("shared") }), vec!["e"]);
        assert_eq!(
            ids(SearchQuery { scope: SearchScope::Folder, folder: Some("Work".into()), ..q("shared") }),
            vec!["a", "b"]
        );
    }

    #[test]
    fn folder_names_are_searchable() {
        let db = Database::open_in_memory().unwrap();
        index(&db, "a", "Recipes", "Pancakes", "flour");
        assert_eq!(search(&db.conn, &q("recipes")).unwrap().len(), 1);
    }
}
