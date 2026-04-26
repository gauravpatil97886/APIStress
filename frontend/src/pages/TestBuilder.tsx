import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ChevronRight, Clipboard, Hammer, Save, Sparkles,
} from "lucide-react";
import { api, getUser, setUser } from "../lib/api";
import { ENV_TAGS, ENV_LABEL } from "../components/ui/EnvPill";

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
  const [busy, setBusy] = useState(false);

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

  function importCurl() {
    if (!curlText.trim()) return toast.error("Paste a curl command first");
    // Minimal client-side feedback only; backend re-parses authoritatively.
    const m = curlText.match(/-X\s+(\w+)/i); if (m) setMethod(m[1].toUpperCase());
    const u = curlText.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
    if (u) setUrl(u[1]);
    toast.success("Imported — backend will re-parse on start");
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
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand" />Quick import: paste a curl</h2>
            <textarea value={curlText} onChange={(e) => setCurlText(e.target.value)}
              className="input w-full font-mono text-xs h-24"
              placeholder="curl -X POST 'https://api.example.com/v1/widgets' -H 'Authorization: Bearer …' -d '{...}'"/>
            <div className="mt-2 flex justify-end">
              <button onClick={importCurl} className="btn-secondary text-sm"><Clipboard className="w-4 h-4" />Import</button>
            </div>
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Request</h2>
            <div>
              <label className="label">Name</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
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
                <input className="input w-full font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/health" />
              </div>
            </div>
            <div>
              <label className="label">Headers (one per line: Key: Value)</label>
              <textarea className="input w-full font-mono text-xs h-20" value={headersText} onChange={(e) => setHeadersText(e.target.value)} />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea className="input w-full font-mono text-xs h-24" value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"foo": "bar"}'/>
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
              <label className="label">Jira ticket ID <span className="text-bad">*</span></label>
              <input className="input w-full font-mono" value={jiraID} onChange={(e) => setJiraID(e.target.value)} placeholder="CT-1234" />
            </div>
            <div>
              <label className="label">Jira link <span className="text-ink-dim normal-case font-normal">(optional)</span></label>
              <input className="input w-full font-mono text-xs" value={jiraLink} onChange={(e) => setJiraLink(e.target.value)} placeholder="https://your-org.atlassian.net/browse/CT-1234" />
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
    </div>
  );
}
