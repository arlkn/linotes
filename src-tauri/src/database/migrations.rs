//! Schema migrations, tracked with SQLite's `PRAGMA user_version`.
//!
//! Each migration runs in its own transaction. To add one, append a SQL file
//! under `src-tauri/migrations/` and an entry to [`MIGRATIONS`]; never edit a
//! migration that has shipped.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration { version: 1, name: "initial", sql: include_str!("../../migrations/0001_initial.sql") },
    Migration { version: 2, name: "full_text_search", sql: include_str!("../../migrations/0002_full_text_search.sql") },
];

pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

pub fn current_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

/// Apply pending migrations up to `target` (inclusive). Returns applied versions.
pub fn migrate_to(conn: &mut Connection, target: i64) -> AppResult<Vec<i64>> {
    let current = current_version(conn)?;
    if current > latest_version() {
        return Err(AppError::Internal(format!(
            "The search index was created by a newer version of Linotes (schema {current})"
        )));
    }
    let mut applied = Vec::new();
    for migration in MIGRATIONS.iter().filter(|m| m.version > current && m.version <= target) {
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql).map_err(|e| {
            AppError::Internal(format!("Migration {} ({}) failed: {e}", migration.version, migration.name))
        })?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
        log::info!("Applied index migration {} ({})", migration.version, migration.name);
        applied.push(migration.version);
    }
    Ok(applied)
}

pub fn migrate(conn: &mut Connection) -> AppResult<Vec<i64>> {
    migrate_to(conn, latest_version())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tables(conn: &Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn versions_are_sequential() {
        for (i, m) in MIGRATIONS.iter().enumerate() {
            assert_eq!(m.version, i as i64 + 1, "migration {} is out of sequence", m.name);
        }
    }

    #[test]
    fn migrates_fresh_database() {
        let mut conn = Connection::open_in_memory().unwrap();
        let applied = migrate(&mut conn).unwrap();
        assert_eq!(applied, vec![1, 2]);
        assert_eq!(current_version(&conn).unwrap(), latest_version());
        let names = tables(&conn);
        assert!(names.contains(&"notes".to_string()));
        assert!(names.contains(&"notes_fts".to_string()));
        // Running again is a no-op.
        assert!(migrate(&mut conn).unwrap().is_empty());
    }

    #[test]
    fn upgrades_existing_v1_database_and_keeps_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, 1).unwrap();
        conn.execute(
            "INSERT INTO notes (id, rel_path, folder, title, created_at, updated_at, body_hash, file_mtime_ns, file_size)
             VALUES ('a', 'a.md', '', 'A', 't', 't', 'h', 0, 0)",
            [],
        )
        .unwrap();
        assert_eq!(migrate(&mut conn).unwrap(), vec![2]);
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        let flag: String =
            conn.query_row("SELECT value FROM app_meta WHERE key = 'needs_full_reindex'", [], |r| r.get(0)).unwrap();
        assert_eq!(flag, "1");
    }

    #[test]
    fn refuses_database_from_newer_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        assert!(migrate(&mut conn).is_err());
    }

    #[test]
    fn fts5_is_available() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE VIRTUAL TABLE t USING fts5(x)").unwrap();
    }
}
