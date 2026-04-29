// JiraSection — first-class Jira integration card, designed for the
// full-width row of the test builder (the cramped right-sidebar version
// kept wrapping the connection pill and squeezing the toggle).
//
// Layout (lg+):
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ [J]  Jira integration                       ● Connected · Gaurav │
//   │      Attach the report PDF + comment to your ticket.             │
//   ├──────────────────────────────────────────────────────────────────┤
//   │ JIRA TICKET ID                  ┃   COMMENT TEMPLATE             │
//   │ ┌────────────────────────────┐  ┃   ○ Detailed (default)         │
//   │ │ 🔗 CT-1234         ✓ valid │  ┃   ○ Brief                      │
//   │ └────────────────────────────┘  ┃   ○ Critical / urgent          │
//   │ [live issue preview card]       ┃                                │
//   │                                 ┃   ┌─────────────────────────┐  │
//   │                                 ┃   │ ●━━━ Auto-attach toggle │  │
//   │                                 ┃   │       on  → CT-1234     │  │
//   │                                 ┃   └─────────────────────────┘  │
//   │                                 ┃   ▸ Advanced (link override)   │
//   └──────────────────────────────────────────────────────────────────┘
//
// On smaller screens the columns stack vertically.

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Link as LinkIcon,
  ShieldCheck, Sparkles, FileText, AlertOctagon, Send, Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { JiraIssuePreview } from "../ui/JiraIssuePreview";

type Health = {
  configured: boolean;
  ok?: boolean;
  error?: string;
  account?: string;
  base_url?: string;
  project?: string;
} | null;

type Template = "detailed" | "brief" | "critical";

type Props = {
  jiraID: string;
  setJiraID: (v: string) => void;
  jiraLink: string;
  setJiraLink: (v: string) => void;
  autoAttach: boolean;
  setAutoAttach: (v: boolean) => void;
  // commentTemplate is optional — parent can pass it or leave it stateful here
  commentTemplate?: Template;
  setCommentTemplate?: (v: Template) => void;
  health: Health;
  onRefreshHealth: () => void;
};

const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

export function JiraSection({
  jiraID, setJiraID, jiraLink, setJiraLink,
  autoAttach, setAutoAttach,
  commentTemplate, setCommentTemplate,
  health, onRefreshHealth,
}: Props) {
  const [advanced, setAdvanced] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<Template>("detailed");
  const tpl = commentTemplate ?? localTemplate;
  const setTpl = setCommentTemplate ?? setLocalTemplate;

  const trimmedID = jiraID.trim().toUpperCase();
  const idValid = KEY_RE.test(trimmedID);

  const healthReason: string =
    !health             ? "Checking Jira connection…" :
    !health.configured  ? "Jira integration isn't configured on the server (set CH_JIRA_* env in .env, then restart)" :
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
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-[#0052CC]/15 via-[#2684FF]/10 to-transparent border-b border-bg-border">
        <JiraMark />
        <div className="leading-tight min-w-0">
          <div className="text-sm font-bold tracking-tight">Jira integration</div>
          <div className="text-[11px] text-ink-muted">Attach the report PDF + assignee-tagged comment to your ticket.</div>
        </div>
        <div className="flex-1" />
        <ConnectionPill health={health} onRefresh={onRefreshHealth} />
      </div>

      {/* ── Body — two columns at lg+ ──────────────────────────────── */}
      <div className="p-5 grid lg:grid-cols-[1.2fr_1fr] gap-6">
        {/* ── LEFT: ticket ID + live preview ──────────────────────── */}
        <div className="space-y-4">
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
                placeholder="CT-1234"
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
            {!trimmedID && (
              <p className="mt-1.5 text-[11px] text-ink-dim">
                Tip: paste the URL like <code className="font-mono">…/browse/CT-1234</code> — we'll extract the key.
              </p>
            )}
          </div>

          <JiraIssuePreview
            jiraID={jiraID}
            enabled={!!health?.configured && !!health?.ok}
            onResolved={(info) => {
              if (info?.url && !jiraLink.trim()) setJiraLink(info.url);
            }}
          />

          {/* Quick capabilities row — explains what auto-attach actually does. */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <CapabilityCard Icon={FileText}  label="PDF report"   desc="Full charts + percentile breakdown" />
            <CapabilityCard Icon={Send}      label="Tag assignee" desc="They get a Jira notification" />
            <CapabilityCard Icon={Eye}       label="Trail kept"   desc="Resend later from the report page" />
          </div>
        </div>

        {/* ── RIGHT: template + auto-attach toggle + advanced ──────── */}
        <div className="space-y-4 lg:border-l lg:border-bg-border/60 lg:pl-6">
          <div>
            <div className="label flex items-center gap-1.5">
              Comment template
              <span className="ml-auto text-[10px] text-ink-dim font-mono uppercase tracking-wider">
                what gets posted
              </span>
            </div>
            <div className="space-y-1.5">
              <TemplateOption
                value="detailed" current={tpl} onChange={setTpl}
                Icon={FileText} title="Detailed"
                desc="Wiki table with metrics + verdict + next steps. Default."
              />
              <TemplateOption
                value="brief" current={tpl} onChange={setTpl}
                Icon={Sparkles} title="Brief"
                desc="One-line summary + a link to the full PDF attachment."
              />
              <TemplateOption
                value="critical" current={tpl} onChange={setTpl}
                Icon={AlertOctagon} title="Critical / urgent"
                desc="Red-headed callout — use when the run discovered a regression."
              />
            </div>
          </div>

          {/* Auto-attach — proper toggle switch */}
          <button
            type="button"
            onClick={() => {
              if (blocked) {
                toast.error(reason, { id: "jira-toggle", duration: 4500 });
                return;
              }
              setAutoAttach(!autoAttach);
            }}
            className={`w-full text-left p-3.5 rounded-xl ring-1 transition flex items-start gap-3
              ${active
                ? "ring-[#2684FF]/50 bg-[#2684FF]/[.08] shadow-md shadow-[#0052CC]/10"
                : blocked
                  ? "ring-warn/30 bg-warn/[.04] cursor-not-allowed"
                  : "ring-bg-border bg-bg-card/40 hover:ring-[#2684FF]/40"}`}
            aria-pressed={active}
          >
            <Toggle on={active} blocked={blocked} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold flex items-center gap-2 flex-wrap">
                Auto-attach when finished
                <span className={`pill ring-1 text-[10px] uppercase tracking-wider
                  ${active
                    ? "bg-good/15 text-good ring-good/30"
                    : blocked
                      ? "bg-warn/15 text-warn ring-warn/30"
                      : "bg-bg-card ring-bg-border text-ink-muted"}`}>
                  {active ? "on" : blocked ? "blocked" : "off"}
                </span>
                {trimmedID && idValid && active && (
                  <span className="pill ring-1 text-[10px] bg-[#2684FF]/15 text-[#9bbcff] ring-[#2684FF]/30 ml-auto font-mono">
                    → {trimmedID}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">
                When the run reaches a terminal state, the PDF is uploaded and a
                {" "}{tpl === "brief" ? "one-line " : tpl === "critical" ? "critical-tone " : "wiki-formatted "}
                comment is posted that tags the issue's assignee.
              </p>
              {blocked && (
                <p className="mt-2 text-[11px] text-warn flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{reason}</span>
                </p>
              )}
            </div>
          </button>

          {/* Advanced — collapsible link override */}
          <div>
            <button
              type="button"
              onClick={() => setAdvanced(a => !a)}
              className="text-[11px] text-ink-muted hover:text-ink inline-flex items-center gap-1"
            >
              {advanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Advanced — custom Jira link override
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
      </div>
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────
function CapabilityCard({ Icon, label, desc }: { Icon: any; label: string; desc: string }) {
  return (
    <div className="rounded-lg ring-1 ring-bg-border bg-bg-card/30 p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-[#2684FF]" />
        <span className="font-bold text-ink">{label}</span>
      </div>
      <div className="text-ink-muted text-[10px] mt-0.5 leading-snug">{desc}</div>
    </div>
  );
}

function TemplateOption({
  value, current, onChange, Icon, title, desc,
}: {
  value: Template; current: Template; onChange: (v: Template) => void;
  Icon: any; title: string; desc: string;
}) {
  const active = current === value;
  const tone =
    value === "critical"
      ? active ? "ring-bad/50 bg-bad/[.08]" : "ring-bg-border hover:ring-bad/30"
      : active ? "ring-[#2684FF]/50 bg-[#2684FF]/[.08]" : "ring-bg-border hover:ring-[#2684FF]/30";
  const iconTone =
    value === "critical" ? "text-bad" : "text-[#2684FF]";
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`w-full text-left p-2.5 rounded-lg ring-1 transition flex items-start gap-2 ${tone}`}
      aria-pressed={active}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconTone}`} />
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
  // Compact pill — just the dot + state. Account name on hover only, so the
  // pill never wraps in narrow layouts.
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
        <span className="hidden sm:inline text-good/80 font-medium truncate max-w-[140px]">
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
      className={`relative shrink-0 inline-block w-11 h-6 rounded-full transition mt-0.5
        ${on
          ? "bg-gradient-to-r from-[#0052CC] to-[#2684FF]"
          : blocked
            ? "bg-warn/20 ring-1 ring-warn/30"
            : "bg-bg-card ring-1 ring-bg-border"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all
          ${on ? "translate-x-5 bg-white" : "translate-x-0 bg-ink-muted/80"}`}
      />
    </span>
  );
}
