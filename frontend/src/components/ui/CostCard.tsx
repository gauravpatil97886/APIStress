import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, AlertTriangle,
  Database, Zap, HardDrive, Inbox, Globe, Search, BarChart3,
  Lock, CreditCard, Mail, LineChart,
} from "lucide-react";

const CATEGORY_ICON: Record<string, any> = {
  database: Database,
  cache: Zap,
  storage: HardDrive,
  queue: Inbox,
  cdn: Globe,
  search: Search,
  auth: Lock,
  payments: CreditCard,
  email: Mail,
  analytics: LineChart,
  observability: BarChart3,
};
const CATEGORY_LABEL: Record<string, string> = {
  database: "Database",
  cache: "Cache",
  storage: "Storage",
  queue: "Queue / streaming",
  cdn: "CDN",
  search: "Search",
  auth: "Auth",
  payments: "Payments",
  email: "Email / SMS",
  analytics: "Analytics / DW",
  observability: "Observability",
};

type LineItem = { Label?: string; label?: string; USD?: number; usd?: number; Basis?: string; basis?: string };
type Stack = {
  Component?: string;     component?: string;
  Label?: string;         label?: string;
  Category?: string;      category?: string;
  Tier?: string;          tier?: string;
  TierLabel?: string;     tier_label?: string;
  Count?: number;         count?: number;
  MonthlyUSD?: number;    monthly_usd?: number;
};
type Estimate = {
  Computed?: boolean;       computed?: boolean;
  Items?: LineItem[];       items?: LineItem[];
  ResolvedStack?: Stack[];  resolved_stack?: Stack[];
  TotalLowUSD?: number;     total_low_usd?: number;
  TotalHighUSD?: number;    total_high_usd?: number;
  PerThousandUSD?: number;  per_1k_requests_usd?: number;
  Assumptions?: string[];   assumptions?: string[];
  Disclaimer?: string;      disclaimer?: string;
  Inputs?: any;             inputs?: any;
};

function pick<T = any>(o: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (o?.[k] !== undefined) return o[k];
  }
  return undefined;
}

function $(n?: number) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 100)  return `$${n.toFixed(0)}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function CostCard({ estimate }: { estimate?: Estimate }) {
  if (!estimate) return null;
  const computed = pick<boolean>(estimate, "Computed", "computed");
  if (!computed) return null;

  const items = (pick<LineItem[]>(estimate, "Items", "items") || []);
  const stack = (pick<Stack[]>(estimate, "ResolvedStack", "resolved_stack") || []);
  const low = pick<number>(estimate, "TotalLowUSD", "total_low_usd") ?? 0;
  const high = pick<number>(estimate, "TotalHighUSD", "total_high_usd") ?? 0;
  const per1k = pick<number>(estimate, "PerThousandUSD", "per_1k_requests_usd") ?? 0;
  const assumptions = pick<string[]>(estimate, "Assumptions", "assumptions") || [];
  const disclaimer = pick<string>(estimate, "Disclaimer", "disclaimer");
  const inputs = pick<any>(estimate, "Inputs", "inputs") || {};

  const tone = high >= 1000 ? "ring-bad/40 bg-bad/[.04]"
            : high >= 100  ? "ring-warn/40 bg-warn/[.04]"
            :                "ring-good/40 bg-good/[.04]";
  const valueColor = high >= 1000 ? "text-bad" : high >= 100 ? "text-warn" : "text-good";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`card p-6 ring-1 ${tone}`}
    >
      <header className="flex items-start gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-good to-emerald-700 grid place-items-center shrink-0">
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
            Estimated monthly cost
          </div>
          <div className={`text-3xl font-bold tabular-nums mt-1 ${valueColor}`}>
            {$(low)} <span className="text-ink-muted text-xl font-normal">–</span> {$(high)}
            <span className="text-sm text-ink-muted font-normal ml-2">/ month</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted flex items-center gap-2 flex-wrap">
            {inputs.cloud && (
              <span className="pill ring-1 ring-bg-border bg-bg-card uppercase tracking-wider font-bold text-[9px]">
                {inputs.cloud}
              </span>
            )}
            {inputs.region && <span className="font-mono">{inputs.region}</span>}
            {inputs.compute_model && <span>· {String(inputs.compute_model).replace("_", " ")}</span>}
            {inputs.compute_size && <span>· {inputs.compute_size}</span>}
            {inputs.discount && inputs.discount !== "on_demand" && (
              <span className="text-good font-mono">· {String(inputs.discount).replace("_", " ")}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
            Cost / 1K requests
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 flex items-center gap-1 justify-end">
            <TrendingUp className="w-4 h-4 text-ink-muted" />
            ${per1k.toFixed(per1k < 0.1 ? 4 : per1k < 1 ? 3 : 2)}
          </div>
        </div>
      </header>

      {/* Tagged tech stack (visible regardless of cost) */}
      {stack.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold mb-2">
            Tech stack tagged ({stack.length})
          </div>
          <StackByCategory stack={stack} />
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
            Cost breakdown
          </div>
          <div className="space-y-1.5">
            {items.map((it, i) => {
              const label = pick<string>(it, "Label", "label") || "";
              const usd = pick<number>(it, "USD", "usd") ?? 0;
              const basis = pick<string>(it, "Basis", "basis") || "";
              return (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-3 py-1.5 border-b border-bg-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{label}</div>
                    <div className="text-[11px] text-ink-muted truncate">{basis}</div>
                  </div>
                  <div className="text-sm tabular-nums font-mono font-semibold text-ink self-center">
                    {$(usd)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {assumptions.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink select-none">
            Assumptions ({assumptions.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-muted pl-4 list-disc">
            {assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </details>
      )}

      {disclaimer && (
        <div className="mt-4 flex items-start gap-2 text-[11px] text-ink-muted bg-bg-card rounded-lg px-3 py-2 border-l-2 border-warn">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warn" />
          <span>{disclaimer}</span>
        </div>
      )}
    </motion.section>
  );
}

// ── Tagged stack pills, grouped by category ──────────────────────────────
function StackByCategory({ stack }: { stack: Stack[] }) {
  const groups: Record<string, Stack[]> = {};
  stack.forEach((s) => {
    const cat = pick<string>(s, "Category", "category") || "other";
    (groups[cat] ||= []).push(s);
  });

  // Stable category ordering matching the picker UI
  const order = ["database", "cache", "storage", "queue", "cdn", "search", "auth", "payments", "email", "analytics", "observability"];
  const cats = Object.keys(groups).sort(
    (a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b))
  );

  return (
    <div className="space-y-3">
      {cats.map((cat) => {
        const items = groups[cat];
        const Icon = CATEGORY_ICON[cat] || Database;
        const subtotal = items.reduce(
          (acc, s) => acc + (pick<number>(s, "MonthlyUSD", "monthly_usd") || 0), 0
        );
        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-bg-card ring-1 ring-bg-border p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-muted font-bold">
                <Icon className="w-3 h-3" />
                {CATEGORY_LABEL[cat] || cat}
                <span className="text-ink-dim">· {items.length}</span>
              </div>
              <div className="text-xs font-mono font-bold text-good">
                ${subtotal.toFixed(0)}/mo
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s, i) => {
                const label = pick<string>(s, "Label", "label") || "";
                const tierLabel = pick<string>(s, "TierLabel", "tier_label") || "";
                const count = pick<number>(s, "Count", "count") || 1;
                const usd = pick<number>(s, "MonthlyUSD", "monthly_usd") || 0;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="pill ring-1 bg-bg-panel ring-bg-border text-xs px-3 py-1.5 flex flex-col items-start gap-0 max-w-full"
                    title={`${label} · ${tierLabel}${count > 1 ? ` × ${count}` : ""}`}
                  >
                    <div className="flex items-center gap-1.5 max-w-full">
                      <span className="font-bold text-ink truncate">{label}</span>
                      {count > 1 && (
                        <span className="text-[10px] text-brand font-mono">×{count}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-muted font-mono flex items-center gap-2">
                      <span className="truncate">{tierLabel}</span>
                      <span className="text-good shrink-0">${usd}/mo</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
