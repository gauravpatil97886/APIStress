import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

const COLORS = {
  "2xx Success": "#22c55e",
  "3xx Redirect": "#3b82f6",
  "4xx Client": "#f59e0b",
  "5xx Server": "#ef4444",
  "Network/Timeout": "#a855f7",
};

export function StatusDonut({ statuses }: { statuses?: Record<string, number> }) {
  if (!statuses) return null;
  const buckets: Record<string, number> = { "2xx Success": 0, "3xx Redirect": 0, "4xx Client": 0, "5xx Server": 0, "Network/Timeout": 0 };
  Object.entries(statuses).forEach(([codeStr, count]) => {
    const code = parseInt(codeStr);
    const c = Number(count);
    if (code === 0) buckets["Network/Timeout"] += c;
    else if (code < 300) buckets["2xx Success"] += c;
    else if (code < 400) buckets["3xx Redirect"] += c;
    else if (code < 500) buckets["4xx Client"] += c;
    else buckets["5xx Server"] += c;
  });
  const data = Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const total = data.reduce((acc, d) => acc + d.value, 0);

  if (total === 0) return null;
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Response breakdown</h3>
        <span className="text-xs text-ink-muted">{total.toLocaleString()} total</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%" cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            stroke="#161821"
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={COLORS[d.name as keyof typeof COLORS] || "#888"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#1c1f2b", border: "1px solid #252836", borderRadius: 8, fontSize: 12 }}
            formatter={(v: any, name: any) => [`${Number(v).toLocaleString()} (${((v / total) * 100).toFixed(1)}%)`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconSize={10}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
