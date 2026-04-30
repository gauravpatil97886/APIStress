import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function VuChart({ data }: { data: any[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Active VUs</h3>
        <span className="text-xs text-ink-muted">virtual users</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#252836" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#5b6076" tick={{ fontSize: 11 }} />
          <YAxis stroke="#5b6076" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12 }} />
          <Line type="stepAfter" dataKey="active_vus" stroke="#a855f7" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
