package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/platform/curl"
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
	"github.com/spf13/cobra"
)

var (
	apiURL    string
	accessKey string
)

func main() {
	root := &cobra.Command{
		Use:   "hammer",
		Short: "APIStress CLI — fire load tests at your APIs",
	}
	root.PersistentFlags().StringVar(&apiURL, "api", envOr("CH_API", "http://localhost:8080"), "ChoiceHammer API base URL")
	root.PersistentFlags().StringVar(&accessKey, "key", envOr("CH_ACCESS_KEY", ""), "Access key")

	root.AddCommand(runCmd(), statusCmd(), reportCmd(), listCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func runCmd() *cobra.Command {
	var (
		curlStr   string
		url       string
		method    string
		vus       int
		duration  int
		pattern   string
		thinkMs   int
		createdBy string
		jiraID    string
		jiraLink  string
		notes     string
		watch     bool
	)
	cmd := &cobra.Command{
		Use:   "run",
		Short: "Start a new load test",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := &engine.TestConfig{
				Name:        fmt.Sprintf("cli-run-%d", time.Now().Unix()),
				Protocol:    engine.ProtoHTTP,
				VUs:         vus,
				DurationSec: duration,
				Pattern:     engine.LoadPattern(pattern),
				ThinkTimeMs: thinkMs,
			}
			if curlStr != "" {
				req, err := curl.Parse(curlStr)
				if err != nil {
					return err
				}
				cfg.Request = *req
			} else if url != "" {
				cfg.Request = engine.HTTPRequest{Method: strings.ToUpper(method), URL: url, Headers: map[string]string{}, Timeout: 30000}
			} else {
				return fmt.Errorf("provide --url or --curl")
			}
			if createdBy == "" {
				return fmt.Errorf("--by (your name) is required")
			}
			if jiraID == "" && jiraLink == "" {
				return fmt.Errorf("--jira or --jira-link is required")
			}
			body := map[string]interface{}{
				"config":     cfg,
				"created_by": createdBy,
				"jira_id":    jiraID,
				"jira_link":  jiraLink,
				"notes":      notes,
			}
			resp, err := apiPost("/api/runs", body)
			if err != nil {
				return err
			}
			runID, _ := resp["run_id"].(string)
			fmt.Printf("\033[1;32m✓\033[0m run started  id=%s\n", runID)
			if watch {
				return watchRun(runID)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&curlStr, "curl", "", "curl command to import")
	cmd.Flags().StringVar(&url, "url", "", "target URL")
	cmd.Flags().StringVar(&method, "method", "GET", "HTTP method")
	cmd.Flags().IntVar(&vus, "vus", 10, "virtual users")
	cmd.Flags().IntVar(&duration, "duration", 30, "duration in seconds")
	cmd.Flags().StringVar(&pattern, "pattern", "constant", "load pattern: constant|ramp|spike|stages")
	cmd.Flags().IntVar(&thinkMs, "think-ms", 0, "per-request think time")
	cmd.Flags().StringVar(&createdBy, "by", envOr("USER", ""), "your name (required)")
	cmd.Flags().StringVar(&jiraID, "jira", "", "Jira ticket id (e.g. CT-123)")
	cmd.Flags().StringVar(&jiraLink, "jira-link", "", "Jira ticket URL")
	cmd.Flags().StringVar(&notes, "notes", "", "free-form notes")
	cmd.Flags().BoolVar(&watch, "watch", true, "tail live metrics until done")
	return cmd
}

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status [run-id]",
		Short: "Show run status",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			out, err := apiGet("/api/runs/" + args[0])
			if err != nil {
				return err
			}
			b, _ := json.MarshalIndent(out, "", "  ")
			fmt.Println(string(b))
			return nil
		},
	}
}

func listCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List recent runs",
		RunE: func(cmd *cobra.Command, args []string) error {
			out, err := apiGet("/api/runs")
			if err != nil {
				return err
			}
			arr, _ := out.([]interface{})
			fmt.Printf("%-38s  %-10s  %-20s  %s\n", "ID", "STATUS", "BY", "NAME")
			for _, item := range arr {
				m, _ := item.(map[string]interface{})
				fmt.Printf("%-38s  %-10s  %-20s  %s\n",
					str(m["id"]), str(m["status"]), str(m["created_by"]), str(m["name"]))
			}
			return nil
		},
	}
}

func reportCmd() *cobra.Command {
	var out string
	cmd := &cobra.Command{
		Use:   "report [run-id]",
		Short: "Download PDF report",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			req, _ := http.NewRequest("GET", apiURL+"/api/reports/"+args[0]+"/pdf", nil)
			req.Header.Set("X-Access-Key", accessKey)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				body, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("http %d: %s", resp.StatusCode, body)
			}
			if out == "" {
				out = "apistress-" + args[0] + ".pdf"
			}
			f, err := os.Create(out)
			if err != nil {
				return err
			}
			defer f.Close()
			n, err := io.Copy(f, resp.Body)
			if err != nil {
				return err
			}
			fmt.Printf("\033[1;32m✓\033[0m wrote %s (%d bytes)\n", out, n)
			return nil
		},
	}
	cmd.Flags().StringVarP(&out, "output", "o", "", "output filename")
	return cmd
}

func watchRun(runID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 24*time.Hour)
	defer cancel()
	url := fmt.Sprintf("%s/api/runs/%s/live?key=%s", apiURL, runID, accessKey)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("live stream http %d", resp.StatusCode)
	}
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			for {
				idx := bytes.Index(buf, []byte("\n\n"))
				if idx < 0 {
					break
				}
				event := buf[:idx]
				buf = buf[idx+2:]
				printEvent(event)
			}
		}
		if err != nil {
			return nil
		}
	}
}

func printEvent(raw []byte) {
	var ev, data string
	for _, line := range bytes.Split(raw, []byte("\n")) {
		s := string(line)
		switch {
		case strings.HasPrefix(s, "event:"):
			ev = strings.TrimSpace(strings.TrimPrefix(s, "event:"))
		case strings.HasPrefix(s, "data:"):
			data = strings.TrimSpace(strings.TrimPrefix(s, "data:"))
		}
	}
	if data == "" {
		return
	}
	var snap map[string]interface{}
	if err := json.Unmarshal([]byte(data), &snap); err != nil {
		return
	}
	totals, _ := snap["totals"].(map[string]interface{})
	requests := numF(totals["requests"])
	errors := numF(totals["errors"])
	rps := numF(snap["rps"])
	errRate := numF(snap["error_rate"])
	vus := numF(snap["active_vus"])
	latest, _ := snap["latest"].(map[string]interface{})
	p95 := numF(latest["p95_ms"])

	color := "\033[1;32m"
	if errRate >= 0.05 {
		color = "\033[1;31m"
	} else if errRate >= 0.01 {
		color = "\033[1;33m"
	}
	fmt.Printf("\r%s● %-5s\033[0m  vus=%4.0f  req=%6.0f  err=%4.0f (%5.2f%%)  rps=%7.1f  p95=%6.1fms",
		color, ev, vus, requests, errors, errRate*100, rps, p95)
	if ev == "done" {
		fmt.Println()
	}
}

func numF(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}

func str(v interface{}) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprintf("%v", v)
}

func apiPost(path string, body interface{}) (map[string]interface{}, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", apiURL+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Access-Key", accessKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, respBody)
	}
	var out map[string]interface{}
	_ = json.Unmarshal(respBody, &out)
	return out, nil
}

func apiGet(path string) (interface{}, error) {
	req, _ := http.NewRequest("GET", apiURL+path, nil)
	req.Header.Set("X-Access-Key", accessKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, respBody)
	}
	var out interface{}
	_ = json.Unmarshal(respBody, &out)
	return out, nil
}
