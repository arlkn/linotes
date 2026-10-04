//! Queries against the index. All functions take a plain `Connection` (or a
//! transaction, which derefs to one) so callers control transactions.

use crate::error::AppResult;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;
use std::collections::HashMap;

/// What the notes list needs to show for a note.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    /// Folder the note lives in (for trashed notes: the folder it came from).
    pub folder: String,
    pub favorite: bool,
    pub trashed: bool,
    pub trashed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRow {
    pub summary: NoteSummary,
    pub rel_path: String,
    /// For trashed notes: the folder to restore to.
    pub trashed_from: Option<String>,
    pub body_hash: String,
    pub file_mtime_ns: i64,
    pub file_size: i64,
    /// Whether the id is stored in the file's frontmatter (vs. derived).
    pub id_in_file: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    pub mtime_ns: i64,
    pub size: i64,
}

const COLUMNS: &str = "id, title, preview, folder, favorite, trashed, trashed_at, created_at, updated_at, \
                       rel_path, trashed_from, body_hash, file_mtime_ns, file_size, id_in_file";

fn map_row(row: &Row<'_>) -> rusqlite::Result<NoteRow> {
    Ok(NoteRow {
        summary: NoteSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            preview: row.get(2)?,
            folder: row.get(3)?,
            favorite: row.get(4)?,
            trashed: row.get(5)?,
            trashed_at: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        },
        rel_path: row.get(9)?,
        trashed_from: row.get(10)?,
        body_hash: row.get(11)?,
        file_mtime_ns: row.get(12)?,
        file_size: row.get(13)?,
        id_in_file: row.get(14)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<NoteRow>> {
    Ok(conn
        .prepare_cached(&format!("SELECT {COLUMNS} FROM notes WHERE id = ?1"))?
        .query_row([id], map_row)
        .optional()?)
}

pub fn get_by_path(conn: &Connection, rel_path: &str) -> AppResult<Option<NoteRow>> {
    Ok(conn
        .prepare_cached(&format!("SELECT {COLUMNS} FROM notes WHERE rel_path = ?1"))?
        .query_row([rel_path], map_row)
        .optional()?)
}

pub fn list(conn: &Connection) -> AppResult<Vec<NoteRow>> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM notes ORDER BY updated_at DESC"))?;
    let rows = stmt.query_map([], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn list_summaries(conn: &Connection) -> AppResult<Vec<NoteSummary>> {
    Ok(list(conn)?.into_iter().map(|r| r.summary).collect())
}

/// `rel_path → (id, stamp)` for change detection during sync.
pub fn path_index(conn: &Connection) -> AppResult<HashMap<String, (String, FileStamp)>> {
    let mut stmt = conn.prepare("SELECT rel_path, id, file_mtime_ns, file_size FROM notes")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, (r.get::<_, String>(1)?, FileStamp { mtime_ns: r.get(2)?, size: r.get(3)? })))
    })?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

/// Insert or update a note and its full-text entry.
pub fn upsert(conn: &Connection, row: &NoteRow, body_text: &str) -> AppResult<()> {
    let s = &row.summary;
    let seq: i64 = conn
        .prepare_cached(
            "INSERT INTO notes (id, rel_path, folder, title, preview, favorite, trashed, trashed_from, trashed_at,
                            created_at, updated_at, body_hash, file_mtime_ns, file_size, id_in_file)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(id) DO UPDATE SET
            rel_path = excluded.rel_path, folder = excluded.folder, title = excluded.title,
            preview = excluded.preview, favorite = excluded.favorite, trashed = excluded.trashed,
            trashed_from = excluded.trashed_from, trashed_at = excluded.trashed_at,
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            body_hash = excluded.body_hash, file_mtime_ns = excluded.file_mtime_ns,
            file_size = excluded.file_size, id_in_file = excluded.id_in_file
         RETURNING seq",
        )?
        .query_row(
            params![
                s.id,
                row.rel_path,
                s.folder,
                s.title,
                s.preview,
                s.favorite,
                s.trashed,
                row.trashed_from,
                s.trashed_at,
                s.created_at,
                s.updated_at,
                row.body_hash,
                row.file_mtime_ns,
                row.file_size,
                row.id_in_file
            ],
            |r| r.get(0),
        )?;
    conn.prepare_cached("DELETE FROM notes_fts WHERE rowid = ?1")?.execute([seq])?;
    conn.prepare_cached("INSERT INTO notes_fts (rowid, title, body, folder, alt) VALUES (?1, ?2, ?3, ?4, ?5)")?
        .execute(params![seq, s.title, body_text, s.folder, alternate_spellings(&s.title, body_text)])?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<bool> {
    let seq: Option<i64> =
        conn.prepare_cached("SELECT seq FROM notes WHERE id = ?1")?.query_row([id], |r| r.get(0)).optional()?;
    let Some(seq) = seq else { return Ok(false) };
    conn.prepare_cached("DELETE FROM notes_fts WHERE rowid = ?1")?.execute([seq])?;
    conn.prepare_cached("DELETE FROM notes WHERE seq = ?1")?.execute([seq])?;
    Ok(true)
}

/// Rewrite paths and folders after a folder rename (`old` → `new`).
pub fn rename_folder_prefix(conn: &Connection, old: &str, new: &str) -> AppResult<()> {
    let like = format!("{}/%", escape_like(old));
    let mut stmt = conn.prepare(
        "SELECT seq, rel_path, folder, trashed_from FROM notes
         WHERE rel_path LIKE ?1 ESCAPE '\\' OR folder = ?2 OR folder LIKE ?1 ESCAPE '\\'
            OR trashed_from = ?2 OR trashed_from LIKE ?1 ESCAPE '\\'",
    )?;
    let rows: Vec<(i64, String, String, Option<String>)> = stmt
        .query_map(params![like, old], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<_, _>>()?;
    let swap = |value: &str| -> String {
        if value == old {
            new.to_string()
        } else if let Some(rest) = value.strip_prefix(&format!("{old}/")) {
            format!("{new}/{rest}")
        } else {
            value.to_string()
        }
    };
    for (seq, rel_path, folder, from) in rows {
        let new_folder = swap(&folder);
        conn.execute(
            "UPDATE notes SET rel_path = ?1, folder = ?2, trashed_from = ?3 WHERE seq = ?4",
            params![swap(&rel_path), new_folder, from.as_deref().map(swap), seq],
        )?;
        conn.execute("UPDATE notes_fts SET folder = ?1 WHERE rowid = ?2", params![new_folder, seq])?;
    }
    Ok(())
}

/// Text variants the tokenizer cannot fold on its own. Empty when there are none.
fn alternate_spellings(title: &str, body: &str) -> String {
    if title.contains('ı') || body.contains('ı') {
        format!("{title}\n{body}").replace('ı', "i")
    } else {
        String::new()
    }
}

fn escape_like(value: &str) -> String {
    value.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

pub fn get_meta(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn.query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Count of non-trashed notes per folder.
pub fn folder_counts(conn: &Connection) -> AppResult<HashMap<String, u32>> {
    let mut stmt = conn.prepare("SELECT folder, COUNT(*) FROM notes WHERE trashed = 0 GROUP BY folder")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, u32>(1)?)))?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::database::Database;

    pub fn sample(id: &str, rel_path: &str, folder: &str) -> NoteRow {
        NoteRow {
            summary: NoteSummary {
                id: id.into(),
                title: format!("Title {id}"),
                preview: String::new(),
                folder: folder.into(),
                favorite: false,
                trashed: false,
                trashed_at: None,
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
            },
            rel_path: rel_path.into(),
            trashed_from: None,
            body_hash: "h".into(),
            file_mtime_ns: 1,
            file_size: 2,
            id_in_file: true,
        }
    }

    #[test]
    fn upsert_get_delete() {
        let db = Database::open_in_memory().unwrap();
        let row = sample("a", "Work/a.md", "Work");
        upsert(&db.conn, &row, "hello world").unwrap();
        assert_eq!(get(&db.conn, "a").unwrap().unwrap(), row);
        let mut changed = row.clone();
        changed.summary.title = "New".into();
        upsert(&db.conn, &changed, "hello again").unwrap();
        assert_eq!(get(&db.conn, "a").unwrap().unwrap().summary.title, "New");
        let fts: i64 = db.conn.query_row("SELECT COUNT(*) FROM notes_fts", [], |r| r.get(0)).unwrap();
        assert_eq!(fts, 1, "updating must not duplicate FTS rows");
        assert!(delete(&db.conn, "a").unwrap());
        assert!(get(&db.conn, "a").unwrap().is_none());
        let fts: i64 = db.conn.query_row("SELECT COUNT(*) FROM notes_fts", [], |r| r.get(0)).unwrap();
        assert_eq!(fts, 0);
    }

    #[test]
    fn folder_prefix_rename() {
        let db = Database::open_in_memory().unwrap();
        upsert(&db.conn, &sample("a", "Work/a.md", "Work"), "").unwrap();
        upsert(&db.conn, &sample("b", "Work/Sub/b.md", "Work/Sub"), "").unwrap();
        upsert(&db.conn, &sample("c", "Workshop/c.md", "Workshop"), "").unwrap();
        let mut trashed = sample("d", ".trash/d.md", "Work");
        trashed.summary.trashed = true;
        trashed.trashed_from = Some("Work".into());
        upsert(&db.conn, &trashed, "").unwrap();
        rename_folder_prefix(&db.conn, "Work", "Jobs").unwrap();
        assert_eq!(get(&db.conn, "a").unwrap().unwrap().rel_path, "Jobs/a.md");
        assert_eq!(get(&db.conn, "b").unwrap().unwrap().summary.folder, "Jobs/Sub");
        assert_eq!(
            get(&db.conn, "c").unwrap().unwrap().rel_path,
            "Workshop/c.md",
            "prefix match must respect separators"
        );
        assert_eq!(get(&db.conn, "d").unwrap().unwrap().trashed_from.as_deref(), Some("Jobs"));
        assert_eq!(get(&db.conn, "d").unwrap().unwrap().rel_path, ".trash/d.md");
    }
}
