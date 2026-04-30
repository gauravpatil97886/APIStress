// KavachFileJiraButton — files a single finding as a NEW Jira issue.
//
// This is the *primary* Jira flow for Kavach (one finding → one ticket),
// distinct from APIStress's "attach the run report to an existing ticket"
// flow. The portal modal has no `JiraIssuePreview` because the issue
// doesn't exist yet — we're creating it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Loader2, Send, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../../lib/api";

type Health = {
  configured: boolean;
  ok?: boolean;
  account?: string;
  error?: string;
  project?: string;
} | null;

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

const SEV_TO_PRIORITY: Record<string, string> = {
  critical: "Highest", high: "High", medium: "Medium", low: "Low", info: "Lowest",
};

type Props = {
  findingID: number;
  severity: string;
  testID?: string;
  cwe?: string;
  owasp?: string;
  defaultTitle?: string;        // pre-fill summary
  // Called after a successful file with the new Jira id/url so the parent
  // can stamp the finding card with a "Filed as XX-NN" pill.
  onFiled?: (jiraID: string, jiraURL: string) => void;
};

export function KavachFileJiraButton({
  findingID, severity, testID, cwe, owasp, defaultTitle, onFiled,
}: Props) {
  const [health, setHealth] = useState<Health>(healthCache?.value ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modal-local state
  const [projectKey, setProjectKey] = useState("");
  const [issueType, setIssueType] = useState("Bug");
  const [summary, setSummary] = useState("");
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState(SEV_TO_PRIORITY[severity] || "Medium");
  const [labelsText, setLabelsText] = useState("");

  useEffect(() => {
    let cancelled = false;
    getHealthCached().then(h => { if (!cancelled) setHealth(h); });
    return () => { cancelled = true; };
  }, []);

  // Hide entirely if Jira isn't configured.
  if (!health) return null;
  if (!health.configured) return null;

  function openModal() {
    if (!health?.ok) {
      toast.error(`Jira health check failed${health?.error ? ": " + health.error : ""}`);
      return;
    }
    setProjectKey(health.project || "");
    setIssueType("Bug");
    setSummary(defaultTitle ? `[Kavach] ${capitalize(severity)} — ${defaultTitle}` : "");
    setComment("");
    setPriority(SEV_TO_PRIORITY[severity] || "Medium");
    setLabelsText(["security", "kavach", "vapt", "sev-" + severity, cwe ? "cwe-" + cwe.replace(/^CWE-/i, "").toLowerCase() : "", owasp ? "owasp-" + owasp.split(":")[0].toLowerCase() : ""].filter(Boolean).join(", "));
    setOpen(true);
  }

  async function submit() {
    if (!projectKey.trim()) { toast.error("Project key is required"); return; }
    setBusy(true);
    const tID = toast.loading("Creating Jira issue…");
    try {
      const labels = labelsText.split(",").map(s => s.trim()).filter(Boolean);
      const r = await api.kavach.fileFinding(findingID, {
        project_key: projectKey.trim().toUpperCase(),
        issue_type: issueType,
        summary: summary.trim() || undefined,
        comment: comment.trim() || undefined,
        priority,
        labels,
      });
      toast.success(
        <span>
          Filed as <b>{r.jira_id}</b>{" — "}
          <a href={r.jira_url} target="_blank" rel="noopener" className="underline text-good hover:text-good/80">
            open in Jira
          </a>
        </span>,
        { id: tID, duration: 6000 },
      );
      api.logActivity({
        event_type: "feature.kavach.finding.filed",
        tool_slug: "kavach",
        resource_type: "finding",
        resource_id: String(findingID),
        meta: { jira_id: r.jira_id, severity },
      });
      onFiled?.(r.jira_id, r.jira_url);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Jira create failed: ${e?.message || String(e)}`, { id: tID, duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                   bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-teal-900/40
                   hover:from-cyan-500 hover:to-teal-500 transition"
      >
        <Paperclip className="w-3.5 h-3.5" /> File as Jira issue
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
                <div className="text-base font-bold leading-tight">Create Jira issue from finding</div>
                <div className="text-[11px] text-ink-muted">
                  Files a NEW issue in your project with severity-mapped priority + evidence + labels.
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

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Project key <span className="text-bad">*</span></label>
                  <input
                    value={projectKey}
                    onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                    className="input w-full font-mono"
                    placeholder="CT"
                    disabled={!!health.project}
                  />
                  {health.project && (
                    <div className="text-[10px] text-ink-dim mt-1">Locked by server: {health.project}</div>
                  )}
                </div>
                <div>
                  <label className="label">Issue type</label>
                  <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className="input w-full">
                    <option>Bug</option>
                    <option>Task</option>
                    <option>Story</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Summary (title)</label>
                <input value={summary} onChange={(e) => setSummary(e.target.value)} className="input w-full" />
                <div className="text-[10px] text-ink-dim mt-1">Leave blank to auto-generate from the finding title.</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input w-full">
                    <option>Highest</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                    <option>Lowest</option>
                  </select>
                </div>
                <div>
                  <label className="label">Labels</label>
                  <input value={labelsText} onChange={(e) => setLabelsText(e.target.value)}
                    className="input w-full font-mono text-xs" placeholder="security, kavach, …" />
                </div>
              </div>

              <div>
                <label className="label">Comment / description (optional override)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="input w-full font-mono text-[11px] resize-y"
                  rows={6}
                  placeholder="Leave blank for the auto-generated wiki-formatted body (plain-English explanation + reproducer + technical reference)."
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                <CheckCircle2 className="w-3 h-3 text-good" />
                Test ID: <code className="font-mono text-cyan-300">{testID || "—"}</code>
                {cwe && <>· {cwe}</>}
                {owasp && <>· {owasp}</>}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
              <button
                onClick={submit}
                disabled={busy || !projectKey.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold
                           bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-teal-900/40
                           hover:from-cyan-500 hover:to-teal-500 transition
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                  : <><Send className="w-3.5 h-3.5" /> Create Jira issue</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
