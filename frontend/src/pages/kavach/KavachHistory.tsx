// KavachHistory — list of past scans for the team. Mirrors APIStress's
// History tab — every scan with operator, target host, severity rollup,
// status, Jira link (if attached), and a quick-open button.

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Shield, ExternalLink, Search, Sparkles, ArrowRight,
  CheckCircle2, AlertCircle, Loader2, Clock, FileSpreadsheet, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

type Row = {
  id: string;
  target_url: string;
  target_host: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  summary?: any;
  created_by: string;
  jira_id?: string;
  jira_link?: string;
  notes?: string;
};

type Props = {
  onPick: (scanID: string) => void;
  onNewScan: () => void;
};

export function KavachHistory({ onPick, onNewScan }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.kavach.listScans();
      setRows(data || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load history");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.target_host.toLowerCase().includes(q) ||
      r.target_url.toLowerCase().includes(q) ||
      r.created_by?.toLowerCase().includes(q) ||
      r.jira_id?.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Aggregate stats across all scans (visible at top).
  const stats = useMemo(() => {
    let total = 0, completed = 0, findings = 0, critical = 0, high = 0;
    for (const r of rows) {
      total++;
      if (r.status === "completed") completed++;
      const c = r.summary?.counts || {};
      findings += Number(r.summary?.total_findings || 0);
      critical += Number(c.critical || 0);
      high += Number(c.high || 0);
    }
    return { total, completed, findings, critical, high };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-teal-700 to-teal-700 grid place-items-center shrink-0 shadow-md shadow-teal-900/40">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 font-mono">
            Past scans · {rows.length}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Scan history</h1>
        </div>
        <div className="flex-1" />
        <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button onClick={onNewScan} className="btn-primary text-xs">
          <Sparkles className="w-3.5 h-3.5" /> New scan
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total scans" value={stats.total} />
        <Stat label="Completed"   value={stats.completed} tone="good" />
        <Stat label="Findings"    value={stats.findings} />
        <Stat label="Critical"    value={stats.critical} tone="bad" />
        <Stat label="High"        value={stats.high} tone="warn" />
      </div>

      {/* Search */}
      <div className="card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by host, URL, operator, Jira ID…"
          className="input text-xs flex-1 py-1.5"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-12 text-center text-ink-muted">
          <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-50" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-ink-muted">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {rows.length === 0
            ? <div className="text-sm">No scans yet — run your first one.</div>
            : <div className="text-sm">No scans match "{search}".</div>}
          {rows.length === 0 && (
            <button onClick={onNewScan} className="btn-primary text-xs mt-4">
              <Sparkles className="w-3.5 h-3.5" /> Start a scan
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => <RowCard key={r.id} r={r} onPick={() => onPick(r.id)} />)}
        </ul>
      )}
    </div>
  );
}

function RowCard({ r, onPick }: { r: Row; onPick: () => void }) {
  const counts = r.summary?.counts || {};
  const total = Number(r.summary?.total_findings || 0);
  return (
    <li className="card p-4 ring-1 ring-bg-border hover:ring-cyan-500/30 transition cursor-pointer" onClick={onPick}>
      <div className="flex items-start gap-3 flex-wrap">
        <StatusPill status={r.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-sm truncate">{r.target_host}</div>
            {r.jira_id && (
              <a
                href={r.jira_link || "#"}
                target="_blank" rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="pill ring-1 text-[10px] bg-[#2684FF]/15 text-[#9bbcff] ring-[#2684FF]/30 inline-flex items-center gap-1 font-mono"
                title="Linked Jira ticket"
              >
                {r.jira_id} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="text-[11px] text-ink-muted truncate font-mono mt-0.5">
            {r.target_url}
          </div>
          <div className="text-[10px] text-ink-dim mt-1 flex items-center gap-2 flex-wrap">
            <span>by <b className="text-ink-muted">{r.created_by || "—"}</b></span>
            <span>·</span>
            <span>{new Date(r.started_at).toLocaleString()}</span>
            {r.summary?.tests_run && (
              <>
                <span>·</span>
                <span className="text-good">{r.summary.tests_passed} passed</span>
                <span>/</span>
                <span className="text-bad">{r.summary.tests_failed || 0} failed</span>
                <span>of {r.summary.tests_run} tests</span>
              </>
            )}
          </div>
        </div>

        {/* Severity rollup chips */}
        <div className="flex items-center gap-1 shrink-0">
          {(["critical","high","medium","low","info"] as const).map((s) => {
            const n = Number(counts[s] || 0);
            if (!n) return null;
            const tone =
              s === "critical" ? "bg-bad/15 text-bad ring-bad/40" :
              s === "high"     ? "bg-warn/15 text-warn ring-warn/40" :
              s === "medium"   ? "bg-amber-500/15 text-amber-400 ring-amber-500/40" :
              s === "low"      ? "bg-sky-500/15 text-sky-400 ring-sky-500/30" :
                                  "bg-bg-card ring-bg-border text-ink-muted";
            return (
              <span key={s} className={`pill ring-1 text-[10px] font-mono uppercase tracking-wider ${tone}`}>
                {s[0].toUpperCase()} {n}
              </span>
            );
          })}
          {total === 0 && (
            <span className="pill ring-1 text-[10px] bg-good/10 text-good ring-good/30 font-mono uppercase tracking-wider">
              <CheckCircle2 className="w-2.5 h-2.5 inline mr-1" /> clean
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a
            href={api.kavach.pdfURL(r.id)}
            target="_blank" rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="btn-ghost !p-2"
            title="Download PDF report"
          >
            <FileText className="w-3.5 h-3.5" />
          </a>
          <button onClick={onPick} className="btn-ghost !p-2" title="Open report">
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {r.notes && (
        <div className="mt-2 pl-12 text-[11px] text-ink-muted italic line-clamp-2">"{r.notes}"</div>
      )}
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const t =
    tone === "good" ? "text-good" :
    tone === "warn" ? "text-warn" :
    tone === "bad"  ? "text-bad"  :
                       "text-ink";
  return (
    <div className="card p-3 ring-1 ring-bg-border bg-teal-950/20">
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-tight mt-0.5 ${t}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg =
    status === "completed" ? { tone: "bg-good/15 text-good ring-good/40", Icon: CheckCircle2, label: "Completed" } :
    status === "running"   ? { tone: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/40", Icon: Loader2, label: "Running" } :
    status === "stopped"   ? { tone: "bg-warn/15 text-warn ring-warn/40", Icon: AlertCircle, label: "Stopped" } :
                              { tone: "bg-bad/15 text-bad ring-bad/40", Icon: AlertCircle, label: status };
  const { Icon } = cfg;
  return (
    <span className={`pill ring-1 text-[10px] uppercase tracking-wider font-mono inline-flex items-center gap-1.5 shrink-0 ${cfg.tone}`}>
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}
