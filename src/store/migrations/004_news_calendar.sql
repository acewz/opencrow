DROP TABLE IF EXISTS tweets CASCADE;

CREATE TABLE IF NOT EXISTS news_articles (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    url_hash TEXT NOT NULL,
    published_at TEXT DEFAULT '',
    category TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    sentiment TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    currencies_json TEXT DEFAULT '[]',
    source_id TEXT DEFAULT '',
    source_domain TEXT DEFAULT '',
    section TEXT DEFAULT '',
    extra_json TEXT DEFAULT '{}',
    scraped_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url_hash ON news_articles(url_hash);

CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(source_name, scraped_at DESC);

CREATE TABLE IF NOT EXISTS economic_calendar_events (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    country TEXT DEFAULT '',
    currency TEXT DEFAULT '',
    importance TEXT DEFAULT 'medium',
    event_datetime TEXT DEFAULT '',
    actual TEXT DEFAULT '',
    forecast TEXT DEFAULT '',
    previous TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    event_hash TEXT NOT NULL DEFAULT '',
    scraped_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_event_hash ON economic_calendar_events(event_hash);

CREATE TABLE IF NOT EXISTS news_scraper_runs (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    status TEXT CHECK(status IN ('ok','error','timeout')),
    articles_found INTEGER DEFAULT 0,
    articles_new INTEGER DEFAULT 0,
    duration_ms INTEGER NOT NULL,
    error TEXT,
    started_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_news_runs_source ON news_scraper_runs(source_name, started_at DESC);

DROP TABLE IF EXISTS agent_configs CASCADE;

DROP TABLE IF EXISTS auth_state CASCADE;
