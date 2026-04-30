package report

import (
	"bytes"
	"fmt"
	"html/template"
	"sort"
	"strings"
	"time"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/metrics"
)

const htmlTpl = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>APIStress Report — {{.Name}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,800;1,9..144,500&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --brand:#FF5A1F; --brand-dark:#E0341A; --brand-light:#FF7A2A; --brand-2:#7a8c2c;
    --bg:#fafaf7; --panel:#ffffff; --ink:#0e0f13; --muted:#6a6f7d; --dim:#9aa0ad;
    --border:#ebe9e1; --good:#16a34a; --warn:#ea580c; --bad:#dc2626; --cool:#9333ea;
    --shadow: 0 1px 2px rgba(15,15,20,.04), 0 4px 16px rgba(15,15,20,.06);
  }
  * { box-sizing: border-box; }
  body { background:
           radial-gradient(900px 500px at 100% -10%, rgba(255,90,31,.06), transparent 60%),
           radial-gradient(700px 500px at -10% 110%, rgba(122,140,44,.06), transparent 60%),
           var(--bg);
         color: var(--ink); font-family: 'Inter', system-ui, sans-serif;
         margin: 0; padding: 48px 32px; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 940px; margin: 0 auto; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark { width: 44px; height: 44px; border-radius: 12px;
                background: linear-gradient(135deg, #FF6B35, #E0341A 55%, #7C1D6F);
                color: #fff; display: grid; place-items: center; font-weight: 800;
                font-family: 'Fraunces', serif; font-size: 22px;
                box-shadow: 0 6px 20px rgba(224,52,26,.3); }
  .brand-mark svg { width: 26px; height: 26px; }
  .brand-name { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; }
  .brand-name em { font-style: italic; color: var(--brand-2); font-weight: 600; }
  .brand-sub { font-size: 10px; letter-spacing: 0.18em; color: var(--muted); text-transform: uppercase; font-family: 'JetBrains Mono', monospace; }
  .meta { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); letter-spacing: 0.1em; }
  .meta b { color: var(--ink); }
  .badge-id { display: inline-block; background: var(--ink); color: #c2cf7e; padding: 2px 8px;
              border-radius: 4px; font-size: 11px; }
  hr { border: 0; border-top: 2px solid var(--ink); margin: 18px 0 28px; }

  h1 { font-family: 'Fraunces', serif; font-size: 56px; line-height: 1; font-weight: 700;
       letter-spacing: -0.02em; margin: 0 0 8px; }
  h1 em { font-style: italic; color: var(--brand-2); font-weight: 600; }
  .url { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--ink); margin: 4px 0 28px;
         word-break: break-all; }
  .url .verb { color: var(--bad); font-weight: 600; margin-right: 8px; }

  h2 { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; margin: 40px 0 6px; letter-spacing: -0.01em; }
  .lede { color: var(--muted); font-style: italic; font-size: 14px; margin-bottom: 14px; }

  .banner { display: grid; grid-template-columns: 56px 1fr; gap: 18px;
            background: #fff5e1; border-left: 4px solid var(--warn); padding: 18px 22px; border-radius: 4px;
            margin: 0 0 28px; }
  .banner.good { background: #ecfdf3; border-left-color: var(--good); }
  .banner.bad,.banner.critical { background: #fff1f0; border-left-color: var(--bad); }
  .banner .icon { width: 44px; height: 44px; border-radius: 50%;
                  background: var(--warn); color: #fff; display: grid; place-items: center;
                  font-weight: 800; font-size: 22px; }
  .banner.good .icon { background: var(--good); }
  .banner.bad .icon, .banner.critical .icon { background: var(--bad); }
  .banner h3 { margin: 0 0 4px; font-size: 16px; }
  .banner p { margin: 0; color: #4b5160; font-size: 13.5px; line-height: 1.6; }

  .summary { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
             padding: 22px 26px; line-height: 1.7; font-size: 14.5px; }
  .summary p { margin: 0 0 12px; }
  .summary p:last-child { margin: 0; }
  .summary b { color: var(--ink); }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tile { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
          padding: 18px 20px; }
  .tile .label { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em;
                 color: var(--muted); text-transform: uppercase; }
  .tile .value { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600; margin-top: 8px;
                 letter-spacing: -0.02em; line-height: 1; }
  .tile .value .unit { font-size: 14px; font-weight: 400; color: var(--muted); margin-left: 4px; }
  .tile .hint { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); margin-top: 10px; }
  .tile.good .value { color: var(--good); }
  .tile.warn .value { color: var(--warn); }
  .tile.bad  .value { color: var(--bad); }

  .callout { background: #f5f4ed; border-left: 3px solid var(--brand-2); padding: 14px 18px;
             font-size: 13px; line-height: 1.6; margin-top: 18px; color: #3b3f49; }
  .callout b { color: var(--ink); }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; background: var(--panel);
          border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  thead { background: var(--ink); color: #ffffff; }
  th { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.16em;
       text-transform: uppercase; text-align: left; padding: 12px 16px; font-weight: 600; }
  td { padding: 14px 16px; font-size: 13.5px; border-top: 1px solid var(--border); vertical-align: top; }
  td.num { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  td.muted { color: var(--muted); }
  tr:first-child td { border-top: 0; }

  .insight { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
             padding: 16px 20px; display: grid; grid-template-columns: 36px 1fr; gap: 14px; margin-bottom: 10px; }
  .insight .ico { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
                  color: #fff; font-weight: 800; font-size: 14px; }
  .insight.warn .ico { background: var(--warn); }
  .insight.bad .ico, .insight.critical .ico { background: var(--bad); }
  .insight.good .ico { background: var(--good); }
  .insight.info .ico { background: var(--cool); }
  .insight h4 { margin: 0 0 4px; font-size: 14.5px; }
  .insight p { margin: 0; font-size: 13px; color: #3b3f49; line-height: 1.6; }
  .insight .rec { margin-top: 8px; font-size: 12.5px; color: #1f242e; background: #f5f4ed;
                  padding: 8px 12px; border-radius: 4px; border-left: 3px solid var(--brand-2); }

  .donut { display: flex; align-items: center; gap: 24px; padding: 22px 26px; background: var(--panel);
           border: 1px solid var(--border); border-radius: 6px; }
  .donut svg { width: 160px; height: 160px; }
  .donut .legend { font-size: 13px; line-height: 1.8; }
  .donut .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .donut .legend .count { color: var(--muted); margin-left: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }

  .chart { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 20px; }
  .chart-title { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.18em;
                 text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
  .chart svg { width: 100%; display: block; }
  .legend-mini { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted); margin-top: 6px; }
  .legend-mini .sw { display: inline-block; width: 18px; height: 3px; vertical-align: middle; margin-right: 6px; border-radius: 2px; }

  .attrib { display: grid; grid-template-columns: 64px 1fr auto; gap: 18px; align-items: center;
            background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
            padding: 18px 22px; margin: 0 0 24px; }
  .attrib .avatar { width: 56px; height: 56px; border-radius: 50%;
                    background: linear-gradient(135deg, #FF7A2A, #E0341A);
                    color: #fff; display: grid; place-items: center;
                    font-family: 'Fraunces', serif; font-weight: 700; font-size: 26px;
                    box-shadow: 0 6px 20px rgba(255,90,31,0.25); }
  .attrib .who-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em;
                       color: var(--muted); text-transform: uppercase; }
  .attrib .who-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600;
                      letter-spacing: -0.01em; margin-top: 2px; }
  .attrib .who-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted);
                      margin-top: 6px; }
  .attrib .who-meta b { color: var(--ink); }
  .attrib .who-meta a { color: var(--brand); text-decoration: none; border-bottom: 1px dashed var(--brand); }
  .env-pill { display: inline-block; padding: 4px 12px; border-radius: 999px;
              font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
              letter-spacing: 0.08em; text-transform: uppercase; margin-left: 8px;
              border: 1px solid currentColor; }
  .env-pill.production { color: #dc2626; background: #fee2e2; border-color: #fca5a5; }
  .env-pill.broking    { color: #ea580c; background: #ffedd5; border-color: #fdba74; }
  .env-pill.uat        { color: #2563eb; background: #dbeafe; border-color: #93c5fd; }

  .attrib .when { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 10px;
                  letter-spacing: 0.16em; color: var(--muted); text-transform: uppercase; }
  .attrib .when .v { color: var(--ink); font-size: 13px; letter-spacing: normal; text-transform: none;
                     font-family: 'Inter', sans-serif; font-weight: 600; margin-top: 2px; }

  .footer { margin-top: 56px; padding-top: 18px; border-top: 2px solid var(--ink);
            display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace;
            font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .footer b { color: var(--ink); }
  .footer .by { color: var(--brand-2); }

  @media print {
    body { padding: 0; }
    .wrap { max-width: none; }
    .grid2 { break-inside: avoid; }
    .tile, .insight, .chart, .donut, table { break-inside: avoid; }
    h2 { break-after: avoid; }
  }
</style>
</head><body><div class="wrap">

<header class="row">
  <div class="brand">
    <div class="brand-mark">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="M 14 38 A 18 18 0 0 1 50 38" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="3" stroke-linecap="round"/>
        <path d="M 38 22 A 18 18 0 0 1 50 38" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <path d="M 30 18 L 22 36 L 30 36 L 26 50 L 40 30 L 32 30 L 36 18 Z" fill="#fff" stroke="#fff" stroke-width="0.6" stroke-linejoin="round"/>
        <circle cx="32" cy="38" r="2.5" fill="#fff"/>
      </svg>
    </div>
    <div>
      <div class="brand-name">API<em>Stress</em></div>
      <div class="brand-sub">Load testing report</div>
    </div>
  </div>
  <div class="meta">
    <div>REPORT GENERATED</div>
    <div><b>{{fmtDate now}}</b></div>
    <div><b>{{fmtClock now}}</b> &nbsp;<span class="badge-id">AS-{{shortID .ID}}</span></div>
    <div style="margin-top:8px">
      <a href="/api/reports/{{.ID}}/pdf?key={{.AccessKey}}"
         style="display:inline-block;background:#0e0f13;color:#c2cf7e;padding:7px 14px;border-radius:6px;
                text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em">
        ⬇ DOWNLOAD PDF
      </a>
      <button onclick="window.print()"
         style="margin-left:6px;background:#fff;color:#0e0f13;border:1px solid #0e0f13;padding:6px 14px;border-radius:6px;
                font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;cursor:pointer">
        🖨 PRINT
      </button>
    </div>
  </div>
</header>
<hr/>

<h1>Performance <em>Analysis</em></h1>
<div class="url"><span class="verb">{{.Config.Request.Method}}</span>{{.Config.Request.URL}}</div>

<div class="banner {{.Verdict.Severity}}">
  <div class="icon">{{verdictIcon .Verdict.Severity}}</div>
  <div>
    <h3>{{.Verdict.Headline}}</h3>
    <p>{{.Verdict.Summary}}</p>
  </div>
</div>

<div class="attrib">
  <div class="avatar">{{initials .CreatedBy}}</div>
  <div>
    <div class="who-label">Tested by</div>
    <div class="who-name">
      {{or .CreatedBy "Unknown"}}
      {{if .EnvTag}}<span class="env-pill {{lower .EnvTag}}">{{.EnvTag}}</span>{{end}}
    </div>
    <div class="who-meta">
      {{if .JiraID}}
        {{if .JiraLink}}
          <a href="{{.JiraLink}}" target="_blank">Jira <b>{{.JiraID}}</b> ↗</a>
        {{else}}
          Jira <b>{{.JiraID}}</b>
        {{end}}
        &nbsp;·&nbsp;
      {{end}}
      Run <b>{{shortID .ID}}</b>
    </div>
  </div>
  <div class="when">
    {{if .StartedAt}}<div>Started</div><div class="v">{{fmtTime .StartedAt}}</div>{{end}}
    {{if .FinishedAt}}<div style="margin-top:8px">Finished</div><div class="v">{{fmtTime .FinishedAt}}</div>{{end}}
  </div>
</div>

<h2>Executive Summary</h2>
<div class="lede">What happened in plain words — read this first.</div>
<div class="summary">
  <p>We simulated <b>{{.Agg.PeakVUs}} concurrent users</b> hitting your API in a <b>{{.Config.Pattern}}</b> pattern for <b>{{fmtSecs .Agg.DurationS}}</b>. The API served <b>{{fmtInt .Agg.Requests}} total requests</b> at an average throughput of <b>{{fmtFloat .Agg.AvgRPS}} requests per second</b> (peaking at <b>{{fmtInt0 .Agg.PeakRPS}} rps</b>).</p>
  <p>Half of all responses came back within <b>{{fmtMs .Agg.P50Ms}}</b> (typical user experience). The slowest 5% took longer than <b>{{fmtMs .Agg.P95Ms}}</b>, and the worst 1% exceeded <b>{{fmtMs .Agg.P99Ms}}</b>. <b>{{fmtPct .Agg.SuccessPct}} of requests succeeded</b>, while <b>{{fmtPct .Agg.ErrorPct}} failed</b>.</p>
  <p><b>Bottom line:</b> {{bottomLine .Verdict.Severity}}</p>
</div>

<h2>Key Metrics</h2>
<div class="lede">The numbers that matter for production planning.</div>
<div class="grid2">
  <div class="tile"><div class="label">Total requests</div>
    <div class="value">{{fmtInt .Agg.Requests}}</div>
    <div class="hint">sent in {{fmtSecs .Agg.DurationS}}</div></div>
  <div class="tile"><div class="label">Average throughput</div>
    <div class="value">{{fmtFloat .Agg.AvgRPS}}<span class="unit">rps</span></div>
    <div class="hint">peak {{fmtInt0 .Agg.PeakRPS}} rps</div></div>
  <div class="tile {{toneSuccess .Agg.SuccessPct}}"><div class="label">Success rate</div>
    <div class="value">{{fmtPct .Agg.SuccessPct}}</div>
    <div class="hint">{{fmtInt .Agg.Successes}} of {{fmtInt .Agg.Requests}}</div></div>
  <div class="tile {{toneError .Agg.ErrorPct}}"><div class="label">Error rate</div>
    <div class="value">{{fmtPct .Agg.ErrorPct}}</div>
    <div class="hint">{{fmtInt .Agg.Errors}} failed</div></div>
  <div class="tile"><div class="label">Median latency</div>
    <div class="value">{{fmtMs .Agg.P50Ms}}</div>
    <div class="hint">p50 · typical user</div></div>
  <div class="tile {{toneP95 .Agg.P95Ms}}"><div class="label">95th percentile</div>
    <div class="value">{{fmtMs .Agg.P95Ms}}</div>
    <div class="hint">slowest 5% of users</div></div>
  <div class="tile {{toneP99 .Agg.P99Ms}}"><div class="label">99th percentile</div>
    <div class="value">{{fmtMs .Agg.P99Ms}}</div>
    <div class="hint">worst 1%</div></div>
  <div class="tile"><div class="label">Data received</div>
    <div class="value">{{fmtBytes .Agg.BytesIn}}</div>
    <div class="hint">payload total</div></div>
</div>
<div class="callout"><b>How to read percentiles:</b> "p95 = 400ms" means 95% of users got a response in 400ms or less, and 5% waited longer. Percentiles reveal real user experience far better than averages, which hide slow outliers. Industry rule of thumb: if p95 is more than 3× your p50, you have unpredictable performance.</div>

<h2>Latency Analysis</h2>
<div class="lede">How fast the API responded, and how consistent that speed was.</div>
<div class="chart">
  <div class="chart-title">Latency over time</div>
  {{multiSparkline .Series}}
  <div class="legend-mini">
    <span class="sw" style="background:#3b82f6"></span>p50
    <span class="sw" style="background:#f59e0b; margin-left:14px"></span>p95
    <span class="sw" style="background:#ef4444; margin-left:14px"></span>p99
  </div>
</div>

<table>
  <thead><tr><th>Metric</th><th>Value</th><th>What it means</th></tr></thead>
  <tbody>
    <tr><td>Minimum</td>          <td class="num">{{fmtMs .Agg.MinMs}}</td><td class="muted">Fastest response observed</td></tr>
    <tr><td>Average (mean)</td>   <td class="num">{{fmtMs .Agg.MeanMs}}</td><td class="muted">Arithmetic average — hides outliers</td></tr>
    <tr><td>Median (p50)</td>     <td class="num">{{fmtMs .Agg.P50Ms}}</td><td class="muted">What a typical user experiences</td></tr>
    <tr><td>p75</td>              <td class="num">{{fmtMs .Agg.P75Ms}}</td><td class="muted">75% of users are faster than this</td></tr>
    <tr><td>p90</td>              <td class="num">{{fmtMs .Agg.P90Ms}}</td><td class="muted">Common SLO target</td></tr>
    <tr><td>p95</td>              <td class="num">{{fmtMs .Agg.P95Ms}}</td><td class="muted">Industry standard SLO target</td></tr>
    <tr><td>p99</td>              <td class="num">{{fmtMs .Agg.P99Ms}}</td><td class="muted">Worst 1% — your frustrated users</td></tr>
    <tr><td>Maximum</td>          <td class="num">{{fmtMs .Agg.MaxMs}}</td><td class="muted">Slowest response observed</td></tr>
    <tr><td>Std Deviation</td>    <td class="num">{{fmtMs .Agg.StdDevMs}}</td><td class="muted">How spread out responses are (lower = more predictable)</td></tr>
  </tbody>
</table>

<h2>Response Breakdown</h2>
<div class="lede">What the API returned, and what it means.</div>
<div class="donut">
  {{donut .Agg}}
  <div class="legend">{{donutLegend .Agg}}</div>
</div>

<table>
  <thead><tr><th>Code</th><th>Meaning</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th></tr></thead>
  <tbody>
    {{range statusRows .Agg}}
    <tr>
      <td class="num">{{.Code}}</td>
      <td class="muted">{{.Meaning}}</td>
      <td class="num" style="text-align:right">{{fmtInt .Count}}</td>
      <td class="num" style="text-align:right">{{fmtPct .Pct}}</td>
    </tr>
    {{end}}
  </tbody>
</table>
<div class="callout"><b>Status code guide:</b> <b>2xx</b> = success. <b>3xx</b> = redirect (usually fine). <b>4xx</b> = client mistake (bad auth, bad input). <b>5xx</b> = server failure (crashes, timeouts, overload). <b>Network/Timeout</b> = request never reached the server or didn't finish in time.</div>

<h2>Insights & Recommendations</h2>
<div class="lede">Patterns we detected in your data — and what to do next.</div>
{{range .Insights}}
<div class="insight {{.Severity}}">
  <div class="ico">{{insightIcon .Severity}}</div>
  <div>
    <h4>{{.Title}}</h4>
    <p>{{.Detail}}</p>
    {{if .Recommend}}<div class="rec"><b>Recommendation:</b> {{.Recommend}}</div>{{end}}
  </div>
</div>
{{end}}

{{if .Agg.ErrorReasons}}{{if gt (len .Agg.ErrorReasons) 0}}
<h2>Error Details</h2>
<div class="lede">Specific errors observed during the test.</div>
<table>
  <thead><tr><th>Error</th><th style="text-align:right">Occurrences</th></tr></thead>
  <tbody>
    {{range errorRows .Agg.ErrorReasons}}
    <tr><td>{{.Reason}}</td><td class="num" style="text-align:right">{{fmtInt .Count}}</td></tr>
    {{end}}
  </tbody>
</table>
{{end}}{{end}}

{{if .Stack}}{{if gt (len .Stack) 0}}
<h2>Tech Stack Tagged</h2>
<div class="lede">Components declared as part of this API — used for cost projection and traceability.</div>
<table>
  <thead><tr><th>Component</th><th>Category</th><th>Tier</th><th style="text-align:right">Count</th><th style="text-align:right">$/month</th></tr></thead>
  <tbody>
    {{range .Stack}}
    <tr>
      <td><b>{{.Label}}</b></td>
      <td class="muted">{{.Category}}</td>
      <td class="muted">{{.TierLabel}}</td>
      <td class="num" style="text-align:right">{{.Count}}</td>
      <td class="num" style="text-align:right">${{fmtFloat .MonthlyUSD}}</td>
    </tr>
    {{end}}
  </tbody>
</table>
{{end}}{{end}}

<h2>Test Configuration</h2>
<div class="lede">Exact parameters used — reproducible.</div>
<table>
  <tbody>
    <tr><td>Test pattern</td><td class="num">{{upper .Config.Pattern}}</td></tr>
    <tr><td>HTTP method</td><td class="num">{{.Config.Request.Method}}</td></tr>
    <tr><td>Target URL</td><td class="num" style="word-break:break-all">{{.Config.Request.URL}}</td></tr>
    <tr><td>Virtual users</td><td class="num">{{.Config.VUs}}</td></tr>
    <tr><td>Test duration</td><td class="num">{{.Config.DurationSec}}s</td></tr>
    <tr><td>Think time</td><td class="num">{{.Config.ThinkTimeMs}} ms</td></tr>
    <tr><td>Request timeout</td><td class="num">{{.Config.Request.Timeout}} ms</td></tr>
    <tr><td>Custom headers</td><td class="num">{{len .Config.Request.Headers}}</td></tr>
    <tr><td>Started at</td><td class="num">{{fmtTime .StartedAt}}</td></tr>
    <tr><td>Finished at</td><td class="num">{{fmtTime .FinishedAt}}</td></tr>
  </tbody>
</table>

<h2>Industry Standards Reference</h2>
<div class="lede">Thresholds used to judge your API, from published engineering standards.</div>
<table>
  <thead><tr><th>Source</th><th>Metric</th><th>Target</th></tr></thead>
  <tbody>
    <tr><td class="muted">Google SRE Handbook</td><td>Error budget</td><td class="num">≤ 1% per month</td></tr>
    <tr><td class="muted">Google SRE Handbook</td><td>p99 latency (interactive)</td><td class="num">&lt; 1000ms</td></tr>
    <tr><td class="muted">Google Web Vitals</td><td>Good response time (INP)</td><td class="num">&lt; 200ms</td></tr>
    <tr><td class="muted">Google Web Vitals</td><td>Poor response time (INP)</td><td class="num">&gt; 500ms</td></tr>
    <tr><td class="muted">AWS Well-Architected</td><td>Latency variance</td><td class="num">p95 within 2× p50</td></tr>
    <tr><td class="muted">General industry</td><td>Availability ("three nines")</td><td class="num">99.9% uptime</td></tr>
  </tbody>
</table>

<div class="footer">
  <div>APIStress · Choice Techlab Internal Tools</div>
  <div>Report prepared by <span class="by">{{upper .CreatedBy}}</span>
    {{if .JiraID}} · Jira <b>{{.JiraID}}</b>{{end}}
    · {{fmtDate now}}</div>
</div>

</div></body></html>`

type statusRow struct {
	Code    string
	Meaning string
	Count   int64
	Pct     float64
}

type errorRow struct {
	Reason string
	Count  int64
}

func RenderHTML(d ReportData) (string, error) {
	series := d.Series
	if len(series) == 0 && d.Summary != nil {
		series = d.Summary.Series
	}
	durS := 0.0
	if d.Summary != nil {
		durS = d.Summary.DurationS
	} else if d.StartedAt != nil && d.FinishedAt != nil {
		durS = d.FinishedAt.Sub(*d.StartedAt).Seconds()
	}
	totals := metrics.Totals{}
	if d.Summary != nil {
		totals = d.Summary.Totals
	}
	agg := Compute(series, totals, durS)
	verdict := GradeVerdict(agg)
	insights := DeriveInsights(agg)

	view := struct {
		ReportData
		Agg      Aggregates
		Verdict  Verdict
		Insights []Insight
		Series   []metrics.SecondBucket
	}{
		ReportData: d, Agg: agg, Verdict: verdict, Insights: insights, Series: series,
	}

	funcs := template.FuncMap{
		"now":      func() time.Time { return time.Now() },
		"fmtDate":  func(t time.Time) string { return t.Format("January 2, 2006") },
		"fmtClock": func(t time.Time) string { return t.Format("3:04:05 PM") },
		"fmtTime": func(t *time.Time) string {
			if t == nil {
				return "—"
			}
			return t.Format("Jan 2, 2006 · 3:04:05 PM")
		},
		"fmtInt":   func(n int64) string { return fmtIntComma(n) },
		"fmtInt0":  func(n float64) string { return fmtIntComma(int64(n + 0.5)) },
		"fmtFloat": func(f float64) string { return fmt.Sprintf("%.1f", f) },
		"fmtMs": func(f float64) string {
			if f >= 100 {
				return fmt.Sprintf("%.0f ms", f)
			}
			return fmt.Sprintf("%.1f ms", f)
		},
		"fmtPct":  func(f float64) string { return fmt.Sprintf("%.2f%%", f) },
		"fmtSecs": func(f float64) string { return fmt.Sprintf("%.1fs", f) },
		"fmtBytes": func(n int64) string { return humanBytes(n) },
		"upper":    func(s interface{}) string { return up(fmt.Sprintf("%v", s)) },
		"lower":    func(s interface{}) string { return strings.ToLower(fmt.Sprintf("%v", s)) },
		"shortID":  func(s string) string { if len(s) >= 8 { return up(s[:8]) }; return up(s) },
		"initials": func(name string) string {
			name = strings.TrimSpace(name)
			if name == "" {
				return "?"
			}
			parts := strings.Fields(name)
			if len(parts) == 1 {
				w := parts[0]
				if len(w) >= 2 {
					return up(w[:2])
				}
				return up(w)
			}
			return up(string(parts[0][0]) + string(parts[len(parts)-1][0]))
		},
		"toneSuccess": func(p float64) string {
			if p >= 99 { return "good" }
			if p >= 95 { return "warn" }
			return "bad"
		},
		"toneError": func(p float64) string {
			if p >= 5 { return "bad" }
			if p >= 1 { return "warn" }
			return "good"
		},
		"toneP95": func(ms float64) string {
			if ms >= 1000 { return "bad" }
			if ms >= 500 { return "warn" }
			return "good"
		},
		"toneP99": func(ms float64) string {
			if ms >= 2000 { return "bad" }
			if ms >= 1000 { return "warn" }
			return "good"
		},
		"verdictIcon": func(s Severity) string {
			if s == SevGood { return "✓" }
			if s == SevBad || s == SevCritical { return "✕" }
			return "!"
		},
		"insightIcon": func(s Severity) string {
			switch s {
			case SevGood: return "✓"
			case SevBad, SevCritical: return "✕"
			case SevWarn: return "!"
			default: return "i"
			}
		},
		"bottomLine": func(s Severity) string {
			switch s {
			case SevGood:
				return "the API performed well at this load level. You can promote with confidence."
			case SevWarn:
				return "the API has issues that should be addressed before production traffic reaches this level. See the recommendations section for specific fixes."
			case SevBad:
				return "the API is degraded under this load. Do not promote until the issues called out below are fixed and re-tested."
			case SevCritical:
				return "the API is broken under this load. This is a release-blocker — the test ran but the service could not respond meaningfully."
			}
			return ""
		},
		"statusRows": statusRowsFn,
		"errorRows":  errorRowsFn,
		"donut":      donutFn,
		"donutLegend": donutLegendFn,
		"multiSparkline": func(series []metrics.SecondBucket) template.HTML {
			return template.HTML(multiSparklineSVG(series))
		},
	}

	tpl, err := template.New("report").Funcs(funcs).Parse(htmlTpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tpl.Execute(&buf, view); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func fmtIntComma(n int64) string {
	if n < 0 {
		return "-" + fmtIntComma(-n)
	}
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	return fmtIntComma(n/1000) + "," + fmt.Sprintf("%03d", n%1000)
}

func humanBytes(n int64) string {
	const (
		kb = 1024
		mb = kb * 1024
		gb = mb * 1024
	)
	switch {
	case n >= gb:
		return fmt.Sprintf("%.2f GB", float64(n)/gb)
	case n >= mb:
		return fmt.Sprintf("%.2f MB", float64(n)/mb)
	case n >= kb:
		return fmt.Sprintf("%.2f KB", float64(n)/kb)
	default:
		return fmt.Sprintf("%d B", n)
	}
}

func up(s string) string {
	out := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' {
			c -= 32
		}
		out[i] = c
	}
	return string(out)
}

func statusRowsFn(a Aggregates) []statusRow {
	rows := []statusRow{}
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
		rows = append(rows, statusRow{
			Code:    statusCodeLabel(k),
			Meaning: statusMeaning(k),
			Count:   count,
			Pct:     float64(count) / total * 100,
		})
	}
	return rows
}

func statusCodeLabel(c int) string {
	if c == 0 {
		return "TIMEOUT"
	}
	return fmt.Sprintf("%d", c)
}

func statusMeaning(c int) string {
	switch {
	case c == 0:
		return "Network failure / timeout"
	case c >= 200 && c < 300:
		return "Success"
	case c >= 300 && c < 400:
		return "Redirect"
	case c == 401:
		return "Unauthorized — bad or missing auth"
	case c == 403:
		return "Forbidden"
	case c == 404:
		return "Not Found — wrong URL"
	case c == 429:
		return "Rate-limited"
	case c >= 400 && c < 500:
		return "Client error"
	case c == 500:
		return "Internal server error"
	case c == 502:
		return "Bad gateway — upstream down"
	case c == 503:
		return "Service unavailable"
	case c == 504:
		return "Gateway timeout"
	case c >= 500:
		return "Server error"
	default:
		return ""
	}
}

func errorRowsFn(m map[string]int64) []errorRow {
	out := make([]errorRow, 0, len(m))
	for k, v := range m {
		out = append(out, errorRow{Reason: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

func donutFn(a Aggregates) template.HTML {
	// classify status counts into 4 buckets for the donut
	type seg struct {
		label string
		color string
		count int64
	}
	var s2, s3, s4, s5, sNet int64
	for code, n := range a.StatusCounts {
		switch {
		case code == 0:
			sNet += n
		case code >= 200 && code < 300:
			s2 += n
		case code >= 300 && code < 400:
			s3 += n
		case code >= 400 && code < 500:
			s4 += n
		case code >= 500:
			s5 += n
		}
	}
	segs := []seg{
		{"2xx Success", "#22c55e", s2},
		{"3xx Redirect", "#3b82f6", s3},
		{"4xx Client", "#f59e0b", s4},
		{"5xx Server", "#ef4444", s5},
		{"Network/Timeout", "#a855f7", sNet},
	}
	total := int64(0)
	for _, s := range segs {
		total += s.count
	}
	if total == 0 {
		return template.HTML(`<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="60" fill="none" stroke="#e6e4dc" stroke-width="20"/></svg>`)
	}

	const r = 60.0
	const cx, cy = 80.0, 80.0
	circ := 2 * 3.141592653589793 * r
	var paths bytes.Buffer
	offset := 0.0
	for _, s := range segs {
		if s.count == 0 {
			continue
		}
		frac := float64(s.count) / float64(total)
		seg := frac * circ
		fmt.Fprintf(&paths,
			`<circle cx="%f" cy="%f" r="%f" fill="none" stroke="%s" stroke-width="20" stroke-dasharray="%f %f" stroke-dashoffset="-%f" transform="rotate(-90 %f %f)"/>`,
			cx, cy, r, s.color, seg, circ-seg, offset, cx, cy)
		offset += seg
	}
	out := fmt.Sprintf(`<svg viewBox="0 0 160 160">
%s
<text x="80" y="78" text-anchor="middle" font-family="Fraunces, serif" font-size="22" font-weight="600" fill="#0e0f13">%s</text>
<text x="80" y="96" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" letter-spacing="2" fill="#6a6f7d">TOTAL</text>
</svg>`, paths.String(), fmtIntComma(total))
	return template.HTML(out)
}

func donutLegendFn(a Aggregates) template.HTML {
	type seg struct {
		label string
		color string
		count int64
	}
	var s2, s3, s4, s5, sNet int64
	for code, n := range a.StatusCounts {
		switch {
		case code == 0:
			sNet += n
		case code >= 200 && code < 300:
			s2 += n
		case code >= 300 && code < 400:
			s3 += n
		case code >= 400 && code < 500:
			s4 += n
		case code >= 500:
			s5 += n
		}
	}
	segs := []seg{
		{"2xx Success", "#22c55e", s2},
		{"3xx Redirect", "#3b82f6", s3},
		{"4xx Client", "#f59e0b", s4},
		{"5xx Server", "#ef4444", s5},
		{"Network/Timeout", "#a855f7", sNet},
	}
	total := float64(a.Requests)
	if total == 0 {
		total = 1
	}
	var b bytes.Buffer
	for _, s := range segs {
		if s.count == 0 {
			continue
		}
		fmt.Fprintf(&b, `<div><span class="sw" style="background:%s"></span>%s<span class="count">%s (%.1f%%)</span></div>`,
			s.color, s.label, fmtIntComma(s.count), float64(s.count)/total*100)
	}
	return template.HTML(b.String())
}
