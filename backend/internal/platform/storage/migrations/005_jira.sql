-- ─────────────────────────────────────────────────────────────────────────
-- jira_attachments — log every successful "attach run report to Jira"
-- so the report page can show "this report was sent to CT-123 on <date>".
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_attachments (
    id          BIGSERIAL PRIMARY KEY,
    run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    team_id     UUID REFERENCES teams(id) ON DELETE SET NULL,
    jira_id     TEXT NOT NULL,
    jira_url    TEXT NOT NULL,
    filename    TEXT NOT NULL,
    bytes       INT NOT NULL DEFAULT 0,
    attached_by TEXT NOT NULL DEFAULT '',
    attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jira_attach_run    ON jira_attachments(run_id, attached_at DESC);
CREATE INDEX IF NOT EXISTS idx_jira_attach_team   ON jira_attachments(team_id, attached_at DESC);
CREATE INDEX IF NOT EXISTS idx_jira_attach_jira   ON jira_attachments(jira_id);
