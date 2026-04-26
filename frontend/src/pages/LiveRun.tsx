import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { AlertOctagon, ExternalLink, FileText, Square, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useLiveMetrics } from "../hooks/useLiveMetrics";
import { LatencyChart } from "../components/charts/LatencyChart";
import { RpsChart } from "../components/charts/RpsChart";
import { VuChart } from "../components/charts/VuChart";
import { ErrorRateChart } from "../components/charts/ErrorRateChart";
import { MetricCard } from "../components/ui/MetricCard";
import { RunStatusBadge } from "../components/ui/RunStatusBadge";
import { LiveIndicator } from "../components/ui/LiveIndicator";
import { RunCountdown } from "../components/ui/RunCountdown";

export default function LiveRun() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { snap, done } = useLiveMetrics(id);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    api.runStatus(id).then((m) => {
      setMeta(m);
      // If we landed here for a run that already completed (e.g. user
      // returned after navigating away), jump straight to the report.
      if (m && m.status && m.status !== "running" && m.status !== "pending") {
        nav(`/reports/${id}`, { replace: true });
      }
    }).catch(() => {});
  }, [id, done, nav]);

  // Smooth-ticking elapsed time. SSE pushes once a second, but the
  // countdown should animate every 100ms for a polished feel.
  const [tickElapsed, setTickElapsed] = useState(0);
  const startedAtMs = useRef<number | null>(null);
  useEffect(() => {
    if (!snap?.ts) return;
    if (startedAtMs.current == null) {
      startedAtMs.current = Date.now() - (snap.elapsed_sec ?? 0) * 1000;
    }
  }, [snap?.ts, snap?.elapsed_sec]);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      if (startedAtMs.current != null) {
        setTickElapsed((Date.now() - startedAtMs.current) / 1000);
      }
    }, 100);
    return () => clearInterval(t);
  }, [done]);

  const totalSec = Number(meta?.config?.duration_sec ?? meta?.config?.DurationSec ?? 0);
  const elapsedSec = done
    ? snap?.elapsed_sec ?? tickElapsed
    : Math.max(tickElapsed, snap?.elapsed_sec ?? 0);

  async function stop() {
    try { await api.stopRun(id); toast.success("Stop requested"); }
    catch (e: any) { toast.error(e.message || "Stop failed"); }
  }

  const series = useMemo(() => {
    if (!snap?.series) return [];
    return snap.series.map((b: any, i: number) => ({
      t: i + 1,
      p50_ms: round(b.p50_ms),
      p95_ms: round(b.p95_ms),
      p99_ms: round(b.p99_ms),
      mean_ms: round(b.mean_ms),
      requests: b.requests,
      errors: b.errors,
      active_vus: b.active_vus,
    }));
  }, [snap]);

  const totals = snap?.totals || { requests: 0, errors: 0, statuses: {} };
  const errRate = (snap?.error_rate ?? 0) * 100;
  const errTone = errRate >= 5 ? "bad" : errRate >= 1 ? "warn" : "good";
  const status = snap?.status || meta?.status || "running";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{meta?.name || "Live run"}</h1>
            <RunStatusBadge status={status} />
            {!done && status === "running" && <LiveIndicator />}
          </div>
          <div className="mt-2 text-sm text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
            <span>by <b className="text-ink">{meta?.created_by || "—"}</b></span>
            {meta?.jira_link ? (
              <a href={meta.jira_link} target="_blank" className="text-brand hover:underline flex items-center gap-1">
                {meta?.jira_id || "Jira"} <ExternalLink className="w-3 h-3" />
              </a>
            ) : meta?.jira_id ? <span>Jira {meta.jira_id}</span> : null}
            <span className="font-mono text-xs text-ink-dim">{id}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!done && status === "running" && (
            <button onClick={stop} className="btn-secondary"><Square className="w-4 h-4" />Stop</button>
          )}
          <Link to={`/reports/${id}`} className="btn-primary"><FileText className="w-4 h-4" />Open report</Link>
        </div>
      </header>

      {totalSec > 0 && (
        <RunCountdown elapsedSec={elapsedSec} totalSec={totalSec} done={done || snap?.status === "finished" || snap?.status === "cancelled"} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active VUs"      value={snap?.active_vus ?? 0} tone="brand" icon={<Zap className="w-5 h-5" />} />
        <MetricCard label="Requests"        value={totals.requests.toLocaleString()} hint={`${(snap?.rps ?? 0).toFixed(1)} rps`} />
        <MetricCard label="Errors"          value={totals.errors.toLocaleString()} hint={`${errRate.toFixed(2)}%`} tone={errTone as any} icon={<AlertOctagon className="w-5 h-5" />} />
        <MetricCard label="p95 latency"     value={`${(snap?.latest?.p95_ms ?? 0).toFixed(1)} ms`} hint={`p99 ${(snap?.latest?.p99_ms ?? 0).toFixed(1)} ms`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <LatencyChart data={series} />
        <RpsChart data={series} />
        <VuChart data={series} />
        <ErrorRateChart data={series} />
      </div>

      {totals.error_reasons && Object.keys(totals.error_reasons).length > 0 && (
        <section className="card p-5 border border-bad/30">
          <h3 className="text-sm font-semibold mb-3 text-bad flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" />Why are requests failing?
          </h3>
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
          <p className="mt-3 text-xs text-ink-muted">
            These messages come straight from the engine, translated into plain English.
          </p>
        </section>
      )}

      <section className="card p-5">
        <h3 className="text-sm font-semibold mb-3">Status code breakdown</h3>
        <div className="flex flex-wrap gap-2">
          {Object.keys(totals.statuses || {}).length === 0 && (
            <span className="text-sm text-ink-muted">No responses yet</span>
          )}
          {Object.entries(totals.statuses || {}).map(([code, count]) => (
            <motion.div
              key={code}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`pill ring-1 ${codeTone(code)}`}
            >
              <span className="font-mono">{code}</span>
              <span className="opacity-70">×</span>
              <span>{Number(count).toLocaleString()}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

function round(n?: number) { return n ? Math.round(n * 100) / 100 : 0; }
function codeTone(code: string) {
  const c = parseInt(code);
  if (c === 0) return "bg-bad/15 text-bad ring-bad/30";
  if (c < 300) return "bg-good/15 text-good ring-good/30";
  if (c < 400) return "bg-brand/15 text-brand ring-brand/30";
  if (c < 500) return "bg-warn/15 text-warn ring-warn/30";
  return "bg-bad/15 text-bad ring-bad/30";
}
