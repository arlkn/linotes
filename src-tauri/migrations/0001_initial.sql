-- Linotes index schema, version 1.
--
-- This database is a rebuildable cache. The Markdown files in the notes
-- folder are the source of truth; every row here can be regenerated from them.

CREATE TABLE notes (
    seq           INTEGER PRIMARY KEY,
    id            TEXT    NOT NULL UNIQUE,
    rel_path      TEXT    NOT NULL UNIQUE,
    folder        TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    preview       TEXT    NOT NULL DEFAULT '',
    favorite      INTEGER NOT NULL DEFAULT 0,
    trashed       INTEGER NOT NULL DEFAULT 0,
    trashed_from  TEXT,
    trashed_at    TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    body_hash     TEXT    NOT NULL,
    file_mtime_ns INTEGER NOT NULL,
    file_size     INTEGER NOT NULL,
    id_in_file    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_notes_folder ON notes (folder);
CREATE INDEX idx_notes_updated ON notes (updated_at);

CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
