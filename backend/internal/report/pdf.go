package report

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/metrics"
	"github.com/jung-kurt/gofpdf"
)

// psafe replaces characters core gofpdf fonts cannot render (anything outside
// CP1252 panics in SplitText). Symbols we use in the HTML are transliterated.
var psafeReplacer = strings.NewReplacer(
	"\u2014", "-",  // em dash
	"\u2013", "-",  // en dash
	"\u00B7", "-",  // middle dot
	"\u2022", "*",  // bullet
	"\u201C", "\"", "\u201D", "\"",
	"\u2018", "'",  "\u2019", "'",
	"\u2026", "...",
	"\u2264", "<=", "\u2265", ">=",
	"\u00D7", "x",  // multiplication sign
	"\u2713", "OK", "\u2714", "OK",
	"\u2717", "X",  "\u2715", "X",
	"\u2192", "->",
	"\u00B0", "deg",
	"\u00A0", " ",
)

func psafe(s string) string {
	s = psafeReplacer.Replace(s)
	var b strings.Builder
	for _, r := range s {
		if r <= 0xFF {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// sanitizeReportData makes a defensive copy with all user-controlled strings
// stripped of non-CP1252 codepoints.
func sanitizeReportData(d ReportData) ReportData {
	d.Name = psafe(d.Name)
	d.CreatedBy = psafe(d.CreatedBy)
	d.JiraID = psafe(d.JiraID)
	d.JiraLink = psafe(d.JiraLink)
	d.Notes = psafe(d.Notes)
	d.Config.Name = psafe(d.Config.Name)
	d.Config.Description = psafe(d.Config.Description)
	d.Config.Request.URL = psafe(d.Config.Request.URL)
	d.Config.Request.Method = psafe(d.Config.Request.Method)
	d.Config.Request.Body = psafe(d.Config.Request.Body)
	if d.Config.Request.Headers != nil {
		clean := make(map[string]string, len(d.Config.Request.Headers))
		for k, v := range d.Config.Request.Headers {
			clean[psafe(k)] = psafe(v)
		}
		d.Config.Request.Headers = clean
	}
	return d
}

// RenderPDF is kept for API symmetry; use RenderPDFFromData.
func RenderPDF(_ string) ([]byte, error) {
	return nil, fmt.Errorf("use RenderPDFFromData")
}

// PDFOptions tunes the generated PDF.
type PDFOptions struct {
	Orientation   string // "portrait" (default) or "landscape"
	IncludeCharts bool   // when false, skip the latency over-time chart
}

// RenderPDFFromDataWithOptions wraps RenderPDFFromData with options.
// Currently the engine renders portrait by default; orientation is plumbed
// for future use. IncludeCharts is honored by latencyAnalysis().
var renderIncludeCharts = true

func RenderPDFFromDataWithOptions(d ReportData, opts PDFOptions) ([]byte, error) {
	prev := renderIncludeCharts
	renderIncludeCharts = opts.IncludeCharts
	defer func() { renderIncludeCharts = prev }()
	// orientation is reserved for future use; gofpdf needs to know at New().
	return RenderPDFFromData(d)
}

// RenderPDFFromData produces a multi-section professional PDF with the same
// structure as the HTML report: verdict banner, executive summary, KPIs,
// latency breakdown, status breakdown, insights & recommendations, error
// details, test config, and industry standards reference.
func RenderPDFFromData(d ReportData) ([]byte, error) {
	d = sanitizeReportData(d)
	series := d.Series
	if len(series) == 0 && d.Summary != nil {
		series = d.Summary.Series
	}
	durS := 0.0
	totals := metrics.Totals{}
	if d.Summary != nil {
		durS = d.Summary.DurationS
		totals = d.Summary.Totals
	}
	// Sanitize error reasons (user-controlled).
	if totals.ErrorReasons != nil {
		clean := make(map[string]int64, len(totals.ErrorReasons))
		for k, v := range totals.ErrorReasons {
			clean[psafe(k)] = v
		}
		totals.ErrorReasons = clean
	}
	a := Compute(series, totals, durS)
	verdict := GradeVerdict(a)
	verdict.Headline = psafe(verdict.Headline)
	verdict.Summary = psafe(verdict.Summary)
	insights := DeriveInsights(a)
	for i := range insights {
		insights[i].Title = psafe(insights[i].Title)
		insights[i].Detail = psafe(insights[i].Detail)
		insights[i].Recommend = psafe(insights[i].Recommend)
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 18, 15)
	pdf.SetAutoPageBreak(true, 18)
	pdf.SetTitle("APIStress Report - "+d.Name, true)
	pdf.SetAuthor(d.CreatedBy, true)
	pdf.AddPage()

	headerBlock(pdf, d)
	titleBlock(pdf, d)
	verdictBanner(pdf, verdict)
	execSummary(pdf, d, a, verdict)
	keyMetrics(pdf, a)
	latencyAnalysis(pdf, a, series)
	responseBreakdown(pdf, a)
	insightsBlock(pdf, insights)
	if len(a.ErrorReasons) > 0 {
		errorDetails(pdf, a)
	}
	testConfig(pdf, d)
	standardsReference(pdf)

	footer(pdf, d)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ---- helpers ----

var (
	colInk     = [3]int{14, 15, 19}
	colMuted   = [3]int{106, 111, 125}
	colDim     = [3]int{154, 160, 173}
	colBorder  = [3]int{230, 228, 220}
	colBgPanel = [3]int{255, 255, 255}
	colBgSoft  = [3]int{248, 247, 242}
	colBrand2  = [3]int{122, 140, 44}
	colGood    = [3]int{34, 197, 94}
	colWarn    = [3]int{245, 158, 11}
	colBad     = [3]int{239, 68, 68}
	colChip    = [3]int{194, 207, 126}
)

func setRGB(pdf *gofpdf.Fpdf, fn func(r, g, b int), c [3]int) { fn(c[0], c[1], c[2]) }

func headerBlock(pdf *gofpdf.Fpdf, d ReportData) {
	// Brand mark (dark square with chip-yellow C)
	pdf.SetFillColor(colInk[0], colInk[1], colInk[2])
	pdf.RoundedRect(15, 15, 12, 12, 2, "1234", "F")
	pdf.SetTextColor(colChip[0], colChip[1], colChip[2])
	pdf.SetFont("Helvetica", "B", 12)
	pdf.SetXY(15, 16.2)
	pdf.CellFormat(12, 9, "C", "", 0, "C", false, 0, "")

	// Wordmark
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Times", "B", 14)
	pdf.SetXY(30, 16)
	pdf.Cell(50, 6, "APIStress")
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetFont("Courier", "", 7)
	pdf.SetXY(30, 22)
	pdf.Cell(60, 4, "OPEN-SOURCE API LOAD TESTING REPORT")

	// Right meta
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetFont("Courier", "", 7)
	pdf.SetXY(140, 16)
	pdf.CellFormat(55, 4, "REPORT GENERATED", "", 0, "R", false, 0, "")
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Courier", "B", 8)
	pdf.SetXY(140, 20)
	pdf.CellFormat(55, 4, time.Now().Format("January 2, 2006"), "", 0, "R", false, 0, "")

	pdf.SetFont("Courier", "", 7)
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetXY(140, 24)
	pdf.CellFormat(55, 4, time.Now().Format("3:04:05 PM"), "", 0, "R", false, 0, "")

	// CH-id chip
	id := d.ID
	if len(id) > 8 {
		id = id[:8]
	}
	pdf.SetFillColor(colInk[0], colInk[1], colInk[2])
	pdf.SetTextColor(colChip[0], colChip[1], colChip[2])
	pdf.SetFont("Courier", "B", 7)
	chip := "AS-" + up(id)
	cw := pdf.GetStringWidth(chip) + 4
	pdf.SetXY(195-cw, 28)
	pdf.CellFormat(cw, 4.6, chip, "", 0, "C", true, 0, "")

	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetDrawColor(colInk[0], colInk[1], colInk[2])
	pdf.SetLineWidth(0.6)
	pdf.Line(15, 35, 195, 35)
	pdf.SetY(40)
}

func titleBlock(pdf *gofpdf.Fpdf, d ReportData) {
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Times", "B", 30)
	pdf.SetX(15)
	pdf.Cell(0, 12, "Performance ")
	width := pdf.GetStringWidth("Performance ")
	pdf.SetTextColor(colBrand2[0], colBrand2[1], colBrand2[2])
	pdf.SetFont("Times", "BI", 30)
	pdf.SetX(15 + width)
	pdf.Cell(0, 12, "Analysis")
	pdf.Ln(13)

	pdf.SetTextColor(colBad[0], colBad[1], colBad[2])
	pdf.SetFont("Courier", "B", 9)
	pdf.SetX(15)
	pdf.Cell(0, 5, d.Config.Request.Method+"  ")
	wm := pdf.GetStringWidth(d.Config.Request.Method + "  ")
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Courier", "", 9)
	pdf.SetX(15 + wm)
	pdf.MultiCell(0, 5, d.Config.Request.URL, "", "L", false)
	pdf.Ln(2)
}

func verdictBanner(pdf *gofpdf.Fpdf, v Verdict) {
	bg := [3]int{255, 245, 225}
	bar := colWarn
	icon := "!"
	switch v.Severity {
	case SevGood:
		bg = [3]int{236, 253, 243}
		bar = colGood
		icon = "OK"
	case SevBad, SevCritical:
		bg = [3]int{255, 241, 240}
		bar = colBad
		icon = "X"
	}
	x := 15.0
	y := pdf.GetY() + 2
	w := 180.0
	pdf.SetFillColor(bg[0], bg[1], bg[2])
	pdf.SetDrawColor(bg[0], bg[1], bg[2])

	// Measure body height first.
	pdf.SetFont("Helvetica", "", 9)
	wrapWidth := w - 30
	bodyHeight := measureMultiLineHeight(pdf, v.Summary, wrapWidth, 4.6)
	totalH := bodyHeight + 14
	if totalH < 22 {
		totalH = 22
	}

	pdf.Rect(x, y, w, totalH, "F")
	pdf.SetFillColor(bar[0], bar[1], bar[2])
	pdf.Rect(x, y, 1.2, totalH, "F")

	// Icon circle
	pdf.SetFillColor(bar[0], bar[1], bar[2])
	pdf.Circle(x+10, y+10, 4, "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 9)
	tw := pdf.GetStringWidth(icon)
	pdf.SetXY(x+10-tw/2, y+8.5)
	pdf.Cell(tw, 4, icon)

	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetXY(x+18, y+5)
	pdf.Cell(w-22, 5, v.Headline)
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(75, 81, 96)
	pdf.SetXY(x+18, y+11)
	pdf.MultiCell(wrapWidth, 4.6, v.Summary, "", "L", false)
	pdf.SetY(y + totalH + 6)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
}

func execSummary(pdf *gofpdf.Fpdf, d ReportData, a Aggregates, v Verdict) {
	sectionTitle(pdf, "Executive Summary", "What happened in plain words - read this first.")

	pdf.SetFillColor(colBgPanel[0], colBgPanel[1], colBgPanel[2])
	pdf.SetDrawColor(colBorder[0], colBorder[1], colBorder[2])
	x, y := 15.0, pdf.GetY()
	w := 180.0
	body1 := fmt.Sprintf("We simulated %d concurrent users hitting your API in a %s pattern for %.1fs. The API served %s total requests at an average throughput of %.1f requests per second (peaking at %s rps).",
		a.PeakVUs, up(string(d.Config.Pattern)), a.DurationS, fmtIntComma(a.Requests), a.AvgRPS, fmtIntComma(int64(a.PeakRPS+0.5)))
	body2 := fmt.Sprintf("Half of all responses came back within %.0fms (typical user experience). The slowest 5%% took longer than %.0fms, and the worst 1%% exceeded %.0fms. %.2f%% of requests succeeded, while %.2f%% failed.",
		a.P50Ms, a.P95Ms, a.P99Ms, a.SuccessPct, a.ErrorPct)
	body3 := "Bottom line: " + bottomLineFor(v.Severity)

	pdf.SetFont("Helvetica", "", 10)
	h1 := measureMultiLineHeight(pdf, body1, w-12, 5)
	h2 := measureMultiLineHeight(pdf, body2, w-12, 5)
	h3 := measureMultiLineHeight(pdf, body3, w-12, 5)
	totalH := h1 + h2 + h3 + 18
	pdf.Rect(x, y, w, totalH, "FD")

	pdf.SetXY(x+6, y+5)
	pdf.MultiCell(w-12, 5, body1, "", "L", false)
	pdf.Ln(2)
	pdf.SetX(x + 6)
	pdf.MultiCell(w-12, 5, body2, "", "L", false)
	pdf.Ln(2)
	pdf.SetX(x + 6)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.MultiCell(w-12, 5, body3, "", "L", false)
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetY(y + totalH + 6)
}

func bottomLineFor(s Severity) string {
	switch s {
	case SevGood:
		return "the API performed well at this load level. You can promote with confidence."
	case SevWarn:
		return "the API has issues that should be addressed before production traffic reaches this level. See the recommendations section for specific fixes."
	case SevBad:
		return "the API is degraded under this load. Do not promote until the issues called out below are fixed and re-tested."
	case SevCritical:
		return "the API is broken under this load. This is a release-blocker."
	}
	return ""
}

func keyMetrics(pdf *gofpdf.Fpdf, a Aggregates) {
	sectionTitle(pdf, "Key Metrics", "The numbers that matter for production planning.")

	type tile struct {
		label, value, unit, hint string
		tone                     string
	}
	tiles := []tile{
		{"Total requests", fmtIntComma(a.Requests), "", fmt.Sprintf("sent in %.1fs", a.DurationS), ""},
		{"Average throughput", fmt.Sprintf("%.1f", a.AvgRPS), "rps", fmt.Sprintf("peak %s rps", fmtIntComma(int64(a.PeakRPS+0.5))), ""},
		{"Success rate", fmt.Sprintf("%.2f%%", a.SuccessPct), "", fmt.Sprintf("%s of %s", fmtIntComma(a.Successes), fmtIntComma(a.Requests)), toneSuccess(a.SuccessPct)},
		{"Error rate", fmt.Sprintf("%.2f%%", a.ErrorPct), "", fmt.Sprintf("%s failed", fmtIntComma(a.Errors)), toneError(a.ErrorPct)},
		{"Median latency", fmt.Sprintf("%.0f", a.P50Ms), "ms", "p50 - typical user", ""},
		{"95th percentile", fmt.Sprintf("%.0f", a.P95Ms), "ms", "slowest 5% of users", toneP95(a.P95Ms)},
		{"99th percentile", fmt.Sprintf("%.0f", a.P99Ms), "ms", "worst 1%", toneP99(a.P99Ms)},
		{"Data received", humanBytes(a.BytesIn), "", "payload total", ""},
	}

	x0 := 15.0
	y := pdf.GetY()
	tw := 88.0
	th := 22.0
	gap := 4.0
	for i, t := range tiles {
		row := i / 2
		col := i % 2
		tx := x0 + float64(col)*(tw+gap)
		ty := y + float64(row)*(th+gap)
		pdf.SetDrawColor(colBorder[0], colBorder[1], colBorder[2])
		pdf.SetFillColor(colBgPanel[0], colBgPanel[1], colBgPanel[2])
		pdf.Rect(tx, ty, tw, th, "FD")
		// label
		pdf.SetFont("Courier", "", 7)
		pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
		pdf.SetXY(tx+4, ty+3)
		pdf.Cell(tw-8, 3, up(t.label))
		// value
		pdf.SetFont("Times", "B", 18)
		switch t.tone {
		case "good":
			pdf.SetTextColor(colGood[0], colGood[1], colGood[2])
		case "warn":
			pdf.SetTextColor(colWarn[0], colWarn[1], colWarn[2])
		case "bad":
			pdf.SetTextColor(colBad[0], colBad[1], colBad[2])
		default:
			pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
		}
		pdf.SetXY(tx+4, ty+8)
		pdf.Cell(tw-8, 8, t.value)
		if t.unit != "" {
			vw := pdf.GetStringWidth(t.value) + 1
			pdf.SetFont("Helvetica", "", 9)
			pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
			pdf.SetXY(tx+4+vw, ty+11.5)
			pdf.Cell(20, 4, t.unit)
		}
		// hint
		pdf.SetFont("Courier", "", 7)
		pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
		pdf.SetXY(tx+4, ty+th-5)
		pdf.Cell(tw-8, 3, t.hint)
	}
	pdf.SetY(y + 4*(th+gap) + 2)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])

	// callout
	calloutBlock(pdf, "How to read percentiles:", "\"p95 = 400ms\" means 95% of users got a response in 400ms or less, and 5% waited longer. Percentiles reveal real user experience far better than averages, which hide slow outliers. Industry rule of thumb: if p95 is more than 3× your p50, you have unpredictable performance.")
}

func toneSuccess(p float64) string {
	if p >= 99 {
		return "good"
	}
	if p >= 95 {
		return "warn"
	}
	return "bad"
}
func toneError(p float64) string {
	if p >= 5 {
		return "bad"
	}
	if p >= 1 {
		return "warn"
	}
	return "good"
}
func toneP95(ms float64) string {
	if ms >= 1000 {
		return "bad"
	}
	if ms >= 500 {
		return "warn"
	}
	return "good"
}
func toneP99(ms float64) string {
	if ms >= 2000 {
		return "bad"
	}
	if ms >= 1000 {
		return "warn"
	}
	return "good"
}

func latencyAnalysis(pdf *gofpdf.Fpdf, a Aggregates, series []metrics.SecondBucket) {
	sectionTitle(pdf, "Latency Analysis", "How fast the API responded, and how consistent that speed was.")

	// chart
	x, y := 15.0, pdf.GetY()
	w, h := 180.0, 50.0
	pdf.SetDrawColor(colBorder[0], colBorder[1], colBorder[2])
	pdf.SetFillColor(colBgPanel[0], colBgPanel[1], colBgPanel[2])
	pdf.Rect(x, y, w, h, "FD")
	pdf.SetFont("Courier", "", 7)
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetXY(x+3, y+3)
	pdf.Cell(50, 3, "LATENCY OVER TIME")

	if len(series) > 0 {
		max := 0.0
		for _, b := range series {
			if b.P99Ms > max {
				max = b.P99Ms
			}
		}
		if max <= 0 {
			max = 1
		}
		drawLatencyLine(pdf, x+8, y+8, w-12, h-12, series, max, "p50", colors{59, 130, 246})
		drawLatencyLine(pdf, x+8, y+8, w-12, h-12, series, max, "p95", colors{245, 158, 11})
		drawLatencyLine(pdf, x+8, y+8, w-12, h-12, series, max, "p99", colors{239, 68, 68})

		// Legend
		pdf.SetXY(x+3, y+h-5)
		pdf.SetFont("Courier", "", 7)
		legendItem(pdf, "p50", 59, 130, 246)
		legendItem(pdf, "p95", 245, 158, 11)
		legendItem(pdf, "p99", 239, 68, 68)
	} else {
		pdf.SetXY(x+w/2-15, y+h/2)
		pdf.Cell(40, 4, "no data points")
	}
	pdf.SetY(y + h + 4)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])

	// Table
	tableHeader2(pdf, []string{"METRIC", "VALUE", "WHAT IT MEANS"}, []float64{50, 30, 100})
	row := func(name, val, meaning string) {
		tableRow2(pdf, []string{name, val, meaning}, []float64{50, 30, 100})
	}
	row("Minimum", fmt.Sprintf("%.0f ms", a.MinMs), "Fastest response observed")
	row("Average (mean)", fmt.Sprintf("%.0f ms", a.MeanMs), "Arithmetic average - hides outliers")
	row("Median (p50)", fmt.Sprintf("%.0f ms", a.P50Ms), "What a typical user experiences")
	row("p75", fmt.Sprintf("%.0f ms", a.P75Ms), "75% of users are faster than this")
	row("p90", fmt.Sprintf("%.0f ms", a.P90Ms), "Common SLO target")
	row("p95", fmt.Sprintf("%.0f ms", a.P95Ms), "Industry standard SLO target")
	row("p99", fmt.Sprintf("%.0f ms", a.P99Ms), "Worst 1% - your frustrated users")
	row("Maximum", fmt.Sprintf("%.0f ms", a.MaxMs), "Slowest response observed")
	row("Std Deviation", fmt.Sprintf("%.0f ms", a.StdDevMs), "Lower = more predictable")
	pdf.Ln(4)
}

type colors struct{ r, g, b int }

func drawLatencyLine(pdf *gofpdf.Fpdf, x, y, w, h float64, series []metrics.SecondBucket, max float64, kind string, c colors) {
	if len(series) == 0 || max <= 0 {
		return
	}
	pdf.SetDrawColor(c.r, c.g, c.b)
	pdf.SetLineWidth(0.4)
	prevX, prevY := 0.0, 0.0
	denom := float64(len(series) - 1)
	if denom < 1 {
		denom = 1
	}
	for i, b := range series {
		var v float64
		switch kind {
		case "p50":
			v = b.P50Ms
		case "p95":
			v = b.P95Ms
		case "p99":
			v = b.P99Ms
		}
		px := x + (float64(i)/denom)*w
		py := y + h - (v/max)*h
		if i > 0 {
			pdf.Line(prevX, prevY, px, py)
		}
		prevX, prevY = px, py
	}
}

func legendItem(pdf *gofpdf.Fpdf, label string, r, g, b int) {
	pdf.SetFillColor(r, g, b)
	x, y := pdf.GetX(), pdf.GetY()+1
	pdf.Rect(x, y, 3, 1, "F")
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetXY(x+5, pdf.GetY())
	pdf.Cell(15, 3, label)
}

func responseBreakdown(pdf *gofpdf.Fpdf, a Aggregates) {
	sectionTitle(pdf, "Response Breakdown", "What the API returned, and what it means.")

	tableHeader2(pdf, []string{"CODE", "MEANING", "COUNT", "SHARE"}, []float64{30, 90, 30, 30})
	keys := make([]int, 0, len(a.StatusCounts))
	for k := range a.StatusCounts {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	total := float64(a.Requests)
	if total == 0 {
		total = 1
	}
	for _, k := range keys {
		count := a.StatusCounts[k]
		pct := float64(count) / total * 100
		label := statusCodeLabel(k)
		mean := statusMeaning(k)
		tableRow2(pdf,
			[]string{label, mean, fmtIntComma(count), fmt.Sprintf("%.2f%%", pct)},
			[]float64{30, 90, 30, 30},
		)
	}
	pdf.Ln(2)
	calloutBlock(pdf, "Status code guide:",
		"2xx = success.   3xx = redirect (usually fine).   4xx = client mistake (bad auth, bad input).   5xx = server failure (crashes, timeouts, overload).   Network/Timeout = request never reached the server or didn't finish in time.")
}

func insightsBlock(pdf *gofpdf.Fpdf, ins []Insight) {
	sectionTitle(pdf, "Insights & Recommendations", "Patterns we detected in your data - and what to do next.")
	for _, in := range ins {
		insightCard(pdf, in)
	}
}

func insightCard(pdf *gofpdf.Fpdf, in Insight) {
	x := 15.0
	w := 180.0
	y := pdf.GetY()
	pdf.SetFont("Helvetica", "", 9)
	bodyH := measureMultiLineHeight(pdf, in.Detail, w-22, 4.4)
	recH := 0.0
	if in.Recommend != "" {
		pdf.SetFont("Helvetica", "", 8)
		recH = measureMultiLineHeight(pdf, "Recommendation: "+in.Recommend, w-26, 4.2) + 6
	}
	totalH := 12 + bodyH + recH
	if totalH < 18 {
		totalH = 18
	}

	if y+totalH > 280 {
		pdf.AddPage()
		y = pdf.GetY()
	}

	pdf.SetDrawColor(colBorder[0], colBorder[1], colBorder[2])
	pdf.SetFillColor(colBgPanel[0], colBgPanel[1], colBgPanel[2])
	pdf.Rect(x, y, w, totalH, "FD")

	// icon circle
	var ic [3]int
	icon := "i"
	switch in.Severity {
	case SevGood:
		ic = colGood
		icon = "OK"
	case SevWarn:
		ic = colWarn
		icon = "!"
	case SevBad, SevCritical:
		ic = colBad
		icon = "X"
	default:
		ic = [3]int{168, 85, 247}
		icon = "i"
	}
	pdf.SetFillColor(ic[0], ic[1], ic[2])
	pdf.Circle(x+8, y+8, 3.2, "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 7)
	w0 := pdf.GetStringWidth(icon)
	pdf.SetXY(x+8-w0/2, y+6.5)
	pdf.Cell(w0, 3, icon)

	// title
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetXY(x+15, y+4.5)
	pdf.Cell(w-18, 4, in.Title)

	// detail
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(60, 65, 75)
	pdf.SetXY(x+15, y+10)
	pdf.MultiCell(w-22, 4.4, in.Detail, "", "L", false)

	if in.Recommend != "" {
		ry := pdf.GetY() + 1
		pdf.SetFillColor(colBgSoft[0], colBgSoft[1], colBgSoft[2])
		pdf.Rect(x+15, ry, w-22, recH-1, "F")
		pdf.SetFillColor(colBrand2[0], colBrand2[1], colBrand2[2])
		pdf.Rect(x+15, ry, 0.8, recH-1, "F")
		pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
		pdf.SetFont("Helvetica", "B", 8)
		pdf.SetXY(x+18, ry+1.5)
		pdf.Cell(40, 3.5, "Recommendation:")
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetXY(x+18, ry+5.5)
		pdf.MultiCell(w-26, 4.2, in.Recommend, "", "L", false)
	}
	pdf.SetY(y + totalH + 3)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
}

func errorDetails(pdf *gofpdf.Fpdf, a Aggregates) {
	sectionTitle(pdf, "Error Details", "Specific errors observed during the test.")
	tableHeader2(pdf, []string{"ERROR", "OCCURRENCES"}, []float64{145, 35})
	rows := make([]errorRow, 0, len(a.ErrorReasons))
	for k, v := range a.ErrorReasons {
		rows = append(rows, errorRow{k, v})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Count > rows[j].Count })
	for _, r := range rows {
		tableRow2(pdf, []string{r.Reason, fmtIntComma(r.Count)}, []float64{145, 35})
	}
	pdf.Ln(2)
}

func testConfig(pdf *gofpdf.Fpdf, d ReportData) {
	sectionTitle(pdf, "Test Configuration", "Exact parameters used - reproducible.")
	row := func(k, v string) {
		tableRow2(pdf, []string{k, v}, []float64{60, 120})
	}
	row("Test pattern", up(string(d.Config.Pattern)))
	row("HTTP method", d.Config.Request.Method)
	row("Target URL", d.Config.Request.URL)
	row("Virtual users", fmt.Sprintf("%d", d.Config.VUs))
	row("Test duration", fmt.Sprintf("%ds", d.Config.DurationSec))
	row("Think time", fmt.Sprintf("%d ms", d.Config.ThinkTimeMs))
	row("Request timeout", fmt.Sprintf("%d ms", d.Config.Request.Timeout))
	row("Custom headers", fmt.Sprintf("%d", len(d.Config.Request.Headers)))
	row("Started at", fmtTimePtr(d.StartedAt))
	row("Finished at", fmtTimePtr(d.FinishedAt))
	pdf.Ln(2)
}

func standardsReference(pdf *gofpdf.Fpdf) {
	sectionTitle(pdf, "Industry Standards Reference", "Thresholds used to judge your API, from published engineering standards.")
	tableHeader2(pdf, []string{"SOURCE", "METRIC", "TARGET"}, []float64{60, 70, 50})
	row := func(s, m, t string) { tableRow2(pdf, []string{s, m, t}, []float64{60, 70, 50}) }
	row("Google SRE Handbook", "Error budget", "<= 1% per month")
	row("Google SRE Handbook", "p99 latency (interactive)", "< 1000ms")
	row("Google Web Vitals", "Good response time (INP)", "< 200ms")
	row("Google Web Vitals", "Poor response time (INP)", "> 500ms")
	row("AWS Well-Architected", "Latency variance", "p95 within 2x p50")
	row("General industry", "Availability (\"three nines\")", "99.9% uptime")
}

func footer(pdf *gofpdf.Fpdf, d ReportData) {
	pdf.SetY(-22)
	pdf.SetDrawColor(colInk[0], colInk[1], colInk[2])
	pdf.Line(15, pdf.GetY(), 195, pdf.GetY())
	pdf.Ln(2)
	pdf.SetFont("Courier", "", 7)
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetX(15)
	pdf.CellFormat(80, 4, "APISTRESS  -  OPEN-SOURCE", "", 0, "L", false, 0, "")
	pdf.SetX(95)
	right := "REPORT PREPARED BY "
	right += up(d.CreatedBy)
	if d.JiraID != "" {
		right += "  -  JIRA " + d.JiraID
	}
	right += "  -  " + time.Now().Format("January 2, 2006")
	pdf.CellFormat(100, 4, right, "", 0, "R", false, 0, "")
}

// ---- shared layout helpers ----

func sectionTitle(pdf *gofpdf.Fpdf, title, lede string) {
	if pdf.GetY() > 250 {
		pdf.AddPage()
	}
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Times", "B", 16)
	pdf.SetX(15)
	pdf.Cell(0, 8, title)
	pdf.Ln(7)
	pdf.SetFont("Helvetica", "I", 9)
	pdf.SetTextColor(colMuted[0], colMuted[1], colMuted[2])
	pdf.SetX(15)
	pdf.Cell(0, 5, lede)
	pdf.Ln(7)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
}

func tableHeader2(pdf *gofpdf.Fpdf, cols []string, widths []float64) {
	pdf.SetFillColor(colInk[0], colInk[1], colInk[2])
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Courier", "B", 8)
	for i, c := range cols {
		pdf.CellFormat(widths[i], 7, c, "", 0, "L", true, 0, "")
	}
	pdf.Ln(7)
	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
}

func tableRow2(pdf *gofpdf.Fpdf, cells []string, widths []float64) {
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetDrawColor(colBorder[0], colBorder[1], colBorder[2])
	// compute height for wrapping cells (last column wraps if long)
	maxH := 6.0
	for i := range cells {
		h := measureMultiLineHeight(pdf, cells[i], widths[i]-2, 4.6)
		if h+2 > maxH {
			maxH = h + 2
		}
	}
	x := pdf.GetX()
	y := pdf.GetY()
	for i, cell := range cells {
		pdf.SetXY(x, y)
		pdf.CellFormat(widths[i], maxH, "", "B", 0, "L", false, 0, "")
		pdf.SetXY(x+1, y+1)
		pdf.MultiCell(widths[i]-2, 4.6, cell, "", "L", false)
		x += widths[i]
	}
	pdf.SetXY(15, y+maxH)
}

func calloutBlock(pdf *gofpdf.Fpdf, head, body string) {
	x := 15.0
	y := pdf.GetY() + 1
	w := 180.0
	pdf.SetFont("Helvetica", "", 8)
	bodyH := measureMultiLineHeight(pdf, head+" "+body, w-12, 4.2)
	totalH := bodyH + 6
	pdf.SetFillColor(colBgSoft[0], colBgSoft[1], colBgSoft[2])
	pdf.SetDrawColor(colBgSoft[0], colBgSoft[1], colBgSoft[2])
	pdf.Rect(x, y, w, totalH, "F")
	pdf.SetFillColor(colBrand2[0], colBrand2[1], colBrand2[2])
	pdf.Rect(x, y, 1, totalH, "F")

	pdf.SetTextColor(colInk[0], colInk[1], colInk[2])
	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetXY(x+4, y+3)
	wHead := pdf.GetStringWidth(head) + 1
	pdf.Cell(wHead, 4, head)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetXY(x+4+wHead, y+3)
	pdf.MultiCell(w-12-wHead, 4.2, body, "", "L", false)
	pdf.SetY(y + totalH + 3)
}

func measureMultiLineHeight(pdf *gofpdf.Fpdf, text string, width, lineH float64) float64 {
	if text == "" {
		return lineH
	}
	lines := pdf.SplitText(text, width)
	if len(lines) == 0 {
		return lineH
	}
	return float64(len(lines)) * lineH
}

func fmtTimePtr(t *time.Time) string {
	if t == nil {
		return "-"
	}
	return t.Format("Jan 2, 2006 - 3:04:05 PM MST")
}
