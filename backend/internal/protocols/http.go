package protocols

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/engine"
)

// friendlyError converts low-level net/url errors into messages that a
// non-engineer can understand. These show up in the live UI and reports.
func friendlyError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	low := strings.ToLower(msg)

	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		// Strip the leading "Get \"…\":" wrapper Go adds.
		msg = urlErr.Err.Error()
		low = strings.ToLower(msg)
	}

	switch {
	case errors.Is(err, context.DeadlineExceeded), strings.Contains(low, "deadline exceeded"):
		return "Request timed out — the server didn't respond in time."
	case errors.Is(err, context.Canceled):
		return "Request cancelled (test stopped)."
	case strings.Contains(low, "no such host"):
		return "Hostname could not be resolved (DNS lookup failed). Check the URL is correct."
	case strings.Contains(low, "connection refused"):
		return "Connection refused — nothing is listening on that host:port."
	case strings.Contains(low, "connection reset"):
		return "Connection reset by the server. It may be overloaded or rejecting traffic."
	case strings.Contains(low, "i/o timeout"), strings.Contains(low, "timeout"):
		return "Network timeout — the server is slow or unreachable."
	case strings.Contains(low, "tls"), strings.Contains(low, "x509"), strings.Contains(low, "certificate"):
		return "TLS/SSL handshake failed (bad certificate or HTTPS misconfig)."
	case strings.Contains(low, "eof"):
		return "Server closed the connection before responding."
	case strings.Contains(low, "unsupported protocol scheme"), strings.Contains(low, "missing scheme"):
		return "URL is missing a scheme. Add http:// or https:// at the start."
	case strings.Contains(low, "invalid url"), strings.Contains(low, "parse "):
		return "URL is malformed. Double-check spelling, quotes, and encoding."
	case strings.Contains(low, "network is unreachable"):
		return "Network unreachable from this server."
	default:
		return "Request failed: " + msg
	}
}

type HTTPExecutor struct {
	cfg    *engine.TestConfig
	client *http.Client
}

func NewHTTPExecutor(cfg *engine.TestConfig) (*HTTPExecutor, error) {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          0,
		MaxIdleConnsPerHost:   2048,
		MaxConnsPerHost:       0,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
		DisableCompression:    false,
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   time.Duration(cfg.Request.Timeout) * time.Millisecond,
	}
	return &HTTPExecutor{cfg: cfg, client: client}, nil
}

func (e *HTTPExecutor) Execute(ctx context.Context) engine.Result {
	r := engine.Result{StartedAt: time.Now()}
	req, err := http.NewRequestWithContext(
		ctx,
		strings.ToUpper(e.cfg.Request.Method),
		e.cfg.Request.URL,
		strings.NewReader(e.cfg.Request.Body),
	)
	if err != nil {
		r.Err = friendlyError(err)
		r.DurationUs = time.Since(r.StartedAt).Microseconds()
		return r
	}
	for k, v := range e.cfg.Request.Headers {
		req.Header.Set(k, v)
	}
	if e.cfg.Request.Body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	r.BytesOut = int64(len(e.cfg.Request.Body))

	resp, err := e.client.Do(req)
	if err != nil {
		r.Err = friendlyError(err)
		r.DurationUs = time.Since(r.StartedAt).Microseconds()
		return r
	}
	defer resp.Body.Close()

	n, _ := io.Copy(io.Discard, resp.Body)
	r.BytesIn = n
	r.Status = resp.StatusCode
	r.DurationUs = time.Since(r.StartedAt).Microseconds()
	return r
}

func (e *HTTPExecutor) Close() {
	if t, ok := e.client.Transport.(*http.Transport); ok {
		t.CloseIdleConnections()
	}
}
