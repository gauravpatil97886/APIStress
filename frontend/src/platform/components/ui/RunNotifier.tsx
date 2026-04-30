import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, AlertOctagon, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { api, getKey } from "../../api/client";

type Run = {
  id: string;
  name?: string;
  status: string;
  created_by?: string;
  jira_id?: string;
  summary?: any;
};

let pollTimer: number | null = null;
const lastStatus = new Map<string, string>();
let primed = false;

export function RunNotifier() {
  const nav = useNavigate();

  useEffect(() => {
    if (!getKey()) return;

    async function tick() {
      if (!getKey()) return;
      try {
        const list = (await api.listRuns()) as Run[];
        if (!primed) {
          // First poll: seed without notifying so we don't fire for runs
          // that completed before the user opened the app.
          list.forEach((r) => lastStatus.set(r.id, r.status));
          primed = true;
          return;
        }
        list.forEach((r) => {
          const old = lastStatus.get(r.id);
          lastStatus.set(r.id, r.status);
          if (old === "running" && r.status !== "running") {
            showCompletionToast(r, () => nav(`/reports/${r.id}`));
          }
        });
      } catch {
        /* ignored — 401 handler redirects to /login */
      }
    }

    void tick();
    pollTimer = window.setInterval(tick, 4000);
    return () => {
      if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
    };
  }, [nav]);

  return null;
}

function showCompletionToast(r: Run, openReport: () => void) {
  const ok = r.status === "finished";
  const reqs = r.summary?.totals?.requests;
  const errRate = r.summary?.error_rate;

  toast.custom(
    (t) => (
      <motion.div
        initial={{ opacity: 0, x: 30, scale: 0.96 }}
        animate={{ opacity: t.visible ? 1 : 0, x: t.visible ? 0 : 30, scale: 1 }}
        transition={{ duration: 0.2 }}
        className={`pointer-events-auto w-[380px] rounded-xl border p-4 shadow-2xl backdrop-blur
          ${ok ? "bg-bg-panel border-good/40" : "bg-bg-panel border-bad/40"}`}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-0.5 ${ok ? "text-good" : "text-bad"}`}>
            {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink truncate">
              {ok ? "Load test finished" : `Load test ${r.status}`}
            </div>
            <div className="text-xs text-ink-muted truncate mt-0.5">
              {r.name || r.id.slice(0, 8)}
              {r.created_by ? ` · by ${r.created_by}` : ""}
              {r.jira_id ? ` · ${r.jira_id}` : ""}
            </div>
            {typeof reqs === "number" && (
              <div className="text-[11px] text-ink-dim mt-1 tabular-nums">
                {reqs.toLocaleString()} requests
                {typeof errRate === "number" && ` · ${(errRate * 100).toFixed(2)}% errors`}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { toast.dismiss(t.id); openReport(); }}
                className="btn-primary text-xs px-3 py-1.5"
              >
                View report <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    ),
    { duration: 12000, position: "top-right" }
  );
}
