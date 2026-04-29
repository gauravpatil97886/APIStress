// Package activity is the team-side audit / activity event stream.
//
// What goes here vs `admin_audit`:
//   - admin_audit: admin-key actions only (team CRUD, key rotation).
//   - activity_log: everything teams + their members do — login attempts,
//     tool opens, run starts, request sends, exports, and so on. The admin
//     console reads this to answer "how is each team using the platform?".
//
// All inserts are best-effort (logged on error, never returned) so a
// transient DB hiccup never breaks a real user request.
package activity

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Common event-type keys. Not exhaustive — handlers and the frontend may
// emit additional event types. Centralising the well-known ones here keeps
// dashboards consistent and lets us reason about adoption.
const (
	EventLogin        = "auth.login"
	EventLoginFailed  = "auth.login_failed"
	EventLogout       = "auth.logout"
	EventToolOpen     = "tool.open"
	EventRunStart     = "feature.run.start"
	EventRunStop      = "feature.run.stop"
	EventPwSend       = "feature.pw.send"
	EventPwImport     = "feature.pw.import"
	EventCrosswalkJoin = "feature.crosswalk.join"
	EventCrosswalkExport = "feature.crosswalk.export"
	EventAdminAction  = "admin.action"
)

type Event struct {
	TeamID       string
	ActorType    string // "user" | "admin" | "system"
	ActorName    string
	EventType    string
	ToolSlug     string
	ResourceType string
	ResourceID   string
	Meta         map[string]interface{}
	IP           string
	UA           string
}

type Service struct {
	Pool *pgxpool.Pool
}

func New(p *pgxpool.Pool) *Service { return &Service{Pool: p} }

// Log records an event. Errors are logged but never bubbled up to the caller
// — activity logging must never fail an in-flight user request.
func (s *Service) Log(ctx context.Context, e Event) {
	if e.EventType == "" {
		return
	}
	if e.ActorType == "" {
		e.ActorType = "user"
	}
	var teamArg interface{}
	if strings.TrimSpace(e.TeamID) != "" {
		teamArg = e.TeamID
	}
	var toolArg, resTypeArg, resIDArg interface{}
	if e.ToolSlug != "" { toolArg = e.ToolSlug }
	if e.ResourceType != "" { resTypeArg = e.ResourceType }
	if e.ResourceID != "" { resIDArg = e.ResourceID }
	metaJSON, _ := json.Marshal(e.Meta)
	if len(metaJSON) == 0 || string(metaJSON) == "null" {
		metaJSON = []byte("{}")
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO activity_log (team_id, actor_type, actor_name, event_type, tool_slug,
		                          resource_type, resource_id, meta, ip, ua)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		teamArg, e.ActorType, e.ActorName, e.EventType, toolArg,
		resTypeArg, resIDArg, metaJSON, e.IP, e.UA,
	)
	if err != nil {
		logger.Warn("activity log insert failed",
			zap.String("event", e.EventType),
			zap.String("team", e.TeamID),
			zap.Error(err))
	}
}

// ─── Admin-side queries ─────────────────────────────────────────────────

type ListFilter struct {
	TeamID    string // empty = all teams
	ToolSlug  string
	EventType string
	Search    string // free-text in actor_name / event_type
	SinceISO  string // ISO-8601 lower bound (inclusive)
	UntilISO  string
	Limit     int
	Offset    int
}

type ListItem struct {
	ID           int64                  `json:"id"`
	TeamID       *string                `json:"team_id"`
	TeamName     *string                `json:"team_name"`
	ActorType    string                 `json:"actor_type"`
	ActorName    string                 `json:"actor_name"`
	EventType    string                 `json:"event_type"`
	ToolSlug     *string                `json:"tool_slug"`
	ResourceType *string                `json:"resource_type"`
	ResourceID   *string                `json:"resource_id"`
	Meta         map[string]interface{} `json:"meta"`
	IP           string                 `json:"ip"`
	UA           string                 `json:"ua"`
	TS           string                 `json:"ts"`
}

func (s *Service) List(ctx context.Context, f ListFilter) ([]ListItem, error) {
	if f.Limit <= 0 || f.Limit > 1000 { f.Limit = 200 }
	q := `
		SELECT a.id, a.team_id, t.name, a.actor_type, a.actor_name, a.event_type,
		       a.tool_slug, a.resource_type, a.resource_id, a.meta, a.ip, a.ua, a.ts
		  FROM activity_log a
		  LEFT JOIN teams t ON t.id = a.team_id
		 WHERE 1=1`
	args := []interface{}{}
	if f.TeamID != "" { args = append(args, f.TeamID); q += " AND a.team_id = $" + itoa(len(args)) }
	if f.ToolSlug != "" { args = append(args, f.ToolSlug); q += " AND a.tool_slug = $" + itoa(len(args)) }
	if f.EventType != "" { args = append(args, f.EventType); q += " AND a.event_type = $" + itoa(len(args)) }
	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		q += " AND (a.actor_name ILIKE $" + itoa(len(args)) + " OR a.event_type ILIKE $" + itoa(len(args)) + ")"
	}
	if f.SinceISO != "" { args = append(args, f.SinceISO); q += " AND a.ts >= $" + itoa(len(args)) + "::timestamptz" }
	if f.UntilISO != "" { args = append(args, f.UntilISO); q += " AND a.ts <= $" + itoa(len(args)) + "::timestamptz" }
	args = append(args, f.Limit); q += " ORDER BY a.ts DESC LIMIT $" + itoa(len(args))
	if f.Offset > 0 { args = append(args, f.Offset); q += " OFFSET $" + itoa(len(args)) }

	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	out := []ListItem{}
	for rows.Next() {
		var it ListItem
		var metaRaw []byte
		var ip, ua *string
		// `ts` column is TIMESTAMPTZ — must scan into time.Time, NOT string.
		// (Earlier version scanned into string and silently dropped every row,
		// making the admin activity feed look empty even though events were
		// being written correctly.)
		var ts time.Time
		if err := rows.Scan(&it.ID, &it.TeamID, &it.TeamName, &it.ActorType, &it.ActorName, &it.EventType,
			&it.ToolSlug, &it.ResourceType, &it.ResourceID, &metaRaw, &ip, &ua, &ts); err != nil {
			logger.Warn("activity list scan failed", zap.Error(err))
			continue
		}
		_ = json.Unmarshal(metaRaw, &it.Meta)
		if ip != nil { it.IP = *ip }
		if ua != nil { it.UA = *ua }
		it.TS = ts.Format(time.RFC3339)
		out = append(out, it)
	}
	return out, nil
}

// Stats aggregates the recent stream for the admin dashboard. `windowHours`
// caps the aggregation window; default is 168 (7 days).
type Stats struct {
	TotalEvents     int64                    `json:"total_events"`
	UniqueTeams     int64                    `json:"unique_teams"`
	UniqueActors    int64                    `json:"unique_actors"`
	WindowHours     int                      `json:"window_hours"`
	ToolBreakdown   []ToolUseRow             `json:"tool_breakdown"`
	EventBreakdown  []EventCountRow          `json:"event_breakdown"`
	TopTeams        []TeamUseRow             `json:"top_teams"`
	HourlyTimeline  []TimelineRow            `json:"hourly_timeline"`
}

type ToolUseRow struct {
	Tool   string `json:"tool"`
	Count  int64  `json:"count"`
	Teams  int64  `json:"teams"`
}
type EventCountRow struct {
	EventType string `json:"event_type"`
	Count     int64  `json:"count"`
}
type TeamUseRow struct {
	TeamID   string `json:"team_id"`
	TeamName string `json:"team_name"`
	Count    int64  `json:"count"`
	LastSeen string `json:"last_seen"`
}
type TimelineRow struct {
	Bucket string `json:"bucket"` // ISO timestamp at hour granularity
	Count  int64  `json:"count"`
}

func (s *Service) Stats(ctx context.Context, windowHours int) (*Stats, error) {
	if windowHours <= 0 || windowHours > 24*30 { windowHours = 168 }
	out := &Stats{WindowHours: windowHours}
	since := "NOW() - make_interval(hours => " + itoa(windowHours) + ")"

	if err := s.Pool.QueryRow(ctx,
		`SELECT COUNT(*),
		        COUNT(DISTINCT team_id),
		        COUNT(DISTINCT NULLIF(actor_name,''))
		   FROM activity_log WHERE ts >= `+since,
	).Scan(&out.TotalEvents, &out.UniqueTeams, &out.UniqueActors); err != nil {
		return nil, err
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT COALESCE(tool_slug,'(global)') AS t, COUNT(*), COUNT(DISTINCT team_id)
		  FROM activity_log WHERE ts >= `+since+`
		 GROUP BY t ORDER BY 2 DESC LIMIT 8`)
	if err != nil { return nil, err }
	for rows.Next() {
		var r ToolUseRow
		if err := rows.Scan(&r.Tool, &r.Count, &r.Teams); err == nil { out.ToolBreakdown = append(out.ToolBreakdown, r) }
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `
		SELECT event_type, COUNT(*)
		  FROM activity_log WHERE ts >= `+since+`
		 GROUP BY event_type ORDER BY 2 DESC LIMIT 12`)
	if err != nil { return nil, err }
	for rows.Next() {
		var r EventCountRow
		if err := rows.Scan(&r.EventType, &r.Count); err == nil { out.EventBreakdown = append(out.EventBreakdown, r) }
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `
		SELECT COALESCE(a.team_id::text,''), COALESCE(t.name,'(deleted)'),
		       COUNT(*), TO_CHAR(MAX(a.ts), 'YYYY-MM-DD"T"HH24:MI:SSOF')
		  FROM activity_log a
		  LEFT JOIN teams t ON t.id = a.team_id
		 WHERE a.ts >= `+since+`
		 GROUP BY a.team_id, t.name ORDER BY 3 DESC LIMIT 10`)
	if err != nil { return nil, err }
	for rows.Next() {
		var r TeamUseRow
		if err := rows.Scan(&r.TeamID, &r.TeamName, &r.Count, &r.LastSeen); err == nil { out.TopTeams = append(out.TopTeams, r) }
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `
		SELECT TO_CHAR(date_trunc('hour', ts), 'YYYY-MM-DD"T"HH24:MI:SSOF'), COUNT(*)
		  FROM activity_log WHERE ts >= `+since+`
		 GROUP BY 1 ORDER BY 1`)
	if err != nil { return nil, err }
	for rows.Next() {
		var r TimelineRow
		if err := rows.Scan(&r.Bucket, &r.Count); err == nil { out.HourlyTimeline = append(out.HourlyTimeline, r) }
	}
	rows.Close()

	return out, nil
}

func itoa(n int) string {
	if n == 0 { return "0" }
	neg := n < 0
	if neg { n = -n }
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg { digits = append([]byte{'-'}, digits...) }
	return string(digits)
}
