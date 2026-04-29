package postwomen

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxBodyBytes = 2 * 1024 * 1024 // 2 MB cap on the captured response body

var sharedClient = &http.Client{
	Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout: 10 * time.Second,
		MaxIdleConnsPerHost: 32,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, // mirrors APIStress engine
	},
	Timeout: 60 * time.Second,
}

// Send fires a single HTTP request and returns a captured SendResult.
// vars is the active environment for `{{var}}` substitution.
func Send(ctx context.Context, req Request, vars map[string]string) SendResult {
	out := SendResult{Headers: map[string][]string{}}
	start := time.Now()

	// 1. Substitute {{vars}} in URL, headers, body, auth.
	subURL := substitute(req.URL, vars)

	// 2. Append query params (enabled only).
	parsed, err := url.Parse(subURL)
	if err != nil {
		out.Error = "Invalid URL: " + err.Error()
		out.DurationMs = int(time.Since(start).Milliseconds())
		return out
	}
	q := parsed.Query()
	for _, p := range req.Query {
		if p.Enabled && p.Key != "" {
			q.Add(substitute(p.Key, vars), substitute(p.Value, vars))
		}
	}
	parsed.RawQuery = q.Encode()

	// 3. Build body.
	var bodyReader io.Reader
	contentType := ""
	switch req.BodyKind {
	case "raw", "json":
		raw := substitute(req.Body.Raw, vars)
		if raw != "" {
			bodyReader = strings.NewReader(raw)
		}
		contentType = req.Body.ContentType
		if req.BodyKind == "json" && contentType == "" {
			contentType = "application/json"
		}
	case "urlencoded":
		v := url.Values{}
		for _, f := range req.Body.Form {
			if f.Enabled {
				v.Add(substitute(f.Key, vars), substitute(f.Value, vars))
			}
		}
		bodyReader = strings.NewReader(v.Encode())
		contentType = "application/x-www-form-urlencoded"
	case "form-data":
		buf := &strings.Builder{}
		mw := multipart.NewWriter(stringBuilderWriter{buf})
		for _, f := range req.Body.Form {
			if !f.Enabled {
				continue
			}
			_ = mw.WriteField(substitute(f.Key, vars), substitute(f.Value, vars))
		}
		_ = mw.Close()
		bodyReader = strings.NewReader(buf.String())
		contentType = mw.FormDataContentType()
	case "graphql":
		if req.Body.GraphQL != nil {
			payload := map[string]interface{}{
				"query":     substitute(req.Body.GraphQL.Query, vars),
				"variables": req.Body.GraphQL.Variables,
			}
			if b, err := json.Marshal(payload); err == nil {
				bodyReader = strings.NewReader(string(b))
				contentType = "application/json"
			}
		}
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, parsed.String(), bodyReader)
	if err != nil {
		out.Error = err.Error()
		out.DurationMs = int(time.Since(start).Milliseconds())
		return out
	}

	// 4. Headers.
	for k, v := range req.Headers {
		if k == "" {
			continue
		}
		httpReq.Header.Set(substitute(k, vars), substitute(v, vars))
	}
	if contentType != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", contentType)
	}

	// 5. Auth.
	applyAuth(httpReq, req.Auth, vars)

	// 6. Fire.
	resp, err := sharedClient.Do(httpReq)
	out.DurationMs = int(time.Since(start).Milliseconds())
	if err != nil {
		out.Error = friendly(err)
		return out
	}
	defer resp.Body.Close()

	// 7. Capture response.
	out.Status = resp.StatusCode
	out.StatusText = resp.Status
	out.Headers = resp.Header
	for _, c := range resp.Cookies() {
		out.Cookies = append(out.Cookies, c.String())
	}
	limited := io.LimitReader(resp.Body, maxBodyBytes+1)
	bodyBytes, _ := io.ReadAll(limited)
	if len(bodyBytes) > maxBodyBytes {
		out.BodyTrunc = true
		bodyBytes = bodyBytes[:maxBodyBytes]
	}
	out.Body = string(bodyBytes)
	out.SizeBytes = len(bodyBytes)
	return out
}

func applyAuth(req *http.Request, a Auth, vars map[string]string) {
	switch a.Kind {
	case "bearer":
		t := strings.TrimSpace(substitute(a.Token, vars))
		if t != "" {
			req.Header.Set("Authorization", "Bearer "+t)
		}
	case "basic":
		u := substitute(a.User, vars)
		p := substitute(a.Pass, vars)
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(u+":"+p)))
	case "api_key":
		k := substitute(a.Key, vars)
		v := substitute(a.Value, vars)
		if k == "" {
			return
		}
		if a.In == "query" {
			q := req.URL.Query()
			q.Set(k, v)
			req.URL.RawQuery = q.Encode()
		} else {
			req.Header.Set(k, v)
		}
	}
}

// substitute replaces `{{var}}` placeholders with values from the env map.
// Unknown vars are left as-is (so the user can see what wasn't resolved).
func substitute(s string, vars map[string]string) string {
	if s == "" || len(vars) == 0 || !strings.Contains(s, "{{") {
		return s
	}
	out := s
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

func friendly(err error) string {
	msg := err.Error()
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "no such host"):
		return "Hostname could not be resolved (DNS lookup failed)."
	case strings.Contains(low, "connection refused"):
		return "Connection refused — nothing is listening on that host:port."
	case strings.Contains(low, "i/o timeout"), strings.Contains(low, "timeout"):
		return "Network timeout — the server is slow or unreachable."
	case strings.Contains(low, "x509"), strings.Contains(low, "certificate"):
		return "TLS/SSL handshake failed (bad certificate)."
	case strings.Contains(low, "unsupported protocol scheme"):
		return "URL is missing a scheme. Add http:// or https://."
	default:
		return msg
	}
}

// stringBuilderWriter adapts a *strings.Builder to io.Writer.
type stringBuilderWriter struct{ b *strings.Builder }

func (w stringBuilderWriter) Write(p []byte) (int, error) { return w.b.Write(p) }
