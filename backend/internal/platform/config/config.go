package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	HTTPAddr      string
	PostgresDSN   string
	AccessKey     string
	MaxVUs        int
	ResultBufSize int
	LogDir        string
	LogLevel      string
	LogPretty     bool
	AdminKey      string

	// Jira integration — used by the "Attach report to Jira" feature.
	// All fields blank = feature disabled, /api/jira/health returns
	// {configured: false}, the UI hides its "Attach to Jira" button.
	JiraBaseURL    string // e.g. https://choicetechlab.atlassian.net
	JiraAuthKind   string // "cloud_basic" (email + API token) | "server_pat" (Bearer PAT)
	JiraEmail      string // only for cloud_basic
	JiraAPIToken   string // API token (cloud) or PAT (server)
	JiraProjectKey string // optional — restrict attaches to this project (e.g. "CT")

	// Hardening knobs
	// AllowedOrigins is the CORS allow-list, comma-separated. Empty =
	// dev fallback (allow-all). Set in production.
	AllowedOrigins []string
	// MaxRequestBytes caps every JSON / form / curl-string body. 32 MiB
	// is enough for a Postman collection import while still being a
	// hard stop on runaway uploads.
	MaxRequestBytes int64
	// KavachAllowPrivate disables the SSRF gate that otherwise refuses
	// targets resolving to loopback / RFC1918 / link-local. Only enable
	// for internal-only deployments where probing internal infra is the
	// stated intent.
	KavachAllowPrivate bool
	// GinMode lets ops force a specific Gin mode (release|debug|test).
	// Defaults to "release" — debug mode leaks route tables on stdout.
	GinMode string
}

func Load() (*Config, error) {
	cfg := &Config{
		HTTPAddr:      env("CH_HTTP_ADDR", ":8080"),
		PostgresDSN:   env("CH_POSTGRES_DSN", "postgres://choicehammer:choicehammer@localhost:5432/choicehammer?sslmode=disable"),
		AccessKey:     env("CH_ACCESS_KEY", "choicehammer-dev-key"),
		MaxVUs:        envInt("CH_MAX_VUS", 50000),
		ResultBufSize: envInt("CH_RESULT_BUF_SIZE", 65536),
		LogDir:        env("CH_LOG_DIR", "logs"),
		LogLevel:      env("CH_LOG_LEVEL", "info"),
		LogPretty:     env("CH_LOG_PRETTY", "true") == "true",
		AdminKey:      env("CH_ADMIN_KEY", "97886"),

		JiraBaseURL:    env("CH_JIRA_BASE_URL", ""),
		JiraAuthKind:   env("CH_JIRA_AUTH_KIND", "cloud_basic"),
		JiraEmail:      env("CH_JIRA_EMAIL", ""),
		JiraAPIToken:   env("CH_JIRA_API_TOKEN", ""),
		JiraProjectKey: env("CH_JIRA_PROJECT_KEY", ""),

		AllowedOrigins:     splitCSV(env("CH_ALLOWED_ORIGINS", "")),
		MaxRequestBytes:    int64(envInt("CH_MAX_REQUEST_BYTES", 32*1024*1024)),
		KavachAllowPrivate: env("CH_KAVACH_ALLOW_PRIVATE", "false") == "true",
		GinMode:            env("CH_GIN_MODE", "release"),
	}
	if cfg.AccessKey == "" {
		return nil, fmt.Errorf("CH_ACCESS_KEY must be set")
	}
	return cfg, nil
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
