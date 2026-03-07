DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post'));
  END $$;

ALTER TABLE x_scraped_tweets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'timeline';

CREATE TABLE IF NOT EXISTS x_timeline_scrape_jobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    max_pages INTEGER NOT NULL DEFAULT 3,
    sources TEXT NOT NULL DEFAULT 'home,top_posts',
    interval_minutes INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('running','stopped')),
    next_run_at INTEGER,
    total_scraped INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    UNIQUE(account_id)
  );

CREATE TABLE IF NOT EXISTS generated_ideas (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    sources_used TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'general',
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_generated_ideas_agent ON generated_ideas(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_ideas_created ON generated_ideas(created_at DESC);

ALTER TABLE generated_ideas ADD COLUMN IF NOT EXISTS rating TEXT DEFAULT NULL CHECK(rating IN ('good','bad'));

ALTER TABLE generated_ideas ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT '';
