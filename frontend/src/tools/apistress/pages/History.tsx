import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity, AlertOctagon, CheckCircle2, Download, ExternalLink,
  Eye, FileText, Filter, GitCompare, Hammer, RotateCcw,
  Search, Tag, User as UserIcon,
} from "lucide-react";
import { api } from "../../../platform/api/client";
import { RunStatusBadge } from "../../../platform/components/ui/RunStatusBadge";
import { MiniCountdown } from "../../../platform/components/ui/MiniCountdown";
import { EnvPill, ENV_TAGS } from "../../../platform/components/layout/EnvPill";
import { PDFDownloadModal } from "../../../platform/components/ui/PDFDownloadModal";
import { JiraSendButton } from "../../../platform/components/jira/JiraSendButton";

type Run = {
  id: string;
  name: string;
  status: string;
  created_by?: string;
  jira_id?: string;
  jira_link?: string;
  env_tag?: string;
  started_at?: string | null;
  finished_at?: string | null;
  summary?: any;
  config?: { duration_sec?: number };
};

export default function History() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "finished" | "failed" | "cancelled">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [pdfTarget, setPdfTarget] = useState<Run | null>(null);
  const [compareIDs, setCompareIDs] = useState<string[]>([]);
  const navigate = useNavigate();

  async function reload() {
    try { setRuns((await api.listRuns()) as Run[]); } catch { setRuns([]); }
  }
  useEffect(() => {
    reload();
    const i = setInterval(reload, 5000);
    return () => clearInterval(i);
  }, []);

  const users = useMemo(() => {
    const s = new Set<string>();
    runs.forEach((r) => r.created_by && s.add(r.created_by));
    return ["all", ...Array.from(s).sort()];
  }, [runs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (userFilter !== "all" && r.created_by !== userFilter) return false;
      if (envFilter !== "all" && (r.env_tag || "") !== envFilter) return false;
      if (!needle) return true;
      return (
        (r.name || "").toLowerCase().includes(needle) ||
        (r.created_by || "").toLowerCase().includes(needle) ||
        (r.jira_id || "").toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle)
      );
    });
  }, [runs, q, statusFilter, userFilter, envFilter]);

  const stats = useMemo(() => {
    let running = 0, finished = 0, failed = 0;
    runs.forEach((r) => {
      if (r.status === "running") running++;
      else if (r.status === "finished") finished++;
      else failed++;
    });
    return { total: runs.length, running, finished, failed };
  }, [runs]);

  function toggleCompare(id: string) {
    setCompareIDs((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // keep most-recent two
      return [...prev, id];
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Hammer className="w-7 h-7 text-brand" />
            Test History
          </h1>
          <p className="text-ink-muted mt-1">
            Every load test ever run — who ran it, what was tested, and the outcome.
          </p>
        </div>
        <Link to="/builder" className="btn-primary">+ New Test</Link>
      </header>

      {compareIDs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="card p-3 flex items-center gap-3 ring-1 ring-brand/30 bg-brand/[.04]"
        >
          <GitCompare className="w-4 h-4 text-brand shrink-0" />
          <span className="text-sm font-semibold text-ink">
            {compareIDs.length} of 2 selected for comparison
          </span>
          <span className="text-xs text-ink-muted truncate">
            {compareIDs.map((id) => {
              const r = runs.find((x) => x.id === id);
              return r?.name || id.slice(0, 8);
            }).join("  vs  ")}
          </span>
          <div className="flex-1" />
          <button onClick={() => setCompareIDs([])} className="btn-ghost text-xs">Clear</button>
          {compareIDs.length === 2 && (
            <button
              onClick={() => navigate(`/compare?a=${compareIDs[0]}&b=${compareIDs[1]}`)}
              className="btn-primary text-xs"
            >
              Compare now <GitCompare className="w-3.5 h-3.5" />
            </button>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile label="All time" value={stats.total} Icon={Activity} />
        <SummaryTile label="Running now" value={stats.running} Icon={Hammer} tone="brand" />
        <SummaryTile label="Successful" value={stats.finished} Icon={CheckCircle2} tone="good" />
        <SummaryTile label="Failed / Cancelled" value={stats.failed} Icon={AlertOctagon} tone={stats.failed ? "bad" : "neutral"} />
      </div>

      <section className="card p-3 flex flex-wrap items-center gap-2 gap-y-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, user, Jira, or run ID…"
            className="input w-full pl-9"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-ink-muted ml-1">
          <Filter className="w-3.5 h-3.5" />Status
        </div>
        {(["all", "running", "finished", "failed", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ring-1
              ${statusFilter === s ? "bg-brand/15 text-brand ring-brand/30" : "bg-bg-card text-ink-muted ring-bg-border hover:text-ink"}`}
          >
            {s}
          </button>
        ))}
        <div className="flex items-center gap-1 text-xs text-ink-muted ml-2">
          <UserIcon className="w-3.5 h-3.5" />User
        </div>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="input text-xs py-1.5"
        >
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="flex items-center gap-1 text-xs text-ink-muted ml-2">
          <Tag className="w-3.5 h-3.5" />Env
        </div>
        {(["all", ...ENV_TAGS] as const).map((t) => (
          <button
            key={t}
            onClick={() => setEnvFilter(t)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition ring-1
              ${envFilter === t
                ? (t === "Production" ? "bg-bad/15 text-bad ring-bad/30"
                  : t === "Broking"   ? "bg-warn/15 text-warn ring-warn/30"
                  : t === "UAT"       ? "bg-blue-500/15 text-blue-400 ring-blue-500/30"
                  :                     "bg-brand/15 text-brand ring-brand/30")
                : "bg-bg-card text-ink-muted ring-bg-border hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </section>

      <PDFDownloadModal
        open={pdfTarget !== null}
        onClose={() => setPdfTarget(null)}
        runID={pdfTarget?.id || ""}
        defaultName={pdfTarget?.name}
        envTag={pdfTarget?.env_tag}
        jiraID={pdfTarget?.jira_id}
      />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted bg-white/[0.02]">
            <tr>
              <th className="text-left px-5 py-3">Test</th>
              <th className="text-left px-3 py-3">Status</th>
              <th className="text-left px-3 py-3">Env</th>
              <th className="text-left px-3 py-3">By</th>
              <th className="text-left px-3 py-3">Jira</th>
              <th className="text-left px-3 py-3">Started</th>
              <th className="text-right px-3 py-3">Requests</th>
              <th className="text-right px-3 py-3">RPS</th>
              <th className="text-right px-3 py-3">p95</th>
              <th className="text-right px-3 py-3">Errors</th>
              <th className="px-5 py-3 text-right"><span className="opacity-60">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {filtered.map((r, i) => {
              const last = r.summary?.series?.[r.summary.series.length - 1];
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  className="hover:bg-white/[.02]"
                >
                  <td className="px-5 py-3">
                    <Link to={r.status === "running" ? `/runs/${r.id}` : `/reports/${r.id}`}
                      className="font-medium hover:text-brand">{r.name || "Untitled"}</Link>
                    <div className="text-[11px] text-ink-dim font-mono">{r.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-3"><RunStatusBadge status={r.status} /></td>
                  <td className="px-3"><EnvPill tag={r.env_tag} /></td>
                  <td className="px-3">{r.created_by || "—"}</td>
                  <td className="px-3">
                    {r.jira_link ? (
                      <a href={r.jira_link} target="_blank" className="text-brand hover:underline inline-flex items-center gap-1">
                        {r.jira_id || "link"} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (r.jira_id || "—")}
                  </td>
                  <td className="px-3">
                    {r.status === "running" && r.config?.duration_sec ? (
                      <MiniCountdown startedAt={r.started_at} totalSec={r.config.duration_sec} />
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">{(r.summary?.totals?.requests ?? 0).toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{r.summary?.rps ? r.summary.rps.toFixed(1) : "—"}</td>
                  <td className="px-3 text-right tabular-nums">{last?.p95_ms ? last.p95_ms.toFixed(0) + " ms" : "—"}</td>
                  <td className="px-3 text-right tabular-nums text-bad">{(r.summary?.totals?.errors ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1 items-center">
                      {r.status === "running" ? (
                        <Link to={`/runs/${r.id}`} className="btn-primary text-xs px-3 py-1.5">Live</Link>
                      ) : (
                        <>
                          <a
                            href={api.reportHTMLUrl(r.id)}
                            target="_blank" rel="noopener"
                            title="View HTML report in new tab"
                            className="btn-primary !p-2"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <Link
                            to={`/reports/${r.id}`}
                            title="Open in-app report detail"
                            className="btn-ghost !p-2"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => setPdfTarget(r)}
                            title="Download PDF (with naming options)"
                            className="btn-ghost !p-2"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            to={`/builder?from=${r.id}`}
                            title="Re-run with the same config"
                            className="btn-ghost !p-2"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Link>
                          <JiraSendButton runID={r.id} jiraID={r.jira_id} />

                          <button
                            onClick={() => toggleCompare(r.id)}
                            title={compareIDs.includes(r.id) ? "Remove from comparison" : "Add to comparison (pick 2)"}
                            className={`btn-ghost !p-2 relative ${compareIDs.includes(r.id) ? "text-brand ring-1 ring-brand/40 rounded-lg" : ""}`}
                          >
                            <GitCompare className="w-3.5 h-3.5" />
                            {compareIDs.includes(r.id) && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand text-white rounded-full text-[9px] font-bold grid place-items-center">
                                {compareIDs.indexOf(r.id) + 1}
                              </span>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-12 text-center text-ink-muted">
                {runs.length === 0 ? "No tests yet — run your first one." : "No runs match your filters."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label, value, Icon, tone = "neutral",
}: { label: string; value: number; Icon: any; tone?: "neutral"|"brand"|"good"|"bad" }) {
  const ring = tone === "neutral" ? "ring-bg-border" : `ring-${tone}/30`;
  const text = tone === "neutral" ? "text-ink" : `text-${tone}`;
  return (
    <div className={`card p-4 ring-1 ${ring}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold">{label}</div>
        <Icon className={`w-4 h-4 ${text}`} />
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${text}`}>{value}</div>
    </div>
  );
}
