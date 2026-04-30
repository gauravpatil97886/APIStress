import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export function RpsChart({ data }: { data: any[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Throughput</h3>
        <span className="text-xs text-ink-muted">requests / sec</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="rpsg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#252836" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#5b6076" tick={{ fontSize: 11 }} />
          <YAxis stroke="#5b6076" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="requests" name="rps" stroke="#22c55e" fill="url(#rpsg)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
