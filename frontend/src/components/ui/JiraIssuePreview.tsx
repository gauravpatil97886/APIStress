// JiraIssuePreview — debounced live lookup of a Jira issue while the user
// types/pastes the ticket ID. Shows the assignee's avatar + name, the issue
// summary, and pills for status / type / priority. All read-only — the
// component never sends anything back to Jira, only reflects what's there.

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ExternalLink, UserCircle2 } from "lucide-react";
import { api } from "../../lib/api";

type IssueInfo = {
  key: string;
  summary?: string;
  status?: string;
  issue_type?: string;
  priority?: string;
  url?: string;
  assignee_name?: string;
  assignee_email?: string;
  assignee_avatar?: string;
};

type Props = {
  jiraID: string;
  // When false (no creds), we render nothing — the test builder already
  // has its own "not configured" hint elsewhere.
  enabled: boolean;
  // Optional callback so the parent can read the resolved info (e.g. to
  // auto-fill the Jira link field).
  onResolved?: (info: IssueInfo | null) => void;
};

const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

export function JiraIssuePreview({ jiraID, enabled, onResolved }: Props) {
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setInfo(null); setError(null); return;
    }
    const trimmed = jiraID.trim().toUpperCase();
    if (!trimmed) {
      setInfo(null); setError(null); onResolved?.(null);
      return;
    }
    if (!KEY_RE.test(trimmed)) {
      setInfo(null); setError(null); // shape error is shown elsewhere
      onResolved?.(null);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const i = await api.jiraLookupIssue(trimmed);
        if (cancelled) return;
        setInfo(i);
        onResolved?.(i);
      } catch (e: any) {
        if (cancelled) return;
        setInfo(null);
        setError(e?.message || "Lookup failed");
        onResolved?.(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);

    return () => { cancelled = true; clearTimeout(t); };
    // onResolved is stable enough to leave out — adding it would re-fetch on
    // every parent render. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jiraID, enabled]);

  if (!enabled) return null;
  if (!jiraID.trim()) return null;

  if (loading) {
    return (
      <div className="mt-2 px-2.5 py-1.5 rounded-lg ring-1 ring-bg-border bg-bg-card/40 text-[11px] text-ink-muted inline-flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-sky-400" /> Looking up {jiraID.toUpperCase()}…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-2 px-2.5 py-1.5 rounded-lg ring-1 ring-warn/30 bg-warn/[.06] text-[11px] text-warn inline-flex items-center gap-2 max-w-full">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="truncate" title={error}>{error}</span>
      </div>
    );
  }
  if (!info) return null;

  const statusTone = statusClass(info.status);

  return (
    <div className="mt-2 p-3 rounded-xl ring-1 ring-sky-500/30 bg-gradient-to-br from-sky-500/[.05] to-violet-500/[.04]">
      <div className="flex items-start gap-3">
        {/* Avatar / fallback bubble */}
        {info.assignee_avatar ? (
          <img
            src={info.assignee_avatar}
            alt={info.assignee_name || "assignee"}
            className="w-9 h-9 rounded-full ring-2 ring-sky-500/40 shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-9 h-9 rounded-full grid place-items-center bg-bg-card ring-2 ring-bg-border shrink-0 text-ink-muted">
            <UserCircle2 className="w-5 h-5" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={info.url} target="_blank" rel="noopener"
              className="text-xs font-bold font-mono text-brand hover:underline inline-flex items-center gap-1"
              title="Open in Jira"
            >
              {info.key} <ExternalLink className="w-3 h-3" />
            </a>
            {info.issue_type && (
              <span className="pill ring-1 text-[9px] bg-bg-card ring-bg-border text-ink-muted uppercase tracking-wider">
                {info.issue_type}
              </span>
            )}
            {info.status && (
              <span className={`pill ring-1 text-[9px] uppercase tracking-wider ${statusTone}`}>
                {info.status}
              </span>
            )}
            {info.priority && (
              <span className="pill ring-1 text-[9px] bg-bg-card ring-bg-border text-ink-muted">
                {info.priority}
              </span>
            )}
          </div>
          {info.summary && (
            <div className="text-xs text-ink mt-1 line-clamp-2" title={info.summary}>
              {info.summary}
            </div>
          )}
          <div className="text-[11px] text-ink-muted mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-ink-dim">Assignee:</span>
            {info.assignee_name ? (
              <>
                <span className="text-ink font-medium">{info.assignee_name}</span>
                {info.assignee_email && (
                  <span className="text-ink-dim font-mono">· {info.assignee_email}</span>
                )}
                <span className="pill ring-1 text-[9px] bg-good/10 text-good ring-good/30 ml-1">
                  will be tagged in the Jira comment
                </span>
              </>
            ) : (
              <>
                <span className="text-warn">unassigned</span>
                <span className="pill ring-1 text-[9px] bg-warn/10 text-warn ring-warn/30 ml-1">
                  no one will be notified
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusClass(status?: string): string {
  if (!status) return "bg-bg-card ring-bg-border text-ink-muted";
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved"))
    return "bg-good/15 text-good ring-good/30";
  if (s.includes("progress") || s.includes("review") || s.includes("test"))
    return "bg-sky-500/15 text-sky-400 ring-sky-500/30";
  if (s.includes("block") || s.includes("hold"))
    return "bg-bad/15 text-bad ring-bad/30";
  if (s.includes("todo") || s.includes("open") || s.includes("backlog"))
    return "bg-bg-card ring-bg-border text-ink";
  return "bg-warn/10 text-warn ring-warn/30";
}
