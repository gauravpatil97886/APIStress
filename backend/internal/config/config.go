package config

import (
	"fmt"
	"os"
	"strconv"
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
	}
	if cfg.AccessKey == "" {
		return nil, fmt.Errorf("CH_ACCESS_KEY must be set")
	}
	return cfg, nil
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
