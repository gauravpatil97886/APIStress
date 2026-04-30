import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, DollarSign, Info, Plus, X, Server, Database, Zap,
  HardDrive, Inbox, Globe, Search, BarChart3,
} from "lucide-react";
import { api } from "../../../../platform/api/client";

export type StackEntry = { component: string; tier: string; count: number };
export type CostInputs = {
  cloud?: string;
  region?: string;
  compute_model?: string;
  compute_size?: string;
  instance_count?: number;
  memory_mb?: number;
  discount?: string;
  stack?: StackEntry[];
};

const COMPUTE_MODELS_BY_CLOUD: Record<string, { id: string; label: string; kind: "instance" | "serverless" }[]> = {
  aws: [
    { id: "ec2",     label: "EC2 (always-on VM)",   kind: "instance" },
    { id: "fargate", label: "Fargate (containers)", kind: "instance" },
    { id: "lambda",  label: "Lambda (serverless)",  kind: "serverless" },
  ],
  gcp: [
    { id: "gce",       label: "Compute Engine (VM)",    kind: "instance" },
    { id: "cloud_run", label: "Cloud Run (serverless)", kind: "serverless" },
    { id: "functions", label: "Cloud Functions",        kind: "serverless" },
  ],
  azure: [
    { id: "vm",          label: "Virtual Machine",        kind: "instance" },
    { id: "app_service", label: "App Service (PaaS)",     kind: "instance" },
    { id: "functions",   label: "Functions (Consumption)",kind: "serverless" },
  ],
  onprem: [{ id: "onprem", label: "Self-hosted", kind: "instance" }],
};

const CATEGORY_ICON: Record<string, any> = {
  database: Database,
  cache: Zap,
  storage: HardDrive,
  queue: Inbox,
  cdn: Globe,
  search: Search,
  observability: BarChart3,
};

export function CostInputsPanel({
  value, onChange,
}: { value: CostInputs; onChange: (v: CostInputs) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cloud" | "stack">("cloud");
  const [pricing, setPricing] = useState<any>(null);

  useEffect(() => {
    if (open && !pricing) {
      api.costPricing().then(setPricing).catch(() => {});
    }
  }, [open, pricing]);

  const clouds = pricing?.clouds || {};
  const stackCatalogue: any[] = pricing?.stack || [];
  const categories: { id: string; label: string; emoji: string }[] = pricing?.categories || [];

  const stack = value.stack || [];
  const cloudComponents = value.cloud ? clouds[value.cloud] : null;
  const computeModels = value.cloud ? COMPUTE_MODELS_BY_CLOUD[value.cloud] || [] : [];
  const selectedModel = computeModels.find((m) => m.id === value.compute_model);
  const sizes: any[] = cloudComponents && value.compute_model
    ? cloudComponents.instances?.[value.compute_model] || [] : [];

  function set<K extends keyof CostInputs>(k: K, v: CostInputs[K]) {
    onChange({ ...value, [k]: v });
  }
  function addComponent(c: any) {
    const tier = c.default_tier || c.tiers[0]?.id;
    onChange({ ...value, stack: [...stack, { component: c.id, tier, count: 1 }] });
  }
  function updateEntry(idx: number, patch: Partial<StackEntry>) {
    const next = stack.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...value, stack: next });
  }
  function removeEntry(idx: number) {
    const next = stack.slice();
    next.splice(idx, 1);
    onChange({ ...value, stack: next });
  }

  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    stackCatalogue.forEach((c) => { (m[c.category] ||= []).push(c); });
    return m;
  }, [stackCatalogue]);

  // helper: render an "Already added" pill for components present in stack
  const inStack = (id: string) => stack.findIndex((s) => s.component === id);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[.02] transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-good to-emerald-700 grid place-items-center">
            <DollarSign className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold">Cost estimate
              <span className="text-ink-muted font-normal"> (optional)</span>
            </h2>
            <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
              Tag your stack — DB, cache, storage. We'll project a monthly cost.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(value.cloud || stack.length > 0) && (
            <span className="pill ring-1 bg-good/15 text-good ring-good/30 text-[10px] font-mono">
              {(value.cloud ? 1 : 0) + stack.length} configured
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-ink-muted transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-bg-border"
          >
            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 border-b border-bg-border">
              {[
                { id: "cloud", label: "Compute", Icon: Server },
                { id: "stack", label: "Stack", Icon: Database, count: stack.length },
              ].map(({ id, label, Icon, count }: any) => (
                <button
                  key={id}
                  onClick={() => setTab(id as any)}
                  className={`px-3 py-2 -mb-px text-xs font-semibold flex items-center gap-1.5 transition border-b-2
                    ${tab === id
                      ? "border-brand text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {count > 0 && (
                    <span className="bg-brand text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {tab === "cloud" && (
                <CloudTab
                  value={value} onChange={onChange}
                  set={set} cloudData={cloudComponents}
                  computeModels={computeModels}
                  selectedModel={selectedModel} sizes={sizes}
                />
              )}

              {tab === "stack" && (
                <StackTab
                  stack={stack}
                  catalogue={stackCatalogue}
                  categories={categories}
                  grouped={grouped}
                  onAdd={addComponent}
                  onUpdate={updateEntry}
                  onRemove={removeEntry}
                  inStack={inStack}
                />
              )}

              <div className="flex items-start gap-2 text-[11px] text-ink-muted bg-bg-card rounded-lg px-3 py-2 border-l-2 border-good">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-good" />
                <span>
                  Order-of-magnitude only. Stack components use flat monthly tiers; per-query / per-op pricing
                  isn't modelled. Free tiers and volume discounts not applied.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Cloud sub-tab ────────────────────────────────────────────────────────
function CloudTab({ value, onChange, set, cloudData, computeModels, selectedModel, sizes }: any) {
  return (
    <>
      <div>
        <label className="label">Cloud provider</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: "aws",    label: "AWS" },
            { id: "gcp",    label: "Google" },
            { id: "azure",  label: "Azure" },
            { id: "onprem", label: "On-prem" },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ ...value, cloud: c.id, compute_model: undefined, compute_size: undefined })}
              className={`p-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition
                ${value.cloud === c.id
                  ? "bg-brand/15 border-brand text-brand ring-2 ring-brand/30"
                  : "bg-bg-card border-bg-border text-ink-muted hover:border-brand/40"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {value.cloud && value.cloud !== "onprem" && (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Region</label>
              <select className="input w-full text-sm"
                value={value.region || ""}
                onChange={(e) => set("region", e.target.value)}>
                <option value="">Pick a region…</option>
                {cloudData?.regions?.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Pricing</label>
              <select className="input w-full text-sm"
                value={value.discount || "on_demand"}
                onChange={(e) => set("discount", e.target.value)}>
                <option value="on_demand">On-demand</option>
                <option value="reserved_1y">1-year reserved (-35%)</option>
                <option value="reserved_3y">3-year reserved (-55%)</option>
                <option value="spot">Spot (-70%)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Compute model</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {computeModels.map((m: any) => (
                <button key={m.id} type="button"
                  onClick={() => onChange({ ...value, compute_model: m.id, compute_size: "" })}
                  className={`p-2 rounded-lg border text-left transition
                    ${value.compute_model === m.id
                      ? "bg-brand/10 border-brand ring-1 ring-brand/40"
                      : "bg-bg-card border-bg-border hover:border-brand/40"}`}>
                  <div className="font-bold uppercase tracking-wider text-ink text-[10px]">{m.id.replace("_", " ")}</div>
                  <div className="text-[10px] text-ink-muted mt-0.5">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedModel?.kind === "instance" && sizes.length > 0 && (
            <div className="grid sm:grid-cols-[2fr_1fr] gap-2">
              <div>
                <label className="label">Instance size</label>
                <select className="input w-full text-sm"
                  value={value.compute_size || ""}
                  onChange={(e) => set("compute_size", e.target.value)}>
                  <option value="">Pick…</option>
                  {sizes.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.label} — ${s.per_hour_usd.toFixed(4)}/hr</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Count</label>
                <input type="number" min={1} className="input w-full text-sm"
                  value={value.instance_count ?? 1}
                  onChange={(e) => set("instance_count", Math.max(1, +e.target.value))} />
              </div>
            </div>
          )}

          {selectedModel?.kind === "serverless" && (
            <div>
              <label className="label">Function memory</label>
              <select className="input w-full text-sm"
                value={value.memory_mb ?? 512}
                onChange={(e) => set("memory_mb", +e.target.value)}>
                {[128, 256, 512, 1024, 2048, 4096].map((m) => <option key={m} value={m}>{m} MB</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Stack sub-tab ─────────────────────────────────────────────────────────
function StackTab({ stack, catalogue, categories, grouped, onAdd, onUpdate, onRemove, inStack }: any) {
  return (
    <>
      {/* Selected components — stacked layout that survives narrow columns */}
      {stack.length > 0 && (
        <div>
          <label className="label">Selected components ({stack.length})</label>
          <div className="space-y-2">
            {stack.map((entry: StackEntry, i: number) => {
              const c = catalogue.find((x: any) => x.id === entry.component);
              if (!c) return null;
              const Icon = CATEGORY_ICON[c.category] || Database;
              const tier = c.tiers.find((t: any) => t.id === entry.tier);
              const monthly = tier ? tier.monthly_usd * entry.count : 0;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  className="p-2.5 rounded-lg bg-bg-card ring-1 ring-bg-border space-y-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-brand/15 text-brand grid place-items-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{c.label}</div>
                      <div className="text-[10px] text-ink-muted uppercase tracking-wider">{c.category}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-good shrink-0 tabular-nums">
                      ${monthly}/mo
                    </div>
                    <button
                      onClick={() => onRemove(i)}
                      className="text-ink-muted hover:text-bad p-1 shrink-0"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <select
                      className="input text-xs py-1 px-2 flex-1 min-w-0"
                      value={entry.tier}
                      onChange={(e) => onUpdate(i, { tier: e.target.value })}
                    >
                      {c.tiers.map((t: any) => (
                        <option key={t.id} value={t.id}>${t.monthly_usd}/mo · {t.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-ink-muted">×</span>
                      <input
                        type="number" min={1}
                        className="input text-xs py-1 px-1 w-12 text-center"
                        value={entry.count}
                        onChange={(e) => onUpdate(i, { count: Math.max(1, +e.target.value) })}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catalog grouped by category */}
      <div>
        <label className="label">Add to your stack</label>
        <div className="space-y-3">
          {categories.map((cat: any) => {
            const items = grouped[cat.id] || [];
            if (items.length === 0) return null;
            const Icon = CATEGORY_ICON[cat.id] || Database;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold mb-1.5">
                  <Icon className="w-3 h-3" />{cat.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {items.map((c: any) => {
                    const idx = inStack(c.id);
                    const isAdded = idx >= 0;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => isAdded ? null : onAdd(c)}
                        disabled={isAdded}
                        title={c.label}
                        className={`flex items-center gap-1.5 ring-1 rounded-full text-xs px-2.5 py-1 transition min-w-0
                          ${isAdded
                            ? "bg-good/15 text-good ring-good/30 cursor-default"
                            : "bg-bg-card ring-bg-border hover:ring-brand/40 hover:text-brand"}`}
                      >
                        <span className="shrink-0">
                          {isAdded ? "✓" : <Plus className="w-3 h-3" />}
                        </span>
                        <span className="truncate">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
