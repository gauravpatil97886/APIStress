// Package postwomen wires the API-testing module's HTTP routes.
package postwomen

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/platform/api/middleware"
	pw "github.com/choicetechlab/choicehammer/internal/tools/postwomen/store"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	DB *pgxpool.Pool
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]),
	)
}

// workspaceOwnedBy returns true if the workspace belongs to the team (or both empty).
func (h *Handler) workspaceOwnedBy(c *gin.Context, wsID, team string) bool {
	if wsID == "" {
		return false
	}
	var owner *string
	if err := h.DB.QueryRow(c.Request.Context(),
		`SELECT team_id::text FROM pw_workspaces WHERE id=$1`, wsID).Scan(&owner); err != nil {
		return false
	}
	if team == "" {
		return owner == nil
	}
	return owner != nil && *owner == team
}

// collectionWorkspaceOwnedBy returns true if the collection's workspace belongs to team.
func (h *Handler) collectionWorkspaceOwnedBy(c *gin.Context, collID, team string) bool {
	if collID == "" {
		return false
	}
	var owner *string
	if err := h.DB.QueryRow(c.Request.Context(),
		`SELECT w.team_id::text FROM pw_collections c
		 JOIN pw_workspaces w ON w.id = c.workspace_id
		 WHERE c.id = $1`, collID).Scan(&owner); err != nil {
		return false
	}
	if team == "" {
		return owner == nil
	}
	return owner != nil && *owner == team
}

// requestWorkspaceOwnedBy returns true if the request's workspace belongs to team.
func (h *Handler) requestWorkspaceOwnedBy(c *gin.Context, reqID, team string) bool {
	if reqID == "" {
		return false
	}
	var owner *string
	if err := h.DB.QueryRow(c.Request.Context(),
		`SELECT w.team_id::text FROM pw_requests r
		 JOIN pw_collections c ON c.id = r.collection_id
		 JOIN pw_workspaces w ON w.id = c.workspace_id
		 WHERE r.id = $1`, reqID).Scan(&owner); err != nil {
		return false
	}
	if team == "" {
		return owner == nil
	}
	return owner != nil && *owner == team
}

// ── Workspaces ───────────────────────────────────────────────────────────
func (h *Handler) ListWorkspaces(c *gin.Context) {
	team := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, name, created_at, updated_at FROM pw_workspaces WHERE team_id=$1 ORDER BY created_at`, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []pw.Workspace{}
	for rows.Next() {
		var w pw.Workspace
		if err := rows.Scan(&w.ID, &w.Name, &w.CreatedAt, &w.UpdatedAt); err == nil {
			out = append(out, w)
		}
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) CreateWorkspace(c *gin.Context) {
	var b struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&b); err != nil || strings.TrimSpace(b.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace name required"})
		return
	}
	team := middleware.TeamID(c)
	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	id := newID()
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO pw_workspaces (id, name, team_id) VALUES ($1, $2, $3)`, id, b.Name, teamArg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) DeleteWorkspace(c *gin.Context) {
	team := middleware.TeamID(c)
	if !h.workspaceOwnedBy(c, c.Param("id"), team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if _, err := h.DB.Exec(c.Request.Context(),
		`DELETE FROM pw_workspaces WHERE id=$1`, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ── Tree (collections + requests) for one workspace ─────────────────────
func (h *Handler) Tree(c *gin.Context) {
	wsID := c.Param("id")
	team := middleware.TeamID(c)
	if !h.workspaceOwnedBy(c, wsID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	cols, err := h.queryCollections(c, wsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	collIDs := make([]string, 0, len(cols))
	for _, x := range cols {
		collIDs = append(collIDs, x.ID)
	}
	reqs, err := h.queryRequests(c, collIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"collections": cols, "requests": reqs})
}

func (h *Handler) queryCollections(c *gin.Context, wsID string) ([]pw.Collection, error) {
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, workspace_id, parent_id, name, is_folder, position, created_at, updated_at
		   FROM pw_collections WHERE workspace_id=$1 ORDER BY position, created_at`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []pw.Collection{}
	for rows.Next() {
		var x pw.Collection
		var parent *string
		if err := rows.Scan(&x.ID, &x.WorkspaceID, &parent, &x.Name, &x.IsFolder,
			&x.Position, &x.CreatedAt, &x.UpdatedAt); err == nil {
			x.ParentID = parent
			out = append(out, x)
		}
	}
	return out, nil
}

func (h *Handler) queryRequests(c *gin.Context, collIDs []string) ([]pw.Request, error) {
	if len(collIDs) == 0 {
		return []pw.Request{}, nil
	}
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, collection_id, name, method, url, headers, query_params, body_kind, body, auth,
		        tests, pre_script, position, created_at, updated_at
		   FROM pw_requests WHERE collection_id = ANY($1::uuid[]) ORDER BY position, created_at`,
		collIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []pw.Request{}
	for rows.Next() {
		var r pw.Request
		var coll *string
		var headers, query, body, auth []byte
		if err := rows.Scan(&r.ID, &coll, &r.Name, &r.Method, &r.URL, &headers, &query,
			&r.BodyKind, &body, &auth, &r.Tests, &r.PreScript, &r.Position,
			&r.CreatedAt, &r.UpdatedAt); err == nil {
			r.CollectionID = coll
			_ = json.Unmarshal(headers, &r.Headers)
			_ = json.Unmarshal(query, &r.Query)
			_ = json.Unmarshal(body, &r.Body)
			_ = json.Unmarshal(auth, &r.Auth)
			if r.Headers == nil {
				r.Headers = map[string]string{}
			}
			out = append(out, r)
		}
	}
	return out, nil
}

// ── Collection CRUD ─────────────────────────────────────────────────────
func (h *Handler) CreateCollection(c *gin.Context) {
	var b struct {
		WorkspaceID string  `json:"workspace_id"`
		ParentID    *string `json:"parent_id"`
		Name        string  `json:"name"`
		IsFolder    bool    `json:"is_folder"`
	}
	if err := c.ShouldBindJSON(&b); err != nil || b.WorkspaceID == "" || b.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id and name required"})
		return
	}
	team := middleware.TeamID(c)
	if !h.workspaceOwnedBy(c, b.WorkspaceID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	id := newID()
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO pw_collections (id, workspace_id, parent_id, name, is_folder)
		 VALUES ($1, $2, $3, $4, $5)`,
		id, b.WorkspaceID, b.ParentID, b.Name, b.IsFolder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) RenameCollection(c *gin.Context) {
	var b struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&b); err != nil || b.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	team := middleware.TeamID(c)
	if !h.collectionWorkspaceOwnedBy(c, c.Param("id"), team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, err := h.DB.Exec(c.Request.Context(),
		`UPDATE pw_collections SET name=$1, updated_at=NOW() WHERE id=$2`, b.Name, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) DeleteCollection(c *gin.Context) {
	team := middleware.TeamID(c)
	if !h.collectionWorkspaceOwnedBy(c, c.Param("id"), team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, err := h.DB.Exec(c.Request.Context(), `DELETE FROM pw_collections WHERE id=$1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ── Request CRUD ────────────────────────────────────────────────────────
func (h *Handler) CreateRequest(c *gin.Context) {
	var r pw.Request
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if r.Method == "" {
		r.Method = "GET"
	}
	if r.Headers == nil {
		r.Headers = map[string]string{}
	}
	if r.BodyKind == "" {
		r.BodyKind = "none"
	}
	team := middleware.TeamID(c)
	if r.CollectionID == nil || *r.CollectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection_id required"})
		return
	}
	if !h.collectionWorkspaceOwnedBy(c, *r.CollectionID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}
	id := newID()
	if err := h.insertRequest(c, id, r); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) insertRequest(c *gin.Context, id string, r pw.Request) error {
	headers, _ := json.Marshal(r.Headers)
	query, _ := json.Marshal(r.Query)
	body, _ := json.Marshal(r.Body)
	auth, _ := json.Marshal(r.Auth)
	_, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO pw_requests (id, collection_id, name, method, url, headers, query_params,
		                          body_kind, body, auth, tests, pre_script, position)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		id, r.CollectionID, r.Name, r.Method, r.URL, headers, query,
		r.BodyKind, body, auth, r.Tests, r.PreScript, r.Position)
	return err
}

func (h *Handler) UpdateRequest(c *gin.Context) {
	var r pw.Request
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	team := middleware.TeamID(c)
	if !h.requestWorkspaceOwnedBy(c, c.Param("id"), team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// If moving to a different collection, verify ownership of target too.
	if r.CollectionID != nil && *r.CollectionID != "" {
		if !h.collectionWorkspaceOwnedBy(c, *r.CollectionID, team) {
			c.JSON(http.StatusNotFound, gin.H{"error": "target collection not found"})
			return
		}
	}
	headers, _ := json.Marshal(r.Headers)
	query, _ := json.Marshal(r.Query)
	body, _ := json.Marshal(r.Body)
	auth, _ := json.Marshal(r.Auth)
	_, err := h.DB.Exec(c.Request.Context(),
		`UPDATE pw_requests SET collection_id=$1, name=$2, method=$3, url=$4, headers=$5,
		    query_params=$6, body_kind=$7, body=$8, auth=$9, tests=$10, pre_script=$11,
		    updated_at=NOW() WHERE id=$12`,
		r.CollectionID, r.Name, r.Method, r.URL, headers, query, r.BodyKind, body, auth,
		r.Tests, r.PreScript, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) DeleteRequest(c *gin.Context) {
	team := middleware.TeamID(c)
	if !h.requestWorkspaceOwnedBy(c, c.Param("id"), team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, err := h.DB.Exec(c.Request.Context(), `DELETE FROM pw_requests WHERE id=$1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ── Send ─────────────────────────────────────────────────────────────────
func (h *Handler) Send(c *gin.Context) {
	var b struct {
		Request     pw.Request        `json:"request"`
		Vars        map[string]string `json:"vars"`
		SaveHistory *bool             `json:"save_history"` // nil → default true
	}
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	team := middleware.TeamID(c)
	if b.Request.ID != "" && !h.requestWorkspaceOwnedBy(c, b.Request.ID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	res := pw.Send(c.Request.Context(), b.Request, b.Vars)

	// Persist a small history snapshot, scoped to team — but only when the
	// caller hasn't opted out. The Runner sets save_history=false at lakh-
	// scale so a single user can't bloat pw_history with hundreds of
	// thousands of rows and starve the DB for everyone else.
	saveHistory := b.SaveHistory == nil || *b.SaveHistory
	if saveHistory {
		reqSnap, _ := json.Marshal(b.Request)
		respSnap, _ := json.Marshal(res)
		var reqIDArg interface{}
		if b.Request.ID != "" {
			reqIDArg = b.Request.ID
		}
		var teamArg interface{}
		if team != "" {
			teamArg = team
		}
		_, _ = h.DB.Exec(c.Request.Context(),
			`INSERT INTO pw_history (request_id, method, url, status, duration_ms, response_bytes,
			                          request_snapshot, response_snapshot, team_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			reqIDArg, b.Request.Method, b.Request.URL, res.Status,
			res.DurationMs, res.SizeBytes, reqSnap, respSnap, teamArg)
	}

	c.JSON(http.StatusOK, res)
}

// ── Import / export ─────────────────────────────────────────────────────
func (h *Handler) Import(c *gin.Context) {
	wsID := c.Query("workspace_id")
	if wsID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}
	team := middleware.TeamID(c)
	if !h.workspaceOwnedBy(c, wsID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read body"})
		return
	}
	rootName, nodes, err := pw.ParsePostman(body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Insert root collection
	rootID := newID()
	if _, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO pw_collections (id, workspace_id, name, is_folder) VALUES ($1, $2, $3, false)`,
		rootID, wsID, rootName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Walk nodes; build index map ix → uuid for parent lookup
	ids := make([]string, len(nodes))
	folders, requests := 0, 0
	for i, n := range nodes {
		var parentColl string
		if n.ParentIx >= 0 {
			parentColl = ids[n.ParentIx]
		} else {
			parentColl = rootID
		}
		if n.IsFolder {
			ids[i] = newID()
			if _, err := h.DB.Exec(c.Request.Context(),
				`INSERT INTO pw_collections (id, workspace_id, parent_id, name, is_folder)
				 VALUES ($1, $2, $3, $4, true)`,
				ids[i], wsID, parentColl, n.Name); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			folders++
		} else if n.Request != nil {
			rid := newID()
			ids[i] = rid
			r := *n.Request
			r.CollectionID = &parentColl
			if err := h.insertRequest(c, rid, r); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			requests++
		}
	}

	res := pw.ImportResult{WorkspaceID: wsID, CollectionID: rootID}
	res.Counts.Folders = folders
	res.Counts.Requests = requests
	c.JSON(http.StatusOK, res)
}

func (h *Handler) Export(c *gin.Context) {
	rootID := c.Param("id")
	team := middleware.TeamID(c)
	if !h.collectionWorkspaceOwnedBy(c, rootID, team) {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	// Load just the subtree under this collection.
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT name, workspace_id FROM pw_collections WHERE id=$1`, rootID)
	var rootName, wsID string
	if err := row.Scan(&rootName, &wsID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	cols, err := h.queryCollections(c, wsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Filter to descendants of rootID.
	keep := map[string]bool{rootID: true}
	changed := true
	for changed {
		changed = false
		for _, x := range cols {
			if x.ParentID != nil && keep[*x.ParentID] && !keep[x.ID] {
				keep[x.ID] = true
				changed = true
			}
		}
	}
	subtree := []pw.Collection{}
	for _, x := range cols {
		if keep[x.ID] && x.ID != rootID {
			subtree = append(subtree, x)
		}
	}

	// Requests for the root + all descendants.
	collIDs := []string{rootID}
	for _, x := range subtree {
		collIDs = append(collIDs, x.ID)
	}
	reqs, err := h.queryRequests(c, collIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byColl := map[string][]pw.Request{}
	for _, r := range reqs {
		key := ""
		if r.CollectionID != nil {
			key = *r.CollectionID
		}
		byColl[key] = append(byColl[key], r)
	}

	doc, err := pw.ExportCollection(rootID, rootName, subtree, byColl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="`+sanitizeFilename(rootName)+`.postman_collection.json"`)
	c.Data(http.StatusOK, "application/json", doc)
}

func sanitizeFilename(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z',
			c >= 'A' && c <= 'Z',
			c >= '0' && c <= '9',
			c == '-' || c == '_' || c == '.':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "collection"
	}
	return string(out)
}

// ── History ─────────────────────────────────────────────────────────────
func (h *Handler) History(c *gin.Context) {
	team := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT method, url, status, duration_ms, response_bytes, ran_at
		   FROM pw_history WHERE team_id=$1 ORDER BY ran_at DESC LIMIT 50`, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type item struct {
		Method        string `json:"method"`
		URL           string `json:"url"`
		Status        int    `json:"status"`
		DurationMs    int    `json:"duration_ms"`
		ResponseBytes int    `json:"response_bytes"`
		RanAt         string `json:"ran_at"`
	}
	out := []item{}
	for rows.Next() {
		var i item
		var t time.Time
		if err := rows.Scan(&i.Method, &i.URL, &i.Status, &i.DurationMs, &i.ResponseBytes, &t); err != nil {
			continue
		}
		i.RanAt = t.Format(time.RFC3339)
		out = append(out, i)
	}
	c.JSON(http.StatusOK, out)
}
