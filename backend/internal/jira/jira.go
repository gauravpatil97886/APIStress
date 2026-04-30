// Package jira is a tiny HTTP client for the two Jira operations the
// platform actually needs: attach a file to an issue and add a comment.
//
// Two auth modes:
//   - "cloud_basic" — Atlassian Cloud, Basic auth using email + API token.
//   - "server_pat"  — Self-hosted Jira Server / Data Center, Bearer PAT.
//
// All endpoints are resilient to either Jira REST v2 or v3 — for our needs
// (attach + comment) v2 is the lowest common denominator and we use it.
package jira

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const (
	AuthCloudBasic = "cloud_basic"
	AuthServerPAT  = "server_pat"
)

type Client struct {
	BaseURL    string
	AuthKind   string
	Email      string
	APIToken   string
	ProjectKey string
	HTTP       *http.Client
}

// New builds a client. Returns nil + ok=false when the integration isn't
// configured (BaseURL or APIToken missing) so callers can short-circuit.
func New(baseURL, authKind, email, token, projectKey string) (*Client, bool) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" || token == "" {
		return nil, false
	}
	if authKind == "" {
		authKind = AuthCloudBasic
	}
	return &Client{
		BaseURL:    baseURL,
		AuthKind:   authKind,
		Email:      strings.TrimSpace(email),
		APIToken:   token,
		ProjectKey: strings.TrimSpace(projectKey),
		HTTP:       &http.Client{Timeout: 30 * time.Second},
	}, true
}

func (c *Client) authHeader() string {
	switch c.AuthKind {
	case AuthServerPAT:
		return "Bearer " + c.APIToken
	default: // AuthCloudBasic
		raw := c.Email + ":" + c.APIToken
		return "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))
	}
}

// ValidateProject returns an error if a configured project key restricts
// attaches and the issue isn't in it. No-op when CH_JIRA_PROJECT_KEY is empty.
func (c *Client) ValidateProject(issueKey string) error {
	if c.ProjectKey == "" {
		return nil
	}
	prefix := strings.ToUpper(c.ProjectKey) + "-"
	if !strings.HasPrefix(strings.ToUpper(issueKey), prefix) {
		return fmt.Errorf("issue %s is outside the allowed project %s", issueKey, c.ProjectKey)
	}
	return nil
}

// Health pings the API and verifies the credentials are usable.
// Cloud's `/rest/api/3/myself` and Server's `/rest/api/2/myself` both work
// for self-introspection.
func (c *Client) Health(ctx context.Context) (map[string]any, error) {
	url := c.BaseURL + "/rest/api/2/myself"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("jira health %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	out := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out, nil
}

// IssueExists checks whether a key (e.g. CT-123) resolves. Used to give the
// frontend a sharper error than "404 from Jira" when a typo is supplied.
func (c *Client) IssueExists(ctx context.Context, key string) (bool, error) {
	_, err := c.GetIssue(ctx, key)
	if err != nil {
		if strings.Contains(err.Error(), "404") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// IssueInfo is the small slice of issue fields the comment builder + the
// frontend assignee preview need. AccountID is non-empty for Cloud; Name is
// the username on Server. Use `[~accountid:xxxx]` (Cloud) or `[~name]`
// (Server) to mention the user in a Jira comment.
type IssueInfo struct {
	Key                string `json:"key"`
	Summary            string `json:"summary"`
	Status             string `json:"status,omitempty"`
	IssueType          string `json:"issue_type,omitempty"`
	Priority           string `json:"priority,omitempty"`
	URL                string `json:"url,omitempty"`
	AssigneeName       string `json:"assignee_name,omitempty"`
	AssigneeEmail      string `json:"assignee_email,omitempty"`
	AssigneeAvatar     string `json:"assignee_avatar,omitempty"` // 48x48 PNG URL
	AssigneeMention    string `json:"-"`                         // not for the wire — backend-only
}

// GetIssue fetches summary + assignee + status + priority. Returns a user-
// friendly error wrapping the Jira HTTP status so callers can branch on 404.
func (c *Client) GetIssue(ctx context.Context, key string) (*IssueInfo, error) {
	url := c.BaseURL + "/rest/api/2/issue/" + key +
		"?fields=summary,assignee,status,issuetype,priority"
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("404: issue %s not found", key)
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("issue lookup %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	var raw struct {
		Fields struct {
			Summary string `json:"summary"`
			Status struct {
				Name string `json:"name"`
			} `json:"status"`
			IssueType struct {
				Name string `json:"name"`
			} `json:"issuetype"`
			Priority struct {
				Name string `json:"name"`
			} `json:"priority"`
			Assignee struct {
				AccountID    string            `json:"accountId"`   // Cloud
				Name         string            `json:"name"`        // Server
				DisplayName  string            `json:"displayName"`
				EmailAddress string            `json:"emailAddress"`
				AvatarURLs   map[string]string `json:"avatarUrls"`
			} `json:"assignee"`
		} `json:"fields"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	info := &IssueInfo{
		Key:           key,
		Summary:       raw.Fields.Summary,
		Status:        raw.Fields.Status.Name,
		IssueType:     raw.Fields.IssueType.Name,
		Priority:      raw.Fields.Priority.Name,
		URL:           c.BaseURL + "/browse/" + key,
		AssigneeName:  raw.Fields.Assignee.DisplayName,
		AssigneeEmail: raw.Fields.Assignee.EmailAddress,
	}
	// Pick the largest avatar Jira returned (48x48 > 32 > 24 > 16).
	for _, sz := range []string{"48x48", "32x32", "24x24", "16x16"} {
		if u := raw.Fields.Assignee.AvatarURLs[sz]; u != "" {
			info.AssigneeAvatar = u
			break
		}
	}
	if raw.Fields.Assignee.AccountID != "" {
		info.AssigneeMention = "[~accountid:" + raw.Fields.Assignee.AccountID + "]"
	} else if raw.Fields.Assignee.Name != "" {
		info.AssigneeMention = "[~" + raw.Fields.Assignee.Name + "]"
	}
	return info, nil
}

// Attach uploads a single file to a Jira issue. Jira's attachments endpoint
// requires the X-Atlassian-Token: no-check header to bypass XSRF for
// programmatic uploads.
func (c *Client) Attach(ctx context.Context, issueKey, filename string, content []byte, mime string) error {
	if err := c.ValidateProject(issueKey); err != nil {
		return err
	}
	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	h := make(map[string][]string)
	h["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="file"; filename=%q`, filename)}
	if mime != "" {
		h["Content-Type"] = []string{mime}
	}
	part, err := mw.CreatePart(h)
	if err != nil {
		return err
	}
	if _, err := part.Write(content); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}

	url := c.BaseURL + "/rest/api/2/issue/" + issueKey + "/attachments"
	req, _ := http.NewRequestWithContext(ctx, "POST", url, body)
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("X-Atlassian-Token", "no-check")
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("attach %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}
	return nil
}

// CreateIssue files a NEW Jira issue. Used by Kavach's per-finding flow
// where each finding becomes its own ticket.
//
// projectKey: project the issue is filed under (e.g. "CT"). If the client
// has CH_JIRA_PROJECT_KEY locked, projectKey must match.
// issueType: "Bug" / "Task" / "Story" — the human label of an issue type
// configured on the project.
// summary: title of the new issue.
// body: wiki-text description (v2 API).
// priority: optional; "Highest" / "High" / "Medium" / "Low" / "Lowest". Empty = no priority.
// labels: optional list of labels.
type CreatedIssue struct {
	Key string `json:"key"`
	URL string `json:"url"`
}

func (c *Client) CreateIssue(ctx context.Context, projectKey, issueType, summary, body, priority string, labels []string) (*CreatedIssue, error) {
	if c.ProjectKey != "" && !strings.EqualFold(projectKey, c.ProjectKey) {
		return nil, fmt.Errorf("issue must be filed under project %s (server-locked)", c.ProjectKey)
	}
	fields := map[string]interface{}{
		"project":   map[string]interface{}{"key": strings.ToUpper(projectKey)},
		"issuetype": map[string]interface{}{"name": issueType},
		"summary":   summary,
		"description": body,
	}
	if priority != "" {
		fields["priority"] = map[string]interface{}{"name": priority}
	}
	if len(labels) > 0 {
		// Jira labels can't contain spaces; normalise.
		safe := make([]string, 0, len(labels))
		for _, l := range labels {
			l = strings.ReplaceAll(strings.TrimSpace(l), " ", "-")
			if l != "" {
				safe = append(safe, l)
			}
		}
		fields["labels"] = safe
	}
	payload, _ := json.Marshal(map[string]interface{}{"fields": fields})

	url := c.BaseURL + "/rest/api/2/issue"
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("create issue %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}
	var out struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &CreatedIssue{Key: out.Key, URL: c.BaseURL + "/browse/" + out.Key}, nil
}

// Comment posts a plain-text comment to an issue. We deliberately use the v2
// API which accepts `{"body": "string"}` — the v3 ADF format would force us
// to ship a doc tree, and our use-case (a one-paragraph summary + URL) reads
// the same in plain text.
func (c *Client) Comment(ctx context.Context, issueKey, body string) error {
	if err := c.ValidateProject(issueKey); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"body": body})
	url := c.BaseURL + "/rest/api/2/issue/" + issueKey + "/comment"
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("comment %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}
