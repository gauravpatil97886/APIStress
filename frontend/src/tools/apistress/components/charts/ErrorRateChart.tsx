import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function ErrorRateChart({ data }: { data: any[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Errors per second</h3>
        <span className="text-xs text-ink-muted">cumulative</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#252836" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#5b6076" tick={{ fontSize: 11 }} />
          <YAxis stroke="#5b6076" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="errors" fill="#ef4444" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
