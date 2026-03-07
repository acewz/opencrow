ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS tsv_content tsvector;

CREATE INDEX IF NOT EXISTS idx_memory_chunks_fts ON memory_chunks USING gin(tsv_content);

DROP TABLE IF EXISTS browser_sessions CASCADE;

DROP TABLE IF EXISTS browser_cookie_sets CASCADE;
