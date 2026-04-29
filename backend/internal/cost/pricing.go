package cost

// Static pricing snapshot — public on-demand list prices, US/EU regions,
// rounded to 4–6 sig figs. Refresh manually as cloud providers change them.
//
// Sources (April 2026 snapshot):
// - aws.amazon.com/ec2/pricing
// - aws.amazon.com/lambda/pricing
// - aws.amazon.com/api-gateway/pricing
// - cloud.google.com/run/pricing
// - cloud.google.com/compute/all-pricing
// - azure.microsoft.com/pricing/details/functions

// InstanceSize describes a per-hour pricing tier.
type InstanceSize struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	PerHour  float64 `json:"per_hour_usd"`
	VCPUs    int     `json:"vcpus"`
	MemoryGB int     `json:"memory_gb"`
}

type ServerlessRate struct {
	ID            string  `json:"id"`
	Label         string  `json:"label"`
	PerMillionReq float64 `json:"per_million_req_usd"`  // request cost
	PerGBSecond   float64 `json:"per_gb_second_usd"`    // execution cost
}

type Region struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type Cloud struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Regions []Region `json:"regions"`

	Instances  map[string][]InstanceSize  `json:"instances"`   // keyed by compute model (ec2, fargate, app_service)
	Serverless map[string]ServerlessRate  `json:"serverless"`  // keyed by compute model (lambda, cloud_run, functions)
	EgressPerGB float64 `json:"egress_per_gb_usd"`             // first-tier internet egress
}

// Public pricing catalogue. Frontend fetches this to build the picker UI.
var Catalogue = map[string]Cloud{
	"aws": {
		ID: "aws", Label: "AWS",
		Regions: []Region{
			{"us-east-1", "US East (N. Virginia)"},
			{"us-west-2", "US West (Oregon)"},
			{"eu-west-1", "EU West (Ireland)"},
			{"ap-south-1", "Asia Pacific (Mumbai)"},
			{"ap-southeast-1", "Asia Pacific (Singapore)"},
		},
		Instances: map[string][]InstanceSize{
			"ec2": {
				{"t3.small",  "t3.small (2 vCPU · 2 GB)",  0.0208, 2, 2},
				{"t3.medium", "t3.medium (2 vCPU · 4 GB)", 0.0416, 2, 4},
				{"t3.large",  "t3.large (2 vCPU · 8 GB)",  0.0832, 2, 8},
				{"m5.large",  "m5.large (2 vCPU · 8 GB)",  0.0960, 2, 8},
				{"m5.xlarge", "m5.xlarge (4 vCPU · 16 GB)",0.1920, 4, 16},
				{"c5.large",  "c5.large (2 vCPU · 4 GB)",  0.0850, 2, 4},
			},
			"fargate": {
				{"fargate-0.5cpu", "Fargate 0.5 vCPU · 1 GB", 0.02468, 1, 1},
				{"fargate-1cpu",   "Fargate 1 vCPU · 2 GB",   0.04936, 1, 2},
				{"fargate-2cpu",   "Fargate 2 vCPU · 4 GB",   0.09872, 2, 4},
			},
		},
		Serverless: map[string]ServerlessRate{
			"lambda":         {"lambda", "AWS Lambda",       0.20, 0.0000166667},
			"api_gateway_http": {"api_gateway_http", "API Gateway HTTP API", 1.00, 0},
			"api_gateway_rest": {"api_gateway_rest", "API Gateway REST API", 3.50, 0},
		},
		EgressPerGB: 0.09,
	},
	"gcp": {
		ID: "gcp", Label: "Google Cloud",
		Regions: []Region{
			{"us-central1", "US Central (Iowa)"},
			{"europe-west1", "Europe West (Belgium)"},
			{"asia-south1",  "Asia South (Mumbai)"},
		},
		Instances: map[string][]InstanceSize{
			"gce": {
				{"e2-small",   "e2-small (2 vCPU · 2 GB)",  0.01675, 2, 2},
				{"e2-medium",  "e2-medium (2 vCPU · 4 GB)", 0.03350, 2, 4},
				{"n2-standard-2", "n2-standard-2 (2 vCPU · 8 GB)", 0.0971, 2, 8},
			},
		},
		Serverless: map[string]ServerlessRate{
			"cloud_run": {"cloud_run", "Cloud Run", 0.40, 0.000024},
			"functions": {"functions", "Cloud Functions", 0.40, 0.0000025},
		},
		EgressPerGB: 0.12,
	},
	"azure": {
		ID: "azure", Label: "Microsoft Azure",
		Regions: []Region{
			{"eastus", "East US"},
			{"westeurope", "West Europe"},
			{"centralindia", "Central India"},
		},
		Instances: map[string][]InstanceSize{
			"app_service": {
				{"B1", "App Service B1 (1 vCPU · 1.75 GB)", 0.018, 1, 2},
				{"B2", "App Service B2 (2 vCPU · 3.5 GB)",  0.036, 2, 4},
				{"S1", "App Service S1 (1 vCPU · 1.75 GB)", 0.075, 1, 2},
			},
			"vm": {
				{"B2s",  "VM B2s (2 vCPU · 4 GB)",   0.0416, 2, 4},
				{"D2sv5","VM D2s v5 (2 vCPU · 8 GB)",0.096,  2, 8},
			},
		},
		Serverless: map[string]ServerlessRate{
			"functions": {"functions", "Azure Functions (Consumption)", 0.20, 0.000016},
		},
		EgressPerGB: 0.0875,
	},
	"onprem": {
		ID: "onprem", Label: "On-premises / self-hosted",
		Regions: []Region{
			{"datacenter", "Your data centre"},
		},
		Instances:   map[string][]InstanceSize{},
		Serverless:  map[string]ServerlessRate{},
		EgressPerGB: 0,
	},
}

// DiscountMultiplier — multiply on-demand price by this to model commitments.
// Values are deliberately conservative (better to under-promise the discount).
func DiscountMultiplier(d string) (float64, string) {
	switch d {
	case "reserved_1y":
		return 0.65, "1-year RI / Savings Plan (~35% off)"
	case "reserved_3y":
		return 0.45, "3-year RI / Savings Plan (~55% off)"
	case "spot":
		return 0.30, "Spot / Preemptible (~70% off, no SLA)"
	default:
		return 1.00, "On-demand list price"
	}
}
