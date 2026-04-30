const map: Record<string, string> = {
  running:   "bg-brand/15 text-brand ring-brand/30 animate-pulse-soft",
  finished:  "bg-good/15 text-good ring-good/30",
  failed:    "bg-bad/15 text-bad ring-bad/30",
  cancelled: "bg-warn/15 text-warn ring-warn/30",
  pending:   "bg-white/10 text-ink-muted ring-white/15",
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = (status || "pending").toLowerCase();
  const cls = map[s] || map.pending;
  return (
    <span className={`pill ring-1 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s}
    </span>
  );
}
