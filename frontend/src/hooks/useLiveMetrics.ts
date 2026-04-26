import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export type LiveSnapshot = {
  run_id: string;
  ts: string;
  elapsed_sec: number;
  active_vus: number;
  status: string;
  rps: number;
  error_rate: number;
  totals: { requests: number; errors: number; bytes_in: number; bytes_out: number; statuses: Record<string, number>; error_reasons?: Record<string, number> };
  latest: any;
  series: any[];
};

export function useLiveMetrics(runID?: string) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runID) return;
    setDone(false);
    setSnap(null);
    const es = new EventSource(api.liveURL(runID));
    esRef.current = es;
    es.addEventListener("snapshot", (ev: MessageEvent) => setSnap(JSON.parse(ev.data)));
    es.addEventListener("tick",     (ev: MessageEvent) => setSnap(JSON.parse(ev.data)));
    es.addEventListener("done", (ev: MessageEvent) => {
      setSnap(JSON.parse(ev.data));
      setDone(true);
      es.close();
    });
    es.onerror = () => {
      // server may have ended the run; rely on done event when possible
    };
    return () => { es.close(); esRef.current = null; };
  }, [runID]);

  return { snap, done };
}
