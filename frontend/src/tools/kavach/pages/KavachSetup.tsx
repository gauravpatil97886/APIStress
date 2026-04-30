// KavachSetup — paste curl, configure scan, type-the-hostname confirm,
// fire scan. The user's main interaction surface for starting a scan.

import { useEffect, useMemo, useState } from "react";
import { Shield, ArrowLeft, Loader2, AlertTriangle, Eye, Sparkles, Link as LinkIcon } from "lucide-react";
import toast from "react-hot-toast";
import { api, getUser, setUser } from "../../../platform/api/client";
import { parseCurl } from "../../../platform/api/curl";
import { JiraIssuePreview } from "../../../platform/components/jira/JiraIssuePreview";

type Props = {
  onScanStarted: (id: string) => void;
  onCancel: () => void;
};

type CategoryDef = { id: string; label: string; desc: string; count: number; soon?: boolean };
const CATEGORIES: CategoryDef[] = [
  { id: "transport",        label: "Browser safety headers",  desc: "HSTS, CSP, frame-options, CORS, server-header leak.", count: 6 },
  { id: "info_disclosure",  label: "Server leaks info",       desc: "Stack traces, .git/.env exposure, debug endpoints.",  count: 5 },
  { id: "injection",        label: "Hostile input + traversal + SSRF", desc: "SQLi (incl. boolean & time-blind), NoSQLi, command, SSTI, path traversal, SSRF, open redirect, HPP.", count: 10 },
  { id: "method_tampering", label: "Wrong verbs allowed",     desc: "OPTIONS / TRACE reveal, alternate-verb bypass, override-header smuggling.", count: 4 },
];

export function KavachSetup({ onScanStarted, onCancel }: Props) {
  const [curlText, setCurlText] = useState("");
  const [createdBy, setCreatedBy] = useState(getUser() || "");
  useEffect(() => { if (createdBy) setUser(createdBy); }, [createdBy]);
  const [jiraID, setJiraID] = useState("");
  const [jiraLink, setJiraLink] = useState("");
  const [notes, setNotes] = useState("");
  const [jiraConfigured, setJiraConfigured] = useState(false);
  useEffect(() => {
    api.jiraHealth().then(h => setJiraConfigured(!!h.configured && !!h.ok)).catch(() => {});
  }, []);
  // Smart paste — extract issue key from a pasted Jira URL.
  function setJiraIDSmart(raw: string) {
    const v = raw.trim();
    const urlMatch = v.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (urlMatch) {
      setJiraID(urlMatch[1].toUpperCase());
      if (!jiraLink.trim()) setJiraLink(v);
      return;
    }
    setJiraID(v.toUpperCase());
  }

  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    transport: true,
    info_disclosure: true,
    injection: true,
    method_tampering: true,
  });
  const [rateLimit, setRateLimit] = useState(5);
  const [maxDurationMin, setMaxDurationMin] = useState(5);

  const [confirmHost, setConfirmHost] = useState("");
  const [busy, setBusy] = useState(false);

  // Live-derive the parsed target from the curl box.
  const parsed = useMemo(() => {
    const txt = curlText.trim();
    if (!txt) return null;
    try {
      const p = parseCurl(txt);
      const u = p.url ? new URL(p.url) : null;
      return { method: p.method, url: p.url, headers: p.headers, body: p.body, host: u?.hostname || "" };
    } catch {
      return null;
    }
  }, [curlText]);

  const hostMismatch = !!parsed?.host && confirmHost.trim().toLowerCase() !== parsed.host.toLowerCase();
  const enabledCats = Object.entries(enabled).filter(([, v]) => v).map(([k]) => k);
  const canRun = !!parsed?.url && !!parsed?.host && !hostMismatch && enabledCats.length > 0 && !!createdBy.trim() && !busy;

  async function start() {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await api.kavach.startScan({
        curl: curlText.trim(),
        created_by: createdBy.trim(),
        jira_id: jiraID.trim() || undefined,
        jira_link: jiraLink.trim() || undefined,
        notes: notes.trim() || undefined,
        categories: enabledCats,
        rate_limit_rps: rateLimit,
        max_duration_sec: maxDurationMin * 60,
        confirm_hostname: confirmHost.trim(),
      });
      api.logActivity({
        event_type: "feature.kavach.scan.start",
        tool_slug: "kavach",
        resource_type: "scan",
        resource_id: res.scan_id,
        actor_name: createdBy,
        meta: { host: parsed.host, categories: enabledCats },
      });
      toast.success("Scan started");
      onScanStarted(res.scan_id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to start scan", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <button
        onClick={onCancel}
        className="text-xs text-ink-muted hover:text-cyan-200 inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to overview
      </button>

      <header className="text-center pt-2">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80 font-mono inline-flex items-center gap-2 mb-2">
          <Sparkles className="w-3 h-3" /> NEW SCAN
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          Configure your <span className="text-cyan-300">security scan</span>
        </h1>
        <p className="text-ink-muted mt-1.5 text-sm">
          Paste an API request, pick which categories to test, and type the hostname to confirm.
        </p>
      </header>

      {/* Step 1: paste curl */}
      <section className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/20">
        <div className="flex items-center gap-2 mb-3">
          <Step n={1} />
          <h2 className="text-sm font-bold">Paste your API request</h2>
          {parsed && (
            <span className="ml-auto pill ring-1 text-[10px] bg-good/10 text-good ring-good/30 font-mono inline-flex items-center gap-1">
              ✓ parsed · {parsed.method} · {parsed.host}
            </span>
          )}
        </div>
        <textarea
          value={curlText}
          onChange={(e) => setCurlText(e.target.value)}
          placeholder={`curl -X GET 'https://api.example.com/v1/users' \\\n  -H 'Authorization: Bearer …' \\\n  -H 'Content-Type: application/json'`}
          spellCheck={false}
          className="input w-full font-mono text-xs h-36 resize-y"
        />
        {parsed && (
          <div className="mt-3 p-3 rounded-lg ring-1 ring-bg-border bg-bg-card/40 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1.5 inline-flex items-center gap-1">
              <Eye className="w-3 h-3" /> What we'll scan
            </div>
            <div className="font-mono text-ink break-all">
              <span className="text-cyan-300">{parsed.method}</span>{" "}
              {parsed.url}
            </div>
            {Object.keys(parsed.headers || {}).length > 0 && (
              <div className="mt-1.5 text-ink-muted text-[11px]">
                {Object.keys(parsed.headers).length} header{Object.keys(parsed.headers).length === 1 ? "" : "s"}{" "}
                · auth header is sent as-is so authenticated routes are tested
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 2: categories */}
      <section className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/20">
        <div className="flex items-center gap-2 mb-3">
          <Step n={2} />
          <h2 className="text-sm font-bold">What should we test?</h2>
          <span className="ml-auto text-[10px] text-ink-dim font-mono uppercase tracking-wider">
            {enabledCats.length} of {CATEGORIES.length} enabled
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const on = !!enabled[c.id] && !c.soon;
            return (
              <button
                key={c.id}
                type="button"
                disabled={c.soon}
                onClick={() => setEnabled((s) => ({ ...s, [c.id]: !s[c.id] }))}
                className={`text-left p-3 rounded-xl ring-1 transition flex items-start gap-3
                  ${c.soon ? "ring-bg-border bg-bg-card/30 opacity-50 cursor-not-allowed"
                    : on
                      ? "ring-cyan-500/50 bg-cyan-500/[.10] shadow-md shadow-teal-900/20"
                      : "ring-bg-border bg-bg-card/40 hover:ring-cyan-500/40"}`}
              >
                <span className={`w-5 h-5 rounded-md grid place-items-center shrink-0 mt-0.5 transition ring-1
                  ${on ? "bg-cyan-500 ring-cyan-400 text-white" : "ring-bg-border bg-bg-card text-transparent"}`}>
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold flex items-center gap-2 flex-wrap">
                    {c.label}
                    {c.soon && <span className="pill ring-1 text-[9px] bg-bg-card ring-bg-border text-ink-dim font-mono uppercase tracking-wider">v2</span>}
                    {!c.soon && <span className="text-[10px] text-ink-dim font-mono">{c.count} checks</span>}
                  </div>
                  <div className="text-[12px] text-ink-muted mt-0.5">{c.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 3: safety + run */}
      <section className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/20">
        <div className="flex items-center gap-2 mb-4">
          <Step n={3} />
          <h2 className="text-sm font-bold">Confirm and run</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <label className="label">Your name <span className="text-bad">*</span></label>
              <input
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="e.g. Aisha Khan"
                className="input w-full text-sm"
              />
              <div className="text-[11px] text-ink-dim mt-1">Shown on the report and any Jira tickets you file.</div>
            </div>
            <div>
              <label className="label">Jira ticket ID <span className="text-ink-dim normal-case font-normal">(optional)</span></label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/80">
                  <LinkIcon className="w-3.5 h-3.5" />
                </span>
                <input
                  value={jiraID}
                  onChange={(e) => setJiraIDSmart(e.target.value)}
                  placeholder="CT-1234 or paste a /browse/ URL"
                  spellCheck={false}
                  autoCapitalize="characters"
                  className="input w-full text-sm pl-8 font-mono uppercase tracking-wider"
                />
              </div>
              {jiraID.trim() && jiraConfigured && (
                <JiraIssuePreview
                  jiraID={jiraID}
                  enabled={jiraConfigured}
                  onResolved={(info) => {
                    if (info?.url && !jiraLink.trim()) setJiraLink(info.url);
                    if (info?.assignee_name && !createdBy.trim()) setCreatedBy(info.assignee_name);
                  }}
                />
              )}
            </div>
            <div>
              <label className="label">Notes <span className="text-ink-dim normal-case font-normal">(optional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What you're testing, why, anything reviewers should know."
                className="input w-full text-xs h-16 resize-y"
              />
            </div>
            <div>
              <label className="label">Rate limit ({rateLimit} rps)</label>
              <input
                type="range" min={1} max={50} step={1}
                value={rateLimit} onChange={(e) => setRateLimit(+e.target.value)}
                className="w-full accent-cyan-500"
              />
              <div className="flex items-center justify-between text-[10px] text-ink-dim font-mono">
                <span>1 rps (gentle)</span><span>50 rps (max)</span>
              </div>
            </div>
            <div>
              <label className="label">Max duration ({maxDurationMin} min)</label>
              <input
                type="range" min={1} max={30} step={1}
                value={maxDurationMin} onChange={(e) => setMaxDurationMin(+e.target.value)}
                className="w-full accent-cyan-500"
              />
              <div className="flex items-center justify-between text-[10px] text-ink-dim font-mono">
                <span>1 min</span><span>30 min (max)</span>
              </div>
            </div>
          </div>

          {/* Confirm-host gate */}
          <div className="rounded-xl ring-1 ring-amber-500/30 bg-amber-500/[.05] p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-ink leading-relaxed">
                <strong className="text-amber-300">Confirm hostname.</strong> Kavach fires real attacks at the target.
                To prevent accidents, type the hostname exactly to enable the Run button.
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Target host</div>
            <div className="font-mono text-base p-2 rounded bg-bg-card ring-1 ring-bg-border mb-3 select-all">
              {parsed?.host || <span className="text-ink-dim">paste a curl above…</span>}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Type to confirm</div>
            <input
              value={confirmHost}
              onChange={(e) => setConfirmHost(e.target.value)}
              placeholder={parsed?.host || "host"}
              spellCheck={false}
              autoCapitalize="none"
              disabled={!parsed}
              className={`input w-full font-mono text-sm
                ${!parsed ? "opacity-50" :
                  hostMismatch ? "ring-2 ring-warn/40" :
                  "ring-2 ring-good/40"}`}
            />
            {parsed && hostMismatch && confirmHost && (
              <div className="text-[11px] text-warn mt-1.5">Doesn't match — type the hostname exactly.</div>
            )}
            {parsed && !hostMismatch && confirmHost && (
              <div className="text-[11px] text-good mt-1.5">✓ Match — Run button is unlocked.</div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={onCancel} className="btn-ghost text-sm flex-1">Cancel</button>
          <button
            onClick={start}
            disabled={!canRun}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold flex-1
                       bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-teal-900/40
                       hover:from-cyan-500 hover:to-teal-500 transition
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:from-bg-card disabled:to-bg-card disabled:shadow-none"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
              : <><Shield className="w-4 h-4" /> Run security scan</>}
          </button>
        </div>
      </section>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="w-6 h-6 rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/40 grid place-items-center font-mono text-xs text-cyan-200 font-bold">
      {n}
    </span>
  );
}
