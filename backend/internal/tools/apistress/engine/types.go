package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	MaxVUs              = 500
	MaxDurationSec      = 3600
	MaxThinkTimeMs      = 60000
	MaxStageCount       = 20
	MaxStageDurationSec = 3600
)

type Protocol string

const (
	ProtoHTTP      Protocol = "http"
	ProtoWebSocket Protocol = "websocket"
	ProtoSSE       Protocol = "sse"
	ProtoGRPC      Protocol = "grpc"
	ProtoDB        Protocol = "db"
)

type LoadPattern string

const (
	PatternConstant LoadPattern = "constant"
	PatternRamp     LoadPattern = "ramp"
	PatternSpike    LoadPattern = "spike"
	PatternStages   LoadPattern = "stages"
)

type Stage struct {
	DurationSec int `json:"duration_sec" yaml:"duration_sec"`
	TargetVUs   int `json:"target_vus"   yaml:"target_vus"`
}

type HTTPRequest struct {
	Method  string            `json:"method"  yaml:"method"`
	URL     string            `json:"url"     yaml:"url"`
	Headers map[string]string `json:"headers" yaml:"headers"`
	Body    string            `json:"body"    yaml:"body"`
	Timeout int               `json:"timeout_ms" yaml:"timeout_ms"`
}

type Threshold struct {
	Metric  string  `json:"metric"   yaml:"metric"` // p95_ms, p99_ms, error_rate, rps_min
	Op      string  `json:"op"       yaml:"op"`     // < <= > >=
	Value   float64 `json:"value"    yaml:"value"`
	AbortOn bool    `json:"abort_on" yaml:"abort_on"`
}

type TestConfig struct {
	Name        string      `json:"name"        yaml:"name"`
	Description string      `json:"description" yaml:"description"`
	Protocol    Protocol    `json:"protocol"    yaml:"protocol"`
	Request     HTTPRequest `json:"request"     yaml:"request"`
	VUs         int         `json:"vus"         yaml:"vus"`
	DurationSec int         `json:"duration_sec" yaml:"duration_sec"`
	Pattern     LoadPattern `json:"pattern"     yaml:"pattern"`
	Stages      []Stage     `json:"stages"      yaml:"stages"`
	ThinkTimeMs int         `json:"think_time_ms" yaml:"think_time_ms"`
	Thresholds  []Threshold `json:"thresholds"  yaml:"thresholds"`
}

func (c *TestConfig) Validate() error {
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		c.Name = "unnamed"
	}
	if c.VUs <= 0 {
		return fmt.Errorf("virtual users must be at least 1")
	}
	if c.VUs > MaxVUs {
		return fmt.Errorf("virtual users cannot exceed %d", MaxVUs)
	}
	if c.DurationSec <= 0 && len(c.Stages) == 0 {
		return fmt.Errorf("duration must be at least 1 second")
	}
	if c.DurationSec > MaxDurationSec {
		return fmt.Errorf("duration cannot exceed %d seconds", MaxDurationSec)
	}
	if c.Protocol == "" {
		c.Protocol = ProtoHTTP
	}
	if c.Pattern == "" {
		c.Pattern = PatternConstant
	}
	if c.Request.Method == "" {
		c.Request.Method = "GET"
	}
	c.Request.Method = strings.ToUpper(strings.TrimSpace(c.Request.Method))
	if c.Request.Timeout <= 0 {
		c.Request.Timeout = 30000
	}
	if c.ThinkTimeMs < 0 {
		return fmt.Errorf("think time cannot be negative")
	}
	if c.ThinkTimeMs > MaxThinkTimeMs {
		return fmt.Errorf("think time cannot exceed %d ms", MaxThinkTimeMs)
	}
	if c.Pattern == PatternStages {
		if len(c.Stages) == 0 {
			return fmt.Errorf("stages pattern requires at least one stage")
		}
		if len(c.Stages) > MaxStageCount {
			return fmt.Errorf("stages cannot exceed %d entries", MaxStageCount)
		}
		for i, st := range c.Stages {
			if st.DurationSec <= 0 {
				return fmt.Errorf("stage %d duration must be at least 1 second", i+1)
			}
			if st.DurationSec > MaxStageDurationSec {
				return fmt.Errorf("stage %d duration cannot exceed %d seconds", i+1, MaxStageDurationSec)
			}
			if st.TargetVUs < 0 {
				return fmt.Errorf("stage %d target VUs cannot be negative", i+1)
			}
			if st.TargetVUs > MaxVUs {
				return fmt.Errorf("stage %d target VUs cannot exceed %d", i+1, MaxVUs)
			}
		}
	}
	return nil
}

func (c *TestConfig) TotalDuration() time.Duration {
	if c.Pattern == PatternStages && len(c.Stages) > 0 {
		total := 0
		for _, s := range c.Stages {
			total += s.DurationSec
		}
		return time.Duration(total) * time.Second
	}
	return time.Duration(c.DurationSec) * time.Second
}

type Result struct {
	StartedAt  time.Time
	DurationUs int64
	Status     int
	BytesIn    int64
	BytesOut   int64
	Err        string
}

func (r *Result) OK() bool {
	return r.Err == "" && r.Status >= 200 && r.Status < 400
}

type RunStatus string

const (
	RunPending   RunStatus = "pending"
	RunRunning   RunStatus = "running"
	RunFinished  RunStatus = "finished"
	RunFailed    RunStatus = "failed"
	RunCancelled RunStatus = "cancelled"
)

func (c TestConfig) JSON() ([]byte, error) { return json.Marshal(c) }
