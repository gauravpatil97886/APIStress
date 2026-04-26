import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, Eye, Plus, Zap } from "lucide-react";
import { api } from "../lib/api";
import { MetricCard } from "../components/ui/MetricCard";
import { RunStatusBadge } from "../components/ui/RunStatusBadge";
import { MiniCountdown } from "../components/ui/MiniCountdown";

export default function Dashboard() {
  const [runs, setRuns] = useState<any[]>([]);
  useEffect(() => { api.listRuns().then(setRuns).catch(() => setRuns([])); }, []);

  const totalRuns = runs.length;
  const finished = runs.filter((r) => r.status === "finished").length;
  const failed = runs.filter((r) => r.status === "failed" || r.status === "cancelled").length;
  const totalReq = runs.reduce((acc, r) => acc + (r.summary?.totals?.requests || 0), 0);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-ink-muted mt-1">Recent activity and quick actions.</p>
        </div>
        <Link to="/builder" className="btn-primary"><Plus className="w-4 h-4" />New Test</Link>
      </header>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        <MetricCard label="Total runs" value={totalRuns} icon={<Activity className="w-5 h-5" />} tone="brand" />
        <MetricCard label="Successful" value={finished} icon={<CheckCircle2 className="w-5 h-5" />} tone="good" />
        <MetricCard label="Failed / Cancelled" value={failed} icon={<AlertTriangle className="w-5 h-5" />} tone={failed ? "bad" : "neutral"} />
        <MetricCard label="Requests fired" value={totalReq.toLocaleString()} icon={<Zap className="w-5 h-5" />} />
      </motion.div>

      <section className="card p-0 overflow-hidden">
        <header className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          <Link to="/runs" className="text-xs text-brand hover:underline">View all</Link>
        </header>
        <div className="divide-y divide-bg-border">
          {runs.slice(0, 8).map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="px-5 py-3 flex items-center gap-4 hover:bg-white/[.02]"
            >
              <RunStatusBadge status={r.status} />
              <div className="flex-1 min-w-0">
                <Link to={`/runs/${r.id}`} className="font-medium text-ink truncate hover:text-brand">
                  {r.name || r.id}
                </Link>
                <div className="text-xs text-ink-muted truncate">
                  by <span className="text-ink">{r.created_by || "—"}</span>
                  {r.jira_id && (<> · <span className="text-brand">{r.jira_id}</span></>)}
                </div>
              </div>
              {r.status === "running" && r.config?.duration_sec ? (
                <MiniCountdown startedAt={r.started_at} totalSec={r.config.duration_sec} />
              ) : (
                <div className="text-right text-xs tabular-nums text-ink-muted">
                  <div>{r.summary?.totals?.requests?.toLocaleString() ?? 0} req</div>
                  <div className="text-ink-dim">
                    {r.summary?.rps ? `${r.summary.rps.toFixed(1)} rps` : "—"}
                  </div>
                </div>
              )}
              {r.status === "running"
                ? <Link to={`/runs/${r.id}`} className="btn-primary text-xs">Live</Link>
                : <>
                    <a href={api.reportHTMLUrl(r.id)} target="_blank" rel="noopener" className="btn-ghost text-xs">
                      <Eye className="w-3.5 h-3.5" />View
                    </a>
                    <Link to={`/reports/${r.id}`} className="btn-ghost text-xs">Detail</Link>
                  </>}
            </motion.div>
          ))}
          {runs.length === 0 && (
            <div className="px-5 py-12 text-center text-ink-muted text-sm">
              No runs yet — <Link to="/builder" className="text-brand hover:underline">launch your first test</Link>.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
