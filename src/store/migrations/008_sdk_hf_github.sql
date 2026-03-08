CREATE TABLE IF NOT EXISTS sdk_sessions (
    channel TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    sdk_session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    PRIMARY KEY (channel, chat_id, agent_id)
  );

CREATE TABLE IF NOT EXISTS hf_models (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL DEFAULT '',
    pipeline_tag TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    downloads INT NOT NULL DEFAULT 0,
    likes INT NOT NULL DEFAULT 0,
    trending_score REAL NOT NULL DEFAULT 0,
    library_name TEXT NOT NULL DEFAULT '',
    model_created_at TEXT DEFAULT '',
    last_modified TEXT DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    feed_source TEXT NOT NULL DEFAULT 'trending',
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL,
    indexed_at INT
  );

CREATE INDEX IF NOT EXISTS idx_hf_models_updated ON hf_models(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hf_models_likes ON hf_models(likes DESC);

CREATE INDEX IF NOT EXISTS idx_hf_models_downloads ON hf_models(downloads DESC);

CREATE INDEX IF NOT EXISTS idx_hf_models_pipeline_tag ON hf_models(pipeline_tag, updated_at DESC);

DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post','github_repo','observation','idea','app_review','app_ranking'));
  END $$;

ALTER TABLE generated_ideas ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'idea';

ALTER TABLE generated_ideas ADD COLUMN IF NOT EXISTS model_references TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS github_repos (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    stars INT NOT NULL DEFAULT 0,
    forks INT NOT NULL DEFAULT 0,
    stars_today INT NOT NULL DEFAULT 0,
    built_by_json TEXT NOT NULL DEFAULT '[]',
    url TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT 'daily',
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL,
    indexed_at INT
  );

CREATE INDEX IF NOT EXISTS idx_github_repos_updated ON github_repos(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_github_repos_stars ON github_repos(stars DESC);

CREATE INDEX IF NOT EXISTS idx_github_repos_stars_today ON github_repos(stars_today DESC);

CREATE INDEX IF NOT EXISTS idx_github_repos_language ON github_repos(language, updated_at DESC);
