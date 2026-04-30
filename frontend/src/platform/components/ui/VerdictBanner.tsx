import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";

type Verdict = { Severity?: string; severity?: string; Headline?: string; headline?: string; Summary?: string; summary?: string };

export function VerdictBanner({ v }: { v?: Verdict | null }) {
  if (!v) return null;
  const sev = (v.Severity || v.severity || "warn").toLowerCase();
  const headline = v.Headline || v.headline || "";
  const summary = v.Summary || v.summary || "";

  const tone = {
    good:     { ring: "ring-good/40",  bg: "bg-good/[.06]",  text: "text-good",  Icon: CheckCircle2 },
    warn:     { ring: "ring-warn/40",  bg: "bg-warn/[.06]",  text: "text-warn",  Icon: AlertTriangle },
    bad:      { ring: "ring-bad/40",   bg: "bg-bad/[.06]",   text: "text-bad",   Icon: AlertOctagon },
    critical: { ring: "ring-bad/60",   bg: "bg-bad/[.10]",   text: "text-bad",   Icon: AlertOctagon },
    info:     { ring: "ring-bg-border", bg: "",              text: "text-ink",   Icon: AlertTriangle },
  }[sev] || { ring: "ring-bg-border", bg: "", text: "text-ink", Icon: AlertTriangle };

  const Icon = tone.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`card p-5 ring-1 ${tone.ring} ${tone.bg}`}
    >
      <div className="flex items-start gap-4">
        <div className={`shrink-0 mt-0.5 ${tone.text}`}>
          <Icon className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-ink">{headline}</h2>
          <p className="mt-1 text-sm text-ink-muted leading-relaxed">{summary}</p>
        </div>
      </div>
    </motion.div>
  );
}
