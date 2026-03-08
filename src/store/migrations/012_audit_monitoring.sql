ALTER TABLE generated_ideas ADD COLUMN IF NOT EXISTS quality_score REAL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS tool_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    tool_name TEXT NOT NULL,
    tool_input TEXT,
    tool_response TEXT,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_tool_audit_agent_time ON tool_audit_log(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_audit_tool ON tool_audit_log(tool_name, created_at DESC);

DO $$ BEGIN
    ALTER TABLE memory_sources DROP CONSTRAINT IF EXISTS memory_sources_kind_check;
    ALTER TABLE memory_sources ADD CONSTRAINT memory_sources_kind_check
      CHECK(kind IN ('conversation','note','document','tweet','article','product','story','reddit_post','github_repo','observation','idea','app_review','app_ranking'));
  END $$;

CREATE TABLE IF NOT EXISTS monitor_alerts (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('critical','warning','info')),
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    metric REAL,
    threshold REAL,
    fired_at INTEGER NOT NULL,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_monitor_alerts_fired
    ON monitor_alerts(fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_alerts_active
    ON monitor_alerts(resolved_at, fired_at DESC);

CREATE TABLE IF NOT EXISTS session_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    prompt TEXT,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, session_id)
  );

CREATE INDEX IF NOT EXISTS idx_session_history_agent ON session_history(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_prompt_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_user_prompt_log_agent ON user_prompt_log(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_prompt_log_session ON user_prompt_log(session_id);

CREATE TABLE IF NOT EXISTS subagent_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_agent_id TEXT NOT NULL,
    session_id TEXT,
    subagent_id TEXT NOT NULL,
    task TEXT,
    status TEXT DEFAULT 'started',
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );

CREATE INDEX IF NOT EXISTS idx_subagent_audit_parent ON subagent_audit_log(parent_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subagent_audit_session ON subagent_audit_log(session_id);
