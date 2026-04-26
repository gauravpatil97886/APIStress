import { motion } from "framer-motion";
import { Clock, CheckCircle2 } from "lucide-react";

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function pad(n: number) { return n.toString().padStart(2, "0"); }

export function RunCountdown({
  elapsedSec,
  totalSec,
  done,
}: {
  elapsedSec: number;
  totalSec: number;
  done: boolean;
}) {
  const total = Math.max(totalSec, 1);
  const elapsed = Math.max(0, Math.min(elapsedSec, total));
  const remaining = Math.max(0, total - elapsed);
  const progress = (elapsed / total) * 100;

  const tone = done ? "good" : remaining < 5 ? "warn" : "brand";
  const ring = done ? "ring-good/30" : remaining < 5 ? "ring-warn/30" : "ring-brand/30";
  const text = done ? "text-good" : remaining < 5 ? "text-warn" : "text-brand";
  const Icon = done ? CheckCircle2 : Clock;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`card p-4 ring-1 ${ring} relative overflow-hidden`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.div
            animate={done ? { scale: [1, 1.15, 1] } : { rotate: [0, 0] }}
            transition={done ? { duration: 0.6 } : { duration: 60, repeat: Infinity, ease: "linear" }}
            className={`${text}`}
          >
            <Icon className="w-6 h-6" />
          </motion.div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold">
              {done ? "Completed in" : "Time remaining"}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${text} font-mono`}>
              <motion.span
                key={done ? "done" : Math.floor(remaining)}
                initial={{ opacity: 0.4, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                {done ? fmt(elapsed) : fmt(remaining)}
              </motion.span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold">
            Elapsed / Total
          </div>
          <div className="text-sm tabular-nums text-ink mt-1 font-mono">
            {fmt(elapsed)} <span className="text-ink-dim">/</span> {fmt(total)}
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-bg-card overflow-hidden ring-1 ring-bg-border">
        <motion.div
          className={`h-full rounded-full ${
            done
              ? "bg-good"
              : tone === "warn"
              ? "bg-gradient-to-r from-warn to-bad"
              : "bg-gradient-to-r from-brand-light to-brand-dark"
          } relative`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {!done && (
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
              style={{ backgroundSize: "400px 100%" }}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
