-- ─────────────────────────────────────────────────────────────────────────
-- 007_vapt_jira — capture optional Jira metadata at scan-start time, like
-- APIStress's load runs do. The operator types the ticket they're scanning
-- under (`jira_id` + `jira_link`); the history view shows it as a chip and
-- the auto-attach finish hook (future) targets it.
-- Idempotent — uses ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE vapt_scans ADD COLUMN IF NOT EXISTS jira_id   TEXT NOT NULL DEFAULT '';
ALTER TABLE vapt_scans ADD COLUMN IF NOT EXISTS jira_link TEXT NOT NULL DEFAULT '';
ALTER TABLE vapt_scans ADD COLUMN IF NOT EXISTS notes     TEXT NOT NULL DEFAULT '';
