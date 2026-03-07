CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    media_type TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(channel, chat_id, timestamp);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    UNIQUE(channel, chat_id)
  );

CREATE INDEX IF NOT EXISTS idx_sessions_chat ON sessions(channel, chat_id);

CREATE TABLE IF NOT EXISTS agent_memory (
    agent_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
    PRIMARY KEY (agent_id, key)
  );

CREATE TABLE IF NOT EXISTS memory_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('conversation','note','document','tweet','article','product','story')),
    agent_id TEXT NOT NULL,
    channel TEXT,
    chat_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_memory_sources_agent ON memory_sources(agent_id);

CREATE TABLE IF NOT EXISTS memory_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES memory_sources(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_memory_chunks_source ON memory_chunks(source_id);

CREATE TABLE IF NOT EXISTS subagent_runs (
    id TEXT PRIMARY KEY,
    parent_agent_id TEXT NOT NULL,
    parent_session_key TEXT NOT NULL,
    child_agent_id TEXT NOT NULL,
    child_session_key TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','error','timeout')),
    result_text TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
  );

CREATE INDEX IF NOT EXISTS idx_subagent_runs_parent ON subagent_runs(parent_session_key, status);
