// KavachAttachJiraButton — attach the full Kavach scan PDF + a wiki-text
// summary comment to an existing Jira issue (analogous to APIStress's
// flow). Reuses JiraIssuePreview to live-preview the target ticket.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Loader2, Send, X, MessageSquare, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../../platform/api/client";
import { JiraIssuePreview } from "../../../platform/components/jira/JiraIssuePreview";

type Health = {
  configured: boolean;
  ok?: boolean;
  account?: string;
  error?: string;
  project?: string;
} | null;

let healthCache: { value: Health; ts: number } | null = null;
async function getHealthCached(): Promise<Health> {
  const now = Date.now();
  if (healthCache && now - healthCache.ts < 60_000) return healthCache.value;
  try {
    const v = await api.jiraHealth();
    healthCache = { value: v, ts: now };
    return v;
  } catch {
    healthCache = { value: { configured: false }, ts: now };
    return healthCache.value;
  }
}

type Props = {
  scanID: string;
};

export function KavachAttachJiraButton({ scanID }: Props) {
  const [health, setHealth] = useState<Health>(healthCache?.value ?? null);
  const [open, setOpen] = useState(false);
  const [jiraID, setJiraID] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHealthCached().then(h => { if (!cancelled) setHealth(h); });
    return () => { cancelled = true; };
  }, []);

  if (!health) return null;
  if (!health.configured) return null;

  function openModal() {
    if (!health?.ok) {
      toast.error(`Jira health check failed${health?.error ? ": " + health.error : ""}`);
      return;
    }
    setJiraID("");
    setComment("");
    setOpen(true);
  }

  async function submit() {
    const target = jiraID.trim().toUpperCase();
    if (!target) { toast.error("Provide a Jira issue key"); return; }
    setBusy(true);
    const tID = toast.loading(`Attaching report to ${target}…`);
    try {
      const r = await api.kavach.attachReport(scanID, {
        jira_id: target,
        comment: comment.trim() || undefined,
      });
      toast.success(
        <span>
          Attached to <b>{r.jira_id}</b>{" — "}
          <a href={r.jira_url} target="_blank" rel="noopener" className="underline text-good hover:text-good/80">
            open in Jira
          </a>
        </span>,
        { id: tID, duration: 6000 },
      );
      api.logActivity({
        event_type: "feature.kavach.report.attached",
        tool_slug: "kavach",
        resource_type: "scan",
        resource_id: scanID,
        meta: { jira_id: r.jira_id, filename: r.filename },
      });
      setOpen(false);
    } catch (e: any) {
      toast.error(`Jira attach failed: ${e?.message || String(e)}`, { id: tID, duration: 8000 });
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ring-1 ring-cyan-500/40 text-cyan-200 bg-cyan-500/[.08] hover:bg-cyan-500/[.16] transition"
        title="Attach the full report PDF to a Jira tracking ticket"
      >
        <Paperclip className="w-3.5 h-3.5" /> Attach to Jira
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog" aria-modal="true"
        >
          <div onClick={(e) => e.stopPropagation()}
               className="card p-6 w-full max-w-2xl ring-1 ring-cyan-500/30 bg-slate-950 shadow-2xl shadow-black/60 my-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-700 grid place-items-center shrink-0 shadow-md shadow-teal-900/40">
                <Paperclip className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-base font-bold leading-tight">Attach full report to Jira</div>
                <div className="text-[11px] text-ink-muted">
                  Uploads the PDF + posts a wiki-formatted summary comment with the assignee tagged.
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="ml-auto text-ink-muted hover:text-ink p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            {!health.ok && (
              <div className="mb-3 p-2 rounded-lg ring-1 ring-warn/30 bg-warn/[.06] text-[11px] text-warn flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Jira health check failed: {health.error || "unknown error"}.</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="label">Existing issue key <span className="text-bad">*</span></label>
                <input
                  value={jiraID}
                  onChange={(e) => setJiraID(e.target.value.trim().toUpperCase())}
                  className="input w-full font-mono text-base py-2.5 tracking-wider uppercase"
                  placeholder="CT-1234"
                  autoFocus
                />
                <JiraIssuePreview
                  jiraID={jiraID}
                  enabled={!!health?.configured && !!health?.ok}
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> Comment override
                  <span className="ml-auto text-[10px] text-ink-dim normal-case tracking-normal">optional</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="input w-full font-mono text-xs resize-y"
                  rows={5}
                  placeholder="Leave blank for the auto-generated security summary (severity rollup + top findings + assignee mention)."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
              <button
                onClick={submit}
                disabled={busy || !jiraID.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold
                           bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-teal-900/40
                           hover:from-cyan-500 hover:to-teal-500 transition
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Send className="w-3.5 h-3.5" /> Attach to {jiraID || "issue"}</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
