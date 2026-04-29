// Package teams encapsulates team + access-key persistence and validation.
package teams

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const LegacyTeamName = "Legacy"

type Team struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsActive    bool      `json:"is_active"`
	ToolsAccess []string  `json:"tools_access"`   // ["apistress","postwomen"]
	CreatedAt   time.Time `json:"created_at"`
	MemberCount int       `json:"member_count"`
	KeyPrefix   string    `json:"key_prefix"`     // for display: "prod-a3f2"
	LastUsedAt  *time.Time `json:"last_used_at"`
}

// Service is the entry point for both admin operations and login validation.
type Service struct {
	Pool *pgxpool.Pool
}

func New(p *pgxpool.Pool) *Service { return &Service{Pool: p} }

// ── Bootstrap ────────────────────────────────────────────────────────────

// Bootstrap ensures the Legacy team exists and seeds it with a key matching
// the env-var CH_ACCESS_KEY so existing users aren't locked out during the
// migration window. Re-runs are idempotent.
func (s *Service) Bootstrap(ctx context.Context, legacyAccessKey string) error {
	// 1. Ensure Legacy team
	var teamID string
	err := s.Pool.QueryRow(ctx,
		`SELECT id FROM teams WHERE name=$1`, LegacyTeamName).Scan(&teamID)
	if errors.Is(err, pgx.ErrNoRows) {
		teamID = newID()
		_, err = s.Pool.Exec(ctx,
			`INSERT INTO teams (id, name, description, created_by) VALUES ($1, $2, $3, 'bootstrap')`,
			teamID, LegacyTeamName, "Auto-created during teams migration. Holds pre-multitenant data.")
		if err != nil {
			return fmt.Errorf("create legacy team: %w", err)
		}
	} else if err != nil {
		return err
	}

	// 2. Backfill ownership of every existing row to Legacy
	for _, sql := range []string{
		`UPDATE runs            SET team_id=$1 WHERE team_id IS NULL`,
		`UPDATE tests           SET team_id=$1 WHERE team_id IS NULL`,
		`UPDATE environments    SET team_id=$1 WHERE team_id IS NULL`,
		`UPDATE pw_workspaces   SET team_id=$1 WHERE team_id IS NULL`,
		`UPDATE pw_history      SET team_id=$1 WHERE team_id IS NULL`,
	} {
		if _, err := s.Pool.Exec(ctx, sql, teamID); err != nil {
			return fmt.Errorf("backfill: %w", err)
		}
	}

	// 3. Ensure Legacy has a key matching CH_ACCESS_KEY
	if legacyAccessKey == "" {
		return nil
	}
	exists, err := s.keyExists(ctx, teamID, legacyAccessKey)
	if err != nil {
		return err
	}
	if !exists {
		if err := s.addKey(ctx, teamID, legacyAccessKey); err != nil {
			return fmt.Errorf("seed legacy key: %w", err)
		}
	}
	return nil
}

// ── Auth — used by request middleware on every authenticated call ────────

// Authenticate hashes & looks up the supplied plaintext key. Returns the
// owning team or an error if the key is unknown / revoked.
func (s *Service) Authenticate(ctx context.Context, plaintext string) (*Team, error) {
	plaintext = strings.TrimSpace(plaintext)
	if plaintext == "" {
		return nil, errors.New("empty key")
	}
	prefix := keyPrefix(plaintext)

	rows, err := s.Pool.Query(ctx,
		`SELECT k.id, k.team_id, k.key_hash, t.name, t.description, t.is_active, t.tools_access
		   FROM team_keys k JOIN teams t ON t.id = k.team_id
		  WHERE k.key_prefix = $1 AND k.revoked_at IS NULL AND t.is_active = TRUE`,
		prefix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var keyID, teamID, name, description string
		var hash []byte
		var active bool
		var tools []string
		if err := rows.Scan(&keyID, &teamID, &hash, &name, &description, &active, &tools); err != nil {
			continue
		}
		if bcrypt.CompareHashAndPassword(hash, []byte(plaintext)) == nil {
			// Update last-used timestamp asynchronously (non-blocking)
			go func() {
				_, _ = s.Pool.Exec(context.Background(),
					`UPDATE team_keys SET last_used_at=NOW() WHERE id=$1`, keyID)
			}()
			return &Team{
				ID: teamID, Name: name, Description: description,
				IsActive: active, ToolsAccess: tools,
			}, nil
		}
	}
	return nil, errors.New("invalid access key")
}

// ── Admin operations ─────────────────────────────────────────────────────

func (s *Service) ListTeams(ctx context.Context) ([]Team, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT t.id, t.name, t.description, t.is_active, t.tools_access, t.created_at,
		       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id),
		       (SELECT k.key_prefix  FROM team_keys k WHERE k.team_id = t.id AND k.revoked_at IS NULL ORDER BY k.created_at DESC LIMIT 1),
		       (SELECT k.last_used_at FROM team_keys k WHERE k.team_id = t.id AND k.revoked_at IS NULL ORDER BY k.created_at DESC LIMIT 1)
		  FROM teams t ORDER BY t.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Team{}
	for rows.Next() {
		var t Team
		var prefix *string
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.IsActive, &t.ToolsAccess, &t.CreatedAt,
			&t.MemberCount, &prefix, &t.LastUsedAt); err != nil {
			continue
		}
		if prefix != nil { t.KeyPrefix = *prefix }
		out = append(out, t)
	}
	return out, nil
}

// Default tools enabled when nothing is specified — sourced from the canonical
// tools registry so adding a new tool only requires editing one place.
var DefaultTools = append([]string(nil), tools.AllSlugs...)

func sanitizeTools(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(t))
		if tools.IsAllowed(t) && !seen[t] {
			out = append(out, t)
			seen[t] = true
		}
	}
	if len(out) == 0 {
		return append([]string{}, DefaultTools...)
	}
	return out
}

// CreateTeam returns the team plus the plaintext key. The plaintext key is
// shown to the admin **once**; only the bcrypt hash is stored.
func (s *Service) CreateTeam(ctx context.Context, name, description string, tools []string) (*Team, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, "", errors.New("team name is required")
	}
	tools = sanitizeTools(tools)
	id := newID()
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO teams (id, name, description, tools_access) VALUES ($1, $2, $3, $4)`,
		id, name, description, tools)
	if err != nil {
		return nil, "", err
	}
	plaintext := generateKey(name)
	if err := s.addKey(ctx, id, plaintext); err != nil {
		_, _ = s.Pool.Exec(ctx, `DELETE FROM teams WHERE id=$1`, id)
		return nil, "", err
	}
	return &Team{
		ID: id, Name: name, Description: description, IsActive: true,
		ToolsAccess: tools,
		KeyPrefix:   keyPrefix(plaintext),
	}, plaintext, nil
}

// RotateKey revokes all active keys for the team and issues a new one.
func (s *Service) RotateKey(ctx context.Context, teamID string) (string, error) {
	var teamName string
	if err := s.Pool.QueryRow(ctx, `SELECT name FROM teams WHERE id=$1`, teamID).Scan(&teamName); err != nil {
		return "", err
	}
	if _, err := s.Pool.Exec(ctx,
		`UPDATE team_keys SET revoked_at=NOW() WHERE team_id=$1 AND revoked_at IS NULL`,
		teamID); err != nil {
		return "", err
	}
	plaintext := generateKey(teamName)
	if err := s.addKey(ctx, teamID, plaintext); err != nil {
		return "", err
	}
	return plaintext, nil
}

func (s *Service) DeleteTeam(ctx context.Context, teamID string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM teams WHERE id=$1`, teamID)
	return err
}

// SetActive enables or disables a team. A disabled team's keys still exist in
// the DB but Authenticate rejects them.
func (s *Service) SetActive(ctx context.Context, teamID string, active bool) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE teams SET is_active=$1, updated_at=NOW() WHERE id=$2`, active, teamID)
	return err
}

func (s *Service) RenameTeam(ctx context.Context, teamID, name, description string, tools []string) error {
	if len(tools) > 0 {
		tools = sanitizeTools(tools)
		_, err := s.Pool.Exec(ctx,
			`UPDATE teams SET name=$1, description=$2, tools_access=$3, updated_at=NOW() WHERE id=$4`,
			name, description, tools, teamID)
		return err
	}
	_, err := s.Pool.Exec(ctx,
		`UPDATE teams SET name=$1, description=$2, updated_at=NOW() WHERE id=$3`,
		name, description, teamID)
	return err
}

// TouchMember records that a user-named identity sent a request inside a team.
func (s *Service) TouchMember(ctx context.Context, teamID, displayName string) {
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return
	}
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO team_members (team_id, display_name, request_count)
		VALUES ($1, $2, 1)
		ON CONFLICT (team_id, display_name) DO UPDATE
		SET last_seen_at = NOW(), request_count = team_members.request_count + 1`,
		teamID, displayName)
}

// ── Audit ────────────────────────────────────────────────────────────────

func (s *Service) Audit(ctx context.Context, actor, action, targetType, targetID, ip, ua string) {
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO admin_audit (actor, action, target_type, target_id, ip, ua)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		actor, action, targetType, targetID, ip, ua)
}

func (s *Service) ListAudit(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT actor, action, target_type, target_id, ip, ts FROM admin_audit ORDER BY ts DESC LIMIT $1`,
		limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]interface{}{}
	for rows.Next() {
		var actor, action string
		var targetType, targetID, ip *string
		var ts time.Time
		if err := rows.Scan(&actor, &action, &targetType, &targetID, &ip, &ts); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"actor": actor, "action": action,
			"target_type": stringOrEmpty(targetType),
			"target_id":   stringOrEmpty(targetID),
			"ip":          stringOrEmpty(ip),
			"ts":          ts.Format(time.RFC3339),
		})
	}
	return out, nil
}

func stringOrEmpty(p *string) string { if p == nil { return "" }; return *p }

// ── internals ────────────────────────────────────────────────────────────

func (s *Service) addKey(ctx context.Context, teamID, plaintext string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx,
		`INSERT INTO team_keys (id, team_id, key_hash, key_prefix) VALUES ($1, $2, $3, $4)`,
		newID(), teamID, hash, keyPrefix(plaintext))
	return err
}

func (s *Service) keyExists(ctx context.Context, teamID, plaintext string) (bool, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT key_hash FROM team_keys WHERE team_id=$1 AND key_prefix=$2 AND revoked_at IS NULL`,
		teamID, keyPrefix(plaintext))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var h []byte
		if err := rows.Scan(&h); err != nil {
			continue
		}
		if bcrypt.CompareHashAndPassword(h, []byte(plaintext)) == nil {
			return true, nil
		}
	}
	return false, nil
}

func keyPrefix(s string) string {
	if len(s) >= 8 {
		return strings.ToLower(s[:8])
	}
	return strings.ToLower(s)
}

func generateKey(teamName string) string {
	slug := slugify(teamName)
	if slug == "" {
		slug = "team"
	}
	if len(slug) > 16 {
		slug = slug[:16]
	}
	return fmt.Sprintf("%s-%s-%s-%s", slug, randPart(), randPart(), randPart())
}

func slugify(s string) string {
	out := []byte{}
	prev := byte(0)
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c = c - 'A' + 'a'
		}
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			out = append(out, c)
			prev = c
		} else if prev != '-' && len(out) > 0 {
			out = append(out, '-')
			prev = '-'
		}
	}
	for len(out) > 0 && out[len(out)-1] == '-' {
		out = out[:len(out)-1]
	}
	return string(out)
}

func randPart() string {
	var b [3]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])[:4]
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]), hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]), hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]))
}
