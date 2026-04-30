-- ─────────────────────────────────────────────────────────────────────────
-- activity_log — unified team-side activity stream.
--
-- This sits next to admin_audit (which only tracks admin mutations). It
-- captures every notable team event so an admin can answer:
--   • Who logs in, when, and how often?
--   • Which tools does each team use the most?
--   • What features within a tool get used?
--   • Did Crosswalk adoption pick up after we rolled it out?
--
-- Idempotent — safe to re-apply.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
    id            BIGSERIAL PRIMARY KEY,
    team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
    actor_type    TEXT NOT NULL DEFAULT 'user',   -- user | admin | system
    actor_name    TEXT NOT NULL DEFAULT '',       -- best-effort display name
    event_type    TEXT NOT NULL,                  -- auth.login | tool.open | feature.run.start | …
    tool_slug     TEXT,                           -- apistress | postwomen | crosswalk | admin (NULL = global)
    resource_type TEXT,                           -- run | request | workspace | join | team | key
    resource_id   TEXT,
    meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip            TEXT,
    ua            TEXT,
    ts            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_team_ts  ON activity_log(team_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_event_ts ON activity_log(event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_tool_ts  ON activity_log(tool_slug, ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ts       ON activity_log(ts DESC);
