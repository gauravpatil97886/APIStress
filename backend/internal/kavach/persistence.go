package kavach

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// InsertFinding writes a single finding to vapt_findings, returning the
// auto-generated id so the runner can fill it on the in-memory record.
func InsertFinding(ctx context.Context, pool *pgxpool.Pool, scanID, teamID string, f *Finding) (int64, error) {
	reqJSON, _ := json.Marshal(map[string]interface{}{
		"method":  f.Request.Method,
		"url":     f.Request.URL,
		"headers": RedactHeaders(f.Request.Headers),
		"body":    RedactBody(f.Request.Body),
	})
	respJSON, _ := json.Marshal(f.Response)
	plainStepsJSON, _ := json.Marshal(f.PlainHowToFix)
	if string(plainStepsJSON) == "null" {
		plainStepsJSON = []byte("[]")
	}
	var teamArg interface{}
	if teamID != "" {
		teamArg = teamID
	}

	var id int64
	explanation := f.TestExplanation
	if explanation == "" {
		explanation = ExplainTest(f.TestID)
	}
	err := pool.QueryRow(ctx, `
		INSERT INTO vapt_findings (
			scan_id, team_id, severity, category, test_id,
			title, description,
			plain_title, plain_whats_happening, plain_why, plain_how_to_fix, effort,
			request_snapshot, response_snapshot, evidence_text,
			owasp, cwe, remediation, test_explanation
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7,
			$8, $9, $10, $11, $12,
			$13, $14, $15,
			$16, $17, $18, $19
		) RETURNING id`,
		scanID, teamArg, string(f.Severity), string(f.Category), f.TestID,
		f.Title, f.Description,
		f.PlainTitle, f.PlainWhatsHappening, f.PlainWhy, plainStepsJSON, string(f.Effort),
		reqJSON, respJSON, TruncateEvidence(f.EvidenceText),
		f.OWASP, f.CWE, f.Remediation, explanation,
	).Scan(&id)
	return id, err
}

// FinalizeScan stamps status + finished_at + summary on a scan row.
func FinalizeScan(ctx context.Context, pool *pgxpool.Pool, scanID, status string, summary map[string]interface{}, finishedAt time.Time) error {
	summaryJSON, _ := json.Marshal(summary)
	if string(summaryJSON) == "null" {
		summaryJSON = []byte("{}")
	}
	_, err := pool.Exec(ctx, `
		UPDATE vapt_scans
		SET status = $1, finished_at = $2, summary = $3
		WHERE id = $4`,
		status, finishedAt, summaryJSON, scanID,
	)
	return err
}
