export function LiveIndicator({ on = true, label = "LIVE" }: { on?: boolean; label?: string }) {
  return (
    <span className={`pill ring-1 ${on ? "bg-bad/15 text-bad ring-bad/30" : "bg-white/10 text-ink-muted ring-white/15"}`}>
      <span className={`w-2 h-2 rounded-full ${on ? "bg-bad animate-ping" : "bg-ink-muted"} `} />
      <span className="font-mono">{label}</span>
    </span>
  );
}
