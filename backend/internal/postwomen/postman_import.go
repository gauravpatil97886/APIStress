package postwomen

import (
	"encoding/json"
	"fmt"
)

// Postman v2.1 (subset) — we accept the most common shapes.
type postmanCollection struct {
	Info struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	} `json:"info"`
	Item []postmanItem `json:"item"`
}

type postmanItem struct {
	Name    string         `json:"name"`
	Item    []postmanItem  `json:"item,omitempty"`    // folder
	Request *postmanReq    `json:"request,omitempty"` // leaf
}

type postmanReq struct {
	Method string             `json:"method"`
	Header []postmanKV        `json:"header"`
	URL    json.RawMessage    `json:"url"` // can be string or object
	Body   *postmanBody       `json:"body"`
	Auth   *postmanAuth       `json:"auth"`
}

type postmanKV struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
}

type postmanURL struct {
	Raw   string      `json:"raw"`
	Query []postmanKV `json:"query"`
}

type postmanBody struct {
	Mode       string             `json:"mode"`
	Raw        string             `json:"raw"`
	URLEncoded []postmanKV        `json:"urlencoded"`
	FormData   []postmanKV        `json:"formdata"`
	GraphQL    *postmanGraphQL    `json:"graphql"`
	Options    *postmanBodyOpts   `json:"options"`
}

type postmanGraphQL struct {
	Query     string                 `json:"query"`
	Variables string                 `json:"variables"`
}

type postmanBodyOpts struct {
	Raw struct {
		Language string `json:"language"`
	} `json:"raw"`
}

type postmanAuth struct {
	Type   string      `json:"type"`
	Bearer []postmanKV `json:"bearer"`
	Basic  []postmanKV `json:"basic"`
	APIKey []postmanKV `json:"apikey"`
}

// ImportResult is what handlers return after a successful import.
type ImportResult struct {
	WorkspaceID  string `json:"workspace_id,omitempty"`
	CollectionID string `json:"collection_id"`
	Counts       struct {
		Folders  int `json:"folders"`
		Requests int `json:"requests"`
	} `json:"counts"`
}

// FlatNode is what the parser emits — caller persists it.
type FlatNode struct {
	IsFolder bool
	Name     string
	ParentIx int       // -1 = root
	Request  *Request  // nil when IsFolder
}

// ParsePostman accepts JSON and returns a flat list ready for insertion.
func ParsePostman(data []byte) (root string, nodes []FlatNode, err error) {
	var col postmanCollection
	if err = json.Unmarshal(data, &col); err != nil {
		return "", nil, fmt.Errorf("not a Postman collection JSON: %w", err)
	}
	if col.Info.Name == "" {
		return "", nil, fmt.Errorf("missing collection name")
	}
	root = col.Info.Name
	walkPostman(col.Item, -1, &nodes)
	return root, nodes, nil
}

func walkPostman(items []postmanItem, parentIx int, out *[]FlatNode) {
	for _, it := range items {
		if len(it.Item) > 0 {
			ix := len(*out)
			*out = append(*out, FlatNode{IsFolder: true, Name: it.Name, ParentIx: parentIx})
			walkPostman(it.Item, ix, out)
			continue
		}
		if it.Request == nil {
			continue
		}
		req := convertPostmanRequest(it.Name, it.Request)
		*out = append(*out, FlatNode{Name: it.Name, ParentIx: parentIx, Request: &req})
	}
}

func convertPostmanRequest(name string, p *postmanReq) Request {
	r := Request{
		Name:     name,
		Method:   p.Method,
		Headers:  map[string]string{},
		Query:    []QueryParam{},
		BodyKind: "none",
	}
	// URL can be a plain string OR a structured object
	if len(p.URL) > 0 {
		var asString string
		if err := json.Unmarshal(p.URL, &asString); err == nil {
			r.URL = asString
		} else {
			var u postmanURL
			if err := json.Unmarshal(p.URL, &u); err == nil {
				r.URL = u.Raw
				for _, q := range u.Query {
					r.Query = append(r.Query, QueryParam{Key: q.Key, Value: q.Value, Enabled: !q.Disabled})
				}
			}
		}
	}
	for _, h := range p.Header {
		if h.Disabled || h.Key == "" {
			continue
		}
		r.Headers[h.Key] = h.Value
	}
	if p.Body != nil {
		switch p.Body.Mode {
		case "raw":
			r.BodyKind = "raw"
			r.Body.Raw = p.Body.Raw
			if p.Body.Options != nil && p.Body.Options.Raw.Language == "json" {
				r.BodyKind = "json"
				r.Body.ContentType = "application/json"
			}
		case "urlencoded":
			r.BodyKind = "urlencoded"
			for _, f := range p.Body.URLEncoded {
				r.Body.Form = append(r.Body.Form, FormField{
					Key: f.Key, Value: f.Value, Type: "text", Enabled: !f.Disabled,
				})
			}
		case "formdata":
			r.BodyKind = "form-data"
			for _, f := range p.Body.FormData {
				r.Body.Form = append(r.Body.Form, FormField{
					Key: f.Key, Value: f.Value, Type: "text", Enabled: !f.Disabled,
				})
			}
		case "graphql":
			if p.Body.GraphQL != nil {
				r.BodyKind = "graphql"
				r.Body.GraphQL = &GraphQLBody{
					Query:     p.Body.GraphQL.Query,
					Variables: map[string]interface{}{},
				}
				_ = json.Unmarshal([]byte(p.Body.GraphQL.Variables), &r.Body.GraphQL.Variables)
			}
		}
	}
	if p.Auth != nil {
		switch p.Auth.Type {
		case "bearer":
			r.Auth.Kind = "bearer"
			r.Auth.Token = pickValue(p.Auth.Bearer, "token")
		case "basic":
			r.Auth.Kind = "basic"
			r.Auth.User = pickValue(p.Auth.Basic, "username")
			r.Auth.Pass = pickValue(p.Auth.Basic, "password")
		case "apikey":
			r.Auth.Kind = "api_key"
			r.Auth.Key = pickValue(p.Auth.APIKey, "key")
			r.Auth.Value = pickValue(p.Auth.APIKey, "value")
			r.Auth.In = pickValue(p.Auth.APIKey, "in")
		}
	}
	return r
}

func pickValue(kvs []postmanKV, key string) string {
	for _, kv := range kvs {
		if kv.Key == key {
			return kv.Value
		}
	}
	return ""
}
