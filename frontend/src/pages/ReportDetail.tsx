import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Download, Eye, RotateCcw, FileText, Clipboard, ArrowLeft,
  Sparkles, Activity, AlertOctagon, CheckCircle2, AlertTriangle, Info,
  Zap, Hash, Server,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { LatencyChart } from "../components/charts/LatencyChart";
import { RpsChart } from "../components/charts/RpsChart";
import { VuChart } from "../components/charts/VuChart";
import { ErrorRateChart } from "../components/charts/ErrorRateChart";
import { StatusDonut } from "../components/charts/StatusDonut";
import { MetricCard } from "../components/ui/MetricCard";
import { RunStatusBadge } from "../components/ui/RunStatusBadge";
import { VerdictBanner } from "../components/ui/VerdictBanner";
import { TestedBy } from "../components/ui/TestedBy";
import { PDFDownloadModal } from "../components/ui/PDFDownloadModal";
import { CostCard } from "../components/ui/CostCard";

type Aggregates = {
  Requests?: number; Errors?: number; Successes?: number;
  SuccessPct?: number; ErrorPct?: number;
  DurationS?: number; AvgRPS?: number; PeakRPS?: number; BytesIn?: number;
  MinMs?: number; MaxMs?: number; MeanMs?: number;
  P50Ms?: number; P75Ms?: number; P90Ms?: number; P95Ms?: number; P99Ms?: number;
  StdDevMs?: number; PeakVUs?: number;
  StatusCounts?: Record<string, number>;
  ErrorReasons?: Record<string, number>;
};

type Insight = {
  Severity: string; severity?: string;
  Title?: string; title?: string;
  Detail?: string; detail?: string;
  Recommend?: string; recommend?: string;
};

export default function ReportDetail() {
  const { id = "" } = useParams();
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    setR(null); setErr("");
    api.report(id)
      .then((d) => setR(d))
      .catch((e) => setErr(e?.message || "Failed to load report"));
  }, [id]);

  const series = useMemo(() => {
    const s = r?.series || r?.summary?.series || [];
    return s.map((b: any, i: number) => ({
      t: i + 1,
      p50_ms: round(b.p50_ms),
      p95_ms: round(b.p95_ms),
      p99_ms: round(b.p99_ms),
      requests: b.requests,
      errors: b.errors,
      active_vus: b.active_vus,
    }));
  }, [r]);

  if (err) {
    return (
      <div className="card p-6 ring-1 ring-bad/30">
        <div className="text-bad font-semibold mb-1">Couldn't load this report</div>
        <div className="text-sm text-ink-muted">{err}</div>
        <div className="text-xs text-ink-dim mt-3 font-mono">id: {id}</div>
        <Link to="/history" className="btn-ghost text-xs mt-4"><ArrowLeft className="w-3.5 h-3.5" />Back to history</Link>
      </div>
    );
  }
  if (!r) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-bg-card rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 bg-bg-card rounded-2xl" />)}
        </div>
        <div className="h-64 bg-bg-card rounded-2xl" />
      </div>
    );
  }

  const agg: Aggregates = r.aggregates || {};
  const totals = r.summary?.totals || { requests: 0, errors: 0, statuses: {} };
  const errRate = (agg.ErrorPct ?? r.summary?.error_rate * 100) ?? 0;
  const successPct = agg.SuccessPct ?? (100 - errRate);
  const errTone = errRate >= 5 ? "bad" : errRate >= 1 ? "warn" : "good";
  const p95 = agg.P95Ms ?? 0;
  const p95Tone = p95 >= 1000 ? "bad" : p95 >= 500 ? "warn" : "good";

  const insights: Insight[] = r.insights || [];
  const cfg = r.config || {};
  const req = cfg.request || {};

  function copyCurl() {
    const headers = Object.entries(req.headers || {})
      .map(([k, v]) => ` -H '${k}: ${v}'`).join("");
    const body = req.body ? ` -d '${String(req.body).replace(/'/g, "'\\''")}'` : "";
    const cmd = `curl -X ${req.method || "GET"} '${req.url || ""}'${headers}${body}`;
    navigator.clipboard.writeText(cmd);
    toast.success("curl copied to clipboard");
  }
  function copyShare() {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Share link copied");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <Link to="/history" className="text-xs text-ink-muted hover:text-brand inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="w-3 h-3" /> Back to history
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{r.name || "Untitled load test"}</h1>
            <RunStatusBadge status={r.status} />
          </div>
          <div className="mt-2 text-sm text-ink-muted flex items-center gap-2 font-mono min-w-0">
            <span className={`pill ring-1 ${methodTone(req.method)} shrink-0`}>{req.method || "GET"}</span>
            <span className="truncate">{req.url || "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button onClick={copyCurl} className="btn-ghost text-xs flex-1 sm:flex-none"><Clipboard className="w-3.5 h-3.5" />Copy curl</button>
          <button onClick={copyShare} className="btn-ghost text-xs flex-1 sm:flex-none"><Hash className="w-3.5 h-3.5" />Share</button>
          <Link to={`/builder?from=${id}`} className="btn-ghost text-xs flex-1 sm:flex-none"><RotateCcw className="w-3.5 h-3.5" />Re-run</Link>
          <a href={api.reportHTMLUrl(id)} target="_blank" rel="noopener" className="btn-secondary flex-1 sm:flex-none"><Eye className="w-4 h-4" />View</a>
          <button type="button" onClick={() => setPdfOpen(true)} className="btn-primary flex-1 sm:flex-none">
            <Download className="w-4 h-4" />PDF
          </button>
        </div>
      </header>

      {/* Verdict banner */}
      <VerdictBanner v={r.verdict} />

      {/* Tested by attribution */}
      <TestedBy
        name={r.created_by}
        jiraID={r.jira_id}
        jiraLink={r.jira_link}
        startedAt={r.started_at}
        finishedAt={r.finished_at}
        runID={id}
        notes={r.notes}
        envTag={r.env_tag}
      />

      {/* Cost estimate (only shown when user provided cost inputs) */}
      <CostCard estimate={r.cost_estimate} />

      {/* Executive summary */}
      <ExecutiveSummary agg={agg} cfg={cfg} />

      {/* KPI tiles */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05 } },
        }}
      >
        <MetricCard label="Total requests" value={fmtInt(agg.Requests ?? totals.requests)} hint={`in ${(agg.DurationS ?? 0).toFixed(1)}s`} />
        <MetricCard label="Throughput" value={`${(agg.AvgRPS ?? 0).toFixed(1)} rps`} hint={`peak ${Math.round(agg.PeakRPS ?? 0)} rps`} tone="good" icon={<Zap className="w-5 h-5" />} />
        <MetricCard label="Success rate" value={`${successPct.toFixed(2)}%`} hint={`${fmtInt(agg.Successes ?? 0)} of ${fmtInt(agg.Requests ?? 0)}`} tone={successPct >= 99 ? "good" : successPct >= 95 ? "warn" : "bad"} icon={<CheckCircle2 className="w-5 h-5" />} />
        <MetricCard label="Error rate" value={`${errRate.toFixed(2)}%`} hint={`${fmtInt(agg.Errors ?? totals.errors)} failed`} tone={errTone as any} icon={<AlertOctagon className="w-5 h-5" />} />

        <MetricCard label="Median latency (p50)" value={`${(agg.P50Ms ?? 0).toFixed(0)} ms`} hint="typical user" />
        <MetricCard label="p95 latency" value={`${p95.toFixed(0)} ms`} hint="slowest 5%" tone={p95Tone as any} />
        <MetricCard label="p99 latency" value={`${(agg.P99Ms ?? 0).toFixed(0)} ms`} hint="worst 1%" />
        <MetricCard label="Peak VUs" value={fmtInt(agg.PeakVUs ?? 0)} hint="concurrent users" tone="brand" icon={<Activity className="w-5 h-5" />} />
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LatencyChart data={series} />
        <RpsChart data={series} />
        <VuChart data={series} />
        <ErrorRateChart data={series} />
      </div>

      {/* Latency breakdown table + status donut side by side */}
      <div className="grid lg:grid-cols-2 gap-4">
        <LatencyTable agg={agg} />
        <StatusDonut statuses={totals.statuses} />
      </div>

      {/* Insights */}
      {insights.length > 0 && <InsightsPanel insights={insights} />}

      {/* Error reasons */}
      {totals.error_reasons && Object.keys(totals.error_reasons).length > 0 && (
        <section className="card p-5 border border-bad/30">
          <h3 className="text-sm font-semibold mb-3 text-bad">Why requests failed</h3>
          <ul className="space-y-2">
            {Object.entries(totals.error_reasons)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .map(([reason, count]) => (
                <li key={reason} className="flex items-start gap-3 text-sm">
                  <span className="pill ring-1 bg-bad/15 text-bad ring-bad/30 shrink-0 tabular-nums">
                    {Number(count).toLocaleString()}×
                  </span>
                  <span className="text-ink">{reason}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Test config */}
      <TestConfigCard cfg={cfg} />

      {/* Standards reference */}
      <StandardsCard />

      <PDFDownloadModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        runID={id}
        defaultName={r.name}
        envTag={r.env_tag}
        jiraID={r.jira_id}
      />
    </div>
  );
}

function ExecutiveSummary({ agg, cfg }: { agg: Aggregates; cfg: any }) {
  const reqs = agg.Requests ?? 0;
  if (reqs === 0) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}
      className="card p-6"
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-brand" /> Executive summary
      </div>
      <p className="mt-3 text-base leading-relaxed text-ink">
        We simulated <b>{fmtInt(agg.PeakVUs ?? cfg.vus ?? 0)} concurrent users</b> hitting your API in a{" "}
        <b className="text-brand">{cfg.pattern || "constant"}</b> pattern for{" "}
        <b>{(agg.DurationS ?? 0).toFixed(1)}s</b>. The API served{" "}
        <b>{fmtInt(reqs)} total requests</b> at an average throughput of{" "}
        <b>{(agg.AvgRPS ?? 0).toFixed(1)} requests / sec</b>{" "}
        (peaking at <b>{Math.round(agg.PeakRPS ?? 0)} rps</b>).
      </p>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">
        Half of all responses came back within <b className="text-ink">{(agg.P50Ms ?? 0).toFixed(0)}ms</b> (typical user
        experience). The slowest 5% took longer than <b className="text-ink">{(agg.P95Ms ?? 0).toFixed(0)}ms</b>, and the
        worst 1% exceeded <b className="text-ink">{(agg.P99Ms ?? 0).toFixed(0)}ms</b>.{" "}
        <b className="text-good">{(agg.SuccessPct ?? 0).toFixed(2)}% succeeded</b>, while{" "}
        <b className="text-bad">{(agg.ErrorPct ?? 0).toFixed(2)}% failed</b>.
      </p>
    </motion.section>
  );
}

function LatencyTable({ agg }: { agg: Aggregates }) {
  const rows: [string, string, string][] = [
    ["Minimum", `${(agg.MinMs ?? 0).toFixed(0)} ms`, "Fastest response observed"],
    ["Average (mean)", `${(agg.MeanMs ?? 0).toFixed(0)} ms`, "Hides slow outliers"],
    ["Median (p50)", `${(agg.P50Ms ?? 0).toFixed(0)} ms`, "What a typical user experiences"],
    ["p75", `${(agg.P75Ms ?? 0).toFixed(0)} ms`, "75% of users are faster"],
    ["p90", `${(agg.P90Ms ?? 0).toFixed(0)} ms`, "Common SLO target"],
    ["p95", `${(agg.P95Ms ?? 0).toFixed(0)} ms`, "Industry standard SLO"],
    ["p99", `${(agg.P99Ms ?? 0).toFixed(0)} ms`, "Worst 1% — your unhappy users"],
    ["Maximum", `${(agg.MaxMs ?? 0).toFixed(0)} ms`, "Slowest response observed"],
    ["Std dev", `${(agg.StdDevMs ?? 0).toFixed(0)} ms`, "Lower = more predictable"],
  ];
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border">
        <h3 className="text-sm font-semibold text-ink">Latency breakdown</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-bg-border">
          {rows.map(([label, value, hint]) => (
            <tr key={label}>
              <td className="px-4 py-2 text-ink font-medium">{label}</td>
              <td className="px-4 py-2 text-right tabular-nums font-mono font-semibold text-ink">{value}</td>
              <td className="px-4 py-2 text-xs text-ink-muted">{hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">Insights & recommendations</h2>
        <span className="text-xs text-ink-muted">— what your numbers reveal, and what to do next</span>
      </div>
      <div className="space-y-2">
        {insights.map((ins, i) => {
          const sev = (ins.Severity || ins.severity || "info").toLowerCase();
          const tone = sevTone(sev);
          const Icon = sevIcon(sev);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`card p-4 flex items-start gap-3 ring-1 ${tone.ring}`}
            >
              <div className={`shrink-0 mt-0.5 ${tone.text}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-ink">{ins.Title || ins.title}</h4>
                {(ins.Detail || ins.detail) && (
                  <p className="mt-1 text-sm text-ink-muted leading-relaxed">{ins.Detail || ins.detail}</p>
                )}
                {(ins.Recommend || ins.recommend) && (
                  <div className="mt-3 text-xs text-ink bg-bg-card rounded-lg px-3 py-2 border-l-2 border-brand">
                    <span className="font-bold text-brand uppercase tracking-wider mr-2">Recommendation</span>
                    {ins.Recommend || ins.recommend}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function TestConfigCard({ cfg }: { cfg: any }) {
  const req = cfg?.request || {};
  const headers = req.headers || {};
  const headerCount = Object.keys(headers).length;
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">Test configuration</h3>
        <span className="text-xs text-ink-muted">— exact parameters used (reproducible)</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <KV k="Pattern" v={String(cfg.pattern || "—").toUpperCase()} />
        <KV k="HTTP method" v={req.method || "—"} mono />
        <KV k="Virtual users" v={String(cfg.vus ?? "—")} />
        <KV k="Duration" v={`${cfg.duration_sec ?? "—"} s`} />
        <KV k="Think time" v={`${cfg.think_time_ms ?? 0} ms`} />
        <KV k="Request timeout" v={`${req.timeout_ms ?? "—"} ms`} />
        <KV k="Custom headers" v={String(headerCount)} />
        <KV k="Body size" v={`${req.body ? new TextEncoder().encode(req.body).length : 0} bytes`} />
      </div>
      <div className="mt-3 pt-3 border-t border-bg-border">
        <KV k="Target URL" v={req.url || "—"} mono full />
      </div>
      {headerCount > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-2">Headers</div>
          <div className="space-y-1 font-mono text-xs">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k} className="flex">
                <span className="text-brand">{k}</span>
                <span className="text-ink-dim mx-2">:</span>
                <span className="text-ink truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StandardsCard() {
  const rows: [string, string, string][] = [
    ["Google SRE Handbook", "Error budget", "≤ 1% per month"],
    ["Google SRE Handbook", "p99 latency (interactive)", "< 1000 ms"],
    ["Google Web Vitals", "Good response time (INP)", "< 200 ms"],
    ["Google Web Vitals", "Poor response time (INP)", "> 500 ms"],
    ["AWS Well-Architected", "Latency variance", "p95 within 2× p50"],
    ["General industry", "Availability (3 nines)", "99.9% uptime"],
  ];
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">Industry standards reference</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map(([source, metric, target]) => (
          <div key={metric} className="text-xs text-ink-muted">
            <div className="font-mono uppercase tracking-wider text-[10px]">{source}</div>
            <div className="text-ink mt-0.5">{metric}</div>
            <div className="text-brand font-mono">{target}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KV({ k, v, mono = false, full = false }: { k: string; v: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={`flex ${full ? "flex-col" : "items-baseline justify-between"} gap-2`}>
      <span className="text-xs text-ink-muted uppercase tracking-wider font-semibold">{k}</span>
      <span className={`text-sm text-ink ${mono ? "font-mono" : ""} ${full ? "break-all" : ""}`}>{v}</span>
    </div>
  );
}

function sevTone(s: string) {
  switch (s) {
    case "good":     return { ring: "ring-good/30",  text: "text-good" };
    case "warn":     return { ring: "ring-warn/30",  text: "text-warn" };
    case "bad":
    case "critical": return { ring: "ring-bad/30",   text: "text-bad" };
    default:         return { ring: "ring-bg-border", text: "text-cool" };
  }
}
function sevIcon(s: string) {
  switch (s) {
    case "good": return CheckCircle2;
    case "warn": return AlertTriangle;
    case "bad":
    case "critical": return AlertOctagon;
    default: return Info;
  }
}

function methodTone(m?: string) {
  const x = (m || "GET").toUpperCase();
  if (x === "POST")   return "bg-good/15 text-good ring-good/30";
  if (x === "PUT" || x === "PATCH") return "bg-warn/15 text-warn ring-warn/30";
  if (x === "DELETE") return "bg-bad/15 text-bad ring-bad/30";
  return "bg-brand/15 text-brand ring-brand/30";
}

function fmtInt(n: any): string {
  return Number(n || 0).toLocaleString();
}
function round(n?: number) { return n ? Math.round(n * 100) / 100 : 0; }
