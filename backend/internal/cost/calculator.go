package cost

import "fmt"

const hoursPerMonth = 730.0
const secondsPerMonth = 60.0 * 60.0 * hoursPerMonth // 2,628,000

// Estimate computes a cost projection from a load shape + user inputs.
// Returns Estimate{Computed:false} if Inputs are empty.
//
// Philosophy: only include line items we can defend with public pricing.
// Disclose every assumption. Always emit a low/high band.
func Compute(shape LoadShape, in Inputs) Estimate {
	out := Estimate{
		Inputs:     in,
		Disclaimer: "Estimate based on public list prices and your declared stack. Real production cost will differ — use this as an order-of-magnitude guide only.",
	}
	hasCloud := in.Cloud != ""
	hasStack := len(in.Stack) > 0
	if !hasCloud && !hasStack {
		return out // nothing to compute
	}
	out.Computed = true

	cloud, cloudOk := Catalogue[in.Cloud]
	if hasCloud && !cloudOk {
		hasCloud = false
	}
	if hasCloud && in.Cloud == "onprem" {
		out.Items = append(out.Items, LineItem{
			Label: "Compute (self-hosted)",
			USD:   0,
			Basis: "On-premises — hardware, power, cooling not modelled",
		})
		out.Assumptions = append(out.Assumptions,
			"On-prem compute cost (hardware, power, cooling, bandwidth) is not modelled.",
			"Egress is assumed free on your private network.")
		hasCloud = false // skip the cloud-specific compute below
	}

	discount, discLabel := DiscountMultiplier(in.Discount)
	avgRPS := shape.AvgRPS
	peakRPS := shape.PeakRPS
	if peakRPS < avgRPS {
		peakRPS = avgRPS
	}
	bytes := shape.BytesInAvg
	if bytes <= 0 {
		bytes = 1024 // safe default if we never measured a body
	}

	// Compute cost depends on the model — only when we have a real cloud.
	if hasCloud {
		out = appendComputeAndEgress(out, cloud, in, shape, discount, discLabel, bytes, avgRPS, peakRPS)
	}

	// Stack components (DB, cache, storage, queues, CDN, search, observability)
	if hasStack {
		for _, e := range in.Stack {
			c := findStackComponent(e.Component)
			if c == nil {
				continue
			}
			t := findStackTier(c, e.Tier)
			if t == nil {
				continue
			}
			count := e.Count
			if count < 1 {
				count = 1
			}
			usd := t.USD * float64(count) * discount
			out.Items = append(out.Items, LineItem{
				Label: c.Label + " (" + c.Category + ")",
				USD:   usd,
				Basis: stackBasis(count, t),
			})
			out.ResolvedStack = append(out.ResolvedStack, ResolvedStack{
				Component:  c.ID,
				Label:      c.Label,
				Category:   c.Category,
				Provider:   c.Provider,
				Tier:       t.ID,
				TierLabel:  t.Label,
				Count:      count,
				MonthlyUSD: usd,
			})
		}
	}

	// Total band — ±20% to reflect the imprecision of extrapolating a short test.
	mid := 0.0
	for _, it := range out.Items {
		mid += it.USD
	}
	out.TotalLowUSD = mid * 0.80
	out.TotalHighUSD = mid * 1.20

	totalReqMonth := avgRPS * secondsPerMonth
	if totalReqMonth > 0 {
		out.PerThousandUSD = mid / (totalReqMonth / 1000)
	}

	out.Assumptions = append(out.Assumptions,
		fmt.Sprintf("Sustained load of %.1f rps for %.0f hours = %.0f M requests/month.",
			avgRPS, hoursPerMonth, avgRPS*secondsPerMonth/1e6),
		"Pricing is from public on-demand list; volume discounts and free tiers are not applied.",
		"Stack component costs are flat monthly tiers; query / op count is not modelled.",
	)
	if discount < 1 {
		out.Assumptions = append(out.Assumptions,
			fmt.Sprintf("Discount applied to all line items: %s.", discLabel))
	}
	return out
}

func stackBasis(count int, t *StackTier) string {
	if count == 1 {
		return fmt.Sprintf("%s — $%.0f/mo", t.Label, t.USD)
	}
	return fmt.Sprintf("%d × %s @ $%.0f/mo", count, t.Label, t.USD)
}

// appendComputeAndEgress encapsulates the cloud-specific compute+egress logic.
func appendComputeAndEgress(out Estimate, cloud Cloud, in Inputs, shape LoadShape,
	discount float64, discLabel string, bytes, avgRPS, peakRPS float64) Estimate {
	switch in.ComputeModel {
	case "ec2", "fargate", "vm", "gce", "app_service":
		// Instance-hour pricing — independent of RPS for the test horizon,
		// but it scales with how many instances you keep running.
		count := in.InstanceCount
		if count < 1 {
			count = 1
		}
		size := findSize(cloud.Instances[in.ComputeModel], in.ComputeSize)
		hourly := 0.0
		basis := "no instance selected"
		if size != nil {
			hourly = size.PerHour
			basis = fmt.Sprintf("%d × %s @ $%.4f/hr × %.0f h × %s",
				count, size.Label, hourly, hoursPerMonth, discLabel)
		}
		monthly := float64(count) * hourly * hoursPerMonth * discount
		out.Items = append(out.Items, LineItem{
			Label: "Compute (instance-hour)",
			USD:   monthly,
			Basis: basis,
		})

	case "lambda", "cloud_run", "functions":
		rate, ok := cloud.Serverless[in.ComputeModel]
		if !ok {
			break
		}
		mem := in.MemoryMB
		if mem <= 0 {
			mem = 512
		}
		memGB := float64(mem) / 1024.0
		// Use mean latency for billable time. p95 would over-estimate.
		execSec := shape.MeanLatencyMs / 1000.0
		if execSec <= 0 {
			execSec = 0.1
		}
		reqsLow := avgRPS * secondsPerMonth
		reqsHigh := peakRPS * secondsPerMonth

		costReqLow := (reqsLow / 1_000_000) * rate.PerMillionReq
		costReqHigh := (reqsHigh / 1_000_000) * rate.PerMillionReq
		costExecLow := reqsLow * execSec * memGB * rate.PerGBSecond
		costExecHigh := reqsHigh * execSec * memGB * rate.PerGBSecond

		out.Items = append(out.Items,
			LineItem{
				Label: "Serverless requests",
				USD:   (costReqLow + costReqHigh) / 2 * discount,
				Basis: fmt.Sprintf("%.0f-%.0f M req/mo × $%.2f/M (avg ↔ peak)",
					reqsLow/1e6, reqsHigh/1e6, rate.PerMillionReq),
			},
			LineItem{
				Label: "Serverless execution",
				USD:   (costExecLow + costExecHigh) / 2 * discount,
				Basis: fmt.Sprintf("%.0f ms × %d MB × $%.7f/GB-s",
					shape.MeanLatencyMs, mem, rate.PerGBSecond),
			},
		)

	default:
		out.Items = append(out.Items, LineItem{
			Label: "Compute",
			USD:   0,
			Basis: "Unknown compute model — set one to include compute cost",
		})
	}

	// Egress: applies regardless of compute model.
	if cloud.EgressPerGB > 0 {
		gbLow := avgRPS * secondsPerMonth * bytes / 1e9
		gbHigh := peakRPS * secondsPerMonth * bytes / 1e9
		out.Items = append(out.Items, LineItem{
			Label: "Internet egress",
			USD:   (gbLow + gbHigh) / 2 * cloud.EgressPerGB,
			Basis: fmt.Sprintf("%.0f-%.0f GB/mo (avg %.0f bytes/req) × $%.3f/GB",
				gbLow, gbHigh, bytes, cloud.EgressPerGB),
		})
	}
	return out
}

func findSize(sizes []InstanceSize, id string) *InstanceSize {
	for i := range sizes {
		if sizes[i].ID == id {
			return &sizes[i]
		}
	}
	return nil
}
