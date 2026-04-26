import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const toneRing: Record<Tone, string> = {
  neutral: "ring-bg-border",
  good: "ring-good/40",
  warn: "ring-warn/40",
  bad: "ring-bad/40",
  brand: "ring-brand/40",
};
const toneText: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  brand: "text-brand",
};
const toneGlow: Record<Tone, string> = {
  neutral: "",
  good:  "before:bg-good/[.04]",
  warn:  "before:bg-warn/[.04]",
  bad:   "before:bg-bad/[.06]",
  brand: "before:bg-brand/[.05]",
};

/**
 * AnimatedNumber — counts smoothly from 0 (or previous value) to the target.
 * Pure number values get this; non-numeric values render as-is.
 */
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (format ? format(v) : Math.round(v).toLocaleString()));
  const [text, setText] = useState("0");

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = display.on("change", (v) => setText(v));
    return () => { controls.stop(); unsub(); };
  }, [value]);

  return <span>{text}</span>;
}

export function MetricCard({
  label, value, hint, icon, tone = "neutral", animateNumber = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  animateNumber?: boolean;
}) {
  // Detect if `value` is numeric / "<number><suffix>" so we can animate it.
  const numericMatch =
    animateNumber && typeof value === "string"
      ? value.match(/^([\d,.]+)(.*)$/)
      : null;
  const numericValue =
    animateNumber && typeof value === "number"
      ? value
      : numericMatch
      ? parseFloat(numericMatch[1].replace(/,/g, ""))
      : null;
  const suffix = numericMatch ? numericMatch[2] : "";
  const decimals = numericMatch ? (numericMatch[1].split(".")[1]?.length ?? 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`card p-4 ring-1 ${toneRing[tone]} relative overflow-hidden
                  before:content-[''] before:absolute before:inset-0 before:rounded-2xl ${toneGlow[tone]} before:pointer-events-none
                  hover:shadow-xl hover:shadow-black/30 transition-shadow`}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold truncate">
            {label}
          </div>
          <div className={`mt-2 text-2xl font-bold tabular-nums ${toneText[tone]}`}>
            {numericValue != null && !isNaN(numericValue) ? (
              <>
                <AnimatedNumber
                  value={numericValue}
                  format={
                    decimals > 0
                      ? (n) => n.toFixed(decimals)
                      : (n) => Math.round(n).toLocaleString()
                  }
                />
                {suffix}
              </>
            ) : (
              value
            )}
          </div>
          {hint && <div className="mt-1 text-xs text-ink-muted truncate">{hint}</div>}
        </div>
        {icon && (
          <motion.div
            className={`opacity-70 ${toneText[tone]} shrink-0`}
            whileHover={{ rotate: -10, scale: 1.1 }}
          >
            {icon}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
