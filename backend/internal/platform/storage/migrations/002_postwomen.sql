-- ─────────────────────────────────────────────────────────────────────────
-- PostWomen — companion API-testing module sharing the same Postgres.
-- All idempotent so re-applying on existing DBs is safe.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pw_workspaces (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pw_collections (
    id            UUID PRIMARY KEY,
    workspace_id  UUID NOT NULL REFERENCES pw_workspaces(id) ON DELETE CASCADE,
    parent_id     UUID REFERENCES pw_collections(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    is_folder     BOOL NOT NULL DEFAULT FALSE,
    position      INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pw_collections_workspace ON pw_collections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pw_collections_parent    ON pw_collections(parent_id);

CREATE TABLE IF NOT EXISTS pw_requests (
    id             UUID PRIMARY KEY,
    collection_id  UUID REFERENCES pw_collections(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    method         TEXT NOT NULL DEFAULT 'GET',
    url            TEXT NOT NULL DEFAULT '',
    headers        JSONB NOT NULL DEFAULT '{}'::jsonb,
    query_params   JSONB NOT NULL DEFAULT '[]'::jsonb,
    body_kind      TEXT NOT NULL DEFAULT 'none',
    body           JSONB NOT NULL DEFAULT '{}'::jsonb,
    auth           JSONB NOT NULL DEFAULT '{}'::jsonb,
    tests          TEXT NOT NULL DEFAULT '',
    pre_script     TEXT NOT NULL DEFAULT '',
    position       INT  NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pw_requests_collection ON pw_requests(collection_id);

CREATE TABLE IF NOT EXISTS pw_environments (
    id            UUID PRIMARY KEY,
    workspace_id  UUID REFERENCES pw_workspaces(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    values        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pw_history (
    id                BIGSERIAL PRIMARY KEY,
    request_id        UUID REFERENCES pw_requests(id) ON DELETE SET NULL,
    method            TEXT,
    url               TEXT,
    status            INT,
    duration_ms       INT,
    response_bytes    BIGINT,
    request_snapshot  JSONB,
    response_snapshot JSONB,
    ran_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pw_history_ran_at ON pw_history(ran_at DESC);
