import { useEffect, useRef, useState, RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ChevronRight, Clipboard, Hammer, Save, Sparkles, Send,
} from "lucide-react";
import { api, getUser, setUser } from "../lib/api";
import { ENV_TAGS, ENV_LABEL } from "../components/ui/EnvPill";
import { CostInputsPanel, type CostInputs } from "../components/builder/CostInputs";
import { JiraSection } from "../components/builder/JiraSection";
import { parseCurl, prettyJSON, headersToText, suggestName } from "../lib/curl";

const PATTERNS = [
  { v: "constant", label: "Constant", desc: "Hold N VUs for the whole duration." },
  { v: "ramp",     label: "Ramp Up",  desc: "Linearly grow from 0 to N." },
  { v: "spike",    label: "Spike",    desc: "Warm up, jump to N, fall back." },
];

const PROTOCOLS = [
  { v: "http", label: "HTTP/REST" },
  { v: "websocket", label: "WebSocket" },
];

export default function TestBuilder() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const fromRun = params.get("from");
  const [name, setName] = useState("Untitled load test");
  const [protocol, setProtocol] = useState("http");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [body, setBody] = useState("");
  const [vus, setVus] = useState(20);
  const [duration, setDuration] = useState(30);
  const [pattern, setPattern] = useState("constant");
  const [thinkMs, setThinkMs] = useState(0);
  const [curlText, setCurlText] = useState("");

  const [createdBy, setCreatedBy] = useState(getUser());
  const [jiraID, setJiraID] = useState("");
  const [jiraLink, setJiraLink] = useState("");
  const [notes, setNotes] = useState("");
  const [envTag, setEnvTag] = useState<string>("");
  const [costInputs, setCostInputs] = useState<CostInputs>({});
  // When true, the backend auto-attaches the PDF to the Jira ticket once
  // the run finishes. Persisted to localStorage so the user's preference
  // sticks across sessions.
  // Auto-attach is *opt-in per session* — defaults to OFF every time the
  // user opens the test builder, even if they ticked it for a previous run.
  // Posting a load report to Jira is a meaningful side-effect, so we want
  // an explicit choice each time rather than a sticky preference.
  const [autoAttachJira, setAutoAttachJira] = useState<boolean>(false);
  // Clear any previous sticky preference once, so users coming back after
  // an upgrade don't carry stale "on" state.
  useEffect(() => { localStorage.removeItem("ch_auto_attach_jira"); }, []);
  // Comment template selection — persisted so the user's last choice sticks.
  const [jiraCommentTemplate, setJiraCommentTemplate] = useState<"detailed" | "brief" | "critical">(
    () => (localStorage.getItem("ch_jira_template") as any) || "detailed"
  );
  useEffect(() => {
    localStorage.setItem("ch_jira_template", jiraCommentTemplate);
  }, [jiraCommentTemplate]);

  // Friendlier setter: lets the user paste a full Jira URL and we'll extract
  // the issue key. Saves the "Tip: paste …/browse/CT-1234" promise from the
  // section we wrote.
  function setJiraIDSmart(raw: string) {
    const v = raw.trim();
    const urlMatch = v.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (urlMatch) {
      setJiraID(urlMatch[1].toUpperCase());
      // Auto-fill the link too if user pasted a URL.
      if (!jiraLink.trim()) setJiraLink(v);
      return;
    }
    setJiraID(v.toUpperCase());
  }
  // Track the full health response so we can tell the user *why* the
  // integration is unavailable (not configured vs. configured-but-probe-
  // failed vs. just stale cache from before the backend restart).
  const [jiraHealth, setJiraHealth] = useState<{
    configured: boolean; ok?: boolean; error?: string; account?: string;
  } | null>(null);
  const jiraConfigured = !!jiraHealth?.configured && !!jiraHealth?.ok;
  function refreshJiraHealth() {
    api.jiraHealth().then(setJiraHealth).catch(() => setJiraHealth({ configured: false }));
  }
  useEffect(() => {
    refreshJiraHealth();
    // Re-probe when the tab regains focus — fixes "I restarted the backend
    // and the UI still says not configured" without a hard refresh.
    const onFocus = () => refreshJiraHealth();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const [busy, setBusy] = useState(false);
  const [importFlash, setImportFlash] = useState(false);
  const requestSectionRef: RefObject<HTMLElement> = useRef(null);

  useEffect(() => { if (createdBy) setUser(createdBy); }, [createdBy]);

  // Pre-fill from a previous run when ?from=<runId> is present.
  // Use a ref guard to avoid React-18 StrictMode double-firing in dev.
  const loadedRef = useRef<string>("");
  useEffect(() => {
    if (!fromRun || loadedRef.current === fromRun) return;
    loadedRef.current = fromRun;
    (async () => {
      try {
        const r = await api.runStatus(fromRun);
        const cfg = r.config || {};
        if (cfg.name) setName(`${cfg.name} (re-run)`);
        if (cfg.protocol) setProtocol(cfg.protocol);
        if (cfg.request?.method) setMethod(cfg.request.method);
        if (cfg.request?.url) setUrl(cfg.request.url);
        if (cfg.request?.headers) {
          setHeadersText(Object.entries(cfg.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n"));
        }
        if (cfg.request?.body) setBody(cfg.request.body);
        if (typeof cfg.vus === "number") setVus(cfg.vus);
        if (typeof cfg.duration_sec === "number") setDuration(cfg.duration_sec);
        if (cfg.pattern) setPattern(cfg.pattern);
        if (typeof cfg.think_time_ms === "number") setThinkMs(cfg.think_time_ms);
        if (r.jira_id) setJiraID(r.jira_id);
        if (r.jira_link) setJiraLink(r.jira_link);
        if (r.env_tag) setEnvTag(r.env_tag);
        if (r.notes) setNotes(`Re-run of ${fromRun.slice(0,8)}. ${r.notes || ""}`.trim());
        toast.success("Loaded config from previous run — adjust and start.");
      } catch (e: any) {
        toast.error(e.message || "Could not load previous run");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRun]);

  function importCurl(sourceOverride?: string) {
    const source = (sourceOverride ?? curlText).trim();
    if (!source) return toast.error("Paste a curl command first");
    try {
      const p = parseCurl(source);
      if (!p.url) return toast.error("Couldn't find a URL in that curl command.");
      setMethod(p.method);
      setUrl(p.url);
      setHeadersText(headersToText(p.headers));
      setBody(prettyJSON(p.body));
      // Auto-name only if user hasn't set a custom one already.
      if (name === "Untitled load test" || !name.trim()) {
        setName(p.suggestedName);
      }
      // Clear the curl box so the form is the source of truth from now on.
      setCurlText("");
      const headerCount = Object.keys(p.headers).length;
      const bytes = p.body ? new TextEncoder().encode(p.body).length : 0;
      toast.success(
        `Imported · ${p.method} · ${headerCount} header${headerCount === 1 ? "" : "s"}` +
        (bytes ? ` · ${bytes} B body` : "")
      );

      // Auto-scroll into the Request section + briefly flash a highlight ring.
      setTimeout(() => {
        requestSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setImportFlash(true);
        setTimeout(() => setImportFlash(false), 1600);
      }, 80);
    } catch (err: any) {
      toast.error(err.message || "Couldn't parse that curl command");
    }
  }

  // Auto-name when the URL changes and the user hasn't customised the name.
  function onURLBlur() {
    if (!url.trim()) return;
    if (!name.trim() || name === "Untitled load test" || name.endsWith("(re-run)")) {
      setName(suggestName(method, url));
    }
  }

  function addHeaderPreset(line: string) {
    const next = headersText.trim();
    setHeadersText(next ? next + "\n" + line : line);
    toast.success("Header added");
  }
  function prettyBody() {
    setBody(prettyJSON(body));
  }

  function parseHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    headersText.split(/\r?\n/).forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  async function start() {
    if (!createdBy.trim()) return toast.error("Please enter your name first.");
    if (!jiraID.trim()) return toast.error("Please enter the Jira ticket ID (e.g. CT-1234).");
    if (!envTag) return toast.error("Pick the environment you're hitting (Production / Broking / UAT).");
    if (!curlText.trim() && !url.trim()) return toast.error("Paste a curl command or fill in the target URL.");
    const finalURL = url.trim();
    if (!curlText.trim() && finalURL && !/^https?:\/\//i.test(finalURL) && !/^wss?:\/\//i.test(finalURL)) {
      return toast.error("URL must start with http://, https://, ws:// or wss://");
    }
    setBusy(true);
    try {
      const cfg = {
        name,
        protocol,
        request: {
          method, url,
          headers: parseHeaders(),
          body,
          timeout_ms: 30000,
        },
        vus, duration_sec: duration, pattern,
        think_time_ms: thinkMs,
      };
      const payload = {
        config: cfg,
        curl: curlText.trim() || undefined,
        created_by: createdBy.trim(),
        jira_id: jiraID.trim(),
        jira_link: jiraLink.trim(),
        notes: notes.trim(),
        env_tag: envTag,
        cost_inputs: costInputs.cloud ? costInputs : undefined,
        auto_attach_jira: autoAttachJira && jiraConfigured && !!jiraID.trim(),
        jira_comment_template: jiraCommentTemplate,
      };
      const { run_id } = await api.startRun(payload);
      toast.success("Load test started");
      nav(`/runs/${run_id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to start");
    } finally { setBusy(false); }
  }

  async function saveOnly() {
    if (!url.trim() && !curlText.trim()) return toast.error("URL required to save");
    try {
      await api.createTest({
        name, description: notes,
        config: {
          name, protocol,
          request: { method, url, headers: parseHeaders(), body, timeout_ms: 30000 },
          vus, duration_sec: duration, pattern, think_time_ms: thinkMs,
        },
      });
      toast.success("Test saved");
      nav("/tests");
    } catch (e: any) { toast.error(e.message || "Save failed"); }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">New Load Test</h1>
        <p className="text-ink-muted mt-1">Configure your test, attach a Jira ticket, and let it rip.</p>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          <section className="card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand" />
                Quick import: paste a curl
              </h2>
              <span className="text-[11px] text-ink-muted">
                We'll fill <b className="text-ink">URL · method · headers · body</b> below.
              </span>
            </div>
            <textarea
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              onPaste={(e) => {
                // Auto-import if user pastes a clean curl command directly.
                const t = e.clipboardData.getData("text").trim();
                if (t.startsWith("curl ")) {
                  e.preventDefault();
                  setCurlText(t);
                  // Pass the pasted text directly — state hasn't flushed yet.
                  importCurl(t);
                }
              }}
              className="input w-full font-mono text-xs h-24"
              placeholder="curl -X POST 'https://api.example.com/v1/widgets' -H 'Authorization: Bearer …' -d '{...}'"
            />
            <div className="mt-2 flex justify-end">
              <button onClick={() => importCurl()} className="btn-primary text-sm">
                <Clipboard className="w-4 h-4" />Import
              </button>
            </div>
          </section>

          <section
            ref={requestSectionRef}
            className={`card p-5 space-y-4 scroll-mt-24 transition-shadow duration-700
              ${importFlash ? "ring-2 ring-brand/60 shadow-2xl shadow-brand/30" : "ring-0"}`}
          >
            <h2 className="text-sm font-semibold">Request</h2>
            <div>
              <div className="flex items-end justify-between gap-2 mb-1.5">
                <label className="label !mb-0">Name</label>
                {url && (
                  <button
                    type="button"
                    onClick={() => setName(suggestName(method, url))}
                    className="text-[10px] uppercase tracking-wider text-brand hover:underline"
                    title="Auto-generate name from URL"
                  >
                    ↺ auto-name
                  </button>
                )}
              </div>
              <input
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-fills from URL — or type your own"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Protocol</label>
                <select className="input w-full" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                  {PROTOCOLS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Method</label>
                <select className="input w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {["GET","POST","PUT","PATCH","DELETE"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <label className="label">URL</label>
                <input
                  className="input w-full font-mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={onURLBlur}
                  placeholder="https://api.example.com/health"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="label !mb-0">
                  Headers
                  {headersText.trim() && (
                    <span className="ml-1.5 pill ring-1 ring-brand/30 bg-brand/10 text-brand text-[9px] font-mono">
                      {headersText.split(/\r?\n/).filter((l) => l.includes(":")).length}
                    </span>
                  )}
                </label>
                <div className="flex gap-1 flex-wrap">
                  <button type="button" onClick={() => addHeaderPreset("Authorization: Bearer ")}
                    className="text-[10px] uppercase tracking-wider text-ink-muted hover:text-brand px-2 py-1 rounded bg-bg-card ring-1 ring-bg-border">
                    + Bearer
                  </button>
                  <button type="button" onClick={() => addHeaderPreset("Content-Type: application/json")}
                    className="text-[10px] uppercase tracking-wider text-ink-muted hover:text-brand px-2 py-1 rounded bg-bg-card ring-1 ring-bg-border">
                    + JSON
                  </button>
                  <button type="button" onClick={() => addHeaderPreset("Accept: application/json")}
                    className="text-[10px] uppercase tracking-wider text-ink-muted hover:text-brand px-2 py-1 rounded bg-bg-card ring-1 ring-bg-border">
                    + Accept
                  </button>
                </div>
              </div>
              <textarea
                className="input w-full font-mono text-xs h-24"
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder="Key: Value (one per line)"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="label !mb-0">
                  Body
                  {body && (
                    <span className="ml-1.5 text-[10px] text-ink-muted font-mono">
                      {new TextEncoder().encode(body).length} B
                    </span>
                  )}
                </label>
                {body && (
                  <button type="button" onClick={prettyBody}
                    className="text-[10px] uppercase tracking-wider text-ink-muted hover:text-brand px-2 py-1 rounded bg-bg-card ring-1 ring-bg-border">
                    ↺ Format JSON
                  </button>
                )}
              </div>
              <textarea
                className="input w-full font-mono text-xs h-32"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"foo": "bar"}'
              />
            </div>
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Load profile</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Virtual Users</label>
                <input type="number" min={1} className="input w-full" value={vus} onChange={(e) => setVus(+e.target.value)} />
              </div>
              <div>
                <label className="label">Duration (s)</label>
                <input type="number" min={1} className="input w-full" value={duration} onChange={(e) => setDuration(+e.target.value)} />
              </div>
              <div>
                <label className="label">Think time (ms)</label>
                <input type="number" min={0} className="input w-full" value={thinkMs} onChange={(e) => setThinkMs(+e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Pattern</label>
              <div className="grid grid-cols-3 gap-3">
                {PATTERNS.map((p) => (
                  <motion.button
                    key={p.v}
                    whileHover={{ y: -2 }}
                    onClick={() => setPattern(p.v)}
                    type="button"
                    className={`text-left p-3 rounded-xl border transition
                      ${pattern === p.v ? "bg-brand/10 border-brand text-ink" : "bg-bg-card border-bg-border text-ink-muted hover:border-brand/40"}`}
                  >
                    <div className="font-semibold text-sm text-ink">{p.label}</div>
                    <div className="text-xs mt-1">{p.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Hammer className="w-4 h-4 text-brand" />Attribution (required)</h2>
            <p className="text-xs text-ink-muted -mt-2">These will appear at the top of the generated report.</p>
            <div>
              <label className="label">Your name <span className="text-bad">*</span></label>
              <input className="input w-full" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="e.g. Aisha Khan" />
            </div>
            <div>
              <label className="label">Environment <span className="text-bad">*</span></label>
              <div className="flex flex-col gap-2">
                {ENV_TAGS.map((t) => {
                  const subtitle =
                    t === "Production" ? "Live customer-facing servers"
                  : t === "Broking"    ? "Pre-production / staging"
                  :                      "User acceptance testing";
                  const tone =
                    t === "Production" ? { ring: "ring-bad",   text: "text-bad",   dot: "bg-bad",   bg: "bg-bad/[.08]" }
                  : t === "Broking"    ? { ring: "ring-warn",  text: "text-warn",  dot: "bg-warn",  bg: "bg-warn/[.08]" }
                  :                      { ring: "ring-blue-500", text: "text-blue-400", dot: "bg-blue-500", bg: "bg-blue-500/[.08]" };
                  const active = envTag === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEnvTag(t)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left
                        ${active
                          ? `${tone.bg} border-transparent ring-2 ${tone.ring}/50`
                          : "bg-bg-card border-bg-border hover:border-brand/40"}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? tone.dot : "bg-ink-dim"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-mono font-bold uppercase tracking-wider truncate
                                          ${active ? tone.text : "text-ink"}`}>
                          {ENV_LABEL[t]}
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5 truncate">{subtitle}</div>
                      </div>
                      {active && (
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${tone.text}`}>
                          ✓ Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input w-full text-xs h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </section>

          <section className="card p-5 space-y-3">
            <button onClick={start} disabled={busy} className="btn-primary w-full py-2.5">
              {busy ? "Starting…" : (<>Start load test <ChevronRight className="w-4 h-4" /></>)}
            </button>
            <button onClick={saveOnly} className="btn-secondary w-full">
              <Save className="w-4 h-4" />Save without running
            </button>
          </section>
        </aside>
      </div>

      {/* Jira integration — full-width row, much more breathing room than
          the cramped right sidebar. */}
      <JiraSection
        jiraID={jiraID}
        setJiraID={setJiraIDSmart}
        jiraLink={jiraLink}
        setJiraLink={setJiraLink}
        autoAttach={autoAttachJira}
        setAutoAttach={setAutoAttachJira}
        commentTemplate={jiraCommentTemplate}
        setCommentTemplate={setJiraCommentTemplate}
        health={jiraHealth}
        onRefreshHealth={refreshJiraHealth}
      />

      {/* Cost estimate spans full width below — needs the room */}
      <CostInputsPanel value={costInputs} onChange={setCostInputs} />
    </div>
  );
}
