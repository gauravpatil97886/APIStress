package postwomen

import "time"

type Workspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Collection struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	ParentID    *string   `json:"parent_id,omitempty"`
	Name        string    `json:"name"`
	IsFolder    bool      `json:"is_folder"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// QueryParam is one row of the URL ? query string.
type QueryParam struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// BodyKind: "none" | "raw" | "json" | "form-data" | "urlencoded" | "graphql".
type Body struct {
	Raw         string            `json:"raw,omitempty"`
	ContentType string            `json:"content_type,omitempty"`   // for raw / json
	Form        []FormField       `json:"form,omitempty"`           // for form-data / urlencoded
	GraphQL     *GraphQLBody      `json:"graphql,omitempty"`
}

type FormField struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Type    string `json:"type"` // text | file
	Enabled bool   `json:"enabled"`
}

type GraphQLBody struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

// Auth: "none" | "bearer" | "basic" | "api_key".
type Auth struct {
	Kind  string            `json:"kind"`
	Token string            `json:"token,omitempty"`     // bearer
	User  string            `json:"username,omitempty"`  // basic
	Pass  string            `json:"password,omitempty"`  // basic
	Key   string            `json:"key,omitempty"`       // api_key
	Value string            `json:"value,omitempty"`     // api_key
	In    string            `json:"in,omitempty"`        // header | query (api_key)
	Extra map[string]string `json:"extra,omitempty"`
}

type Request struct {
	ID           string            `json:"id"`
	CollectionID *string           `json:"collection_id,omitempty"`
	Name         string            `json:"name"`
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Headers      map[string]string `json:"headers"`
	Query        []QueryParam      `json:"query"`
	BodyKind     string            `json:"body_kind"`
	Body         Body              `json:"body"`
	Auth         Auth              `json:"auth"`
	Tests        string            `json:"tests"`
	PreScript    string            `json:"pre_script"`
	Position     int               `json:"position"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

// SendResult is what the executor returns when a request is sent.
type SendResult struct {
	Status     int                 `json:"status"`
	StatusText string              `json:"status_text"`
	DurationMs int                 `json:"duration_ms"`
	SizeBytes  int                 `json:"size_bytes"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body"`
	BodyTrunc  bool                `json:"body_truncated"`
	Cookies    []string            `json:"cookies"`
	Error      string              `json:"error,omitempty"`
}
