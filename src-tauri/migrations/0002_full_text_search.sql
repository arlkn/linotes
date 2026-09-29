-- Version 2: SQLite FTS5 full-text search.
--
-- The FTS rowid mirrors notes.seq. Note bodies are not stored in the notes
-- table, so existing rows are re-read from disk after this migration.
--
-- `alt` holds alternate spellings that the unicode61 tokenizer does not fold
-- by itself (e.g. Turkish dotless ı → i), so "calisma" finds "çalışma".

CREATE VIRTUAL TABLE notes_fts USING fts5 (
    title,
    body,
    folder,
    alt,
    tokenize = 'unicode61 remove_diacritics 2'
);

INSERT OR REPLACE INTO app_meta (key, value) VALUES ('needs_full_reindex', '1');
