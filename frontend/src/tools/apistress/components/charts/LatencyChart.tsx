import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export function LatencyChart({ data }: { data: any[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Latency over time</h3>
        <span className="text-xs text-ink-muted">milliseconds</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="p95g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF5A1F" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#FF5A1F" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="p50g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#252836" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#5b6076" tick={{ fontSize: 11 }} />
          <YAxis stroke="#5b6076" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          <Area type="monotone" dataKey="p50_ms" name="p50" stroke="#6366f1" fill="url(#p50g)" strokeWidth={2} />
          <Area type="monotone" dataKey="p95_ms" name="p95" stroke="#FF5A1F" fill="url(#p95g)" strokeWidth={2} />
          <Area type="monotone" dataKey="p99_ms" name="p99" stroke="#ef4444" fillOpacity={0} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12,
};
const legendStyle = { fontSize: 12 };
