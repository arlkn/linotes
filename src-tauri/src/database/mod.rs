//! SQLite index: connection management, corruption recovery and queries.
//!
//! The index is disposable. If it cannot be opened, fails an integrity
//! check, or was written by a newer Linotes, it is moved aside and rebuilt
//! from the Markdown files. User notes are never stored only here.

pub mod migrations;
pub mod repo;

use crate::error::{AppError, AppResult, IoContext};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};

pub struct Database {
    pub conn: Connection,
}

#[derive(Debug, Default, Clone)]
pub struct OpenOutcome {
    /// The previous index file was unusable and was moved to this path.
    pub replaced_corrupt: Option<PathBuf>,
    /// Whether every note must be re-read from disk.
    pub needs_full_reindex: bool,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<(Self, OpenOutcome)> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).with_path("create", parent)?;
        }
        match Self::try_open(path) {
            Ok(db) => {
                let needs = db.needs_full_reindex()?;
                Ok((db, OpenOutcome { replaced_corrupt: None, needs_full_reindex: needs }))
            }
            Err(err) => {
                log::warn!("Index at {} is unusable ({err}); rebuilding it", path.display());
                let moved = move_aside(path)?;
                let db = Self::try_open(path)?;
                Ok((db, OpenOutcome { replaced_corrupt: moved, needs_full_reindex: true }))
            }
        }
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        let mut conn = Connection::open_in_memory()?;
        migrations::migrate(&mut conn)?;
        Ok(Database { conn })
    }

    fn try_open(path: &Path) -> AppResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let mut conn = Connection::open_with_flags(path, flags)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        let check: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
        if check != "ok" {
            return Err(AppError::Internal(format!("integrity check failed: {check}")));
        }
        migrations::migrate(&mut conn)?;
        Ok(Database { conn })
    }

    pub fn needs_full_reindex(&self) -> AppResult<bool> {
        Ok(repo::get_meta(&self.conn, "needs_full_reindex")?.as_deref() == Some("1"))
    }

    pub fn clear_full_reindex_flag(&self) -> AppResult<()> {
        self.conn.execute("DELETE FROM app_meta WHERE key = 'needs_full_reindex'", [])?;
        Ok(())
    }
}

/// Move a broken index (and its WAL/SHM side files) out of the way.
fn move_aside(path: &Path) -> AppResult<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let dest = path.with_file_name(format!("{file_name}.corrupt-{stamp}"));
    std::fs::rename(path, &dest).with_path("move aside", path)?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.exists() {
            let _ = std::fs::remove_file(side);
        }
    }
    Ok(Some(dest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_index_is_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("index.sqlite");
        std::fs::write(&path, b"this is definitely not a sqlite database, just garbage bytes").unwrap();
        let (db, outcome) = Database::open(&path).unwrap();
        assert!(outcome.replaced_corrupt.is_some());
        assert!(outcome.needs_full_reindex);
        assert!(outcome.replaced_corrupt.unwrap().exists(), "broken file is kept for inspection");
        let count: i64 = db.conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn reopening_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("index.sqlite");
        {
            let (db, outcome) = Database::open(&path).unwrap();
            // A brand-new database carries the reindex flag set by migration 2.
            assert!(outcome.needs_full_reindex);
            db.clear_full_reindex_flag().unwrap();
            repo::set_meta(&db.conn, "probe", "1").unwrap();
        }
        let (db, outcome) = Database::open(&path).unwrap();
        assert!(!outcome.needs_full_reindex);
        assert!(outcome.replaced_corrupt.is_none());
        assert_eq!(repo::get_meta(&db.conn, "probe").unwrap().as_deref(), Some("1"));
    }
}
