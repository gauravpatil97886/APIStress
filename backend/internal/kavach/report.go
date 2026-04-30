package kavach

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

// PDFFinding is the small finding shape the PDF renderer needs. Mirrors the
// DB columns + plain-English fields. Defined separately from `Finding` so
// the handler can build it from a SQL row without dragging the whole Test
// machinery into the PDF path.
type PDFFinding struct {
	Severity            string
	Category            string
	TestID              string
	Title               string
	Description         string
	PlainTitle          string
	PlainWhatsHappening string
	PlainWhy            string
	PlainHowToFix       []string
	Effort              string
	Evidence            string
	OWASP               string
	CWE                 string
	Remediation         string
	// Attack mechanic ("what Kavach tried"). Falls back to the registered
	// explanation map when the DB column is empty (older rows).
	TestExplanation string
}

// PDFTestRow captures a single test that ran during the scan — pass or
// fail. Used to render the VAPT compliance section that lists every check
// performed, not just the ones that flagged something.
type PDFTestRow struct {
	TestID       string
	Name         string
	Category     string
	Passed       bool
	FindingCount int
}

type PDFInput struct {
	ScanID     string
	TargetURL  string
	TargetHost string
	Status     string
	StartedAt  time.Time
	FinishedAt *time.Time
	CreatedBy  string
	Summary    map[string]interface{}
	Findings   []PDFFinding
	TestRows   []PDFTestRow // every check that ran (PASS / FAIL list)
}

// ─── Brand palette (cyan/teal — matches the in-app KavachReport) ──────────
var (
	kInk      = [3]int{15, 23, 42}    // slate-900
	kInkSoft  = [3]int{30, 41, 59}    // slate-800
	kMuted    = [3]int{100, 116, 139} // slate-500
	kDim      = [3]int{148, 163, 184} // slate-400
	kBorder   = [3]int{226, 232, 240} // slate-200
	kPanel    = [3]int{255, 255, 255}
	kSoft     = [3]int{240, 253, 250} // teal-50
	kAccent1  = [3]int{8, 145, 178}   // cyan-600
	kAccent2  = [3]int{13, 148, 136}  // teal-600
	kAccent3  = [3]int{15, 118, 110}  // teal-700
	kGood     = [3]int{22, 163, 74}
	kWarn     = [3]int{234, 88, 12}
	kBad      = [3]int{220, 38, 38}
	// severity background swatches for cards
	kCritBg = [3]int{254, 226, 226}
	kHighBg = [3]int{255, 237, 213}
	kMedBg  = [3]int{254, 243, 199}
	kLowBg  = [3]int{219, 234, 254}
	kInfoBg = [3]int{226, 232, 240}
)

// RenderSecurityPDF produces the Kavach security report as a PDF byte slice.
// Layout:
//   1. Cover page — cyan/teal gradient hero + identity strip + stat tiles.
//   2. Executive summary — verdict banner, severity rollup, "what to do".
//   3. Findings — polished per-finding cards with side-bar accent.
//   4. VAPT compliance — full table of every check that ran (PASS/FAIL).
//   5. Methodology — how the scan worked + OWASP API Top-10 reference.
//
// We deliberately don't share with internal/report/pdf.go — that file is
// load-test-specific (RPS charts, latency percentiles). Security findings
// have a fundamentally different shape so a parallel renderer is cleaner
// than a flag-soup conditional.
func RenderSecurityPDF(in PDFInput) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 18, 15)
	pdf.SetAutoPageBreak(true, 22)
	pdf.SetCreator("Choice Techlab Kavach", true)
	pdf.SetTitle("Kavach Security Report — "+in.TargetHost, true)
	pdf.SetAuthor(in.CreatedBy, true)

	// Footer on every page (skip cover via a flag in the closure).
	pageNum := 0
	pdf.SetFooterFunc(func() {
		if pageNum == 0 {
			return // cover page handles its own footer
		}
		footerLine(pdf, in, pageNum)
	})

	// 1. Cover
	pdf.AddPage()
	cover(pdf, in)

	// 2. Executive summary (counts as page 1 in the footer)
	pdf.AddPage()
	pageNum = 1
	headerStrip(pdf, in)
	verdictBlock(pdf, in)
	severityRollup(pdf, in)
	whatToDo(pdf, in)

	// 3. Findings
	if len(in.Findings) > 0 {
		pdf.AddPage()
		pageNum++
		headerStrip(pdf, in)
		sectionTitleK(pdf, "Findings", "Each issue, in plain English, with reproducible evidence.")
		for _, f := range in.Findings {
			findingCard(pdf, f)
		}
	}

	// 4. VAPT compliance
	if len(in.TestRows) > 0 {
		pdf.AddPage()
		pageNum++
		headerStrip(pdf, in)
		complianceTable(pdf, in)
	}

	// 5. Methodology
	pdf.AddPage()
	pageNum++
	headerStrip(pdf, in)
	methodology(pdf, in)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ─── Cover ─────────────────────────────────────────────────────────────────

func cover(pdf *gofpdf.Fpdf, in PDFInput) {
	// Cyan→teal gradient — multi-strip blend (gofpdf only does flat fills).
	w := 210.0
	bandH := 95.0
	steps := 18
	r1, g1, b1 := 8.0, 145.0, 178.0  // cyan-600
	r2, g2, b2 := 13.0, 148.0, 136.0 // teal-600
	for i := 0; i < steps; i++ {
		t := float64(i) / float64(steps-1)
		r := int(r1 + (r2-r1)*t)
		g := int(g1 + (g2-g1)*t)
		b := int(b1 + (b2-b1)*t)
		pdf.SetFillColor(r, g, b)
		pdf.Rect(0, float64(i)*(bandH/float64(steps)), w, bandH/float64(steps)+0.4, "F")
	}

	// Decorative shield mark
	pdf.SetFillColor(255, 255, 255)
	pdf.SetAlpha(0.12, "Normal")
	pdf.Circle(180, 32, 22, "F")
	pdf.SetAlpha(1.0, "Normal")

	// Brand mark (rounded square + K)
	pdf.SetFillColor(255, 255, 255)
	pdf.SetAlpha(0.18, "Normal")
	pdf.RoundedRect(15, 18, 14, 14, 3, "1234", "F")
	pdf.SetAlpha(1.0, "Normal")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 14)
	pdf.SetXY(15, 19.5)
	pdf.CellFormat(14, 11, "K", "", 0, "C", false, 0, "")

	// Wordmark
	pdf.SetFont("Times", "B", 28)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetXY(33, 18)
	pdf.Cell(80, 10, psafe("KAVACH"))

	pdf.SetFont("Courier", "", 8)
	pdf.SetXY(33, 28)
	pdf.Cell(120, 4, psafe("API SECURITY ASSESSMENT REPORT"))

	// Title
	pdf.SetFont("Times", "B", 26)
	pdf.SetXY(15, 50)
	pdf.MultiCell(180, 11, psafe("Security Assessment"), "", "L", false)
	pdf.SetFont("Times", "BI", 22)
	pdf.SetTextColor(207, 250, 254) // cyan-100 highlight
	pdf.SetXY(15, 64)
	pdf.Cell(180, 9, psafe("Findings & Verdict"))

	// Right-side "report id" pill
	id := in.ScanID
	if len(id) > 8 {
		id = id[:8]
	}
	pdf.SetFont("Courier", "B", 8)
	chip := "KV-" + strings.ToUpper(id)
	cw := pdf.GetStringWidth(chip) + 6
	pdf.SetFillColor(255, 255, 255)
	pdf.SetAlpha(0.16, "Normal")
	pdf.RoundedRect(195-cw, 78, cw, 6.5, 1.6, "1234", "F")
	pdf.SetAlpha(1.0, "Normal")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetXY(195-cw, 78.6)
	pdf.CellFormat(cw, 5, chip, "", 0, "C", false, 0, "")

	// Body — target identity
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetY(110)
	pdf.SetX(15)
	pdf.SetFont("Times", "B", 22)
	pdf.MultiCell(180, 9, psafe(valueOr(in.TargetHost, in.TargetURL)), "", "L", false)
	pdf.SetFont("Courier", "", 9)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	pdf.MultiCell(180, 5, psafe(in.TargetURL), "", "L", false)

	// Stat tiles (5-up): findings, critical, high, scan time, operator
	counts := countsFromSummary(in)
	totalFindings := counts["critical"] + counts["high"] + counts["medium"] + counts["low"] + counts["info"]
	dur := "—"
	if in.FinishedAt != nil {
		dur = in.FinishedAt.Sub(in.StartedAt).Round(time.Second).String()
	}
	tiles := []struct {
		label, value string
		col          [3]int
	}{
		{"Findings", intToStr(totalFindings), kInk},
		{"Critical", intToStr(counts["critical"]), kBad},
		{"High", intToStr(counts["high"]), kWarn},
		{"Duration", dur, kAccent2},
		{"Status", strings.ToUpper(in.Status), kAccent1},
	}
	x0 := 15.0
	y := pdf.GetY() + 8
	tw := (180.0 - 4*3.0) / 5.0 // 4 gaps, 5 tiles
	th := 22.0
	gap := 3.0
	for i, t := range tiles {
		x := x0 + float64(i)*(tw+gap)
		pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
		pdf.SetFillColor(kPanel[0], kPanel[1], kPanel[2])
		pdf.RoundedRect(x, y, tw, th, 2, "1234", "FD")
		// Top accent strip
		pdf.SetFillColor(t.col[0], t.col[1], t.col[2])
		pdf.Rect(x, y, tw, 1.2, "F")
		// label
		pdf.SetFont("Courier", "", 7)
		pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
		pdf.SetXY(x+3, y+4)
		pdf.Cell(tw-6, 3, strings.ToUpper(t.label))
		// value
		pdf.SetFont("Times", "B", 14)
		pdf.SetTextColor(t.col[0], t.col[1], t.col[2])
		pdf.SetXY(x+3, y+9)
		pdf.MultiCell(tw-6, 6, psafe(truncate(t.value, 12)), "", "L", false)
	}
	pdf.SetY(y + th + 8)

	// Identity strip (operator / started / finished)
	pdf.SetFont("Courier", "", 8)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	identKV(pdf, "OPERATOR", valueOr(in.CreatedBy, "—"))
	identKV(pdf, "STARTED", in.StartedAt.Format("Mon, 02 Jan 2006 15:04 MST"))
	if in.FinishedAt != nil {
		identKV(pdf, "FINISHED", in.FinishedAt.Format("Mon, 02 Jan 2006 15:04 MST"))
	}
	identKV(pdf, "SCAN ID", in.ScanID)

	// Footer cover line
	pdf.SetY(-22)
	pdf.SetDrawColor(kAccent1[0], kAccent1[1], kAccent1[2])
	pdf.SetLineWidth(0.4)
	pdf.Line(15, pdf.GetY(), 195, pdf.GetY())
	pdf.Ln(2)
	pdf.SetFont("Courier", "", 7)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	pdf.CellFormat(120, 4, psafe("CHOICE TECHLAB - KAVACH - API SECURITY SHIELD"), "", 0, "L", false, 0, "")
	pdf.SetX(135)
	pdf.CellFormat(60, 4, time.Now().Format("January 2, 2006"), "", 0, "R", false, 0, "")
}

func identKV(pdf *gofpdf.Fpdf, k, v string) {
	pdf.SetFont("Courier", "", 7.5)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	pdf.CellFormat(28, 4.5, k, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.MultiCell(0, 4.5, psafe(v), "", "L", false)
}

// ─── Header strip on body pages ────────────────────────────────────────────

func headerStrip(pdf *gofpdf.Fpdf, in PDFInput) {
	// Mini brand mark + scan id chip + date.
	pdf.SetFillColor(kAccent1[0], kAccent1[1], kAccent1[2])
	pdf.RoundedRect(15, 12, 8, 8, 1.6, "1234", "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetXY(15, 13.4)
	pdf.CellFormat(8, 5, "K", "", 0, "C", false, 0, "")

	pdf.SetFont("Times", "B", 11)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetXY(26, 12)
	pdf.Cell(60, 4, "Kavach")
	pdf.SetFont("Courier", "", 6.5)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetXY(26, 16.5)
	pdf.Cell(80, 3, psafe("SECURITY ASSESSMENT - "+strings.ToUpper(valueOr(in.TargetHost, "TARGET"))))

	id := in.ScanID
	if len(id) > 8 {
		id = id[:8]
	}
	pdf.SetFont("Courier", "B", 7)
	chip := "KV-" + strings.ToUpper(id)
	cw := pdf.GetStringWidth(chip) + 4
	pdf.SetFillColor(kAccent1[0], kAccent1[1], kAccent1[2])
	pdf.SetTextColor(255, 255, 255)
	pdf.RoundedRect(195-cw, 13.5, cw, 4.6, 1, "1234", "F")
	pdf.SetXY(195-cw, 14.2)
	pdf.CellFormat(cw, 3.4, chip, "", 0, "C", false, 0, "")

	pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
	pdf.SetLineWidth(0.3)
	pdf.Line(15, 22, 195, 22)
	pdf.SetY(28)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
}

// ─── Verdict banner ────────────────────────────────────────────────────────

func verdictBlock(pdf *gofpdf.Fpdf, in PDFInput) {
	c := countsFromSummary(in)
	headline := "Healthy — no issues detected"
	body := "Kavach ran the full check suite and found nothing concerning. A hands-on review by a human security engineer is still recommended for sensitive surfaces."
	bar := kGood
	bg := [3]int{236, 253, 245} // emerald-50
	icon := "OK"

	switch {
	case c["critical"] > 0:
		headline = fmt.Sprintf("Critical — %d issue(s) require immediate attention", c["critical"])
		body = "Address the critical findings before the next deploy. They are exploitable and observable in this scan's evidence."
		bar = kBad
		bg = [3]int{254, 242, 242}
		icon = "X"
	case c["high"] > 0:
		headline = fmt.Sprintf("Action needed — %d high-priority issue(s)", c["high"])
		body = "No critical issues, but there are high-priority findings that should be fixed this sprint."
		bar = kWarn
		bg = [3]int{255, 247, 237}
		icon = "!"
	case c["medium"]+c["low"]+c["info"] > 0:
		headline = "Strong posture — minor findings only"
		body = "No critical or high-priority issues. The remaining findings are defence-in-depth improvements you can plan over the coming weeks."
		bar = kAccent1
		bg = [3]int{236, 254, 255}
		icon = "i"
	}

	x, y := 15.0, pdf.GetY()
	w := 180.0
	pdf.SetFont("Helvetica", "", 9.5)
	bodyH := measureMultiK(pdf, body, w-30, 4.6)
	totalH := bodyH + 14
	if totalH < 22 {
		totalH = 22
	}
	pdf.SetFillColor(bg[0], bg[1], bg[2])
	pdf.SetDrawColor(bg[0], bg[1], bg[2])
	pdf.RoundedRect(x, y, w, totalH, 2, "1234", "F")
	// side bar
	pdf.SetFillColor(bar[0], bar[1], bar[2])
	pdf.Rect(x, y, 1.4, totalH, "F")
	// icon circle
	pdf.SetFillColor(bar[0], bar[1], bar[2])
	pdf.Circle(x+10, y+10, 4, "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 9)
	tw := pdf.GetStringWidth(icon)
	pdf.SetXY(x+10-tw/2, y+8.4)
	pdf.Cell(tw, 4, icon)

	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetXY(x+18, y+5)
	pdf.MultiCell(w-22, 5, psafe(headline), "", "L", false)
	pdf.SetFont("Helvetica", "", 9.5)
	pdf.SetTextColor(60, 70, 85)
	pdf.SetXY(x+18, y+11)
	pdf.MultiCell(w-30, 4.6, psafe(body), "", "L", false)
	pdf.SetY(y + totalH + 6)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
}

// ─── Severity rollup (5 cards) ─────────────────────────────────────────────

func severityRollup(pdf *gofpdf.Fpdf, in PDFInput) {
	sectionTitleK(pdf, "Findings by severity", "Counts by impact, ordered by urgency.")

	counts := countsFromSummary(in)
	cards := []struct {
		key, label, hint string
		bg, ink          [3]int
	}{
		{"critical", "Critical", "Fix this now", kCritBg, [3]int{153, 27, 27}},
		{"high", "High", "Fix this week", kHighBg, [3]int{154, 52, 18}},
		{"medium", "Medium", "Fix when you can", kMedBg, [3]int{161, 98, 7}},
		{"low", "Low", "Nice to have", kLowBg, [3]int{30, 64, 175}},
		{"info", "Info", "Heads-up", kInfoBg, [3]int{71, 85, 105}},
	}

	x0 := 15.0
	y := pdf.GetY()
	tw := (180.0 - 4*3.0) / 5.0
	th := 26.0
	gap := 3.0
	for i, c := range cards {
		x := x0 + float64(i)*(tw+gap)
		pdf.SetFillColor(c.bg[0], c.bg[1], c.bg[2])
		pdf.SetDrawColor(c.bg[0], c.bg[1], c.bg[2])
		pdf.RoundedRect(x, y, tw, th, 2, "1234", "F")
		// big count
		pdf.SetTextColor(c.ink[0], c.ink[1], c.ink[2])
		pdf.SetFont("Times", "B", 22)
		pdf.SetXY(x, y+3)
		pdf.CellFormat(tw, 10, intToStr(counts[c.key]), "", 0, "C", false, 0, "")
		// label
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetXY(x, y+14)
		pdf.CellFormat(tw, 4, psafe(c.label), "", 0, "C", false, 0, "")
		// hint
		pdf.SetFont("Courier", "", 7)
		pdf.SetTextColor(c.ink[0], c.ink[1], c.ink[2])
		pdf.SetAlpha(0.75, "Normal")
		pdf.SetXY(x, y+19)
		pdf.CellFormat(tw, 4, strings.ToUpper(c.hint), "", 0, "C", false, 0, "")
		pdf.SetAlpha(1.0, "Normal")
	}
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetY(y + th + 6)
}

// ─── "What you need to do" priority list ───────────────────────────────────

func whatToDo(pdf *gofpdf.Fpdf, in PDFInput) {
	sectionTitleK(pdf, "What you need to do", "Top priorities, ordered.")

	top := topFindings(in.Findings, 3)
	if len(top) == 0 {
		pdf.SetFont("Helvetica", "I", 10)
		pdf.SetTextColor(kGood[0], kGood[1], kGood[2])
		pdf.MultiCell(0, 5.5, psafe("No issues detected on the checks we ran. Looking healthy."), "", "L", false)
		pdf.Ln(2)
		return
	}

	for i, f := range top {
		x, y := 15.0, pdf.GetY()
		w := 180.0
		_, _, _, sR, sG, sB := severityCardColours(f.Severity)
		bgR, bgG, bgB, _, _, _ := severityCardColours(f.Severity)

		// Estimate height
		pdf.SetFont("Helvetica", "", 9)
		bodyH := 0.0
		if f.PlainWhatsHappening != "" {
			bodyH = measureMultiK(pdf, f.PlainWhatsHappening, w-22, 4.4)
		}
		totalH := 11 + bodyH
		if totalH < 16 {
			totalH = 16
		}
		if y+totalH > 270 {
			pdf.AddPage()
			headerStrip(pdf, in)
			y = pdf.GetY()
		}

		pdf.SetFillColor(kPanel[0], kPanel[1], kPanel[2])
		pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
		pdf.RoundedRect(x, y, w, totalH, 2, "1234", "FD")

		// numbered circle
		pdf.SetFillColor(bgR, bgG, bgB)
		pdf.Circle(x+6, y+7, 3.4, "F")
		pdf.SetTextColor(sR, sG, sB)
		pdf.SetFont("Helvetica", "B", 9)
		num := intToStr(i + 1)
		nw := pdf.GetStringWidth(num)
		pdf.SetXY(x+6-nw/2, y+5.3)
		pdf.Cell(nw, 4, num)

		// severity chip
		chip := strings.ToUpper(severityHumanLabel(f.Severity))
		pdf.SetFont("Courier", "B", 7)
		cw := pdf.GetStringWidth(chip) + 4
		pdf.SetFillColor(bgR, bgG, bgB)
		pdf.SetTextColor(sR, sG, sB)
		pdf.RoundedRect(x+12, y+4.2, cw, 4.6, 1, "1234", "F")
		pdf.SetXY(x+12, y+4.7)
		pdf.CellFormat(cw, 3.6, chip, "", 0, "C", false, 0, "")

		// title
		pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
		pdf.SetFont("Helvetica", "B", 10)
		pdf.SetXY(x+12+cw+3, y+4.2)
		pdf.MultiCell(w-(12+cw+5), 4.6, psafe(valueOr(f.PlainTitle, f.Title)), "", "L", false)

		// body
		if f.PlainWhatsHappening != "" {
			pdf.SetFont("Helvetica", "", 9)
			pdf.SetTextColor(60, 70, 85)
			pdf.SetXY(x+12, y+10)
			pdf.MultiCell(w-16, 4.4, psafe(f.PlainWhatsHappening), "", "L", false)
		}
		pdf.SetY(y + totalH + 3)
	}
	pdf.Ln(1)
}

// ─── Per-finding card ──────────────────────────────────────────────────────

func findingCard(pdf *gofpdf.Fpdf, f PDFFinding) {
	if pdf.GetY() > 230 {
		pdf.AddPage()
	}
	bgR, bgG, bgB, sR, sG, sB := severityCardColours(f.Severity)

	// Outer card
	x, y := 15.0, pdf.GetY()
	w := 180.0

	// Pre-measure body
	pdf.SetFont("Helvetica", "", 9.5)
	estimatedH := 18.0 // header
	addH := func(h float64) { estimatedH += h }
	if exp := pickExp(f); exp != "" {
		addH(8 + measureMultiK(pdf, exp, w-12, 4.5))
	}
	if f.PlainWhatsHappening != "" {
		addH(7 + measureMultiK(pdf, f.PlainWhatsHappening, w-12, 4.6))
	}
	if f.PlainWhy != "" {
		addH(7 + measureMultiK(pdf, f.PlainWhy, w-12, 4.6))
	}
	if len(f.PlainHowToFix) > 0 {
		addH(7)
		for _, s := range f.PlainHowToFix {
			addH(measureMultiK(pdf, "9. "+s, w-12, 4.6))
		}
	}
	if f.Evidence != "" {
		pdf.SetFont("Courier", "", 8)
		addH(7 + measureMultiK(pdf, truncate(f.Evidence, 600), w-16, 4) + 2)
		pdf.SetFont("Helvetica", "", 9.5)
	}
	addH(4)

	// Card frame
	pdf.SetFillColor(kPanel[0], kPanel[1], kPanel[2])
	pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
	pdf.RoundedRect(x, y, w, estimatedH, 2.4, "1234", "FD")
	// Severity side bar
	pdf.SetFillColor(sR, sG, sB)
	pdf.Rect(x, y, 1.6, estimatedH, "F")

	// Header row
	pdf.SetFont("Courier", "B", 7.5)
	chip := strings.ToUpper(severityHumanLabel(f.Severity))
	cw := pdf.GetStringWidth(chip) + 5
	pdf.SetFillColor(bgR, bgG, bgB)
	pdf.SetTextColor(sR, sG, sB)
	pdf.RoundedRect(x+5, y+5, cw, 5, 1, "1234", "F")
	pdf.SetXY(x+5, y+5.6)
	pdf.CellFormat(cw, 3.8, chip, "", 0, "C", false, 0, "")

	// Title
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetXY(x+5+cw+3, y+4.6)
	pdf.MultiCell(w-(cw+10), 5.2, psafe(valueOr(f.PlainTitle, f.Title)), "", "L", false)

	// Meta row (test id / OWASP / CWE / effort)
	pdf.SetFont("Courier", "", 7.5)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	meta := f.TestID
	if f.OWASP != "" {
		meta += "  -  " + f.OWASP
	}
	if f.CWE != "" {
		meta += "  -  " + f.CWE
	}
	if f.Effort != "" {
		meta += "  -  effort: " + f.Effort
	}
	pdf.SetXY(x+5+cw+3, pdf.GetY())
	pdf.MultiCell(w-(cw+10), 4, psafe(meta), "", "L", false)
	pdf.Ln(1)

	cy := pdf.GetY() + 1

	// "What we tried"
	if exp := pickExp(f); exp != "" {
		pdf.SetXY(x+5, cy)
		labelLine(pdf, "What we tried")
		pdf.SetX(x + 5)
		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(60, 70, 85)
		pdf.MultiCell(w-10, 4.5, psafe(exp), "", "L", false)
		cy = pdf.GetY() + 1
	}

	if f.PlainWhatsHappening != "" {
		pdf.SetXY(x+5, cy)
		labelLine(pdf, "What we found")
		pdf.SetX(x + 5)
		pdf.SetFont("Helvetica", "", 9.5)
		pdf.SetTextColor(40, 50, 65)
		pdf.MultiCell(w-10, 4.6, psafe(f.PlainWhatsHappening), "", "L", false)
		cy = pdf.GetY() + 1
	}
	if f.PlainWhy != "" {
		pdf.SetXY(x+5, cy)
		labelLine(pdf, "Why it matters")
		pdf.SetX(x + 5)
		pdf.SetFont("Helvetica", "", 9.5)
		pdf.SetTextColor(40, 50, 65)
		pdf.MultiCell(w-10, 4.6, psafe(f.PlainWhy), "", "L", false)
		cy = pdf.GetY() + 1
	}
	if len(f.PlainHowToFix) > 0 {
		pdf.SetXY(x+5, cy)
		labelLine(pdf, "How to fix")
		pdf.SetFont("Helvetica", "", 9.5)
		pdf.SetTextColor(40, 50, 65)
		for i, s := range f.PlainHowToFix {
			pdf.SetX(x + 5)
			pdf.MultiCell(w-10, 4.6, psafe(fmt.Sprintf("%d. %s", i+1, s)), "", "L", false)
		}
		cy = pdf.GetY() + 1
	}

	if f.Evidence != "" {
		pdf.SetXY(x+5, cy)
		labelLine(pdf, "Evidence")
		pdf.SetX(x + 5)
		pdf.SetFont("Courier", "", 8)
		pdf.SetTextColor(60, 70, 85)
		pdf.SetFillColor(248, 250, 252)
		pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
		pdf.MultiCell(w-10, 4, psafe(truncate(f.Evidence, 600)), "1", "L", true)
	}

	pdf.SetY(y + estimatedH + 4)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
}

func pickExp(f PDFFinding) string {
	if f.TestExplanation != "" {
		return f.TestExplanation
	}
	return ExplainTest(f.TestID)
}

// ─── VAPT compliance table ────────────────────────────────────────────────

func complianceTable(pdf *gofpdf.Fpdf, in PDFInput) {
	sectionTitleK(pdf, "VAPT compliance — every check", "Pass/fail breakdown for every test that ran. Use this as the audit trail.")

	passed, failed := 0, 0
	for _, t := range in.TestRows {
		if t.Passed {
			passed++
		} else {
			failed++
		}
	}
	total := len(in.TestRows)

	// Headline strip — 3-up tile
	x0 := 15.0
	y := pdf.GetY()
	tiles := []struct {
		label, value string
		col          [3]int
	}{
		{"Total tests", intToStr(total), kInk},
		{"Passed", intToStr(passed), kGood},
		{"Raised findings", intToStr(failed), kBad},
	}
	tw := (180.0 - 2*3.0) / 3.0
	for i, t := range tiles {
		x := x0 + float64(i)*(tw+3)
		pdf.SetFillColor(kPanel[0], kPanel[1], kPanel[2])
		pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
		pdf.RoundedRect(x, y, tw, 16, 2, "1234", "FD")
		pdf.SetFillColor(t.col[0], t.col[1], t.col[2])
		pdf.Rect(x, y, tw, 1.2, "F")
		pdf.SetFont("Courier", "", 7)
		pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
		pdf.SetXY(x+3, y+3)
		pdf.Cell(tw-6, 3, strings.ToUpper(t.label))
		pdf.SetFont("Times", "B", 14)
		pdf.SetTextColor(t.col[0], t.col[1], t.col[2])
		pdf.SetXY(x+3, y+7)
		pdf.Cell(tw-6, 7, t.value)
	}
	pdf.SetY(y + 20)

	// Group rows by category.
	byCat := map[string][]PDFTestRow{}
	catOrder := []string{}
	for _, t := range in.TestRows {
		if _, ok := byCat[t.Category]; !ok {
			catOrder = append(catOrder, t.Category)
		}
		byCat[t.Category] = append(byCat[t.Category], t)
	}

	for _, cat := range catOrder {
		// Category band
		if pdf.GetY() > 260 {
			pdf.AddPage()
			headerStrip(pdf, in)
		}
		pdf.SetFillColor(kAccent1[0], kAccent1[1], kAccent1[2])
		pdf.SetTextColor(255, 255, 255)
		pdf.RoundedRect(15, pdf.GetY(), 180, 6.5, 1.6, "1234", "F")
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetXY(18, pdf.GetY()+1.4)
		pdf.Cell(0, 4, psafe(humaniseCategory(cat)))
		pdf.Ln(8.5)

		// Header row
		pdf.SetFillColor(248, 250, 252)
		pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
		pdf.SetFont("Courier", "B", 7.5)
		pdf.CellFormat(22, 5.5, "RESULT", "", 0, "L", true, 0, "")
		pdf.CellFormat(85, 5.5, "CHECK", "", 0, "L", true, 0, "")
		pdf.CellFormat(53, 5.5, "TEST ID", "", 0, "L", true, 0, "")
		pdf.CellFormat(20, 5.5, "FINDINGS", "", 1, "R", true, 0, "")

		alt := false
		for _, t := range byCat[cat] {
			if pdf.GetY() > 270 {
				pdf.AddPage()
				headerStrip(pdf, in)
			}
			rowY := pdf.GetY()
			if alt {
				pdf.SetFillColor(252, 253, 254)
				pdf.Rect(15, rowY, 180, 6, "F")
			}
			alt = !alt

			// PASS/FAIL pill
			if t.Passed {
				pdf.SetFillColor(220, 252, 231)
				pdf.SetTextColor(22, 101, 52)
				pdf.RoundedRect(15.5, rowY+0.6, 18, 4.6, 1, "1234", "F")
				pdf.SetFont("Courier", "B", 7)
				pdf.SetXY(15.5, rowY+1.1)
				pdf.CellFormat(18, 3.6, "PASS", "", 0, "C", false, 0, "")
			} else {
				pdf.SetFillColor(254, 226, 226)
				pdf.SetTextColor(153, 27, 27)
				pdf.RoundedRect(15.5, rowY+0.6, 18, 4.6, 1, "1234", "F")
				pdf.SetFont("Courier", "B", 7)
				pdf.SetXY(15.5, rowY+1.1)
				pdf.CellFormat(18, 3.6, "FAIL", "", 0, "C", false, 0, "")
			}

			pdf.SetXY(37, rowY+1)
			pdf.SetFont("Helvetica", "", 8.5)
			pdf.SetTextColor(kInkSoft[0], kInkSoft[1], kInkSoft[2])
			pdf.CellFormat(85, 4, psafe(truncate(t.Name, 60)), "", 0, "L", false, 0, "")
			pdf.SetFont("Courier", "", 7.5)
			pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
			pdf.CellFormat(53, 4, psafe(t.TestID), "", 0, "L", false, 0, "")
			pdf.SetFont("Helvetica", "B", 8.5)
			if t.FindingCount > 0 {
				pdf.SetTextColor(kBad[0], kBad[1], kBad[2])
			} else {
				pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
			}
			pdf.CellFormat(20, 4, intToStr(t.FindingCount), "", 1, "R", false, 0, "")
			pdf.SetY(rowY + 6)
		}
		pdf.Ln(3)
	}
}

func humaniseCategory(cat string) string {
	switch cat {
	case "transport":
		return "Browser safety headers"
	case "info_disclosure":
		return "Server leaks info"
	case "injection":
		return "Hostile input"
	case "method_tampering":
		return "Wrong verbs allowed"
	}
	return cat
}

// ─── Methodology ──────────────────────────────────────────────────────────

func methodology(pdf *gofpdf.Fpdf, in PDFInput) {
	sectionTitleK(pdf, "Methodology", "How Kavach approached this scan, and what to keep in mind.")

	pdf.SetFont("Helvetica", "", 9.5)
	pdf.SetTextColor(60, 70, 85)
	pdf.MultiCell(0, 5, psafe(
		"Kavach runs a deterministic suite of tests against the target API. Each test asserts a specific response shape - header present/absent, body marker, status code, timing - and never relies on machine learning or fuzzy matching. False positives, when they happen, are reproducible.\n\n"+
			"The scan does NOT enumerate every endpoint. It only tests the URL the operator pasted. To get coverage, scan multiple representative endpoints (a public route, an authenticated route, a write route).\n\n"+
			"Severity is calibrated by exploitability and impact, not by jargon. \"Fix this now\" means we observed something an attacker could turn into account takeover or data theft. \"Heads-up\" is informational only.\n\n"+
			"This report is generated from real probe responses captured at scan time. Tokens, JWTs, and known API key formats have been redacted before storage."),
		"", "L", false)
	pdf.Ln(4)

	// OWASP API Top-10 reference
	sectionTitleK(pdf, "OWASP API Security Top 10 (2023)", "Industry reference — what these category codes mean.")
	for _, r := range owaspRows() {
		if pdf.GetY() > 270 {
			pdf.AddPage()
			headerStrip(pdf, in)
		}
		// chip
		pdf.SetFont("Courier", "B", 7.5)
		pdf.SetFillColor(kAccent1[0], kAccent1[1], kAccent1[2])
		pdf.SetTextColor(255, 255, 255)
		cw := pdf.GetStringWidth(r[0]) + 4
		ry := pdf.GetY()
		pdf.RoundedRect(15, ry+0.5, cw, 5, 1, "1234", "F")
		pdf.SetXY(15, ry+1)
		pdf.CellFormat(cw, 4, r[0], "", 0, "C", false, 0, "")
		pdf.SetXY(15+cw+3, ry)
		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
		pdf.MultiCell(180-cw-3, 5.5, psafe(r[1]), "", "L", false)
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────

func sectionTitleK(pdf *gofpdf.Fpdf, title, lede string) {
	if pdf.GetY() > 250 {
		pdf.AddPage()
	}
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
	pdf.SetFont("Times", "B", 16)
	pdf.SetX(15)
	pdf.Cell(0, 8, psafe(title))
	pdf.Ln(7)
	pdf.SetFont("Helvetica", "I", 9)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	pdf.Cell(0, 5, psafe(lede))
	pdf.Ln(7)
	pdf.SetTextColor(kInk[0], kInk[1], kInk[2])
}

func labelLine(pdf *gofpdf.Fpdf, text string) {
	pdf.SetFont("Courier", "B", 7.5)
	pdf.SetTextColor(kAccent2[0], kAccent2[1], kAccent2[2])
	pdf.CellFormat(0, 4.6, strings.ToUpper(psafe(text)), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9.5)
	pdf.SetTextColor(40, 50, 65)
}

func footerLine(pdf *gofpdf.Fpdf, in PDFInput, page int) {
	pdf.SetY(-14)
	pdf.SetDrawColor(kBorder[0], kBorder[1], kBorder[2])
	pdf.SetLineWidth(0.3)
	pdf.Line(15, pdf.GetY(), 195, pdf.GetY())
	pdf.Ln(1.5)
	pdf.SetFont("Courier", "", 7)
	pdf.SetTextColor(kMuted[0], kMuted[1], kMuted[2])
	pdf.SetX(15)
	pdf.CellFormat(80, 4, psafe("KAVACH - CHOICE TECHLAB"), "", 0, "L", false, 0, "")
	id := in.ScanID
	if len(id) > 8 {
		id = id[:8]
	}
	mid := psafe("SCAN KV-" + strings.ToUpper(id))
	pdf.SetX(15 + 80)
	pdf.CellFormat(40, 4, mid, "", 0, "C", false, 0, "")
	pdf.SetX(15 + 120)
	pdf.CellFormat(60, 4, fmt.Sprintf("PAGE %d", page), "", 0, "R", false, 0, "")
}

func measureMultiK(pdf *gofpdf.Fpdf, text string, width, lineH float64) float64 {
	if text == "" {
		return 0
	}
	lines := pdf.SplitText(text, width)
	if len(lines) == 0 {
		return lineH
	}
	return float64(len(lines)) * lineH
}

func severityCardColours(sev string) (bgR, bgG, bgB, fR, fG, fB int) {
	switch strings.ToLower(sev) {
	case "critical":
		return 254, 226, 226, 153, 27, 27
	case "high":
		return 255, 237, 213, 154, 52, 18
	case "medium":
		return 254, 243, 199, 161, 98, 7
	case "low":
		return 219, 234, 254, 30, 64, 175
	case "info":
		return 226, 232, 240, 71, 85, 105
	}
	return 235, 235, 235, 80, 80, 80
}

func severityHumanLabel(sev string) string {
	switch strings.ToLower(sev) {
	case "critical":
		return "Critical"
	case "high":
		return "High"
	case "medium":
		return "Medium"
	case "low":
		return "Low"
	case "info":
		return "Info"
	}
	return strings.Title(sev)
}

func countsFromSummary(in PDFInput) map[string]int {
	out := map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
	if in.Summary != nil {
		if c, ok := in.Summary["counts"].(map[string]interface{}); ok {
			for k, v := range c {
				if f, ok := v.(float64); ok {
					out[k] = int(f)
				}
			}
		}
	}
	total := 0
	for _, n := range out {
		total += n
	}
	if total == 0 {
		for _, f := range in.Findings {
			out[f.Severity]++
		}
	}
	return out
}

func topFindings(fs []PDFFinding, n int) []PDFFinding {
	rank := map[string]int{"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
	cp := make([]PDFFinding, len(fs))
	copy(cp, fs)
	for i := 0; i < len(cp); i++ {
		for j := i + 1; j < len(cp); j++ {
			if rank[cp[j].Severity] > rank[cp[i].Severity] {
				cp[i], cp[j] = cp[j], cp[i]
			}
		}
	}
	if len(cp) > n {
		cp = cp[:n]
	}
	return cp
}

func owaspRows() [][2]string {
	return [][2]string{
		{"API1:2023", "Broken Object Level Authorization (BOLA)"},
		{"API2:2023", "Broken Authentication"},
		{"API3:2023", "Broken Object Property Level Authorization"},
		{"API4:2023", "Unrestricted Resource Consumption"},
		{"API5:2023", "Broken Function Level Authorization"},
		{"API6:2023", "Unrestricted Access to Sensitive Business Flows"},
		{"API7:2023", "Server Side Request Forgery"},
		{"API8:2023", "Security Misconfiguration"},
		{"API9:2023", "Improper Inventory Management"},
		{"API10:2023", "Unsafe Consumption of APIs"},
	}
}

// psafe transliterates Unicode characters that gofpdf's default Helvetica
// encoding can't render (em-dash, smart quotes, etc.) into ASCII so the
// PDF doesn't crash mid-render.
func psafe(s string) string {
	repl := strings.NewReplacer(
		"—", "-",
		"–", "-",
		"·", "-",
		"…", "...",
		"’", "'",
		"‘", "'",
		"“", "\"",
		"”", "\"",
		"•", "-",
		"⚠️", "(!)",
		"✅", "[ok]",
		"🔴", "[crit]",
		"🟢", "[ok]",
		"🟡", "[warn]",
		"🚨", "[!]",
		"📎", "[paperclip]",
		"🛡️", "[shield]",
		"ℹ️", "[i]",
		"🔵", "[i]",
	)
	out := repl.Replace(s)
	// Drop any remaining non-CP1252 codepoints to avoid SplitText panics.
	var b strings.Builder
	for _, r := range out {
		if r <= 0xFF {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func valueOr(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
