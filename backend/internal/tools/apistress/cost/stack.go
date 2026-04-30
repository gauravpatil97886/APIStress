package cost

// StackTier is one priced size for a stack component.
type StackTier struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	USD   float64 `json:"monthly_usd"`
}

// StackComponent is one piece of infrastructure (DB, cache, queue, etc).
// We bake in 3-4 tiers for the most common ones; user picks one and a count.
type StackComponent struct {
	ID          string      `json:"id"`
	Label       string      `json:"label"`
	Category    string      `json:"category"` // database | cache | storage | queue | cdn | search | observability
	Provider    string      `json:"provider"` // aws | gcp | azure | other
	DefaultTier string      `json:"default_tier"`
	Tiers       []StackTier `json:"tiers"`
}

// StackCategory is metadata for the picker UI grouping.
type StackCategory struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Emoji string `json:"emoji"`
}

var StackCategories = []StackCategory{
	{"database",      "Database",         "💾"},
	{"cache",         "Cache",            "⚡"},
	{"storage",       "Object storage",   "📦"},
	{"queue",         "Queue / streaming","📨"},
	{"cdn",           "CDN",              "🌐"},
	{"search",        "Search",           "🔍"},
	{"auth",          "Auth / identity",  "🔐"},
	{"payments",      "Payments",         "💳"},
	{"email",         "Email / SMS",      "✉️"},
	{"analytics",     "Analytics / DW",   "📈"},
	{"observability", "Observability",    "📊"},
}

// Stack is the public catalogue surfaced via /api/cost/pricing.
// Prices are public on-demand US-East list, rounded sensibly.
var Stack = []StackComponent{
	// ── Databases ──────────────────────────────────────────────────────
	{ID: "rds_postgres", Label: "AWS RDS PostgreSQL", Category: "database", Provider: "aws", DefaultTier: "db.t3.medium",
		Tiers: []StackTier{
			{"db.t3.micro",  "db.t3.micro · 2 vCPU · 1 GB",  14},
			{"db.t3.small",  "db.t3.small · 2 vCPU · 2 GB",  28},
			{"db.t3.medium", "db.t3.medium · 2 vCPU · 4 GB", 70},
			{"db.m5.large",  "db.m5.large · 2 vCPU · 8 GB",  175},
			{"db.m5.xlarge", "db.m5.xlarge · 4 vCPU · 16 GB",350},
		}},
	{ID: "rds_mysql", Label: "AWS RDS MySQL", Category: "database", Provider: "aws", DefaultTier: "db.t3.medium",
		Tiers: []StackTier{
			{"db.t3.small",  "db.t3.small · 2 vCPU · 2 GB",  28},
			{"db.t3.medium", "db.t3.medium · 2 vCPU · 4 GB", 70},
			{"db.m5.large",  "db.m5.large · 2 vCPU · 8 GB",  175},
		}},
	{ID: "aurora", Label: "AWS Aurora (Postgres / MySQL)", Category: "database", Provider: "aws", DefaultTier: "db.r5.large",
		Tiers: []StackTier{
			{"db.t3.medium", "db.t3.medium",     85},
			{"db.r5.large",  "db.r5.large · 2 vCPU · 16 GB",  220},
			{"db.r5.xlarge", "db.r5.xlarge · 4 vCPU · 32 GB", 440},
		}},
	{ID: "dynamodb", Label: "AWS DynamoDB (on-demand)", Category: "database", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "Small (~1M reads, 200K writes/mo)", 15},
			{"medium", "Medium (~10M reads, 2M writes/mo)", 80},
			{"large",  "Large (~100M reads, 20M writes/mo)",600},
		}},
	{ID: "mongo_atlas", Label: "MongoDB Atlas", Category: "database", Provider: "other", DefaultTier: "M10",
		Tiers: []StackTier{
			{"M10", "M10 · shared · 10 GB", 57},
			{"M20", "M20 · 4 GB · 20 GB", 120},
			{"M30", "M30 · 8 GB · 40 GB", 400},
		}},
	{ID: "cloud_sql_postgres", Label: "GCP Cloud SQL (Postgres)", Category: "database", Provider: "gcp", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 vCPU · 3.75 GB", 25},
			{"medium", "2 vCPU · 7.5 GB",  70},
			{"large",  "4 vCPU · 16 GB",   180},
		}},
	{ID: "azure_sql", Label: "Azure SQL Database", Category: "database", Provider: "azure", DefaultTier: "S1",
		Tiers: []StackTier{
			{"Basic", "Basic (5 DTU)", 5},
			{"S1",    "Standard S1 (20 DTU)", 30},
			{"S3",    "Standard S3 (100 DTU)", 150},
		}},

	// ── Cache ──────────────────────────────────────────────────────────
	{ID: "elasticache_redis", Label: "AWS ElastiCache Redis", Category: "cache", Provider: "aws", DefaultTier: "cache.t3.small",
		Tiers: []StackTier{
			{"cache.t3.micro",  "cache.t3.micro · 2 vCPU · 0.5 GB", 14},
			{"cache.t3.small",  "cache.t3.small · 2 vCPU · 1.5 GB", 28},
			{"cache.t3.medium", "cache.t3.medium · 2 vCPU · 3 GB", 60},
			{"cache.m5.large",  "cache.m5.large · 2 vCPU · 6.4 GB",125},
		}},
	{ID: "elasticache_memcached", Label: "AWS ElastiCache Memcached", Category: "cache", Provider: "aws", DefaultTier: "cache.t3.small",
		Tiers: []StackTier{
			{"cache.t3.small",  "cache.t3.small · 1.5 GB", 28},
			{"cache.t3.medium", "cache.t3.medium · 3 GB",  60},
		}},
	{ID: "redis_cloud", Label: "Redis Cloud (managed)", Category: "cache", Provider: "other", DefaultTier: "100MB",
		Tiers: []StackTier{
			{"30MB",  "30 MB", 5},
			{"100MB", "100 MB", 18},
			{"1GB",   "1 GB",   85},
		}},
	{ID: "memorystore", Label: "GCP Memorystore (Redis)", Category: "cache", Provider: "gcp", DefaultTier: "1gb",
		Tiers: []StackTier{
			{"1gb", "Basic 1 GB", 35},
			{"5gb", "Basic 5 GB", 175},
		}},

	// ── Object storage ────────────────────────────────────────────────
	{ID: "s3", Label: "AWS S3 Standard", Category: "storage", Provider: "aws", DefaultTier: "100gb",
		Tiers: []StackTier{
			{"10gb",   "10 GB stored",   3},
			{"100gb",  "100 GB stored",  5},
			{"1tb",    "1 TB stored",    24},
			{"10tb",   "10 TB stored",   235},
		}},
	{ID: "gcs", Label: "GCP Cloud Storage Standard", Category: "storage", Provider: "gcp", DefaultTier: "100gb",
		Tiers: []StackTier{
			{"100gb", "100 GB stored", 5},
			{"1tb",   "1 TB stored",   24},
		}},
	{ID: "blob", Label: "Azure Blob Storage Hot", Category: "storage", Provider: "azure", DefaultTier: "100gb",
		Tiers: []StackTier{
			{"100gb", "100 GB stored", 5},
			{"1tb",   "1 TB stored",   21},
		}},

	// ── Queue / streaming ─────────────────────────────────────────────
	{ID: "sqs", Label: "AWS SQS", Category: "queue", Provider: "aws", DefaultTier: "low",
		Tiers: []StackTier{
			{"low",    "Low traffic (~1M msgs/mo)",   1},
			{"medium", "Medium (~50M msgs/mo)",      20},
			{"high",   "High (~1B msgs/mo)",         400},
		}},
	{ID: "msk", Label: "AWS Kafka (MSK)", Category: "queue", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "3-broker kafka.t3.small",       210},
			{"medium", "3-broker kafka.m5.large",       410},
			{"large",  "3-broker kafka.m5.xlarge",      820},
		}},
	{ID: "rabbitmq", Label: "RabbitMQ (CloudAMQP)", Category: "queue", Provider: "other", DefaultTier: "tiger",
		Tiers: []StackTier{
			{"lemur", "Lemur · free", 0},
			{"tiger", "Tiger · 50 conns", 19},
			{"bunny", "Bunny · 1000 conns", 99},
		}},
	{ID: "pubsub", Label: "GCP Pub/Sub", Category: "queue", Provider: "gcp", DefaultTier: "medium",
		Tiers: []StackTier{
			{"low",    "Low (~10 GB/mo)",   4},
			{"medium", "Medium (~500 GB/mo)", 20},
			{"high",   "High (~10 TB/mo)",   400},
		}},

	// ── CDN ───────────────────────────────────────────────────────────
	{ID: "cloudfront", Label: "AWS CloudFront", Category: "cdn", Provider: "aws", DefaultTier: "low",
		Tiers: []StackTier{
			{"low",    "Low (~100 GB/mo egress)", 9},
			{"medium", "Medium (~1 TB/mo)",       85},
			{"high",   "High (~10 TB/mo)",        720},
		}},
	{ID: "cloudflare", Label: "Cloudflare Pro", Category: "cdn", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"pro",      "Pro plan", 25},
			{"business", "Business plan", 250},
		}},

	// ── Search ────────────────────────────────────────────────────────
	{ID: "opensearch", Label: "AWS OpenSearch", Category: "search", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "t3.small.search · 1 node", 30},
			{"medium", "m5.large.search · 1 node", 130},
			{"large",  "m5.large.search · 3 nodes",390},
		}},
	{ID: "algolia", Label: "Algolia", Category: "search", Provider: "other", DefaultTier: "build",
		Tiers: []StackTier{
			{"build", "Build plan",   50},
			{"grow",  "Grow plan",    500},
		}},

	// ── Observability ─────────────────────────────────────────────────
	{ID: "datadog", Label: "Datadog (APM + logs)", Category: "observability", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "5 hosts · APM + logs",  100},
			{"medium", "20 hosts · APM + logs", 400},
		}},
	{ID: "cloudwatch", Label: "AWS CloudWatch (logs + metrics)", Category: "observability", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "5 hosts equivalent",  20},
			{"medium", "50 hosts equivalent", 200},
		}},
	{ID: "sentry", Label: "Sentry (errors)", Category: "observability", Provider: "other", DefaultTier: "team",
		Tiers: []StackTier{
			{"team",     "Team plan",     26},
			{"business", "Business plan", 80},
		}},
	{ID: "newrelic", Label: "New Relic (full stack)", Category: "observability", Provider: "other", DefaultTier: "standard",
		Tiers: []StackTier{
			{"standard",  "Standard (~50 GB ingest)",  100},
			{"pro",       "Pro (~200 GB ingest)",      400},
		}},
	{ID: "grafana_cloud", Label: "Grafana Cloud", Category: "observability", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"free",  "Free tier",   0},
			{"pro",   "Pro plan",    50},
			{"adv",   "Advanced",    300},
		}},
	{ID: "honeycomb", Label: "Honeycomb (tracing)", Category: "observability", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"pro",        "Pro (10 GB events)",       70},
			{"enterprise", "Enterprise (100 GB)",      700},
		}},
	{ID: "logtail", Label: "Better Stack / Logtail", Category: "observability", Provider: "other", DefaultTier: "team",
		Tiers: []StackTier{
			{"freelancer", "Freelancer", 24},
			{"team",       "Team",       144},
		}},

	// ── Self-hosted databases (you run them on a VM, modelled at the VM cost) ──
	{ID: "self_postgres", Label: "PostgreSQL (self-hosted)", Category: "database", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 2 vCPU · 4 GB",  35},
			{"medium", "1 VM · 4 vCPU · 16 GB", 140},
			{"large",  "HA · 2 VM · 8 vCPU · 32 GB", 560},
		}},
	{ID: "self_mysql", Label: "MySQL (self-hosted)", Category: "database", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 2 vCPU · 4 GB",   35},
			{"medium", "1 VM · 4 vCPU · 16 GB",  140},
			{"large",  "HA · 2 VM · 8 vCPU · 32 GB", 560},
		}},
	{ID: "self_mongodb", Label: "MongoDB (self-hosted)", Category: "database", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "Replica set · 3 VMs",  150},
			{"medium", "Replica · 3 × 8 GB",   500},
		}},
	{ID: "mariadb", Label: "MariaDB (self-hosted)", Category: "database", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 2 vCPU · 4 GB", 35},
			{"medium", "1 VM · 4 vCPU · 16 GB",140},
		}},
	{ID: "cockroachdb", Label: "CockroachDB Serverless", Category: "database", Provider: "other", DefaultTier: "free",
		Tiers: []StackTier{
			{"free",     "Free tier (limited)", 0},
			{"standard", "Standard (~5M req)",  50},
			{"large",    "Production (~100M)",  500},
		}},
	{ID: "planetscale", Label: "PlanetScale (MySQL)", Category: "database", Provider: "other", DefaultTier: "scaler",
		Tiers: []StackTier{
			{"hobby",  "Hobby",        0},
			{"scaler", "Scaler Pro",   39},
			{"team",   "Team",         599},
		}},
	{ID: "neon", Label: "Neon (Postgres)", Category: "database", Provider: "other", DefaultTier: "launch",
		Tiers: []StackTier{
			{"free",   "Free",         0},
			{"launch", "Launch",       19},
			{"scale",  "Scale",        69},
		}},
	{ID: "supabase", Label: "Supabase", Category: "database", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"free", "Free",   0},
			{"pro",  "Pro",    25},
			{"team", "Team",   599},
		}},
	{ID: "firestore", Label: "Firebase Firestore", Category: "database", Provider: "gcp", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "Small (~1M reads/day)",  10},
			{"medium", "Medium (~50M reads/day)",100},
			{"large",  "Large (~500M reads/day)",800},
		}},

	// ── Self-hosted cache ─────────────────────────────────────────────
	{ID: "self_redis", Label: "Redis (self-hosted)", Category: "cache", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 2 vCPU · 4 GB",   35},
			{"medium", "1 VM · 4 vCPU · 16 GB",  140},
			{"ha",     "HA · 3 VM · 8 GB",       300},
		}},
	{ID: "upstash_redis", Label: "Upstash Redis (serverless)", Category: "cache", Provider: "other", DefaultTier: "pay_per",
		Tiers: []StackTier{
			{"free",     "Free tier",          0},
			{"pay_per",  "Pay-as-you-go (~1M req/day)", 25},
			{"pro",      "Pro (~10M req/day)", 280},
		}},
	{ID: "keydb", Label: "KeyDB (self-hosted)", Category: "cache", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 4 GB",  35},
			{"medium", "1 VM · 16 GB", 140},
		}},

	// ── Object storage extras ────────────────────────────────────────
	{ID: "r2", Label: "Cloudflare R2", Category: "storage", Provider: "other", DefaultTier: "100gb",
		Tiers: []StackTier{
			{"100gb", "100 GB · zero egress", 2},
			{"1tb",   "1 TB · zero egress",   15},
			{"10tb",  "10 TB · zero egress",  150},
		}},
	{ID: "b2", Label: "Backblaze B2", Category: "storage", Provider: "other", DefaultTier: "1tb",
		Tiers: []StackTier{
			{"100gb", "100 GB", 1},
			{"1tb",   "1 TB",   6},
			{"10tb",  "10 TB",  60},
		}},
	{ID: "spaces", Label: "DigitalOcean Spaces", Category: "storage", Provider: "other", DefaultTier: "250gb",
		Tiers: []StackTier{
			{"250gb", "250 GB · 1 TB egress", 5},
			{"1tb",   "Add-on per TB",       20},
		}},

	// ── Queue / streaming extras ─────────────────────────────────────
	{ID: "kinesis", Label: "AWS Kinesis Data Streams", Category: "queue", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 shard",   12},
			{"medium", "10 shards", 120},
			{"large",  "100 shards",1200},
		}},
	{ID: "confluent", Label: "Confluent Cloud (Kafka)", Category: "queue", Provider: "other", DefaultTier: "basic",
		Tiers: []StackTier{
			{"basic",     "Basic cluster",     30},
			{"standard",  "Standard cluster",  300},
			{"dedicated", "Dedicated cluster", 2000},
		}},
	{ID: "redpanda", Label: "Redpanda Cloud", Category: "queue", Provider: "other", DefaultTier: "byoc_small",
		Tiers: []StackTier{
			{"byoc_small", "BYOC Small",  450},
			{"dedicated",  "Dedicated",   1500},
		}},
	{ID: "nats", Label: "NATS (self-hosted)", Category: "queue", Provider: "other", DefaultTier: "single",
		Tiers: []StackTier{
			{"single", "Single VM",   35},
			{"cluster","3-node cluster", 105},
		}},
	{ID: "temporal", Label: "Temporal Cloud", Category: "queue", Provider: "other", DefaultTier: "starter",
		Tiers: []StackTier{
			{"starter", "Starter",     200},
			{"pro",     "Pro",         1000},
		}},
	{ID: "sns", Label: "AWS SNS", Category: "queue", Provider: "aws", DefaultTier: "low",
		Tiers: []StackTier{
			{"low",    "Low (~1M msgs/mo)",   1},
			{"medium", "Medium (~100M)",     50},
		}},

	// ── CDN extras ────────────────────────────────────────────────────
	{ID: "fastly", Label: "Fastly", Category: "cdn", Provider: "other", DefaultTier: "starter",
		Tiers: []StackTier{
			{"starter", "Starter (~500 GB)",  50},
			{"growth",  "Growth (~5 TB)",     500},
		}},
	{ID: "bunnycdn", Label: "BunnyCDN", Category: "cdn", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "~1 TB egress",   10},
			{"medium", "~10 TB egress", 100},
		}},
	{ID: "keycdn", Label: "KeyCDN", Category: "cdn", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "~1 TB egress",  20},
			{"medium", "~10 TB egress",200},
		}},

	// ── Search extras ─────────────────────────────────────────────────
	{ID: "self_elastic", Label: "Elasticsearch (self-hosted)", Category: "search", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 VM · 8 GB",       70},
			{"medium", "3 nodes · 16 GB",   500},
		}},
	{ID: "meilisearch", Label: "Meilisearch Cloud", Category: "search", Provider: "other", DefaultTier: "build",
		Tiers: []StackTier{
			{"build", "Build",   30},
			{"pro",   "Pro",     400},
		}},
	{ID: "typesense", Label: "Typesense Cloud", Category: "search", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "Small",  20},
			{"medium", "Medium",100},
		}},
	{ID: "pinecone", Label: "Pinecone (vector DB)", Category: "search", Provider: "other", DefaultTier: "starter",
		Tiers: []StackTier{
			{"starter", "Starter",  70},
			{"standard","Standard", 350},
		}},

	// ── Auth ──────────────────────────────────────────────────────────
	{ID: "auth0", Label: "Auth0", Category: "auth", Provider: "other", DefaultTier: "essentials",
		Tiers: []StackTier{
			{"free",       "Free (7,500 MAU)", 0},
			{"essentials", "Essentials (1K MAU)", 35},
			{"pro",        "Professional (1K MAU)", 240},
		}},
	{ID: "clerk", Label: "Clerk", Category: "auth", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"free", "Free (10K MAU)",  0},
			{"pro",  "Pro (10K MAU)",   25},
		}},
	{ID: "cognito", Label: "AWS Cognito", Category: "auth", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "10K MAU",   55},
			{"medium", "100K MAU",  275},
			{"large",  "1M MAU",    2000},
		}},
	{ID: "firebase_auth", Label: "Firebase Authentication", Category: "auth", Provider: "gcp", DefaultTier: "free",
		Tiers: []StackTier{
			{"free",   "Free (50K MAU)", 0},
			{"paid",   "Identity Platform (100K MAU)", 600},
		}},

	// ── Payments ──────────────────────────────────────────────────────
	{ID: "stripe", Label: "Stripe (cards)", Category: "payments", Provider: "other", DefaultTier: "default",
		Tiers: []StackTier{
			{"default", "2.9% + $0.30 per txn (no fixed fee)", 0},
		}},
	{ID: "razorpay", Label: "Razorpay (India)", Category: "payments", Provider: "other", DefaultTier: "default",
		Tiers: []StackTier{
			{"default", "2% per txn (no fixed fee)", 0},
		}},
	{ID: "paypal", Label: "PayPal", Category: "payments", Provider: "other", DefaultTier: "default",
		Tiers: []StackTier{
			{"default", "3.49% + fixed fee per txn", 0},
		}},

	// ── Email / SMS ───────────────────────────────────────────────────
	{ID: "sendgrid", Label: "SendGrid (email)", Category: "email", Provider: "other", DefaultTier: "essentials",
		Tiers: []StackTier{
			{"essentials", "Essentials (50K mails)", 20},
			{"pro",        "Pro (100K mails)",       90},
		}},
	{ID: "mailgun", Label: "Mailgun", Category: "email", Provider: "other", DefaultTier: "foundation",
		Tiers: []StackTier{
			{"foundation", "Foundation (50K mails)", 35},
			{"growth",     "Growth (100K mails)",    80},
		}},
	{ID: "postmark", Label: "Postmark", Category: "email", Provider: "other", DefaultTier: "100k",
		Tiers: []StackTier{
			{"10k",  "10K mails",  15},
			{"100k", "100K mails", 100},
		}},
	{ID: "ses", Label: "AWS SES (email)", Category: "email", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "100K mails",  10},
			{"medium", "1M mails",    100},
		}},
	{ID: "twilio_sms", Label: "Twilio SMS", Category: "email", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "~1K SMS/mo",   8},
			{"medium", "~10K SMS/mo",  80},
			{"large",  "~100K SMS/mo", 800},
		}},
	{ID: "resend", Label: "Resend (email)", Category: "email", Provider: "other", DefaultTier: "pro",
		Tiers: []StackTier{
			{"free", "Free (3K mails)", 0},
			{"pro",  "Pro (50K mails)", 20},
		}},

	// ── Analytics / DW ────────────────────────────────────────────────
	{ID: "snowflake", Label: "Snowflake", Category: "analytics", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "X-Small WH (~50 hr/mo)",  100},
			{"medium", "Small WH (~200 hr/mo)",   400},
			{"large",  "Medium WH (~400 hr/mo)",  1600},
		}},
	{ID: "bigquery", Label: "GCP BigQuery", Category: "analytics", Provider: "gcp", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "1 TB queries/mo",   25},
			{"medium", "10 TB queries/mo",  250},
		}},
	{ID: "redshift", Label: "AWS Redshift", Category: "analytics", Provider: "aws", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "ra3.xlplus · 1 node",  290},
			{"medium", "ra3.xlplus · 3 nodes", 880},
		}},
	{ID: "databricks", Label: "Databricks", Category: "analytics", Provider: "other", DefaultTier: "small",
		Tiers: []StackTier{
			{"small",  "Standard (~50 DBU/mo)",  500},
			{"medium", "Standard (~200 DBU/mo)", 2000},
		}},
	{ID: "clickhouse_cloud", Label: "ClickHouse Cloud", Category: "analytics", Provider: "other", DefaultTier: "dev",
		Tiers: []StackTier{
			{"dev",        "Development",        50},
			{"production", "Production (small)", 200},
		}},
	{ID: "mixpanel", Label: "Mixpanel", Category: "analytics", Provider: "other", DefaultTier: "growth",
		Tiers: []StackTier{
			{"free",   "Free (1M events)",      0},
			{"growth", "Growth (5M events)",   25},
		}},
	{ID: "ga4", Label: "Google Analytics 4", Category: "analytics", Provider: "gcp", DefaultTier: "free",
		Tiers: []StackTier{
			{"free", "Free (10M events)", 0},
			{"360",  "GA 360 enterprise", 12500},
		}},
}

// findStackComponent returns the catalogue entry by ID, or nil.
func findStackComponent(id string) *StackComponent {
	for i := range Stack {
		if Stack[i].ID == id {
			return &Stack[i]
		}
	}
	return nil
}

func findStackTier(c *StackComponent, id string) *StackTier {
	if c == nil {
		return nil
	}
	for i := range c.Tiers {
		if c.Tiers[i].ID == id {
			return &c.Tiers[i]
		}
	}
	if c.DefaultTier != "" {
		for i := range c.Tiers {
			if c.Tiers[i].ID == c.DefaultTier {
				return &c.Tiers[i]
			}
		}
	}
	if len(c.Tiers) > 0 {
		return &c.Tiers[0]
	}
	return nil
}
