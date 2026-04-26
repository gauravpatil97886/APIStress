import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Eye, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { RunStatusBadge } from "../components/ui/RunStatusBadge";

export default function Reports() {
  const [runs, setRuns] = useState<any[]>([]);
  useEffect(() => { api.listRuns().then(setRuns).catch(() => setRuns([])); }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-ink-muted mt-1">All historical runs — open as HTML or download a PDF for stakeholders.</p>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted bg-white/[0.02]">
            <tr>
              <th className="text-left px-5 py-3">Test</th>
              <th className="text-left px-3 py-3">Status</th>
              <th className="text-left px-3 py-3">By</th>
              <th className="text-left px-3 py-3">Jira</th>
              <th className="text-right px-3 py-3">Requests</th>
              <th className="text-right px-3 py-3">RPS</th>
              <th className="text-right px-3 py-3">p95 (ms)</th>
              <th className="text-right px-3 py-3">Errors</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {runs.map((r, i) => {
              const lastBucket = r.summary?.series?.[r.summary.series.length - 1];
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="hover:bg-white/[.02]"
                >
                  <td className="px-5 py-3">
                    <Link to={`/reports/${r.id}`} className="font-medium hover:text-brand">{r.name || r.id}</Link>
                    <div className="text-[11px] text-ink-dim font-mono">{r.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-3"><RunStatusBadge status={r.status} /></td>
                  <td className="px-3">{r.created_by || "—"}</td>
                  <td className="px-3">
                    {r.jira_link ? (
                      <a href={r.jira_link} target="_blank" className="text-brand hover:underline inline-flex items-center gap-1">
                        {r.jira_id || "link"} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (r.jira_id || "—")}
                  </td>
                  <td className="px-3 text-right tabular-nums">{(r.summary?.totals?.requests ?? 0).toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{r.summary?.rps ? r.summary.rps.toFixed(1) : "—"}</td>
                  <td className="px-3 text-right tabular-nums">{lastBucket?.p95_ms?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 text-right tabular-nums text-bad">{(r.summary?.totals?.errors ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <a href={api.reportHTMLUrl(r.id)} target="_blank" rel="noopener" className="btn-ghost text-xs">
                        <Eye className="w-3.5 h-3.5" />View
                      </a>
                      <Link to={`/reports/${r.id}`} className="btn-ghost text-xs">
                        <FileText className="w-3.5 h-3.5" />Detail
                      </Link>
                      <a href={api.reportPDFUrl(r.id)} className="btn-secondary text-xs">
                        <Download className="w-3.5 h-3.5" />PDF
                      </a>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
            {runs.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-ink-muted">No reports yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
