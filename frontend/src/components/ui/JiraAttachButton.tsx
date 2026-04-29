// JiraAttachButton — drops onto any report-detail page. Calls /api/jira/health
// once on mount; if the integration isn't configured, the component renders
// nothing. Otherwise:
//   - The pill shows the run's Jira ID + a one-click "Attach report".
//   - Errors from Jira (auth, 403, issue not found, network) surface as a
//     prominent toast right after the report-view interaction — exactly
//     where the user is looking when they click.
//   - Past attaches for this run are listed underneath so the team has a
//     paper trail of "this report was sent to CT-123 on <date>".

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Paperclip, Loader2, CheckCircle2, AlertTriangle, FileDown, RefreshCw, Send, MessageSquare, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { JiraIssuePreview } from "./JiraIssuePreview";

type Attachment = {
  id: number;
  jira_id: string;
  jira_url: string;
  filename: string;
  bytes: number;
  attached_by: string;
  attached_at: string;
};

type Health = {
  configured: boolean;
  ok?: boolean;
  base_url?: string;
  auth_kind?: string;
  project?: string;
  account?: string;
  error?: string;
};

export function JiraAttachButton({
  runID,
  jiraID,
  envTag,
}: {
  runID: string;
  jiraID?: string | null;
  envTag?: string | null;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState("");
  const [composeJiraID, setComposeJiraID] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.jiraHealth().then(h => { if (!cancelled) setHealth(h); }).catch(() => {});
    refreshAttachments();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runID]);

  async function refreshAttachments() {
    try {
      const a = await api.jiraAttachments(runID);
      setAttachments(a || []);
    } catch {/* ignore */}
  }

  // Open the compose dialog seeded with a sensible default. We support two
  // entry points: the primary "Attach report" button (uses run's jira_id),
  // and per-row "Resend" buttons in the history (preselect that row's id).
  function openCompose(seedJiraID?: string) {
    if (!health?.configured) {
      toast.error("Jira integration isn't configured on this server. Ask an admin to set CH_JIRA_*.");
      return;
    }
    const target = (seedJiraID || jiraID || "").trim();
    if (!target) {
      toast.error("This run has no Jira ID — can't attach.");
      return;
    }
    setComposeJiraID(target);
    // Empty comment → backend uses the auto-generated professional summary
    // (with assignee mention + metrics table). Operators can override.
    setCompose("");
    setShowCompose(true);
  }

  async function send(action: "send" | "resend") {
    if (!health?.configured) return;
    const target = composeJiraID.trim();
    if (!target) {
      toast.error("Provide a Jira issue key.");
      return;
    }
    setBusy(true);
    const verb = action === "resend" ? "Re-sending" : "Attaching";
    const tID = toast.loading(`${verb} report to ${target}…`);
    try {
      const r = await api.jiraAttachRun(runID, {
        jira_id: target,
        comment: compose.trim() || undefined, // empty → backend auto-builds
      });
      toast.success(
        <span>
          {action === "resend" ? "Re-sent" : "Attached"} to <b>{r.jira_id}</b>{" — "}
          <a href={r.jira_url} target="_blank" rel="noopener" className="underline text-good hover:text-good/80">
            open in Jira
          </a>
        </span>,
        { id: tID, duration: 6000 },
      );
      api.logActivity({
        event_type: "feature.jira.attach",
        tool_slug: "apistress",
        resource_type: "run",
        resource_id: runID,
        meta: { jira_id: r.jira_id, action },
      });
      setShowCompose(false);
      setCompose("");
      refreshAttachments();
    } catch (e: any) {
      // Errors from Jira surface as a prominent toast right where the user
      // is looking — auth failure, 403, unknown issue, network, etc.
      toast.error(`Jira attach failed: ${e.message || String(e)}`, { id: tID, duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  // Hide entirely when Jira isn't configured — keeps the report page tidy.
  if (!health || !health.configured) return null;

  const lastAttach = attachments[0];

  return (
    <section className="card p-4 ring-1 ring-bg-border">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-sky-500/20 to-violet-500/20 ring-1 ring-sky-500/30 shrink-0">
          <Paperclip className="w-5 h-5 text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold">Attach this report to Jira</h3>
            {health.ok ? (
              <span className="pill ring-1 text-[10px] bg-good/10 text-good ring-good/30 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected
                {health.account && <span className="text-good/70 ml-1">· {health.account}</span>}
              </span>
            ) : (
              <span className="pill ring-1 text-[10px] bg-warn/10 text-warn ring-warn/30 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Health check failed
              </span>
            )}
            {health.project && (
              <span className="pill ring-1 text-[10px] bg-bg-card ring-bg-border text-ink-muted font-mono">
                {health.project}-*
              </span>
            )}
            {envTag && (
              <span className="pill ring-1 text-[10px] bg-cool/10 text-cool ring-cool/30 font-mono">
                {envTag}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">
            Uploads the PDF report as an attachment + posts a short summary comment on the linked issue.
          </p>
          {!health.ok && health.error && (
            <p className="text-[11px] text-warn mt-1 font-mono break-all">
              {health.error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {jiraID ? (
            <span className="pill ring-1 text-xs bg-brand/10 text-brand ring-brand/30 font-mono">
              {jiraID}
            </span>
          ) : (
            <span className="pill ring-1 text-xs bg-bg-card ring-bg-border text-ink-muted">
              No Jira ID on this run
            </span>
          )}
          <button
            onClick={() => openCompose()}
            disabled={busy || !jiraID || !health.ok}
            className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title={!jiraID
              ? "This run has no Jira ID — can't attach"
              : !health.ok ? "Jira health check failed — see message"
              : `Attach to ${jiraID}`}
          >
            {busy
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
              : <><Paperclip className="w-3.5 h-3.5" /> Attach report</>}
          </button>
        </div>
      </div>

      {/* Live Jira details for the run's linked ticket — assignee + status
          + summary, fetched from /api/jira/issue/:key. Hides itself if the
          run has no jiraID or the integration isn't healthy. */}
      {jiraID && health.ok && (
        <div className="mt-4">
          <JiraIssuePreview jiraID={jiraID} enabled={true} />
        </div>
      )}

      {/* Attach history */}
      {attachments.length > 0 && (
        <div className="mt-4 pt-3 border-t border-bg-border/60">
          <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-2 flex items-center gap-2">
            Attach history
            {lastAttach && (
              <span className="text-ink-muted normal-case tracking-normal">
                — last sent to <a href={lastAttach.jira_url} target="_blank" rel="noopener" className="text-brand hover:underline">{lastAttach.jira_id}</a>
                {" "}on {new Date(lastAttach.attached_at).toLocaleString()}
              </span>
            )}
            <button onClick={refreshAttachments} className="ml-auto text-ink-dim hover:text-ink" title="Refresh"><RefreshCw className="w-3 h-3" /></button>
          </div>
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {attachments.map((a) => (
              <li key={a.id} className="text-xs flex items-center gap-2 p-2 rounded ring-1 ring-bg-border/60 bg-bg-card/40">
                <FileDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <a href={a.jira_url} target="_blank" rel="noopener" className="text-brand hover:underline font-mono shrink-0">
                  {a.jira_id}
                </a>
                <span className="text-ink truncate flex-1" title={a.filename}>{a.filename}</span>
                <span className="text-ink-dim font-mono text-[10px] shrink-0">{fmtBytes(a.bytes)}</span>
                <span className="text-ink-muted shrink-0">by {a.attached_by || "—"}</span>
                <span className="text-ink-dim shrink-0">{new Date(a.attached_at).toLocaleString()}</span>
                <button
                  onClick={() => openCompose(a.jira_id)}
                  disabled={busy || !health.ok}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                             text-sky-400 ring-1 ring-sky-500/30 hover:bg-sky-500/10 disabled:opacity-40
                             disabled:cursor-not-allowed transition shrink-0"
                  title={`Re-send the latest report to ${a.jira_id}`}
                >
                  <Send className="w-3 h-3" /> Resend
                </button>
                <a href={a.jira_url} target="_blank" rel="noopener" className="text-ink-muted hover:text-brand shrink-0" title="Open in Jira">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compose dialog — rendered via portal to document.body so it
          always escapes the parent card's stacking / containment context.
          (Inside JiraAttachButton's parent card, fixed-position children
          can render in the wrong scroll layer; portal fixes that.) */}
      {showCompose && createPortal(
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setShowCompose(false)}
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
              <button onClick={() => setShowCompose(false)} className="ml-auto text-ink-muted hover:text-ink p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Issue key <span className="text-bad">*</span></label>
                <input
                  value={composeJiraID}
                  onChange={(e) => setComposeJiraID(e.target.value.trim().toUpperCase())}
                  className="input w-full font-mono text-base py-2.5 tracking-wider uppercase"
                  placeholder="CT-1234"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> Comment
                  <span className="ml-auto text-[10px] text-ink-dim normal-case tracking-normal">optional override</span>
                </label>
                <textarea
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  className="input w-full font-mono text-xs resize-y"
                  rows={6}
                  placeholder="Leave blank for the auto-generated professional summary (metrics table + verdict + assignee mention). Type here to override — we'll still prepend the assignee mention so they get notified."
                />
                <div className="text-[11px] text-ink-dim mt-1.5">
                  💡 Empty = recommended auto-summary. Custom text always tags the assignee.
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCompose(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
              <button
                onClick={() => send(attachments.some(a => a.jira_id === composeJiraID) ? "resend" : "send")}
                disabled={busy || !composeJiraID}
                className="btn-primary flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Send className="w-3.5 h-3.5" />
                      {attachments.some(a => a.jira_id === composeJiraID) ? "Re-send" : "Attach"} to {composeJiraID || "issue"}
                    </>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
