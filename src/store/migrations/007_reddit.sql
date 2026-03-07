CREATE TABLE IF NOT EXISTS reddit_accounts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    cookies_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'unverified'
      CHECK(status IN ('unverified','active','expired','error')),
    verified_at INTEGER,
    error_message TEXT,
    last_scraped_at INTEGER,
    last_scrape_count INTEGER,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE TABLE IF NOT EXISTS reddit_posts (
    id TEXT PRIMARY KEY,
    subreddit TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    selftext TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    score INT NOT NULL DEFAULT 0,
    num_comments INT NOT NULL DEFAULT 0,
    permalink TEXT NOT NULL DEFAULT '',
    post_type TEXT NOT NULL DEFAULT 'link',
    feed_source TEXT NOT NULL DEFAULT 'home',
    domain TEXT NOT NULL DEFAULT '',
    upvote_ratio REAL NOT NULL DEFAULT 0,
    created_utc INT,
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_reddit_posts_updated ON reddit_posts(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_posts_score ON reddit_posts(score DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_posts_subreddit ON reddit_posts(subreddit, updated_at DESC);

ALTER TABLE reddit_posts ADD COLUMN IF NOT EXISTS indexed_at INT;

ALTER TABLE hn_stories ADD COLUMN IF NOT EXISTS indexed_at INT;

ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS indexed_at INT;

ALTER TABLE ph_products ADD COLUMN IF NOT EXISTS indexed_at INT;

ALTER TABLE x_scraped_tweets ADD COLUMN IF NOT EXISTS indexed_at INT;
