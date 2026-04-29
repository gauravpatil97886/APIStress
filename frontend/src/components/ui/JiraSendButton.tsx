// JiraSendButton — compact "send report to Jira" icon button suitable for
// list rows (e.g. the History page). Self-contained: opens its own portal
// modal so it works inside any table cell or card without breaking layout.
//
// Differences vs JiraAttachButton:
//   - No prominent card UI — just an icon button.
//   - No attachment-history list (the report-detail page already shows that).
//   - Health check is shared at module scope so a list of N rows doesn't
//     fire N parallel /api/jira/health requests.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Loader2, Send, X, MessageSquare, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

type Health = {
  configured: boolean;
  ok?: boolean;
  account?: string;
  error?: string;
} | null;

// Module-scoped cache so 100 rows on the History page don't each fire a
// health probe. Refreshed on first call + every 60 s.
let healthCache: { value: Health; ts: number } | null = null;
let inflight: Promise<Health> | null = null;
async function getHealthCached(): Promise<Health> {
  const now = Date.now();
  if (healthCache && now - healthCache.ts < 60_000) return healthCache.value;
  if (inflight) return inflight;
  inflight = api.jiraHealth()
    .then(h => { healthCache = { value: h, ts: Date.now() }; return h; })
    .catch(() => { healthCache = { value: { configured: false }, ts: Date.now() }; return healthCache.value; })
    .finally(() => { inflight = null; });
  return inflight;
}

type Props = {
  runID: string;
  jiraID?: string | null;
  // Visual mode — `icon` for tight rows, `button` for prominence.
  variant?: "icon" | "button";
  className?: string;
  title?: string;
};

export function JiraSendButton({ runID, jiraID, variant = "icon", className, title }: Props) {
  const [health, setHealth] = useState<Health>(healthCache?.value ?? null);
  const [open, setOpen] = useState(false);
  const [composeJiraID, setComposeJiraID] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHealthCached().then(h => { if (!cancelled) setHealth(h); });
    return () => { cancelled = true; };
  }, []);

  // Don't render anything if Jira isn't configured server-side.
  if (!health) {
    return variant === "icon" ? <span className="btn-ghost !p-2 opacity-30"><Paperclip className="w-3.5 h-3.5" /></span> : null;
  }
  if (!health.configured) return null;

  function openModal() {
    if (!health?.ok) {
      toast.error(`Jira health check failed${health?.error ? ": " + health.error : ""}`,
        { id: "jira-row-send", duration: 4500 });
      return;
    }
    setComposeJiraID((jiraID || "").trim().toUpperCase());
    setComment("");
    setOpen(true);
  }

  async function send() {
    const target = composeJiraID.trim();
    if (!target) { toast.error("Provide a Jira issue key."); return; }
    setBusy(true);
    const tID = toast.loading(`Attaching report to ${target}…`);
    try {
      const r = await api.jiraAttachRun(runID, { jira_id: target, comment: comment.trim() || undefined });
      toast.success(
        <span>
          Attached to <b>{r.jira_id}</b>{" — "}
          <a href={r.jira_url} target="_blank" rel="noopener" className="underline">open in Jira</a>
        </span>,
        { id: tID, duration: 6000 },
      );
      api.logActivity({
        event_type: "feature.jira.attach", tool_slug: "apistress",
        resource_type: "run", resource_id: runID,
        meta: { jira_id: r.jira_id, source: "history" },
      });
      setOpen(false);
    } catch (e: any) {
      toast.error(`Jira attach failed: ${e?.message || String(e)}`, { id: tID, duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  const trigger = variant === "icon" ? (
    <button
      onClick={openModal}
      className={className ?? "btn-ghost !p-2"}
      title={title ?? `Attach report to Jira${jiraID ? ` (${jiraID})` : ""}`}
    >
      <Paperclip className="w-3.5 h-3.5" />
    </button>
  ) : (
    <button
      onClick={openModal}
      className={className ?? "btn-secondary text-xs"}
      title={title ?? "Attach report to Jira"}
    >
      <Paperclip className="w-3.5 h-3.5" /> Send to Jira
    </button>
  );

  return (
    <>
      {trigger}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog" aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card p-6 w-full max-w-2xl ring-1 ring-bg-border shadow-2xl shadow-black/60 my-auto"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0052CC] to-[#2684FF] grid place-items-center shrink-0">
                <Paperclip className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="text-base font-bold leading-tight">Send report to Jira</div>
                <div className="text-[11px] text-ink-muted">
                  Uploads the PDF + posts an assignee-tagged summary comment.
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="ml-auto text-ink-muted hover:text-ink p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            {!health.ok && (
              <div className="mb-3 p-2 rounded-lg ring-1 ring-warn/30 bg-warn/[.06] text-[11px] text-warn flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Jira health check failed: {health.error || "unknown error"}. The send will still try, but expect failure.</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="label">Issue key <span className="text-bad">*</span></label>
                <input
                  value={composeJiraID}
                  onChange={(e) => setComposeJiraID(e.target.value.trim().toUpperCase())}
                  className="input w-full font-mono text-base py-2.5 tracking-wider uppercase"
                  placeholder="CT-1234"
                  autoFocus
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> Comment
                  <span className="ml-auto text-[10px] text-ink-dim normal-case tracking-normal">optional override</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="input w-full font-mono text-xs resize-y"
                  rows={5}
                  placeholder="Leave blank for the auto-generated professional summary (metrics table + verdict + assignee mention)."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
              <button
                onClick={send}
                disabled={busy || !composeJiraID}
                className="btn-primary flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Send className="w-3.5 h-3.5" /> Attach to {composeJiraID || "issue"}</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
