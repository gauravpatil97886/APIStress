-- ─────────────────────────────────────────────────────────────────────────
-- Teams + team-scoped access keys.
-- All idempotent; safe to re-apply.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
    id           UUID PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL DEFAULT '',
    is_active    BOOL NOT NULL DEFAULT TRUE,
    tools_access TEXT[] NOT NULL DEFAULT ARRAY['apistress','postwomen']::TEXT[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by   TEXT NOT NULL DEFAULT 'admin'
);

-- Idempotent ALTER for re-applies on existing DBs.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tools_access TEXT[] NOT NULL DEFAULT ARRAY['apistress','postwomen']::TEXT[];

CREATE TABLE IF NOT EXISTS team_keys (
    id            UUID PRIMARY KEY,
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    key_hash      BYTEA NOT NULL,        -- bcrypt of the actual key
    key_prefix    TEXT  NOT NULL,        -- first 8 chars, displayed in admin UI
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_team_keys_team_active
  ON team_keys(team_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_keys_prefix ON team_keys(key_prefix);

CREATE TABLE IF NOT EXISTS team_members (
    team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    display_name   TEXT NOT NULL,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, display_name)
);

-- ── Add team_id to every user-data table ─────────────────────────────────
ALTER TABLE runs            ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE tests           ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE environments    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE pw_workspaces   ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE pw_history      ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_runs_team           ON runs(team_id);
CREATE INDEX IF NOT EXISTS idx_tests_team          ON tests(team_id);
CREATE INDEX IF NOT EXISTS idx_environments_team   ON environments(team_id);
CREATE INDEX IF NOT EXISTS idx_pw_workspaces_team  ON pw_workspaces(team_id);
CREATE INDEX IF NOT EXISTS idx_pw_history_team     ON pw_history(team_id);

-- ── Audit log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit (
    id           BIGSERIAL PRIMARY KEY,
    actor        TEXT NOT NULL,           -- "admin" for now
    action       TEXT NOT NULL,           -- team.create | team.delete | key.rotate | …
    target_type  TEXT,
    target_id    TEXT,
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip           TEXT,
    ua           TEXT,
    ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit(ts DESC);
