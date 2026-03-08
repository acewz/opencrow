ALTER TABLE ph_products ADD COLUMN IF NOT EXISTS reviews_count INT NOT NULL DEFAULT 0;

ALTER TABLE ph_products ADD COLUMN IF NOT EXISTS reviews_rating REAL NOT NULL DEFAULT 0;

ALTER TABLE hn_stories ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE hn_stories ADD COLUMN IF NOT EXISTS top_comments_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE reddit_posts ADD COLUMN IF NOT EXISTS top_comments_json TEXT DEFAULT NULL;

ALTER TABLE reddit_posts ADD COLUMN IF NOT EXISTS flair TEXT DEFAULT NULL;

ALTER TABLE reddit_posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS google_trends (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    traffic_volume TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    related_queries TEXT NOT NULL DEFAULT '',
    picture_url TEXT DEFAULT NULL,
    news_items_json TEXT DEFAULT NULL,
    geo TEXT NOT NULL DEFAULT 'US',
    category TEXT NOT NULL DEFAULT 'all',
    first_seen_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    indexed_at INTEGER DEFAULT NULL
  );

CREATE INDEX IF NOT EXISTS idx_google_trends_updated ON google_trends(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_trends_category ON google_trends(category, updated_at DESC);

ALTER TABLE google_trends ADD COLUMN IF NOT EXISTS picture_url TEXT DEFAULT NULL;

ALTER TABLE google_trends ADD COLUMN IF NOT EXISTS news_items_json TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS appstore_rankings (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    artist TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    rank INTEGER NOT NULL,
    list_type TEXT NOT NULL,
    icon_url TEXT NOT NULL DEFAULT '',
    store_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT 'Free',
    bundle_id TEXT NOT NULL DEFAULT '',
    release_date TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    indexed_at INTEGER,
    PRIMARY KEY (id, list_type)
  );

CREATE TABLE IF NOT EXISTS appstore_reviews (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    first_seen_at INTEGER NOT NULL,
    indexed_at INTEGER
  );

ALTER TABLE appstore_rankings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE appstore_rankings ADD COLUMN IF NOT EXISTS price TEXT NOT NULL DEFAULT 'Free';

ALTER TABLE appstore_rankings ADD COLUMN IF NOT EXISTS bundle_id TEXT NOT NULL DEFAULT '';

ALTER TABLE appstore_rankings ADD COLUMN IF NOT EXISTS release_date TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS playstore_rankings (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    developer TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    rank INTEGER NOT NULL,
    list_type TEXT NOT NULL,
    icon_url TEXT NOT NULL DEFAULT '',
    store_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT 'Free',
    rating REAL,
    installs TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    indexed_at INTEGER,
    PRIMARY KEY (id, list_type)
  );

CREATE TABLE IF NOT EXISTS playstore_reviews (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    thumbs_up INTEGER NOT NULL DEFAULT 0,
    version TEXT NOT NULL DEFAULT '',
    first_seen_at INTEGER NOT NULL,
    indexed_at INTEGER
  );

DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post','github_repo','observation','idea','app_review','app_ranking'));
  END $$;
