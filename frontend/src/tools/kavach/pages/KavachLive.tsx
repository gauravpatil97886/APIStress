// KavachLive — SSE-driven live scan view.
// Streams findings as they're discovered with severity-coded animation.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Square, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../../platform/api/client";

type Finding = {
  id: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  test_id: string;
  title: string;
  plain_title?: string;
  effort?: string;
};

type Props = {
  scanID: string;
  onDone: () => void;
  onCancel: () => void;
};

const SEV_LABEL: Record<string, string> = {
  critical: "Fix this now",
  high:     "Fix this week",
  medium:   "Fix when you can",
  low:      "Nice to have",
  info:     "Heads-up",
};
const SEV_TONE: Record<string, string> = {
  critical: "bg-bad/15 text-bad ring-bad/40",
  high:     "bg-warn/15 text-warn ring-warn/40",
  medium:   "bg-amber-500/15 text-amber-400 ring-amber-500/40",
  low:      "bg-sky-500/15 text-sky-400 ring-sky-500/40",
  info:     "bg-bg-card ring-bg-border text-ink-muted",
};

export function KavachLive({ scanID, onDone, onCancel }: Props) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, pct: 0 });
  const [counts, setCounts] = useState<Record<string, number>>({
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  });
  // Streamed per-test results (newest first), so the operator sees every
  // check that runs, not just findings.
  const [testFeed, setTestFeed] = useState<Array<{ test_id: string; name: string; category: string; passed: boolean; finding_count: number }>>([]);
  const [passCount, setPassCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [status, setStatus] = useState<string>("running");
  const [stopping, setStopping] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(api.kavach.liveURL(scanID));
    esRef.current = es;
    const onSnapshot = (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); if (d.progress) setProgress({ done: d.progress.done, total: d.progress.total, pct: d.progress.pct }); } catch {}
    };
    const onProgress = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (d.progress) {
          setProgress({ done: d.progress.done, total: d.progress.total, pct: d.progress.pct });
          if (d.progress.counts) setCounts({ ...d.progress.counts });
        }
      } catch {}
    };
    const onFinding = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (d.finding) setFindings(fs => [d.finding, ...fs]);
      } catch {}
    };
    const onTest = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (!d.test) return;
        setTestFeed(t => [d.test, ...t].slice(0, 200));
        if (d.test.passed) setPassCount(c => c + 1);
        else setFailCount(c => c + 1);
      } catch {}
    };
    const onDoneEv = (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); setStatus(d.status || "completed"); } catch {}
      es.close();
      esRef.current = null;
      // Stay on the live view so the operator can scan the pass/fail strip
      // before clicking "View security report" — they explicitly asked for
      // this transition to be manual.
    };

    es.addEventListener("snapshot", onSnapshot as any);
    es.addEventListener("progress", onProgress as any);
    es.addEventListener("test",     onTest as any);
    es.addEventListener("finding",  onFinding as any);
    es.addEventListener("done",     onDoneEv as any);
    es.onerror = () => {
      // SSE will retry automatically; if we've already hit "done" the close
      // is expected and we ignore the error.
    };
    return () => { es.close(); esRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanID]);

  const totalFindings = findings.length;
  const headline = useMemo(() => {
    if (counts.critical > 0) return { tone: "bad", text: `${counts.critical} critical issue${counts.critical === 1 ? "" : "s"} found so far` };
    if (counts.high > 0)     return { tone: "warn", text: `${counts.high} high-priority issue${counts.high === 1 ? "" : "s"} found so far` };
    if (totalFindings > 0)   return { tone: "muted", text: `${totalFindings} finding${totalFindings === 1 ? "" : "s"} so far` };
    return { tone: "muted", text: "Looking for ways to break this API…" };
  }, [counts, totalFindings]);

  async function stopScan() {
    setStopping(true);
    try {
      await api.kavach.stopScan(scanID);
      toast("Stopping scan…", { icon: "🛑" });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't stop scan");
    } finally { setStopping(false); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      {/* Hero — pulsing shield + headline */}
      <div className="card p-6 ring-1 ring-cyan-500/30 bg-gradient-to-br from-teal-700/15 to-teal-700/10 text-center">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-700 shadow-2xl shadow-teal-900/50 ring-1 ring-cyan-400/40 mb-3"
        >
          <Shield className="w-8 h-8 text-white" />
        </motion.div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 font-mono mb-1.5">
          {status === "running" ? "Scanning" : status === "completed" ? "Complete" : status}
        </div>
        <h2 className={`text-xl sm:text-2xl font-bold mb-1.5
          ${headline.tone === "bad" ? "text-bad" : headline.tone === "warn" ? "text-warn" : "text-ink"}`}>
          {headline.text}
        </h2>
        <div className="text-[11px] text-ink-muted font-mono">
          {progress.done} / {progress.total || "?"} checks complete
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-bg-card rounded overflow-hidden ring-1 ring-bg-border">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-teal-500"
            animate={{ width: `${progress.pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Counts row */}
        <div className="mt-5 grid grid-cols-5 gap-2">
          {(["critical", "high", "medium", "low", "info"] as const).map((s) => (
            <div key={s} className={`rounded-lg p-2 ring-1 ${SEV_TONE[s]}`}>
              <div className="text-[10px] uppercase tracking-wider font-mono opacity-80">{SEV_LABEL[s]}</div>
              <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">
                <AnimatedCount value={counts[s] || 0} />
              </div>
            </div>
          ))}
        </div>

        {status === "running" && (
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={stopScan}
              disabled={stopping}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ring-1 ring-bad/40 bg-bad/[.06] text-bad hover:bg-bad/[.12] disabled:opacity-60"
            >
              {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              Stop scan
            </button>
            <button onClick={onCancel} className="btn-ghost text-xs">Hide</button>
          </div>
        )}
        {status !== "running" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex flex-col items-center gap-3"
          >
            <div className="inline-flex items-center gap-1.5 text-good text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" /> Scan finished — {totalFindings} finding{totalFindings === 1 ? "" : "s"}
            </div>
            <button
              onClick={onDone}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold
                         bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-teal-900/50
                         hover:from-cyan-400 hover:to-teal-400 transition ring-2 ring-cyan-400/50
                         animate-pulse"
            >
              <Shield className="w-4 h-4" /> View security report →
            </button>
          </motion.div>
        )}
      </div>

      {/* Tests run — pass/fail strip */}
      <div className="card p-4 ring-1 ring-bg-border">
        <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-3 flex items-center gap-2">
          <Loader2 className={`w-3 h-3 ${status === "running" ? "animate-spin text-cyan-300" : "text-ink-dim"}`} />
          Tests run · {testFeed.length} of {progress.total || "?"}
          <span className="ml-3 pill ring-1 text-[10px] bg-good/15 text-good ring-good/40 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {passCount} passed
          </span>
          <span className="pill ring-1 text-[10px] bg-bad/15 text-bad ring-bad/40 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {failCount} raised findings
          </span>
        </div>
        {testFeed.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-muted">
            Waiting for the first test to complete…
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {testFeed.map((t) => (
                <motion.li
                  key={t.test_id + ":" + (t.passed ? "p" : "f")}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-center gap-2 p-2 rounded ring-1 text-[11px]
                    ${t.passed
                      ? "ring-good/30 bg-good/[.04]"
                      : "ring-bad/30 bg-bad/[.05]"}`}
                >
                  {t.passed
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-good shrink-0" />
                    : <AlertCircle  className="w-3.5 h-3.5 text-bad shrink-0" />}
                  <span className="font-mono text-ink truncate flex-1" title={t.name}>
                    {t.test_id}
                  </span>
                  {!t.passed && (
                    <span className="pill ring-1 text-[9px] bg-bad/10 text-bad ring-bad/30 font-mono uppercase tracking-wider">
                      {t.finding_count} issue{t.finding_count === 1 ? "" : "s"}
                    </span>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Live finding stream */}
      <div className="card p-4 ring-1 ring-bg-border">
        <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-3 flex items-center gap-2">
          <Loader2 className={`w-3 h-3 ${status === "running" ? "animate-spin text-cyan-300" : "text-ink-dim"}`} />
          Live findings · newest first
        </div>
        {totalFindings === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            No findings yet. {status === "running" ? "Still looking…" : "Looks clean!"}
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            <AnimatePresence initial={false}>
              {findings.map((f) => (
                <motion.li
                  key={f.id}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg ring-1 ring-bg-border bg-bg-card/40"
                >
                  <span className={`pill ring-1 text-[10px] uppercase tracking-wider font-mono shrink-0 mt-0.5 ${SEV_TONE[f.severity]}`}>
                    {SEV_LABEL[f.severity]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-snug">
                      {f.plain_title || f.title}
                    </div>
                    <div className="text-[11px] text-ink-muted font-mono mt-0.5">
                      {f.test_id} · {f.category}
                      {f.effort && <span className="ml-2 text-cyan-300/80">{f.effort}</span>}
                    </div>
                  </div>
                  <AlertCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ y: -6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="inline-block"
    >
      {value}
    </motion.span>
  );
}
