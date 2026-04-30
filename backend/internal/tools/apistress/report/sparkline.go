package report

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
)

// multiSparklineSVG draws p50/p95/p99 lines on a single inline SVG, with a
// faint y-axis grid and labels — this is what the HTML report calls.
func multiSparklineSVG(series []metrics.SecondBucket) string {
	if len(series) == 0 {
		return `<svg viewBox="0 0 800 200"><text x="20" y="100" fill="#6a6f7d" font-family="JetBrains Mono, monospace" font-size="12">No data points recorded</text></svg>`
	}
	w, h := 800.0, 220.0
	padL, padR, padT, padB := 40.0, 16.0, 14.0, 24.0
	mx := w - padL - padR
	my := h - padT - padB

	type line struct {
		color string
		vals  []float64
	}
	lines := []line{
		{"#3b82f6", make([]float64, len(series))},
		{"#f59e0b", make([]float64, len(series))},
		{"#ef4444", make([]float64, len(series))},
	}
	for i, b := range series {
		lines[0].vals[i] = b.P50Ms
		lines[1].vals[i] = b.P95Ms
		lines[2].vals[i] = b.P99Ms
	}

	max := 0.0
	for _, ln := range lines {
		for _, v := range ln.vals {
			if v > max {
				max = v
			}
		}
	}
	if max <= 0 {
		max = 1
	}

	var grid bytes.Buffer
	const steps = 4
	for i := 0; i <= steps; i++ {
		y := padT + (float64(i)/float64(steps))*my
		val := max - (float64(i)/float64(steps))*max
		fmt.Fprintf(&grid, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e6e4dc" stroke-width="1"/>`,
			padL, y, w-padR, y)
		fmt.Fprintf(&grid, `<text x="%.1f" y="%.1f" font-family="JetBrains Mono, monospace" font-size="9" fill="#9aa0ad" text-anchor="end">%.0f</text>`,
			padL-4, y+3, val)
	}

	var paths bytes.Buffer
	for _, ln := range lines {
		var pts strings.Builder
		for i, v := range ln.vals {
			denom := float64(len(ln.vals) - 1)
			if denom < 1 {
				denom = 1
			}
			x := padL + (float64(i)/denom)*mx
			y := padT + (1-(v/max))*my
			if i > 0 {
				pts.WriteByte(' ')
			}
			fmt.Fprintf(&pts, "%.1f,%.1f", x, y)
		}
		fmt.Fprintf(&paths,
			`<polyline fill="none" stroke="%s" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="%s"/>`,
			ln.color, pts.String())
	}
	return fmt.Sprintf(`<svg viewBox="0 0 %.0f %.0f" preserveAspectRatio="none">%s%s</svg>`,
		w, h, grid.String(), paths.String())
}

func lastBucket(s []metrics.SecondBucket) *metrics.SecondBucket {
	if len(s) == 0 {
		return nil
	}
	b := s[len(s)-1]
	return &b
}

// sparkline renders an inline SVG line chart for the given series.
func sparkline(seriesAny interface{}, kind string) string {
	series, ok := seriesAny.([]metrics.SecondBucket)
	if !ok || len(series) == 0 {
		return `<svg viewBox="0 0 600 120"><text x="20" y="60" fill="#8a90a2" font-family="sans-serif" font-size="12">No data</text></svg>`
	}
	values := make([]float64, len(series))
	for i, b := range series {
		switch kind {
		case "p95":
			values[i] = b.P95Ms
		case "p99":
			values[i] = b.P99Ms
		case "rps":
			values[i] = float64(b.Requests)
		case "vus":
			values[i] = float64(b.ActiveVUs)
		case "errors":
			values[i] = float64(b.Errors)
		default:
			values[i] = b.MeanMs
		}
	}
	w, h := 600.0, 140.0
	pad := 24.0
	mx := w - pad*2
	my := h - pad*2

	min, max := values[0], values[0]
	for _, v := range values {
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	if max == min {
		max = min + 1
	}

	var pts strings.Builder
	for i, v := range values {
		x := pad + (float64(i)/float64(len(values)-1))*mx
		if len(values) == 1 {
			x = pad + mx/2
		}
		y := pad + (1-(v-min)/(max-min))*my
		if i > 0 {
			pts.WriteByte(' ')
		}
		fmt.Fprintf(&pts, "%.1f,%.1f", x, y)
	}

	color := "#FF5A1F"
	if kind == "rps" {
		color = "#22c55e"
	}
	return fmt.Sprintf(`<svg viewBox="0 0 %.0f %.0f" preserveAspectRatio="none">
  <rect x="0" y="0" width="%.0f" height="%.0f" fill="transparent"/>
  <polyline fill="none" stroke="%s" stroke-width="2" points="%s"/>
  <text x="%.0f" y="14" fill="#8a90a2" font-family="sans-serif" font-size="11">max %.2f</text>
  <text x="%.0f" y="%.0f" fill="#8a90a2" font-family="sans-serif" font-size="11">min %.2f</text>
</svg>`, w, h, w, h, color, pts.String(), pad, max, pad, h-8, min)
}
