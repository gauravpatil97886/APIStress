import { create } from "zustand";
import toast from "react-hot-toast";
import { api, getKey } from "../platform/api/client";

type Run = {
  id: string;
  name: string;
  status: string;
  created_by?: string;
  jira_id?: string;
  jira_link?: string;
  started_at?: string | null;
  finished_at?: string | null;
  summary?: any;
};

type State = {
  runs: Run[];
  trackedStatus: Record<string, string>;
  polling: boolean;
  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
};

let pollTimer: number | null = null;

export const useRunStore = create<State>((set, get) => ({
  runs: [],
  trackedStatus: {},
  polling: false,

  refresh: async () => {
    if (!getKey()) return;
    try {
      const list = (await api.listRuns()) as Run[];
      const prev = get().trackedStatus;
      const nextTracked: Record<string, string> = {};
      list.forEach((r) => { nextTracked[r.id] = r.status; });

      // Detect transitions running → finished/failed/cancelled
      list.forEach((r) => {
        const old = prev[r.id];
        if (old === "running" && r.status !== "running") {
          notifyDone(r);
        }
      });

      set({ runs: list, trackedStatus: nextTracked });
    } catch {
      // ignored — auth handler will redirect on 401
    }
  },

  startPolling: () => {
    if (get().polling) return;
    set({ polling: true });
    void get().refresh();
    pollTimer = window.setInterval(() => { void get().refresh(); }, 4000);
  },

  stopPolling: () => {
    if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
    set({ polling: false });
  },
}));

function notifyDone(r: Run) {
  const ok = r.status === "finished";
  const message = ok
    ? `"${r.name || r.id.slice(0, 8)}" finished — open the report`
    : `"${r.name || r.id.slice(0, 8)}" ${r.status}`;
  const icon = ok ? "✓" : "⚠";
  toast.custom((t) => {
    const onOpen = () => {
      toast.dismiss(t.id);
      window.location.href = `/reports/${r.id}`;
    };
    return (
      // simple HTML element styled like our toast theme
      // (using JSX inside .ts file requires `.tsx` — keep it as a function returning element via React.createElement)
      // see RunNotifier for the React-friendly version
      // @ts-ignore — we render through react-hot-toast which accepts ReactNode
      null
    );
  }, { duration: 8000 });

  // Fallback / primary: simple toast that always works.
  if (ok) {
    toast.success(`${icon}  ${message}`, { duration: 7000 });
  } else {
    toast.error(`${icon}  ${message}`, { duration: 7000 });
  }
}
