package cost

// StackEntry is one selected component (e.g. "RDS Postgres, db.t3.medium, 1 instance").
type StackEntry struct {
	Component string `json:"component"`
	Tier      string `json:"tier"`
	Count     int    `json:"count"`
}

// Inputs is what the user picks in the Test Builder. All optional — if Cloud
// is empty AND Stack is empty we don't compute an estimate.
type Inputs struct {
	Cloud         string       `json:"cloud"`           // aws | gcp | azure | onprem | other
	Region        string       `json:"region"`          // us-east-1, eu-west-1, etc
	ComputeModel  string       `json:"compute_model"`   // ec2 | fargate | lambda | cloud_run | functions | app_service | onprem
	ComputeSize   string       `json:"compute_size"`    // e.g. t3.medium, e2-medium, B1
	InstanceCount int          `json:"instance_count"`  // for instance-hour models, default 1
	MemoryMB      int          `json:"memory_mb"`       // for serverless billable memory
	Discount      string       `json:"discount"`        // on_demand | reserved_1y | reserved_3y | spot
	Stack         []StackEntry `json:"stack"`           // databases, caches, storage, queues, CDN, etc
}

// LineItem is one row in the breakdown.
type LineItem struct {
	Label string  `json:"label"`
	USD   float64 `json:"usd"`
	Basis string  `json:"basis"` // human-readable formula
}

// ResolvedStack expands a user StackEntry with the human-readable bits the
// frontend / report need (label, category, tier label, computed monthly cost).
type ResolvedStack struct {
	Component  string  `json:"component"`
	Label      string  `json:"label"`
	Category   string  `json:"category"`
	Provider   string  `json:"provider"`
	Tier       string  `json:"tier"`
	TierLabel  string  `json:"tier_label"`
	Count      int     `json:"count"`
	MonthlyUSD float64 `json:"monthly_usd"`
}

// Estimate is the computed cost projection.
type Estimate struct {
	Computed       bool            `json:"computed"`         // false when inputs are empty
	Inputs         Inputs          `json:"inputs"`
	Items          []LineItem      `json:"items"`
	ResolvedStack  []ResolvedStack `json:"resolved_stack"`   // pretty stack list for the UI
	TotalLowUSD    float64         `json:"total_low_usd"`
	TotalHighUSD   float64         `json:"total_high_usd"`
	PerThousandUSD float64         `json:"per_1k_requests_usd"`
	Assumptions    []string        `json:"assumptions"`
	Disclaimer     string          `json:"disclaimer"`
}

// Snapshot of the load-test result we feed in.
type LoadShape struct {
	AvgRPS         float64
	PeakRPS        float64
	BytesInAvg     float64 // average response bytes per request
	MeanLatencyMs  float64
	P95LatencyMs   float64
	TotalRequests  int64
}
