import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function pad(n: number) { return n.toString().padStart(2, "0"); }
function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const sec = Math.floor(s % 60);
  const min = Math.floor((s / 60) % 60);
  const hr = Math.floor(s / 3600);
  if (hr > 0) return `${hr}:${pad(min)}:${pad(sec)}`;
  return `${pad(min)}:${pad(sec)}`;
}

/**
 * Inline countdown for running tests in list views.
 * Ticks every second on the client; doesn't need an SSE connection.
 * Pass `startedAt` (ISO) and `totalSec`; it shows time remaining.
 */
export function MiniCountdown({
  startedAt,
  totalSec,
}: {
  startedAt?: string | null;
  totalSec: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!startedAt || !totalSec) {
    return <span className="text-xs text-ink-dim">—</span>;
  }
  const startMs = new Date(startedAt).getTime();
  const elapsed = Math.max(0, (now - startMs) / 1000);
  const remaining = Math.max(0, totalSec - elapsed);
  const pct = Math.min(100, (elapsed / totalSec) * 100);
  const tone = remaining < 5 ? "text-warn" : "text-brand";

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <Clock className={`w-3.5 h-3.5 ${tone}`} />
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className={`text-xs font-mono tabular-nums ${tone}`}>
          {fmt(remaining)} <span className="text-ink-dim">left</span>
        </div>
        <div className="h-1 rounded-full bg-bg-card overflow-hidden ring-1 ring-bg-border">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${
              remaining < 5 ? "bg-gradient-to-r from-warn to-bad" : "bg-gradient-to-r from-brand-light to-brand-dark"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
