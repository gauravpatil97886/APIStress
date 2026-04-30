const TAG_STYLES: Record<string, string> = {
  Production: "bg-bad/15 text-bad ring-bad/30",
  Broking:    "bg-warn/15 text-warn ring-warn/30",
  UAT:        "bg-blue-500/15 text-blue-400 ring-blue-500/30",
};

export const ENV_TAGS = ["Production", "Broking", "UAT"] as const;
export type EnvTag = (typeof ENV_TAGS)[number] | "";

export const ENV_LABEL: Record<string, string> = {
  Production: "PRODUCTION",
  Broking:    "BROKING (PRE-PROD)",
  UAT:        "UAT",
};

export function EnvPill({ tag, size = "sm" }: { tag?: string; size?: "sm" | "md" }) {
  if (!tag) return null;
  const cls = TAG_STYLES[tag] || "bg-white/10 text-ink-muted ring-white/15";
  const px = size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`pill ring-1 ${cls} ${px} font-mono uppercase tracking-wider font-bold`}>
      {tag}
    </span>
  );
}
