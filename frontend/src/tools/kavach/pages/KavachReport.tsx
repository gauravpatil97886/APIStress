// KavachReport — final findings dashboard. Loads /api/kavach/scans/:id,
// shows hero header + verdict + severity rollup + tests-run progress +
// grouped findings + per-finding detail drawer.
//
// Visual polish modeled on ReportDetail.tsx (APIStress) — hero ribbon,
// KPI tiles, action buttons, animated cards. Cyan/teal accent (NOT violet).

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, RefreshCw, AlertCircle, ChevronRight, X, ChevronDown,
  CheckCircle2, Bug, Lock, ServerCrash, ArrowDownLeft, Sparkles,
  Download, ExternalLink, ShieldCheck, ShieldAlert, Activity,
  Hash, ScrollText, ListChecks, FileWarning,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../../platform/api/client";
import { KavachFileJiraButton } from "../components/KavachFileJiraButton";
import { KavachAttachJiraButton } from "../components/KavachAttachJiraButton";

type Finding = {
  id: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  test_id: string;
  title: string;
  description: string;
  plain_title?: string;
  plain_whats_happening?: string;
  plain_why?: string;
  plain_how_to_fix?: string[];
  effort?: string;
  request?: any;
  response?: any;
  evidence_text?: string;
  owasp?: string;
  cwe?: string;
  remediation?: string;
  test_explanation?: string;
  ts?: string;
};

type Scan = {
  id: string;
  target_url: string;
  target_host: string;
  status: string;
  started_at: string;
  finished_at?: string;
  summary?: any;
  created_by: string;
  jira_id?: string;
  findings: Finding[];
};

type Props = {
  scanID: string;
  onNewScan: () => void;
};

const SEV_LABEL: Record<string, string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
  info:     "Info",
};
const SEV_HINT: Record<string, string> = {
  critical: "Fix this now",
  high:     "Fix this week",
  medium:   "Fix when you can",
  low:      "Nice to have",
  info:     "Heads-up",
};
const SEV_TILE: Record<string, string> = {
  critical: "ring-bad/50 bg-bad/[.10] text-bad",
  high:     "ring-warn/50 bg-warn/[.10] text-warn",
  medium:   "ring-amber-500/50 bg-amber-500/[.10] text-amber-400",
  low:      "ring-sky-500/50 bg-sky-500/[.10] text-sky-400",
  info:     "ring-bg-border bg-bg-card text-ink-muted",
};
const SEV_CHIP: Record<string, string> = {
  critical: "bg-bad/15 text-bad ring-bad/40",
  high:     "bg-warn/15 text-warn ring-warn/40",
  medium:   "bg-amber-500/15 text-amber-400 ring-amber-500/40",
  low:      "bg-sky-500/15 text-sky-400 ring-sky-500/40",
  info:     "bg-bg-card ring-bg-border text-ink-muted",
};
const SEV_BAR: Record<string, string> = {
  critical: "bg-gradient-to-r from-bad to-rose-600",
  high:     "bg-gradient-to-r from-warn to-orange-600",
  medium:   "bg-gradient-to-r from-amber-500 to-amber-600",
  low:      "bg-gradient-to-r from-sky-500 to-sky-600",
  info:     "bg-gradient-to-r from-slate-500 to-slate-600",
};
const SEV_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];
const CAT_ICON: Record<string, any> = {
  transport: Lock,
  info_disclosure: ServerCrash,
  injection: Bug,
  method_tampering: ArrowDownLeft,
};

export function KavachReport({ scanID, onNewScan }: Props) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Finding | null>(null);
  const [openSev, setOpenSev] = useState<Record<string, boolean>>({
    critical: true, high: true, medium: true, low: true, info: false,
  });
  const [filed, setFiled] = useState<Record<number, { jiraID: string; jiraURL: string }>>({});

  async function load() {
    try {
      const s = await api.kavach.getScan(scanID);
      setScan(s);
      try {
        const links = await api.kavach.jiraLinks(scanID);
        const next: typeof filed = {};
        for (const l of links) {
          if (l.kind === "issue_created" && typeof l.finding_id === "number") {
            next[l.finding_id] = { jiraID: l.jira_id, jiraURL: l.jira_url };
          }
        }
        setFiled(next);
      } catch {/* not configured — fine */}
    } catch (e: any) {
      toast.error(e?.message || "Failed to load scan");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scanID]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    (scan?.findings || []).forEach(f => { c[f.severity] = (c[f.severity] || 0) + 1; });
    return c;
  }, [scan]);

  const grouped = useMemo(() => {
    const g: Record<string, Finding[]> = {};
    (scan?.findings || []).forEach(f => { (g[f.severity] = g[f.severity] || []).push(f); });
    return g;
  }, [scan]);

  // OWASP coverage chips: which OWASP API codes appeared in findings.
  const owaspHits = useMemo(() => {
    const seen = new Set<string>();
    (scan?.findings || []).forEach(f => { if (f.owasp) seen.add(f.owasp.split(":")[0].trim()); });
    return seen;
  }, [scan]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="h-32 bg-bg-card rounded-2xl" />
        <div className="grid grid-cols-5 gap-3">
          {[0,1,2,3,4].map(i => <div key={i} className="h-20 bg-bg-card rounded-2xl" />)}
        </div>
        <div className="h-24 bg-bg-card rounded-2xl" />
        <div className="h-64 bg-bg-card rounded-2xl" />
      </div>
    );
  }
  if (!scan) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-bad mb-3" />
        <div className="text-sm">Couldn't load this scan.</div>
      </div>
    );
  }

  const total = scan.findings.length;
  const verdict = total === 0
    ? { tone: "good" as const, headline: "Healthy — no issues detected",
        body: "Kavach ran the full check suite and found nothing concerning. A hands-on review by a human security engineer is still recommended for sensitive surfaces.",
        Icon: ShieldCheck }
    : counts.critical > 0
      ? { tone: "bad" as const, headline: `${counts.critical} critical issue${counts.critical === 1 ? "" : "s"} require immediate attention`,
          body: "Address the critical findings before the next deploy. They are exploitable and observable in this scan's evidence.",
          Icon: ShieldAlert }
      : counts.high > 0
        ? { tone: "warn" as const, headline: `${counts.high} high-priority issue${counts.high === 1 ? "" : "s"} found`,
            body: "No critical issues — but high-priority findings should be fixed this sprint.",
            Icon: AlertCircle }
        : { tone: "muted" as const, headline: "Strong posture — minor findings only",
            body: `${total} finding${total === 1 ? "" : "s"} — defence-in-depth improvements you can plan over the coming weeks.`,
            Icon: Shield };

  const dur = scan.finished_at
    ? `${Math.max(0, Math.round((+new Date(scan.finished_at) - +new Date(scan.started_at)) / 1000))}s`
    : "—";

  const summary = scan.summary || {};
  const testsRun = summary.tests_run ?? scan.findings.length;
  const testsPassed = summary.tests_passed ?? 0;
  const testsFailed = summary.tests_failed ?? scan.findings.length;
  const passPct = testsRun > 0 ? Math.round((testsPassed / testsRun) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ─── Hero header (gradient ribbon) ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-2xl ring-1 ring-cyan-500/30 bg-gradient-to-br from-cyan-700/30 via-teal-700/25 to-slate-950"
      >
        {/* Decorative orbs */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

        <div className="relative p-6 sm:p-7 flex items-start gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-700 grid place-items-center shrink-0 shadow-lg shadow-teal-900/40 ring-1 ring-cyan-300/40">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/90 font-mono font-bold">
                Kavach · Security Assessment
              </span>
              <span className={`pill ring-1 text-[10px] font-mono uppercase tracking-wider ${
                scan.status === "finished" ? "bg-good/15 text-good ring-good/40"
                : scan.status === "failed"  ? "bg-bad/15 text-bad ring-bad/40"
                : "bg-cyan-500/15 text-cyan-300 ring-cyan-500/40"}`}>
                {scan.status}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate text-white">
              {scan.target_host}
            </h1>
            <div className="text-[12px] text-cyan-100/70 font-mono break-all mt-1">
              {scan.target_url}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <Chip><Sparkles className="w-3 h-3" /> {scan.created_by || "—"}</Chip>
              <Chip><Hash className="w-3 h-3" /> {scan.id.slice(0, 8)}</Chip>
              <Chip><Activity className="w-3 h-3" /> {new Date(scan.started_at).toLocaleString()}</Chip>
              <Chip><RefreshCw className="w-3 h-3" /> {dur}</Chip>
              {scan.jira_id && <Chip className="bg-blue-500/15 text-blue-200 ring-blue-400/40"><ExternalLink className="w-3 h-3" /> {scan.jira_id}</Chip>}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <a
              href={api.kavach.pdfURL(scanID)}
              target="_blank" rel="noopener"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold ring-1 ring-cyan-300/60 text-white bg-gradient-to-br from-cyan-500 to-teal-700 hover:from-cyan-400 hover:to-teal-600 shadow-lg shadow-teal-900/40 transition"
              title="Download the security report as PDF"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </a>
            <KavachAttachJiraButton scanID={scanID} />
            <button onClick={onNewScan} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ring-1 ring-white/20 text-white bg-white/5 hover:bg-white/10 transition">
              <Sparkles className="w-3.5 h-3.5" /> New scan
            </button>
          </div>
        </div>
      </motion.div>

      {/* ─── Verdict callout ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}
        className={`card p-5 flex items-start gap-4 ring-1 ${
          verdict.tone === "bad"  ? "ring-bad/40 bg-bad/[.06]"
          : verdict.tone === "warn" ? "ring-warn/40 bg-warn/[.06]"
          : verdict.tone === "good" ? "ring-good/40 bg-good/[.05]"
          : "ring-cyan-500/30 bg-cyan-500/[.04]"}`}
      >
        <div className={`w-10 h-10 rounded-xl shrink-0 grid place-items-center ${
          verdict.tone === "bad"  ? "bg-bad/15 text-bad"
          : verdict.tone === "warn" ? "bg-warn/15 text-warn"
          : verdict.tone === "good" ? "bg-good/15 text-good"
          : "bg-cyan-500/15 text-cyan-300"}`}>
          <verdict.Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-dim font-mono">Verdict</div>
          <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{verdict.headline}</div>
          <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">{verdict.body}</p>
        </div>
      </motion.div>

      {/* ─── Severity rollup KPI strip ────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-5 gap-3"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        {SEV_ORDER.map(s => (
          <motion.div
            key={s}
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
            className={`card p-4 ring-1 ${SEV_TILE[s]} relative overflow-hidden`}
          >
            <div className="text-[10px] uppercase tracking-wider font-mono opacity-80">{SEV_LABEL[s]}</div>
            <div className="text-3xl font-bold tabular-nums leading-tight mt-1">{counts[s] || 0}</div>
            <div className="text-[10px] uppercase tracking-wider font-mono opacity-60 mt-1">{SEV_HINT[s]}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ─── Tests run rollup with stacked progress bar ───────────────── */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="card p-5 ring-1 ring-cyan-500/20 bg-gradient-to-br from-teal-950/30 to-transparent"
      >
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-bold text-ink">Tests run</h3>
          <span className="text-[11px] text-ink-muted">— full VAPT sweep coverage</span>
          <span className="ml-auto text-[11px] text-ink-muted font-mono">
            <span className="text-good font-bold">{passPct}%</span> passed
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <div className="text-2xl font-bold tabular-nums">{testsRun}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Total checks</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-good">{testsPassed}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-bad">{testsFailed}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Raised findings</div>
          </div>
        </div>

        {/* Stacked bar */}
        <div className="h-2.5 rounded-full bg-bg-card ring-1 ring-bg-border overflow-hidden flex">
          <div className="h-full bg-gradient-to-r from-good/80 to-good transition-all"
            style={{ width: `${testsRun > 0 ? (testsPassed / testsRun) * 100 : 0}%` }} />
          <div className="h-full bg-gradient-to-r from-bad/80 to-bad transition-all"
            style={{ width: `${testsRun > 0 ? (testsFailed / testsRun) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono uppercase tracking-wider text-ink-dim">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-good mr-1 align-middle" /> {testsPassed} passed</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-bad mr-1 align-middle" /> {testsFailed} failed</span>
        </div>
      </motion.div>

      {/* ─── OWASP API Top-10 strip ──────────────────────────────────── */}
      <div className="card p-4 ring-1 ring-bg-border">
        <div className="flex items-center gap-2 mb-2.5">
          <FileWarning className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-bold">OWASP API Security Top 10 (2023)</h3>
          <span className="text-[11px] text-ink-muted">— categories observed in this scan</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["API1","API2","API3","API4","API5","API6","API7","API8","API9","API10"].map(code => {
            const hit = owaspHits.has(`${code}:2023`) || owaspHits.has(code);
            return (
              <span
                key={code}
                className={`pill ring-1 text-[10px] font-mono ${
                  hit ? "bg-bad/15 text-bad ring-bad/40"
                      : "bg-bg-card text-ink-dim ring-bg-border"}`}
                title={hit ? `${code}:2023 — observed in this scan` : `${code}:2023 — not flagged`}
              >
                {code}{hit && " ●"}
              </span>
            );
          })}
        </div>
      </div>

      {/* ─── All-checks table (collapsible) ─────────────────────────── */}
      {Array.isArray(summary.test_results) && summary.test_results.length > 0 && (
        <details className="card p-0 ring-1 ring-bg-border overflow-hidden group">
          <summary className="px-4 py-3 cursor-pointer hover:bg-cyan-500/[.04] flex items-center gap-2 select-none">
            <ScrollText className="w-4 h-4 text-cyan-300" />
            <span className="text-sm font-bold">VAPT compliance — every check</span>
            <span className="text-[11px] text-ink-muted">({summary.test_results.length} tests)</span>
            <ChevronDown className="w-4 h-4 text-ink-muted ml-auto group-open:rotate-180 transition-transform" />
          </summary>
          <div className="border-t border-bg-border max-h-[42vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-card/40 text-[10px] uppercase tracking-wider text-ink-dim font-mono sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Result</th>
                  <th className="px-3 py-2 text-left">Test</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Findings</th>
                </tr>
              </thead>
              <tbody>
                {(summary.test_results as any[]).map((tr, i) => (
                  <tr key={tr.test_id} className={`border-t border-bg-border/60 ${i % 2 ? "bg-bg-card/20" : ""}`}>
                    <td className="px-3 py-1.5">
                      {tr.passed
                        ? <span className="pill ring-1 text-[10px] bg-good/10 text-good ring-good/30 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Passed</span>
                        : <span className="pill ring-1 text-[10px] bg-bad/10 text-bad ring-bad/30 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Failed</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{tr.test_id}</td>
                    <td className="px-3 py-1.5 text-ink-muted">{tr.category}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{tr.finding_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ─── Findings grouped by severity (collapsible) ──────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-bold text-ink">Findings</h2>
          <span className="text-[11px] text-ink-muted">— grouped by severity, click to expand</span>
        </div>

        <AnimatePresence initial={false}>
          {SEV_ORDER.map((s) => {
            const gs = grouped[s] || [];
            if (gs.length === 0) return null;
            const open = !!openSev[s];
            return (
              <motion.section
                key={s}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="card p-0 ring-1 ring-bg-border overflow-hidden"
              >
                <button
                  onClick={() => setOpenSev(p => ({ ...p, [s]: !p[s] }))}
                  className={`w-full px-4 py-3 border-b border-bg-border flex items-center gap-3 ${SEV_TILE[s]} hover:brightness-110 transition`}
                >
                  <span className={`w-1.5 h-6 rounded-full ${SEV_BAR[s]}`} />
                  <span className="text-sm font-bold">{SEV_LABEL[s]}</span>
                  <span className="text-[11px] font-mono opacity-80">{SEV_HINT[s]}</span>
                  <span className="ml-auto pill ring-1 text-[11px] bg-bg-card/40 ring-bg-border tabular-nums font-mono">
                    {gs.length} finding{gs.length === 1 ? "" : "s"}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="divide-y divide-bg-border/60 overflow-hidden"
                    >
                      {gs.map((f) => {
                        const Icon = CAT_ICON[f.category] || AlertCircle;
                        const filedRef = filed[f.id];
                        return (
                          <li key={f.id}>
                            <button
                              onClick={() => setPicked(f)}
                              className="w-full text-left px-4 py-3 hover:bg-cyan-500/[.04] transition flex items-start gap-3 group"
                            >
                              <div className={`w-8 h-8 rounded-lg shrink-0 grid place-items-center ring-1 ${SEV_CHIP[f.severity]}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold leading-snug flex items-center gap-2 flex-wrap">
                                  {f.plain_title || f.title}
                                  {filedRef && (
                                    <a
                                      href={filedRef.jiraURL}
                                      target="_blank" rel="noopener"
                                      onClick={(e) => e.stopPropagation()}
                                      className="pill ring-1 text-[10px] bg-good/15 text-good ring-good/40 inline-flex items-center gap-1 font-mono normal-case tracking-normal"
                                      title={`Filed as ${filedRef.jiraID}`}
                                    >
                                      <CheckCircle2 className="w-3 h-3" /> {filedRef.jiraID}
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                                <div className="text-[11px] text-ink-muted mt-0.5 font-mono flex flex-wrap items-center gap-x-2">
                                  <span>{f.test_id}</span>
                                  {f.owasp && <span className="text-cyan-300/80">· {f.owasp}</span>}
                                  {f.cwe && <span className="text-ink-dim">· {f.cwe}</span>}
                                  {f.effort && <span className="text-ink-dim">· effort: {f.effort}</span>}
                                </div>
                                {f.plain_whats_happening && (
                                  <div className="text-[12px] text-ink-muted mt-1.5 line-clamp-2 leading-relaxed">
                                    {f.plain_whats_happening}
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0 mt-2 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition" />
                            </button>
                          </li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </motion.section>
            );
          })}
        </AnimatePresence>

        {total === 0 && (
          <div className="card p-12 text-center ring-1 ring-good/30 bg-good/[.05]">
            <ShieldCheck className="w-12 h-12 mx-auto text-good mb-3" />
            <div className="text-base font-bold">No issues detected</div>
            <p className="text-[12px] text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
              Looking good — but a hands-on review by a human security engineer is still
              recommended for sensitive surfaces.
            </p>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {picked && (
        <FindingDrawer
          finding={picked}
          filed={filed[picked.id]}
          onClose={() => setPicked(null)}
          onFiled={(jiraID, jiraURL) => {
            setFiled((prev) => ({ ...prev, [picked.id]: { jiraID, jiraURL } }));
          }}
        />
      )}
    </div>
  );
}

function Chip({ children, className = "" }: { children: any; className?: string }) {
  return (
    <span className={`pill ring-1 text-[10px] inline-flex items-center gap-1 font-mono normal-case tracking-normal bg-white/10 ring-white/20 text-cyan-50 ${className}`}>
      {children}
    </span>
  );
}

function FindingDrawer({
  finding, filed, onClose, onFiled,
}: {
  finding: Finding;
  filed?: { jiraID: string; jiraURL: string };
  onClose: () => void;
  onFiled: (jiraID: string, jiraURL: string) => void;
}) {
  const [tab, setTab] = useState<"plain" | "tried" | "repro" | "tech">("plain");
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 600 }} animate={{ x: 0 }} exit={{ x: 600 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative w-full max-w-[640px] h-full overflow-y-auto bg-slate-950 ring-1 ring-cyan-500/30"
      >
        <div className="sticky top-0 z-10 bg-gradient-to-r from-cyan-700/30 via-teal-700/25 to-slate-950 border-b border-teal-900/50 px-5 py-3 flex items-start gap-2.5">
          <span className={`pill ring-1 text-[10px] uppercase tracking-wider font-mono mt-0.5 ${SEV_CHIP[finding.severity]}`}>
            {SEV_LABEL[finding.severity]} · {SEV_HINT[finding.severity]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight">
              {finding.plain_title || finding.title}
            </div>
            <div className="text-[10px] text-ink-dim font-mono mt-0.5">
              {finding.test_id} · {finding.owasp || "—"} · {finding.cwe || "—"}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-bg-border bg-slate-950/60 sticky top-[60px] z-10">
          <Tab on={tab === "plain"}  onClick={() => setTab("plain")}>Plain English</Tab>
          <Tab on={tab === "tried"}  onClick={() => setTab("tried")}>What we tried</Tab>
          <Tab on={tab === "repro"}  onClick={() => setTab("repro")}>Reproducer</Tab>
          <Tab on={tab === "tech"}   onClick={() => setTab("tech")}>Technical</Tab>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {tab === "plain" && (
            <>
              {finding.plain_whats_happening && <Block title="What's happening" body={finding.plain_whats_happening} />}
              {finding.plain_why && <Block title="Why it matters" body={finding.plain_why} />}
              {finding.plain_how_to_fix && finding.plain_how_to_fix.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1.5">How to fix it</div>
                  <ol className="list-decimal pl-5 space-y-1.5 text-ink leading-relaxed">
                    {finding.plain_how_to_fix.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>
              )}
              {finding.effort && (
                <div className="pill ring-1 text-[11px] bg-cyan-500/10 text-cyan-300 ring-cyan-500/30 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Estimated effort: {finding.effort}
                </div>
              )}
            </>
          )}
          {tab === "tried" && (
            <>
              <div className="rounded-xl ring-1 ring-cyan-500/30 bg-cyan-500/[.06] p-4">
                <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 font-mono mb-1.5">
                  What this test does
                </div>
                <p className="text-sm text-ink leading-relaxed">
                  {finding.test_explanation || "No registered explanation for this test ID. Reproducer tab shows the exact request/response."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg ring-1 ring-bg-border bg-bg-card/40 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Test ID</div>
                  <div className="font-mono text-cyan-300 mt-0.5 break-all">{finding.test_id}</div>
                </div>
                <div className="rounded-lg ring-1 ring-bg-border bg-bg-card/40 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Category</div>
                  <div className="text-ink mt-0.5">{finding.category}</div>
                </div>
                <div className="rounded-lg ring-1 ring-bg-border bg-bg-card/40 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">Severity</div>
                  <div className="text-ink mt-0.5">{SEV_LABEL[finding.severity]}</div>
                </div>
              </div>
              <div className="text-[11px] text-ink-muted leading-relaxed">
                Switch to <b>Reproducer</b> for the exact request that triggered this finding,
                or <b>Plain English</b> for the human-readable impact + fix.
              </div>
            </>
          )}
          {tab === "repro" && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Request</div>
                <pre className="bg-bg-card/60 p-3 rounded-lg ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-72 overflow-auto text-[11px] font-mono">
                  {JSON.stringify(finding.request, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Response</div>
                <pre className="bg-bg-card/60 p-3 rounded-lg ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-72 overflow-auto text-[11px] font-mono">
                  {JSON.stringify(finding.response, null, 2)}
                </pre>
              </div>
              {finding.evidence_text && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Evidence</div>
                  <pre className="bg-bg-card/60 p-3 rounded-lg ring-1 ring-bg-border whitespace-pre-wrap break-all text-[11px] font-mono">
                    {finding.evidence_text}
                  </pre>
                </div>
              )}
            </>
          )}
          {tab === "tech" && (
            <>
              {finding.description && <Block title="Technical description" body={finding.description} />}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg ring-1 ring-bg-border p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">OWASP</div>
                  <div className="font-mono mt-0.5 text-cyan-300">{finding.owasp || "—"}</div>
                </div>
                <div className="rounded-lg ring-1 ring-bg-border p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">CWE</div>
                  <div className="font-mono mt-0.5 text-cyan-300">{finding.cwe || "—"}</div>
                </div>
              </div>
              {finding.remediation && <Block title="Remediation" body={finding.remediation} />}
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 bg-slate-950/95 backdrop-blur border-t border-teal-900/40 px-5 py-3 flex items-center gap-3">
          {filed ? (
            <a
              href={filed.jiraURL}
              target="_blank" rel="noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ring-1 ring-good/40 bg-good/[.08] text-good hover:bg-good/[.16] transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Filed as {filed.jiraID}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <KavachFileJiraButton
              findingID={finding.id}
              severity={finding.severity}
              testID={finding.test_id}
              cwe={finding.cwe}
              owasp={finding.owasp}
              defaultTitle={finding.plain_title || finding.title}
              onFiled={onFiled}
            />
          )}
          <span className="text-[11px] text-ink-muted ml-auto">
            Files a Jira ticket with severity-mapped priority + evidence.
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2
        ${on ? "border-cyan-400 text-cyan-200" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1.5">{title}</div>
      <div className="text-ink leading-relaxed">{body}</div>
    </div>
  );
}
