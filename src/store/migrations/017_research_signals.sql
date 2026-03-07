CREATE TABLE IF NOT EXISTS research_signals (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    signal_type TEXT NOT NULL DEFAULT 'trend',
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT '',
    strength INTEGER NOT NULL DEFAULT 3,
    themes TEXT NOT NULL DEFAULT '',
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_signals_agent ON research_signals (agent_id, consumed, created_at DESC);

ALTER TABLE generated_ideas ALTER COLUMN rating DROP DEFAULT;

ALTER TABLE generated_ideas DROP CONSTRAINT IF EXISTS generated_ideas_rating_check;

ALTER TABLE generated_ideas ALTER COLUMN rating TYPE INTEGER USING CASE WHEN rating = 'good' THEN 5 WHEN rating = 'bad' THEN 1 ELSE NULL END;

ALTER TABLE generated_ideas ALTER COLUMN rating SET DEFAULT NULL;

ALTER TABLE generated_ideas ADD CONSTRAINT generated_ideas_rating_check CHECK(rating >= 0 AND rating <= 5);

ALTER TABLE generated_ideas DROP COLUMN IF EXISTS feedback;
