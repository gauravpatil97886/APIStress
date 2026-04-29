// JiraSection — TestBuilder's Jira integration card.
//
// Redesign goals (vs. earlier two-column version):
//   - The ID input + auto-attach toggle live on the same row so the user
//     can see both at once without scrolling. The toggle is large and
//     unmistakable — it's the most consequential decision on the screen.
//   - The live issue preview spans the full card width as a single rich
//     row (avatar / key / pills / summary / assignee), instead of being
//     a small floating bubble.
//   - Comment templates are horizontal pill radios (one per row of icons),
//     not vertical full-width buttons that wasted space.
//   - Filler "capability" cards (PDF report / Tag assignee / Trail kept)
//     removed — they explained the feature redundantly with the description.
//   - Custom link override moved to a quiet collapsible at the bottom.

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Link as LinkIcon,
  ShieldCheck, Sparkles, FileText, AlertOctagon, ExternalLink, UserCircle2,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

type Health = {
  configured: boolean;
  ok?: boolean;
  error?: string;
  account?: string;
  base_url?: string;
  project?: string;
} | null;

type Template = "detailed" | "brief" | "critical";

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
  setJiraID: (v: string) => void;
  jiraLink: string;
  setJiraLink: (v: string) => void;
  autoAttach: boolean;
  setAutoAttach: (v: boolean) => void;
  commentTemplate?: Template;
  setCommentTemplate?: (v: Template) => void;
  health: Health;
  onRefreshHealth: () => void;
  createdBy?: string;
  setCreatedBy?: (v: string) => void;
};

const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

export function JiraSection({
  jiraID, setJiraID, jiraLink, setJiraLink,
  autoAttach, setAutoAttach,
  commentTemplate, setCommentTemplate,
  health, onRefreshHealth,
  createdBy, setCreatedBy,
}: Props) {
  const [advanced, setAdvanced] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<Template>("detailed");
  const tpl = commentTemplate ?? localTemplate;
  const setTpl = setCommentTemplate ?? setLocalTemplate;

  // ── Live issue lookup state (inlined; replaces the bubble component) ──
  const [issue, setIssue] = useState<IssueInfo | null>(null);
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);

  const trimmedID = jiraID.trim().toUpperCase();
  const idValid = KEY_RE.test(trimmedID);

  // Debounced lookup — 450 ms after the last keystroke.
  useEffect(() => {
    if (!health?.configured || !health?.ok) {
      setIssue(null); setIssueErr(null); return;
    }
    if (!idValid) {
      setIssue(null); setIssueErr(null); return;
    }
    let cancel = false;
    const t = setTimeout(async () => {
      setIssueLoading(true); setIssueErr(null);
      try {
        const i = await api.jiraLookupIssue(trimmedID);
        if (cancel) return;
        setIssue(i);
        // Auto-fill the link if it's empty.
        if (i?.url && !jiraLink.trim()) setJiraLink(i.url);
        // Silent operator name auto-fill if empty.
        if (i?.assignee_name && setCreatedBy && !createdBy?.trim()) {
          setCreatedBy(i.assignee_name);
        }
      } catch (e: any) {
        if (cancel) return;
        setIssue(null);
        setIssueErr(e?.message || "Lookup failed");
      } finally {
        if (!cancel) setIssueLoading(false);
      }
    }, 450);
    return () => { cancel = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedID, idValid, health?.configured, health?.ok]);

  // ── Validation reasons ────────────────────────────────────────────────
  const healthReason: string =
    !health             ? "Checking Jira connection…" :
    !health.configured  ? "Set CH_JIRA_* env vars on the server, then restart" :
    !health.ok          ? `Connection check failed: ${health.error || "unknown error"}` :
                          "";
  const idReason: string =
    !trimmedID ? "Enter a Jira ticket ID first" :
    !idValid   ? `"${trimmedID}" doesn't look like a Jira key (expected PROJ-1234)` :
                 "";
  const blocked = !!healthReason || !!idReason;
  const reason = healthReason || idReason;
  const active = autoAttach && !blocked;

  return (
    <section className="card p-0 overflow-hidden ring-1 ring-bg-border">
      {/* ── Jira-blue header strip ─────────────────────────────────── */}
      <div className="flex items-start gap-3 px-5 py-3.5 bg-gradient-to-r from-[#0052CC]/15 via-[#2684FF]/10 to-transparent border-b border-bg-border flex-wrap">
        <JiraMark />
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">Jira integration</div>
          <div className="text-[11px] text-ink-muted">
            Attach the report PDF + an assignee-tagged summary comment to your ticket.
          </div>
        </div>
        <ConnectionPill health={health} onRefresh={onRefreshHealth} />
      </div>

      {/* ── Top row: ID input  +  auto-attach toggle  ──────────────── */}
      <div className="px-5 pt-5 grid lg:grid-cols-[1fr_auto] gap-4 items-end">
        <div>
          <label className="label flex items-center gap-1.5">
            Jira ticket ID <span className="text-bad">*</span>
            <span className="ml-auto text-[10px] text-ink-dim font-mono uppercase tracking-wider">
              format: PROJ-1234
            </span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#2684FF]/80">
              <LinkIcon className="w-4 h-4" />
            </span>
            <input
              className={`input w-full pl-9 pr-24 font-mono text-base py-3 tracking-wider uppercase
                ${idValid
                  ? "ring-2 ring-[#2684FF]/40 focus:ring-[#2684FF]/70"
                  : trimmedID
                    ? "ring-2 ring-warn/40"
                    : ""}`}
              value={jiraID}
              onChange={(e) => setJiraID(e.target.value.toUpperCase())}
              placeholder="LMS-975"
              spellCheck={false}
              autoCapitalize="characters"
            />
            {idValid && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-good">
                <CheckCircle2 className="w-3.5 h-3.5" /> valid
              </span>
            )}
          </div>
          {trimmedID && !idValid && (
            <p className="mt-1.5 text-[11px] text-warn flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Expected something like <code className="font-mono">CT-1234</code>.
            </p>
          )}
        </div>

        {/* Big auto-attach card — co-located with the ID input */}
        <button
          type="button"
          onClick={() => {
            if (blocked) {
              toast.error(reason, { id: "jira-toggle", duration: 4500 });
              return;
            }
            setAutoAttach(!autoAttach);
          }}
          className={`relative w-full lg:w-[260px] text-left p-3 rounded-xl ring-1 transition flex items-center gap-3
            ${active
              ? "ring-[#2684FF]/60 bg-gradient-to-br from-[#2684FF]/[.12] to-[#0052CC]/[.10] shadow-md shadow-[#0052CC]/15"
              : blocked
                ? "ring-warn/30 bg-warn/[.04] cursor-not-allowed"
                : "ring-bg-border bg-bg-card/40 hover:ring-[#2684FF]/40"}`}
          aria-pressed={active}
        >
          <Toggle on={active} blocked={blocked} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-ink-dim">
              Auto-attach
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5">
              {active ? "On" : blocked ? "Blocked" : "Off"}
              {active && idValid && (
                <span className="text-[#9bbcff] font-mono text-xs">→ {trimmedID}</span>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Validation banner — only when toggle is blocked + something is typed */}
      {blocked && trimmedID && (
        <div className="mx-5 mt-3 p-2 rounded-lg ring-1 ring-warn/30 bg-warn/[.05] text-[11px] text-warn flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{reason}</span>
        </div>
      )}

      {/* ── Issue card — full-width when an issue resolves ──────────── */}
      <div className="px-5 pt-4">
        {issueLoading && (
          <div className="px-3 py-2 rounded-lg ring-1 ring-bg-border bg-bg-card/40 text-[11px] text-ink-muted inline-flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-[#2684FF]" /> Looking up {trimmedID}…
          </div>
        )}
        {issueErr && !issueLoading && (
          <div className="px-3 py-2 rounded-lg ring-1 ring-warn/30 bg-warn/[.06] text-[11px] text-warn inline-flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> {issueErr}
          </div>
        )}
        {issue && !issueLoading && !issueErr && (
          <IssueCard issue={issue} createdBy={createdBy} setCreatedBy={setCreatedBy} />
        )}
      </div>

      {/* ── Bottom row: comment template selector ───────────────────── */}
      <div className="px-5 pt-5 pb-5 space-y-3">
        <div>
          <div className="label flex items-center gap-1.5">
            Comment template
            <span className="ml-auto text-[10px] text-ink-dim font-mono uppercase tracking-wider">
              what gets posted
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <TemplateChip
              value="detailed" current={tpl} onChange={setTpl}
              Icon={FileText} title="Detailed"
              desc="Wiki table + verdict"
            />
            <TemplateChip
              value="brief" current={tpl} onChange={setTpl}
              Icon={Sparkles} title="Brief"
              desc="One-liner + PDF link"
            />
            <TemplateChip
              value="critical" current={tpl} onChange={setTpl}
              Icon={AlertOctagon} title="Critical / urgent"
              desc="Red callout for regressions"
            />
          </div>
        </div>

        {/* Advanced — collapsible link override */}
        <div>
          <button
            type="button"
            onClick={() => setAdvanced(a => !a)}
            className="text-[11px] text-ink-muted hover:text-ink inline-flex items-center gap-1"
          >
            {advanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Custom Jira link override
          </button>
          {advanced && (
            <div className="mt-2">
              <input
                className="input w-full font-mono text-xs"
                value={jiraLink}
                onChange={(e) => setJiraLink(e.target.value)}
                placeholder="https://your-org.atlassian.net/browse/CT-1234"
              />
              <p className="mt-1 text-[10px] text-ink-dim">
                Auto-filled from the live issue lookup. Override only if your team uses a custom URL alias.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────
function IssueCard({
  issue, createdBy, setCreatedBy,
}: {
  issue: IssueInfo;
  createdBy?: string;
  setCreatedBy?: (v: string) => void;
}) {
  const statusTone = statusClass(issue.status);
  const showSyncOperator = !!(
    setCreatedBy &&
    issue.assignee_name &&
    createdBy &&
    createdBy.trim().toLowerCase() !== issue.assignee_name.trim().toLowerCase()
  );

  return (
    <div className="rounded-xl ring-1 ring-[#2684FF]/30 bg-gradient-to-r from-[#2684FF]/[.06] to-transparent p-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        {issue.assignee_avatar ? (
          <img
            src={issue.assignee_avatar}
            alt={issue.assignee_name || "assignee"}
            className="w-12 h-12 rounded-full ring-2 ring-[#2684FF]/40 shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-bg-card grid place-items-center ring-2 ring-bg-border shrink-0 text-ink-muted">
            <UserCircle2 className="w-6 h-6" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Key + pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={issue.url} target="_blank" rel="noopener"
              className="text-sm font-bold font-mono text-[#9bbcff] hover:underline inline-flex items-center gap-1"
              title="Open in Jira"
            >
              {issue.key} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {issue.issue_type && (
              <span className="pill ring-1 text-[10px] bg-bg-card ring-bg-border text-ink-muted uppercase tracking-wider">
                {issue.issue_type}
              </span>
            )}
            {issue.status && (
              <span className={`pill ring-1 text-[10px] uppercase tracking-wider ${statusTone}`}>
                {issue.status}
              </span>
            )}
            {issue.priority && (
              <span className="pill ring-1 text-[10px] bg-bg-card ring-bg-border text-ink-muted">
                {issue.priority}
              </span>
            )}
          </div>

          {/* Summary */}
          {issue.summary && (
            <div className="text-sm text-ink mt-1.5 leading-snug" title={issue.summary}>
              {issue.summary}
            </div>
          )}

          {/* Assignee row */}
          <div className="text-[11px] mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-ink-dim">Assignee:</span>
            {issue.assignee_name ? (
              <>
                <span className="text-ink font-bold">{issue.assignee_name}</span>
                {issue.assignee_email && (
                  <span className="text-ink-dim font-mono">· {issue.assignee_email}</span>
                )}
                <span className="pill ring-1 text-[9px] bg-good/10 text-good ring-good/30 uppercase tracking-wider ml-1">
                  will be tagged
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
            {showSyncOperator && (
              <button
                type="button"
                onClick={() => setCreatedBy?.(issue.assignee_name!)}
                className="ml-auto pill ring-1 text-[10px] bg-[#2684FF]/15 text-[#9bbcff] ring-[#2684FF]/30 hover:bg-[#2684FF]/25 inline-flex items-center gap-1"
                title="Replace the operator-name field with the assignee"
              >
                <Sparkles className="w-3 h-3" /> Use as operator
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateChip({
  value, current, onChange, Icon, title, desc,
}: {
  value: Template; current: Template; onChange: (v: Template) => void;
  Icon: any; title: string; desc: string;
}) {
  const active = current === value;
  const isCritical = value === "critical";
  const tone =
    !active
      ? "ring-bg-border bg-bg-card/30 hover:ring-[#2684FF]/30"
      : isCritical
        ? "ring-bad/50 bg-bad/[.08] shadow-md shadow-bad/10"
        : "ring-[#2684FF]/50 bg-[#2684FF]/[.10] shadow-md shadow-[#0052CC]/10";
  const iconTone = isCritical ? "text-bad" : active ? "text-[#9bbcff]" : "text-[#2684FF]/70";

  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={active}
      className={`relative p-3 rounded-lg ring-1 transition flex items-start gap-2.5 text-left ${tone}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconTone}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold flex items-center gap-1.5">
          {title}
          {active && <CheckCircle2 className="w-3 h-3 text-good" />}
        </div>
        <div className="text-[11px] text-ink-muted mt-0.5 leading-snug">{desc}</div>
      </div>
    </button>
  );
}

function JiraMark() {
  return (
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0052CC] to-[#2684FF] grid place-items-center shrink-0 shadow-md shadow-[#0052CC]/30">
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor" aria-hidden>
        <path d="M11.53 2L2 11.53a.6.6 0 000 .85l9.53 9.54a.6.6 0 00.85 0l4.84-4.84-3.42-3.41a4.18 4.18 0 010-5.93L11.53 2zm9.95 9.16L17.06 6.74a4.17 4.17 0 010 5.92l5.25 5.26a.6.6 0 00.85 0l-1.68-6.76a.6.6 0 000-.85.6.6 0 00.0 0z"/>
      </svg>
    </div>
  );
}

function ConnectionPill({ health, onRefresh }: { health: Health; onRefresh: () => void }) {
  if (!health) {
    return (
      <span className="pill ring-1 text-[10px] bg-bg-card ring-bg-border text-ink-muted inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-pulse" /> checking…
      </span>
    );
  }
  if (!health.configured) {
    return (
      <button onClick={onRefresh}
        className="pill ring-1 text-[10px] bg-warn/15 text-warn ring-warn/30 inline-flex items-center gap-1.5 hover:bg-warn/25 whitespace-nowrap"
        title="Click to re-probe"
      >
        <AlertTriangle className="w-3 h-3" /> not configured
      </button>
    );
  }
  if (!health.ok) {
    return (
      <button onClick={onRefresh}
        className="pill ring-1 text-[10px] bg-bad/15 text-bad ring-bad/30 inline-flex items-center gap-1.5 hover:bg-bad/25 whitespace-nowrap"
        title={health.error || "Click to re-probe"}
      >
        <AlertTriangle className="w-3 h-3" /> health failed
      </button>
    );
  }
  return (
    <span
      className="pill ring-1 text-[10px] bg-good/10 text-good ring-good/30 inline-flex items-center gap-1.5 whitespace-nowrap"
      title={health.account ? `Connected as ${health.account}` : "Connected"}
    >
      <ShieldCheck className="w-3 h-3" /> Connected
      {health.account && (
        <span className="hidden sm:inline text-good/80 font-medium truncate max-w-[180px]">
          · {health.account}
        </span>
      )}
    </span>
  );
}

function Toggle({ on, blocked }: { on: boolean; blocked: boolean }) {
  return (
    <span
      role="presentation"
      className={`relative shrink-0 inline-block w-12 h-6 rounded-full transition
        ${on
          ? "bg-gradient-to-r from-[#0052CC] to-[#2684FF] shadow-inner shadow-black/30"
          : blocked
            ? "bg-warn/20 ring-1 ring-warn/30"
            : "bg-bg-card ring-1 ring-bg-border"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all
          ${on ? "translate-x-6 bg-white" : "translate-x-0 bg-ink-muted/80"}`}
      />
    </span>
  );
}

function statusClass(status?: string): string {
  if (!status) return "bg-bg-card ring-bg-border text-ink-muted";
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved"))
    return "bg-good/15 text-good ring-good/30";
  if (s.includes("progress") || s.includes("review") || s.includes("test"))
    return "bg-[#2684FF]/15 text-[#9bbcff] ring-[#2684FF]/30";
  if (s.includes("block") || s.includes("hold"))
    return "bg-bad/15 text-bad ring-bad/30";
  if (s.includes("todo") || s.includes("open") || s.includes("backlog"))
    return "bg-bg-card ring-bg-border text-ink";
  return "bg-warn/10 text-warn ring-warn/30";
}
