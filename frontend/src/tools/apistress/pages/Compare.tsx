import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, GitCompare, TrendingDown, TrendingUp, Minus,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { api } from "../../../platform/api/client";
import { RunStatusBadge } from "../../../platform/components/ui/RunStatusBadge";
import { EnvPill } from "../../../platform/components/layout/EnvPill";
import { VerdictBanner } from "../../../platform/components/ui/VerdictBanner";

type Delta = {
  metric: string;
  a: number;
  b: number;
  abs_delta: number;
  pct_delta: number;
  direction: "better" | "worse" | "same";
  unit: string;
};

export default function Compare() {
  const [params] = useSearchParams();
  const a = params.get("a") || "";
  const b = params.get("b") || "";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!a || !b) { setErr("Provide ?a= and ?b= run IDs"); return; }
    setErr(""); setData(null);
    api.compare(a, b).then(setData).catch((e) => setErr(e.message));
  }, [a, b]);

  const overlaySeries = useMemo(() => {
    if (!data) return [];
    const sa = data.a.series || [];
    const sb = data.b.series || [];
    const max = Math.max(sa.length, sb.length);
    const out: any[] = [];
    for (let i = 0; i < max; i++) {
      out.push({
        t: i + 1,
        a_p95: sa[i]?.p95_ms ?? null,
        b_p95: sb[i]?.p95_ms ?? null,
        a_p99: sa[i]?.p99_ms ?? null,
        b_p99: sb[i]?.p99_ms ?? null,
        a_rps: sa[i]?.requests ?? null,
        b_rps: sb[i]?.requests ?? null,
      });
    }
    return out;
  }, [data]);

  if (err) {
    return (
      <div className="card p-6 ring-1 ring-bad/30">
        <div className="text-bad font-semibold mb-1">Couldn't compare runs</div>
        <div className="text-sm text-ink-muted">{err}</div>
        <Link to="/history" className="btn-ghost text-xs mt-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to history
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-bg-card rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 bg-bg-card rounded-2xl" />
          <div className="h-72 bg-bg-card rounded-2xl" />
        </div>
      </div>
    );
  }

  const A = data.a;
  const B = data.b;
  const deltas: Delta[] = data.deltas;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/history" className="text-xs text-ink-muted hover:text-brand inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> Back to history
        </Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <GitCompare className="w-7 h-7 text-brand" /> Run comparison
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          Side-by-side diff of two test runs. Green = improvement, red = regression.
        </p>
      </header>

      {/* Two-side header */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SideCard side="A" run={A} />
        <SideCard side="B" run={B} />
      </div>

      {/* Verdict comparison */}
      <div className="grid lg:grid-cols-2 gap-4">
        <VerdictBanner v={A.verdict} />
        <VerdictBanner v={B.verdict} />
      </div>

      {/* Deltas table */}
      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-bg-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Metric deltas</h3>
          <div className="text-xs text-ink-muted flex items-center gap-3">
            <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-good" /> better</span>
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-bad" /> worse</span>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted bg-white/[.02]">
            <tr>
              <th className="text-left px-5 py-2.5">Metric</th>
              <th className="text-right px-3 py-2.5">A (left)</th>
              <th className="text-right px-3 py-2.5">B (right)</th>
              <th className="text-right px-3 py-2.5">Δ</th>
              <th className="text-right px-5 py-2.5">% change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {deltas.map((d, i) => (
              <motion.tr
                key={d.metric}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="hover:bg-white/[.02]"
              >
                <td className="px-5 py-2 font-medium">{d.metric}</td>
                <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(d.a, d.unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(d.b, d.unit)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-mono font-semibold ${tone(d.direction)}`}>
                  {d.abs_delta > 0 ? "+" : ""}{fmt(d.abs_delta, d.unit)}
                </td>
                <td className="px-5 py-2 text-right">
                  <span className={`pill ring-1 ${pillTone(d.direction)} font-mono`}>
                    {Icon(d.direction)}
                    {d.pct_delta > 0 ? "+" : ""}{d.pct_delta.toFixed(1)}%
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Overlay charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <OverlayChart
          title="p95 latency over time"
          unit="ms"
          data={overlaySeries}
          aKey="a_p95" bKey="b_p95"
          aColor="#3b82f6" bColor="#FF5A1F"
          aLabel={shortName(A.name, "A")} bLabel={shortName(B.name, "B")}
        />
        <OverlayChart
          title="Throughput over time"
          unit="req/s"
          data={overlaySeries}
          aKey="a_rps" bKey="b_rps"
          aColor="#3b82f6" bColor="#22c55e"
          aLabel={shortName(A.name, "A")} bLabel={shortName(B.name, "B")}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <OverlayChart
          title="p99 latency over time"
          unit="ms"
          data={overlaySeries}
          aKey="a_p99" bKey="b_p99"
          aColor="#3b82f6" bColor="#ef4444"
          aLabel={shortName(A.name, "A")} bLabel={shortName(B.name, "B")}
        />
        <SummaryCard A={A} B={B} deltas={deltas} />
      </div>
    </div>
  );
}

function SideCard({ side, run }: { side: "A" | "B"; run: any }) {
  return (
    <div className="card p-5 ring-1 ring-bg-border">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand grid place-items-center font-bold">
          {side}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/reports/${run.id}`} className="font-bold truncate hover:text-brand block">
            {run.name || "Untitled"}
          </Link>
          <div className="text-xs text-ink-muted truncate">
            by <b className="text-ink">{run.created_by || "—"}</b>
            {run.jira_id && (<> · {run.jira_link
              ? <a href={run.jira_link} target="_blank" rel="noopener" className="text-brand hover:underline inline-flex items-center gap-1">{run.jira_id}<ExternalLink className="w-3 h-3" /></a>
              : <span className="text-brand">{run.jira_id}</span>}</>)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RunStatusBadge status={run.status} />
          {run.env_tag && <EnvPill tag={run.env_tag} />}
        </div>
      </div>
    </div>
  );
}

function OverlayChart({
  title, unit, data, aKey, bKey, aColor, bColor, aLabel, bLabel,
}: any) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-ink-muted">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#252836" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#5b6076" tick={{ fontSize: 11 }} />
          <YAxis stroke="#5b6076" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey={aKey} name={aLabel} stroke={aColor} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey={bKey} name={bLabel} stroke={bColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryCard({ A, B, deltas }: { A: any; B: any; deltas: Delta[] }) {
  const better = deltas.filter((d) => d.direction === "better").length;
  const worse = deltas.filter((d) => d.direction === "worse").length;
  const same = deltas.filter((d) => d.direction === "same").length;
  const headline =
    worse > better ? "Run B is worse than Run A — regression detected" :
    better > worse ? "Run B is better than Run A — improvement!" :
                     "Run A and Run B perform similarly";
  const tone =
    worse > better ? "ring-bad/30 bg-bad/[.06]"
  : better > worse ? "ring-good/30 bg-good/[.06]"
  :                  "ring-bg-border";
  return (
    <div className={`card p-5 ring-1 ${tone}`}>
      <h3 className="text-sm font-semibold mb-2">Summary</h3>
      <p className="text-base font-bold mb-3">{headline}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-bold text-good">{better}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">improved</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-bad">{worse}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">regressed</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-ink-muted">{same}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">unchanged</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 text-xs">
        <Link to={`/reports/${A.id}`} className="btn-ghost flex-1 justify-center">
          <ArrowLeft className="w-3 h-3" /> Open A
        </Link>
        <Link to={`/reports/${B.id}`} className="btn-ghost flex-1 justify-center">
          Open B <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function fmt(n: number, unit: string) {
  if (!isFinite(n)) return "—";
  if (unit === "%") return `${n.toFixed(2)}%`;
  if (unit === "ms") return `${n.toFixed(0)} ms`;
  if (unit === "rps") return `${n.toFixed(1)} rps`;
  return `${Math.round(n).toLocaleString()}`;
}
function tone(d: string) {
  return d === "better" ? "text-good" : d === "worse" ? "text-bad" : "text-ink-muted";
}
function pillTone(d: string) {
  return d === "better" ? "bg-good/15 text-good ring-good/30"
       : d === "worse"  ? "bg-bad/15 text-bad ring-bad/30"
       :                  "bg-white/10 text-ink-muted ring-white/15";
}
function Icon(d: string) {
  if (d === "better") return <TrendingDown className="w-3 h-3 inline mr-1" />;
  if (d === "worse")  return <TrendingUp className="w-3 h-3 inline mr-1" />;
  return <Minus className="w-3 h-3 inline mr-1" />;
}
function shortName(name: string, fallback: string) {
  if (!name) return fallback;
  return name.length > 20 ? name.slice(0, 18) + "…" : name;
}
