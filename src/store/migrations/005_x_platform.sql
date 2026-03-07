CREATE TABLE IF NOT EXISTS x_accounts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    profile_image_url TEXT,
    auth_token TEXT NOT NULL,
    ct0 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unverified'
      CHECK(status IN ('unverified','active','expired','error')),
    verified_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

ALTER TABLE x_accounts ADD COLUMN IF NOT EXISTS capabilities_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS x_bookmark_jobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    interval_minutes INTEGER NOT NULL DEFAULT 15,
    status TEXT NOT NULL DEFAULT 'stopped'
      CHECK(status IN ('running','stopped')),
    next_run_at INTEGER,
    total_shared INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    UNIQUE(account_id)
  );

CREATE TABLE IF NOT EXISTS x_shared_videos (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    source_tweet_id TEXT NOT NULL,
    source_author TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    shared_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_x_shared_videos_account
    ON x_shared_videos(account_id, shared_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_shared_videos_dedup
    ON x_shared_videos(account_id, source_tweet_id);

CREATE TABLE IF NOT EXISTS ph_accounts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    cookies_json TEXT NOT NULL DEFAULT '[]',
    session_cookie TEXT NOT NULL DEFAULT '',
    token_cookie TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unverified'
      CHECK(status IN ('unverified','active','expired','error')),
    verified_at INTEGER,
    error_message TEXT,
    capabilities_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

ALTER TABLE ph_accounts ADD COLUMN IF NOT EXISTS cookies_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE ph_accounts ALTER COLUMN session_cookie SET DEFAULT '';

CREATE TABLE IF NOT EXISTS ph_products (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    votes_count INT NOT NULL DEFAULT 0,
    comments_count INT NOT NULL DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    rank INT,
    makers_json TEXT NOT NULL DEFAULT '[]',
    topics_json TEXT NOT NULL DEFAULT '[]',
    featured_at INT,
    product_created_at INT,
    account_id TEXT,
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_ph_products_featured_at ON ph_products(featured_at DESC);

ALTER TABLE ph_accounts ADD COLUMN IF NOT EXISTS last_scraped_at INT;

ALTER TABLE ph_accounts ADD COLUMN IF NOT EXISTS last_scrape_count INT;

CREATE TABLE IF NOT EXISTS hn_stories (
    id TEXT PRIMARY KEY,
    rank INT NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    site_label TEXT NOT NULL DEFAULT '',
    points INT NOT NULL DEFAULT 0,
    author TEXT NOT NULL DEFAULT '',
    age TEXT NOT NULL DEFAULT '',
    comment_count INT NOT NULL DEFAULT 0,
    hn_url TEXT NOT NULL DEFAULT '',
    feed_type TEXT NOT NULL DEFAULT 'front',
    first_seen_at INT NOT NULL,
    updated_at INT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_hn_stories_updated ON hn_stories(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hn_stories_points ON hn_stories(points DESC);

CREATE TABLE IF NOT EXISTS x_scraped_tweets (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    tweet_id TEXT NOT NULL,
    author_username TEXT NOT NULL DEFAULT '',
    author_display_name TEXT NOT NULL DEFAULT '',
    author_verified BOOLEAN NOT NULL DEFAULT FALSE,
    author_followers INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT '',
    likes INTEGER NOT NULL DEFAULT 0,
    retweets INTEGER NOT NULL DEFAULT 0,
    replies INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    bookmarks INTEGER NOT NULL DEFAULT 0,
    quotes INTEGER NOT NULL DEFAULT 0,
    has_media BOOLEAN NOT NULL DEFAULT FALSE,
    tweet_created_at INTEGER,
    scraped_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_scraped_tweets_dedup
    ON x_scraped_tweets(account_id, tweet_id);

CREATE INDEX IF NOT EXISTS idx_x_scraped_tweets_account
    ON x_scraped_tweets(account_id, scraped_at DESC);

CREATE TABLE IF NOT EXISTS x_liked_tweets (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    tweet_id TEXT NOT NULL,
    author_username TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    likes INTEGER NOT NULL DEFAULT 0,
    retweets INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    liked_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_liked_tweets_dedup
    ON x_liked_tweets(account_id, tweet_id);

CREATE INDEX IF NOT EXISTS idx_x_liked_tweets_account
    ON x_liked_tweets(account_id, liked_at DESC);

CREATE TABLE IF NOT EXISTS x_autolike_jobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    interval_minutes INTEGER NOT NULL DEFAULT 15,
    max_likes_per_run INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'stopped'
      CHECK(status IN ('running','stopped')),
    next_run_at INTEGER,
    total_scraped INTEGER NOT NULL DEFAULT 0,
    total_liked INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    UNIQUE(account_id)
  );

ALTER TABLE x_autolike_jobs ADD COLUMN IF NOT EXISTS languages TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS x_autofollow_jobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    max_follows_per_run INTEGER NOT NULL DEFAULT 3,
    interval_minutes INTEGER NOT NULL DEFAULT 60,
    languages TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'stopped'
      CHECK(status IN ('running','stopped')),
    next_run_at INTEGER,
    total_followed INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    UNIQUE(account_id)
  );

CREATE TABLE IF NOT EXISTS x_followed_users (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    followers_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    source_tweet_id TEXT DEFAULT NULL,
    followed_at INTEGER NOT NULL,
    follow_back BOOLEAN NOT NULL DEFAULT FALSE,
    follow_back_checked_at INTEGER DEFAULT NULL,
    unfollowed_at INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_followed_users_dedup
    ON x_followed_users(account_id, username);

CREATE INDEX IF NOT EXISTS idx_x_followed_users_account
    ON x_followed_users(account_id, followed_at DESC);
