CREATE TABLE IF NOT EXISTS defi_protocols (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Unknown',
    chain TEXT NOT NULL DEFAULT 'unknown',
    chains_json TEXT NOT NULL DEFAULT '[]',
    tvl NUMERIC NOT NULL DEFAULT 0,
    tvl_prev NUMERIC,
    change_1d REAL,
    change_7d REAL,
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    first_seen_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    indexed_at INTEGER
  );

CREATE INDEX IF NOT EXISTS idx_defi_protocols_tvl ON defi_protocols(tvl DESC);

CREATE INDEX IF NOT EXISTS idx_defi_protocols_chain ON defi_protocols(chain, tvl DESC);

CREATE INDEX IF NOT EXISTS idx_defi_protocols_category ON defi_protocols(category, tvl DESC);

CREATE TABLE IF NOT EXISTS defi_chain_tvls (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    tvl NUMERIC NOT NULL DEFAULT 0,
    tvl_prev NUMERIC,
    protocols_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_chain_tvls_tvl ON defi_chain_tvls(tvl DESC);

CREATE TABLE IF NOT EXISTS defi_chain_tvl_history (
    chain_id TEXT NOT NULL,
    date INTEGER NOT NULL,
    tvl NUMERIC NOT NULL DEFAULT 0,
    PRIMARY KEY (chain_id, date)
  );

CREATE INDEX IF NOT EXISTS idx_defi_chain_tvl_history_date ON defi_chain_tvl_history(chain_id, date DESC);

CREATE TABLE IF NOT EXISTS defi_chain_metrics (
    chain_id TEXT NOT NULL,
    metric_date INTEGER NOT NULL,
    fees_24h NUMERIC,
    fees_7d NUMERIC,
    fees_30d NUMERIC,
    fees_change_1d REAL,
    revenue_24h NUMERIC,
    revenue_7d NUMERIC,
    revenue_30d NUMERIC,
    revenue_change_1d REAL,
    dex_volume_24h NUMERIC,
    dex_volume_7d NUMERIC,
    dex_volume_30d NUMERIC,
    dex_volume_change_1d REAL,
    stablecoin_mcap NUMERIC,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (chain_id, metric_date)
  );

CREATE INDEX IF NOT EXISTS idx_defi_chain_metrics_date ON defi_chain_metrics(chain_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS defi_protocol_detail (
    id TEXT PRIMARY KEY,
    symbol TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    twitter TEXT DEFAULT '',
    description_full TEXT DEFAULT '',
    mcap NUMERIC,
    chains_json TEXT DEFAULT '[]',
    current_chain_tvls_json TEXT DEFAULT '{}',
    raises_json TEXT DEFAULT '[]',
    fees_24h NUMERIC,
    fees_7d NUMERIC,
    revenue_24h NUMERIC,
    revenue_7d NUMERIC,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE IF NOT EXISTS defi_categories (
    name TEXT PRIMARY KEY,
    tvl NUMERIC DEFAULT 0,
    percentage REAL DEFAULT 0,
    protocol_count INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE IF NOT EXISTS defi_global_metrics (
    metric_type TEXT NOT NULL,
    metric_date INTEGER NOT NULL,
    total_24h NUMERIC,
    total_7d NUMERIC,
    change_1d REAL,
    extra_json TEXT DEFAULT '{}',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (metric_type, metric_date)
  );

CREATE TABLE IF NOT EXISTS defi_protocol_metrics (
    protocol_id TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value_24h NUMERIC,
    value_7d NUMERIC,
    change_1d REAL,
    chains_json TEXT DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (protocol_id, metric_type)
  );

CREATE INDEX IF NOT EXISTS idx_defi_protocol_metrics_type ON defi_protocol_metrics (metric_type, value_24h DESC);

CREATE TABLE IF NOT EXISTS defi_yield_pools (
    pool_id TEXT PRIMARY KEY,
    chain TEXT NOT NULL DEFAULT '',
    project TEXT NOT NULL DEFAULT '',
    symbol TEXT NOT NULL DEFAULT '',
    tvl_usd NUMERIC DEFAULT 0,
    apy REAL,
    apy_base REAL,
    apy_reward REAL,
    apy_base_7d REAL,
    volume_usd_1d NUMERIC,
    volume_usd_7d NUMERIC,
    pool_meta TEXT DEFAULT '',
    exposure TEXT DEFAULT '',
    reward_tokens_json TEXT DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_yield_pools_chain ON defi_yield_pools (chain, tvl_usd DESC);

CREATE INDEX IF NOT EXISTS idx_defi_yield_pools_apy ON defi_yield_pools (apy DESC);

CREATE INDEX IF NOT EXISTS idx_defi_yield_pools_project ON defi_yield_pools (project);

CREATE TABLE IF NOT EXISTS defi_bridges (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    display_name TEXT DEFAULT '',
    volume_prev_day NUMERIC,
    volume_prev_2day NUMERIC,
    last_24h_volume NUMERIC,
    chain_breakdown_json TEXT DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );

CREATE TABLE IF NOT EXISTS defi_hacks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    protocol TEXT DEFAULT '',
    amount NUMERIC DEFAULT 0,
    chain TEXT DEFAULT '',
    classification TEXT DEFAULT '',
    technique TEXT DEFAULT '',
    date INTEGER NOT NULL,
    description TEXT DEFAULT '',
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_hacks_date ON defi_hacks (date DESC);

CREATE INDEX IF NOT EXISTS idx_defi_hacks_amount ON defi_hacks (amount DESC);

CREATE TABLE IF NOT EXISTS defi_emissions (
    protocol_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    token TEXT DEFAULT '',
    circ_supply NUMERIC,
    total_locked NUMERIC,
    max_supply NUMERIC,
    unlocks_per_day NUMERIC,
    mcap NUMERIC,
    next_event_date INTEGER,
    next_event_unlock NUMERIC,
    events_json TEXT DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_emissions_next ON defi_emissions (next_event_date ASC);

CREATE TABLE IF NOT EXISTS defi_stablecoins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    symbol TEXT DEFAULT '',
    peg_type TEXT DEFAULT '',
    circulating NUMERIC DEFAULT 0,
    chains_json TEXT DEFAULT '[]',
    price REAL,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_stablecoins_circ ON defi_stablecoins (circulating DESC);

CREATE TABLE IF NOT EXISTS defi_treasury (
    protocol_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    total_usd NUMERIC DEFAULT 0,
    own_tokens_usd NUMERIC DEFAULT 0,
    stablecoins_usd NUMERIC DEFAULT 0,
    majors_usd NUMERIC DEFAULT 0,
    others_usd NUMERIC DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_defi_treasury_total ON defi_treasury (total_usd DESC);
