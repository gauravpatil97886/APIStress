package report

import (
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
	"github.com/jung-kurt/gofpdf"
)

func drawSeriesChart(pdf *gofpdf.Fpdf, series []metrics.SecondBucket, kind string) {
	if len(series) == 0 {
		pdf.SetFont("Helvetica", "I", 9)
		pdf.SetTextColor(140, 140, 140)
		pdf.Cell(0, 6, "No data points")
		pdf.Ln(6)
		pdf.SetTextColor(0, 0, 0)
		return
	}
	x := 15.0
	y := pdf.GetY()
	w := 180.0
	h := 40.0

	pdf.SetDrawColor(220, 220, 220)
	pdf.SetFillColor(250, 250, 252)
	pdf.Rect(x, y, w, h, "FD")

	values := make([]float64, len(series))
	for i, b := range series {
		switch kind {
		case "p95":
			values[i] = b.P95Ms
		case "p99":
			values[i] = b.P99Ms
		case "rps":
			values[i] = float64(b.Requests)
		default:
			values[i] = b.MeanMs
		}
	}
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

	pdf.SetDrawColor(255, 90, 31)
	if kind == "rps" {
		pdf.SetDrawColor(34, 197, 94)
	}
	pdf.SetLineWidth(0.4)

	prevX, prevY := 0.0, 0.0
	for i, v := range values {
		px := x + (float64(i)/float64(maxInt(len(values)-1, 1)))*w
		py := y + h - ((v-min)/(max-min))*h
		if i > 0 {
			pdf.Line(prevX, prevY, px, py)
		}
		prevX, prevY = px, py
	}

	pdf.SetFont("Helvetica", "", 7)
	pdf.SetTextColor(120, 120, 120)
	pdf.Text(x+1, y+4, "max")
	pdf.SetTextColor(40, 40, 40)
	pdf.Text(x+8, y+4, fmtVal(max, kind))
	pdf.SetTextColor(120, 120, 120)
	pdf.Text(x+1, y+h-1, "min")
	pdf.SetTextColor(40, 40, 40)
	pdf.Text(x+8, y+h-1, fmtVal(min, kind))
	pdf.SetTextColor(0, 0, 0)
	pdf.SetY(y + h + 4)
}

func fmtVal(v float64, kind string) string {
	switch kind {
	case "rps":
		return formatFloat(v, 0) + " req"
	default:
		return formatFloat(v, 2) + " ms"
	}
}

func formatFloat(v float64, prec int) string {
	if prec == 0 {
		return intStr(int(v))
	}
	return floatStr(v, prec)
}

func intStr(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	digits := []byte{}
	for i > 0 {
		digits = append([]byte{byte('0' + i%10)}, digits...)
		i /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

func floatStr(v float64, prec int) string {
	mul := 1
	for k := 0; k < prec; k++ {
		mul *= 10
	}
	scaled := int(v*float64(mul) + 0.5)
	whole := scaled / mul
	frac := scaled % mul
	fracStr := intStr(frac)
	for len(fracStr) < prec {
		fracStr = "0" + fracStr
	}
	return intStr(whole) + "." + fracStr
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
