-- ─────────────────────────────────────────────────────────────────────────
-- Sentinel — API VAPT (Vulnerability Assessment + Penetration Testing) tables.
--
-- Three tables, all idempotent (safe to re-apply):
--   - vapt_scans          — one row per scan run.
--   - vapt_findings       — one row per security finding produced by a scan.
--   - vapt_jira_links     — paper trail of Jira issues created from findings
--                           and full reports attached to existing tickets.
--
-- All user-data tables carry team_id so the team-scoped middleware can keep
-- one team's scans / findings invisible to another. (Crosswalk happens to be
-- frontend-only and has no rows here — Sentinel persists everything because
-- the report is generated server-side.)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vapt_scans (
    id                 UUID PRIMARY KEY,
    team_id            UUID REFERENCES teams(id) ON DELETE CASCADE,
    target_url         TEXT NOT NULL,
    target_host        TEXT NOT NULL,                      -- denormalised for fast filtering
    status             TEXT NOT NULL DEFAULT 'pending',    -- pending | running | completed | stopped | failed
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    request_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb, -- redacted parsed request
    settings           JSONB NOT NULL DEFAULT '{}'::jsonb, -- enabled categories, rate limit, max duration, severity threshold
    summary            JSONB NOT NULL DEFAULT '{}'::jsonb, -- counts by severity, total findings, categories run, duration
    created_by         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vapt_scans_team    ON vapt_scans(team_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_vapt_scans_status  ON vapt_scans(status);

CREATE TABLE IF NOT EXISTS vapt_findings (
    id                     BIGSERIAL PRIMARY KEY,
    scan_id                UUID NOT NULL REFERENCES vapt_scans(id) ON DELETE CASCADE,
    team_id                UUID REFERENCES teams(id) ON DELETE CASCADE,
    severity               TEXT NOT NULL,                  -- critical | high | medium | low | info
    category               TEXT NOT NULL,                  -- transport | info_disclosure | injection | method_tampering
    test_id                TEXT NOT NULL,                  -- e.g. "transport.hsts.missing"
    title                  TEXT NOT NULL,
    description            TEXT NOT NULL DEFAULT '',       -- technical description (kept for the Technical tab)
    -- Plain-English framing — the developer-friendly tab leads with these.
    plain_title            TEXT NOT NULL DEFAULT '',
    plain_whats_happening  TEXT NOT NULL DEFAULT '',
    plain_why              TEXT NOT NULL DEFAULT '',
    plain_how_to_fix       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[] of numbered steps
    effort                 TEXT NOT NULL DEFAULT '',       -- "5-min" | "30-min" | "sprint"
    request_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_text          TEXT NOT NULL DEFAULT '',       -- short excerpt that triggered the rule (≤ 2 KB)
    owasp                  TEXT NOT NULL DEFAULT '',       -- "API1:2023"
    cwe                    TEXT NOT NULL DEFAULT '',       -- "CWE-89"
    remediation            TEXT NOT NULL DEFAULT '',
    ts                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vapt_find_scan     ON vapt_findings(scan_id, severity);
CREATE INDEX IF NOT EXISTS idx_vapt_find_team_ts  ON vapt_findings(team_id, ts DESC);

CREATE TABLE IF NOT EXISTS vapt_jira_links (
    id           BIGSERIAL PRIMARY KEY,
    scan_id      UUID NOT NULL REFERENCES vapt_scans(id) ON DELETE CASCADE,
    finding_id   BIGINT REFERENCES vapt_findings(id) ON DELETE CASCADE, -- NULL for scan-level "report attached"
    team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL,                                          -- 'issue_created' | 'report_attached'
    jira_id      TEXT NOT NULL,
    jira_url     TEXT NOT NULL,
    filename     TEXT,
    bytes        INT NOT NULL DEFAULT 0,
    actor        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vapt_jira_scan     ON vapt_jira_links(scan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vapt_jira_finding  ON vapt_jira_links(finding_id);
