import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, Download, FileText } from "lucide-react";
import { api } from "../lib/api";
import { RunStatusBadge } from "../components/ui/RunStatusBadge";
import { MiniCountdown } from "../components/ui/MiniCountdown";

export default function Runs() {
  const [runs, setRuns] = useState<any[]>([]);
  async function reload() {
    try { setRuns(await api.listRuns()); } catch { setRuns([]); }
  }
  useEffect(() => {
    reload();
    const i = setInterval(reload, 3000);
    return () => clearInterval(i);
  }, []);

  const active = runs.filter((r) => r.status === "running");
  const recent = runs.filter((r) => r.status !== "running").slice(0, 12);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Active Runs</h1>
        <p className="text-ink-muted mt-1">
          Tests running right now. They keep going even if you navigate away — you'll get a notification when they finish.
        </p>
      </header>

      <section>
        <h2 className="text-xs uppercase tracking-[0.18em] text-ink-muted font-semibold mb-3">In progress</h2>
        <div className="grid lg:grid-cols-2 gap-3">
          {active.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card p-4 hover:border-brand/40 transition ring-1 ring-brand/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <RunStatusBadge status={r.status} />
                <Link to={`/runs/${r.id}`} className="font-semibold hover:text-brand truncate flex-1">
                  {r.name || r.id}
                </Link>
                <Link to={`/runs/${r.id}`} className="btn-primary text-xs">Open live</Link>
              </div>
              <div className="text-xs text-ink-muted mb-3">
                by <span className="text-ink">{r.created_by || "—"}</span>
                {r.jira_id && <> · <span className="text-brand">{r.jira_id}</span></>}
              </div>
              {r.config?.duration_sec
                ? <MiniCountdown startedAt={r.started_at} totalSec={r.config.duration_sec} />
                : <span className="text-xs text-ink-dim">duration unknown</span>}
            </motion.div>
          ))}
          {active.length === 0 && (
            <div className="col-span-full text-center py-12 text-ink-muted card">
              No tests running right now.
              <div className="mt-2"><Link to="/builder" className="text-brand hover:underline">Start a new test →</Link></div>
            </div>
          )}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.18em] text-ink-muted font-semibold mb-3">Recently finished</h2>
          <div className="grid lg:grid-cols-2 gap-3">
            {recent.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="card p-4 flex items-center gap-3"
              >
                <RunStatusBadge status={r.status} />
                <div className="flex-1 min-w-0">
                  <Link to={`/reports/${r.id}`} className="font-semibold hover:text-brand truncate block">
                    {r.name || r.id}
                  </Link>
                  <div className="text-xs text-ink-muted truncate">
                    by <span className="text-ink">{r.created_by || "—"}</span>
                    {r.jira_id && <> · <span className="text-brand">{r.jira_id}</span></>}
                  </div>
                </div>
                <a href={api.reportHTMLUrl(r.id)} target="_blank" rel="noopener" className="btn-ghost text-xs">
                  <Eye className="w-3.5 h-3.5" />View
                </a>
                <Link to={`/reports/${r.id}`} className="btn-ghost text-xs"><FileText className="w-3.5 h-3.5" />Detail</Link>
                <a href={api.reportPDFUrl(r.id)} className="btn-secondary text-xs"><Download className="w-3.5 h-3.5" />PDF</a>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
