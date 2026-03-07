CREATE TABLE IF NOT EXISTS dexscreener_tokens (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    price_usd TEXT NOT NULL,
    price_change_24h REAL NOT NULL DEFAULT 0,
    volume_24h REAL NOT NULL DEFAULT 0,
    liquidity_usd REAL,
    market_cap REAL,
    pair_url TEXT NOT NULL,
    is_trending BOOLEAN NOT NULL DEFAULT false,
    is_new BOOLEAN NOT NULL DEFAULT false,
    token_hash TEXT NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_dexscreener_token_hash ON dexscreener_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_dexscreener_trending ON dexscreener_tokens(is_trending, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_dexscreener_new ON dexscreener_tokens(is_new, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_dexscreener_symbol ON dexscreener_tokens(symbol);

ALTER TABLE dexscreener_tokens ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE dexscreener_tokens ADD COLUMN IF NOT EXISTS boost_amount INTEGER DEFAULT 0;
