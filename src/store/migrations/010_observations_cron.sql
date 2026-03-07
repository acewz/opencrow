CREATE TABLE IF NOT EXISTS conversation_observations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    observation_type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    facts_json TEXT NOT NULL DEFAULT '[]',
    concepts_json TEXT NOT NULL DEFAULT '[]',
    tools_used_json TEXT NOT NULL DEFAULT '[]',
    source_message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_observations_agent ON conversation_observations(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_observations_chat ON conversation_observations(channel, chat_id, created_at DESC);

DO $$ BEGIN
    ALTER TABLE cron_runs DROP CONSTRAINT IF EXISTS cron_runs_status_check;
    ALTER TABLE cron_runs ADD CONSTRAINT cron_runs_status_check
      CHECK(status IN ('running','ok','error','timeout'));
  END $$;

ALTER TABLE cron_runs ADD COLUMN IF NOT EXISTS progress_json TEXT;

ALTER TABLE cron_runs ALTER COLUMN ended_at DROP NOT NULL;

ALTER TABLE cron_runs ALTER COLUMN duration_ms DROP NOT NULL;
