CREATE TABLE IF NOT EXISTS tests (
    id           UUID PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    config       JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
    id           UUID PRIMARY KEY,
    test_id      UUID REFERENCES tests(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    config       JSONB NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    summary      JSONB,
    created_by   TEXT NOT NULL DEFAULT '',
    jira_id      TEXT NOT NULL DEFAULT '',
    jira_link    TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    env_tag      TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_runs_test_id     ON runs(test_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at  ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status      ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_jira_id     ON runs(jira_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_by  ON runs(created_by);

-- Backfill column for already-created databases (idempotent).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS env_tag TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_runs_env_tag ON runs(env_tag);

CREATE TABLE IF NOT EXISTS run_metrics (
    id           BIGSERIAL PRIMARY KEY,
    run_id       UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    ts           TIMESTAMPTZ NOT NULL,
    snapshot     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_metrics_run_ts ON run_metrics(run_id, ts);

CREATE TABLE IF NOT EXISTS environments (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    base_url    TEXT NOT NULL,
    headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
