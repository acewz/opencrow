CREATE TABLE IF NOT EXISTS task_classification (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_hash TEXT NOT NULL,
    session_id TEXT,
    domain TEXT NOT NULL,
    complexity_score INTEGER DEFAULT 1,
    urgency TEXT DEFAULT 'medium',
    keywords_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_task_classification_domain ON task_classification(domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_classification_hash ON task_classification(task_hash);

CREATE TABLE IF NOT EXISTS routing_decisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id TEXT,
    task_hash TEXT,
    selected_agent_id TEXT NOT NULL,
    alternative_agents_json TEXT NOT NULL DEFAULT '[]',
    decision_reason TEXT,
    outcome_status TEXT,
    outcome_score REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_routing_decisions_session ON routing_decisions(session_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_agent ON routing_decisions(selected_agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_scores (
    agent_id TEXT NOT NULL,
    domain TEXT,
    time_window TEXT NOT NULL,
    success_rate REAL,
    avg_duration_sec REAL,
    avg_cost_usd REAL,
    total_tasks INTEGER,
    score REAL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, domain, time_window)
  );

CREATE INDEX IF NOT EXISTS idx_agent_scores_domain ON agent_scores(domain, score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS tool_scores (
    tool_name TEXT NOT NULL,
    time_window TEXT NOT NULL,
    total_calls INTEGER,
    error_rate REAL,
    avg_latency_ms REAL,
    score REAL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tool_name, time_window)
  );

CREATE TABLE IF NOT EXISTS mcp_performance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mcp_server TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    is_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    cost_usd REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_mcp_perf_server ON mcp_performance(mcp_server, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_perf_tool ON mcp_performance(tool_name, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_scores (
    mcp_server TEXT NOT NULL,
    time_window TEXT NOT NULL,
    total_calls INTEGER,
    p95_latency_ms REAL,
    reliability REAL,
    avg_cost_usd REAL,
    score REAL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mcp_server, time_window)
  );

CREATE TABLE IF NOT EXISTS cost_tracking (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_hash TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL NOT NULL,
    model_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_tracking(agent_id, created_at DESC);

ALTER TABLE task_classification ADD COLUMN IF NOT EXISTS semantic_domain TEXT;

ALTER TABLE task_classification ADD COLUMN IF NOT EXISTS confidence_score REAL;

ALTER TABLE task_classification ADD COLUMN IF NOT EXISTS corrected_domain TEXT;

CREATE TABLE IF NOT EXISTS prewarm_cache (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain TEXT NOT NULL,
    context_data JSONB NOT NULL,
    hit_rate REAL DEFAULT 0,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
