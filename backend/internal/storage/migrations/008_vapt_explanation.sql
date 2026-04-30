-- 008_vapt_explanation — store the per-test attack-mechanic blurb
-- (`What we tried`) on every finding so the report page + PDF can show
-- it without re-deriving from a code map at read time.
ALTER TABLE vapt_findings ADD COLUMN IF NOT EXISTS test_explanation TEXT NOT NULL DEFAULT '';
