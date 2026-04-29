// Runner.tsx — Postman-style data-driven runner for a single saved request.
//
// Designed to handle very large datasets (≥ several lakh rows):
//   - File parsing runs in a Web Worker (`./runner.worker?worker`) so the main
//     thread never blocks during XLSX/CSV/JSON decoding.
//   - The spreadsheet preview and results table are *virtualised* — only the
//     visible window of rows is rendered, so 5,00,000 rows costs the same as
//     50 rows in DOM weight.
//   - During a run, results are accumulated in a ref and flushed to React
//     state at most every ~250 ms. Per-iteration setState would degrade into
//     an O(n) re-sort on every step.
//   - We never materialise filtered row arrays for big datasets; iteration
//     walks the master `dataset.rows` and tests membership in `enabledRows`.
//
// Beyond what Postman's runner ships:
//   - Concurrency 1–10
//   - Built-in {{$macro}} helpers (uuid / now / randomEmail / randomInt / …)
//   - In-app spreadsheet viewer with row + column toggles
//   - Retry-failed-only after a partial run
//   - CSV export of results

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Square, Upload, Download, FileSpreadsheet, RefreshCw, Eye,
  CheckCircle2, XCircle, AlertCircle, ChevronRight, ChevronDown, X, Sparkles,
  Filter, RotateCcw, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
// Vite worker import — bundled separately, runs off the main thread.
// @ts-ignore — query suffix is a Vite-specific build pragma.
import RunnerWorker from "./runner.worker?worker";

type Row = Record<string, any>;

type Dataset = {
  sourceName: string;
  columns: string[];
  rows: Row[];
  // For .xlsx workbooks we keep the raw buffer so the user can switch sheets
  // by re-parsing instead of holding two copies of the data in memory.
  workbookBuffer?: ArrayBuffer;
  sheetNames?: string[];
  activeSheet?: string;
};

type PassRule =
  | { kind: "status_2xx" }
  | { kind: "status_eq"; value: number }
  | { kind: "status_range"; min: number; max: number };

type RunResult = {
  index: number;          // index into dataset.rows
  rowSnapshot: Row;
  status: number;
  ok: boolean;
  durationMs: number;
  bytes: number;
  error?: string;
  resolvedURL: string;
  resolvedRequest: any;
  response: any;
};

type Settings = {
  iterations: number;          // 0 = all enabled
  delayMs: number;
  concurrency: number;          // 1..10
  stopOnError: boolean;
  passRule: PassRule;
};

const DEFAULT_SETTINGS: Settings = {
  iterations: 0,
  delayMs: 0,
  concurrency: 1,
  stopOnError: false,
  passRule: { kind: "status_2xx" },
};

// Soft warnings — let the user proceed but flag pathological sizes.
const ROW_WARN = 200_000;
const ROW_HARD_CAP = 2_000_000; // refuse files larger than this — refuse politely

// Render only a window into the dataset. 28 px feels right at our font size.
const PREVIEW_ROW_H = 28;
const PREVIEW_HEIGHT = 360;
const RESULTS_ROW_H = 28;
const RESULTS_HEIGHT = 320;

// ─── Variable + macro substitution ───────────────────────────────────────
function macroValue(name: string): string {
  const n = name.trim();
  if (n === "uuid") return (globalThis.crypto as any)?.randomUUID?.() ?? randHex(16);
  if (n === "now") return new Date().toString();
  if (n === "now:iso") return new Date().toISOString();
  if (n === "timestampMs") return String(Date.now());
  if (n === "timestamp") return String(Math.floor(Date.now() / 1000));
  if (n === "randomEmail") return `user${Math.floor(Math.random() * 1e7)}@example.com`;
  const intMatch = /^randomInt(?::(-?\d+)\s*-\s*(-?\d+))?$/.exec(n);
  if (intMatch) {
    const lo = intMatch[1] !== undefined ? parseInt(intMatch[1], 10) : 0;
    const hi = intMatch[2] !== undefined ? parseInt(intMatch[2], 10) : 100;
    const a = Math.min(lo, hi), b = Math.max(lo, hi);
    return String(Math.floor(Math.random() * (b - a + 1)) + a);
  }
  if (n === "randomString") return Math.random().toString(36).slice(2, 10);
  return `{{$${n}}}`;
}

function randHex(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function resolveString(s: string, vars: Row): string {
  if (!s) return s;
  let out = s.replace(/\{\{\s*\$([^}]+?)\s*\}\}/g, (_m, name) => macroValue(name));
  out = out.replace(/\{\{\s*([A-Za-z_][^}]*?)\s*\}\}/g, (_m, key) => {
    const k = String(key).trim();
    if (!(k in vars)) return `{{${k}}}`;
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
  return out;
}

function resolveRequest(req: any, row: Row): any {
  if (!req) return req;
  const headers: Record<string, string> = {};
  Object.entries(req.headers || {}).forEach(([k, v]) => {
    const rk = resolveString(String(k), row);
    if (rk) headers[rk] = resolveString(String(v ?? ""), row);
  });
  const query = (req.query || []).map((q: any) => ({
    ...q,
    key: resolveString(String(q.key || ""), row),
    value: resolveString(String(q.value || ""), row),
  }));
  let body = req.body;
  if (req.body_kind === "raw" || req.body_kind === "json") {
    if (body?.raw !== undefined && body?.raw !== null) {
      body = { ...body, raw: resolveString(String(body.raw), row) };
    }
  } else if (req.body_kind === "urlencoded" || req.body_kind === "form-data") {
    if (Array.isArray(body?.form)) {
      body = {
        ...body,
        form: body.form.map((f: any) => ({
          ...f,
          key: resolveString(String(f.key || ""), row),
          value: resolveString(String(f.value || ""), row),
        })),
      };
    }
  }
  return {
    ...req,
    url: resolveString(String(req.url || ""), row),
    headers,
    query,
    body,
  };
}

// ─── Pass-rule check ─────────────────────────────────────────────────────
function passes(status: number, rule: PassRule): boolean {
  if (rule.kind === "status_2xx") return status >= 200 && status < 300;
  if (rule.kind === "status_eq") return status === rule.value;
  if (rule.kind === "status_range") return status >= rule.min && status <= rule.max;
  return false;
}

// ─── CSV export ──────────────────────────────────────────────────────────
function toCSVText(rows: (string | number)[][]): string {
  return rows.map(r => r.map(v => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

function downloadBlob(filename: string, content: BlobPart, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ─── Parse via worker ────────────────────────────────────────────────────
function parseInWorker(
  msg: { kind: "parse-csv" | "parse-json"; payload: { text: string } }
     | { kind: "parse-xlsx"; payload: { buffer: ArrayBuffer; sheet?: string } },
  onProgress: (p: { parsed: number; total?: number; phase: string }) => void,
): Promise<{ columns: string[]; rows: Row[]; sheetNames?: string[]; activeSheet?: string }> {
  return new Promise((resolve, reject) => {
    const w: Worker = new (RunnerWorker as any)();
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === "progress") onProgress({ parsed: m.parsed, total: m.total, phase: m.phase });
      else if (m?.type === "done") { w.terminate(); resolve(m); }
      else if (m?.type === "error") { w.terminate(); reject(new Error(m.error)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "worker error")); };
    // Transfer the buffer so we don't double the memory.
    if (msg.kind === "parse-xlsx") {
      w.postMessage(msg, [msg.payload.buffer]);
    } else {
      w.postMessage(msg);
    }
  });
}

// ─── Component ───────────────────────────────────────────────────────────
type Props = {
  requests: any[];
  initialReq?: any;
  onExit?: () => void;
};

export default function Runner({ requests, initialReq, onExit }: Props) {
  const [selReqID, setSelReqID] = useState<string | "">(initialReq?.id ?? requests[0]?.id ?? "");
  const selectedReq = useMemo(
    () => requests.find(r => r.id === selReqID) || null,
    [requests, selReqID]
  );

  const [dataset, setDataset] = useState<Dataset | null>(null);
  // Keep workbook buffer separately — datasets are passed around React state,
  // which means new object identities; we only want to hold one copy of the
  // raw bytes for sheet switching.
  const workbookBufferRef = useRef<ArrayBuffer | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Off by default — at lakh-scale, persisting every iteration to pw_history
  // would clobber the DB and the user's own history view. They can opt back in.
  const [saveHistory, setSaveHistory] = useState(false);
  const [enabledCols, setEnabledCols] = useState<Record<string, boolean>>({});
  const [enabledRows, setEnabledRows] = useState<Set<number>>(new Set());

  const [parsing, setParsing] = useState<{ phase: string; parsed: number; total?: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, fail: 0 });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [showFakers, setShowFakers] = useState(false);
  const [previewIx, setPreviewIx] = useState(0);
  const [inspectIx, setInspectIx] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const cancelFlag = useRef({ stop: false });
  const fileInput = useRef<HTMLInputElement>(null);

  // Debounce search so a 500k-row scan doesn't run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Derived: just the *count* of enabled rows. We never materialise the list
  // for huge datasets because building it on every toggle would be O(n).
  const enabledRowCount = enabledRows.size;
  const totalRowCount = dataset?.rows.length ?? 0;

  const effectiveIterations = useMemo(() => {
    if (!enabledRowCount) return 0;
    return settings.iterations > 0 ? Math.min(settings.iterations, enabledRowCount) : enabledRowCount;
  }, [enabledRowCount, settings.iterations]);

  // ── File upload handler ────────────────────────────────────────────────
  async function onFile(f: File) {
    setParsing({ phase: "reading", parsed: 0 });
    try {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      let parsed: { columns: string[]; rows: Row[]; sheetNames?: string[]; activeSheet?: string };
      let bufferForSheets: ArrayBuffer | null = null;
      const onProg = (p: any) => setParsing(p);

      if (ext === "csv" || ext === "tsv") {
        const text = await f.text();
        parsed = await parseInWorker({ kind: "parse-csv", payload: { text } }, onProg);
      } else if (ext === "json") {
        const text = await f.text();
        parsed = await parseInWorker({ kind: "parse-json", payload: { text } }, onProg);
      } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") {
        const buf = await f.arrayBuffer();
        // Clone for sheet switching since transferring nukes the original.
        bufferForSheets = buf.slice(0);
        parsed = await parseInWorker({ kind: "parse-xlsx", payload: { buffer: buf } }, onProg);
      } else {
        throw new Error(`Unsupported file type: .${ext}`);
      }

      if (parsed.rows.length > ROW_HARD_CAP) {
        throw new Error(`File has ${parsed.rows.length.toLocaleString()} rows — over the ${ROW_HARD_CAP.toLocaleString()} cap. Split it first.`);
      }
      if (parsed.rows.length === 0) toast.error("File loaded but no data rows found");
      else if (parsed.rows.length > ROW_WARN) {
        toast(`Loaded ${parsed.rows.length.toLocaleString()} rows. Heads-up: that's a lot — preview is virtualised so the UI stays smooth, but expect the run itself to take a while.`, { icon: "⚠️", duration: 6000 });
      }

      workbookBufferRef.current = bufferForSheets;
      setDataset({
        sourceName: f.name,
        columns: parsed.columns,
        rows: parsed.rows,
        workbookBuffer: bufferForSheets ?? undefined,
        sheetNames: parsed.sheetNames,
        activeSheet: parsed.activeSheet,
      });
      // Default everything enabled.
      setEnabledCols(Object.fromEntries(parsed.columns.map(c => [c, true])));
      // Build the Set as an array → Set in one shot (faster than per-row .add).
      const indices = new Array(parsed.rows.length);
      for (let i = 0; i < parsed.rows.length; i++) indices[i] = i;
      setEnabledRows(new Set(indices));
      setResults([]);
      setProgress({ done: 0, total: 0, ok: 0, fail: 0 });
      setPreviewIx(0);
      if (parsed.rows.length > 0) {
        toast.success(`Loaded ${parsed.rows.length.toLocaleString()} rows · ${parsed.columns.length} cols`);
      }
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setParsing(null);
    }
  }

  async function switchSheet(sheet: string) {
    if (!dataset || !workbookBufferRef.current) return;
    setParsing({ phase: "reading", parsed: 0 });
    try {
      // Clone again — transfer would invalidate our cached copy.
      const buf = workbookBufferRef.current.slice(0);
      const parsed = await parseInWorker(
        { kind: "parse-xlsx", payload: { buffer: buf, sheet } },
        (p) => setParsing(p),
      );
      setDataset({
        ...dataset,
        columns: parsed.columns,
        rows: parsed.rows,
        sheetNames: parsed.sheetNames || dataset.sheetNames,
        activeSheet: parsed.activeSheet || sheet,
      });
      setEnabledCols(Object.fromEntries(parsed.columns.map(c => [c, true])));
      const indices = new Array(parsed.rows.length);
      for (let i = 0; i < parsed.rows.length; i++) indices[i] = i;
      setEnabledRows(new Set(indices));
      setResults([]);
      setPreviewIx(0);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setParsing(null);
    }
  }

  // Build the variables object for one row, honouring enabled columns.
  function rowVars(row: Row): Row {
    const out: Row = {};
    for (const k in row) if (enabledCols[k]) out[k] = row[k];
    return out;
  }

  // ── Run / cancel ───────────────────────────────────────────────────────
  async function runIndices(rowIndices: number[]) {
    if (!selectedReq) { toast.error("Pick a request"); return; }
    if (!dataset || !rowIndices.length) { toast.error("No rows enabled"); return; }
    cancelFlag.current.stop = false;
    setRunning(true);
    setStartedAt(Date.now());
    setResults([]);
    setProgress({ done: 0, total: rowIndices.length, ok: 0, fail: 0 });

    // Throttle React updates: append to a ref, flush every 250 ms.
    const buf: RunResult[] = [];
    const counters = { ok: 0, fail: 0, done: 0 };
    let flushTimer: any = setInterval(() => {
      if (buf.length === 0 && counters.done === progress.done) return;
      // Snapshot + sort by iteration index (so the table reads top-to-bottom
      // even with concurrency > 1). Sort is O(n log n) on the snapshot, but
      // we only do it every 250 ms.
      const snap = buf.slice().sort((a, b) => a.index - b.index);
      setResults(snap);
      setProgress({ done: counters.done, total: rowIndices.length, ok: counters.ok, fail: counters.fail });
    }, 250);

    let next = 0;
    const C = Math.max(1, Math.min(10, settings.concurrency));
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    async function worker() {
      while (!cancelFlag.current.stop) {
        const idxIntoList = next++;
        if (idxIntoList >= rowIndices.length) break;
        const dataIx = rowIndices[idxIntoList];
        const row = dataset!.rows[dataIx];
        const vars = rowVars(row);
        const resolved = resolveRequest(selectedReq, vars);
        const t0 = performance.now();
        try {
          const r = await api.pwSend(resolved, vars as Record<string, string>, { saveHistory });
          const dur = Math.round(performance.now() - t0);
          const ok = passes(Number(r?.status ?? 0), settings.passRule);
          buf.push({
            index: dataIx, rowSnapshot: row,
            status: Number(r?.status ?? 0),
            ok, durationMs: dur,
            bytes: Number(r?.size_bytes ?? r?.bytes ?? 0),
            resolvedURL: resolved.url,
            resolvedRequest: resolved,
            response: r,
          });
          ok ? counters.ok++ : counters.fail++;
          if (!ok && settings.stopOnError) cancelFlag.current.stop = true;
        } catch (e: any) {
          const dur = Math.round(performance.now() - t0);
          buf.push({
            index: dataIx, rowSnapshot: row,
            status: 0, ok: false, durationMs: dur, bytes: 0,
            error: e?.message || String(e),
            resolvedURL: resolved.url,
            resolvedRequest: resolved,
            response: null,
          });
          counters.fail++;
          if (settings.stopOnError) cancelFlag.current.stop = true;
        }
        counters.done++;
        if (settings.delayMs > 0) await sleep(settings.delayMs);
      }
    }

    await Promise.all(Array.from({ length: C }, () => worker()));
    clearInterval(flushTimer);
    // Final flush so the last sub-250ms updates land.
    setResults(buf.slice().sort((a, b) => a.index - b.index));
    setProgress({ done: counters.done, total: rowIndices.length, ok: counters.ok, fail: counters.fail });
    setRunning(false);
    if (cancelFlag.current.stop) toast(`Cancelled — ${counters.done}/${rowIndices.length} done`, { icon: "🛑" });
    else toast.success(`Run complete · ${counters.ok} pass · ${counters.fail} fail`);
  }

  function startRun() {
    if (!dataset) return;
    const cap = effectiveIterations;
    if (!cap) return;
    // Walk dataset.rows once, collect first `cap` enabled indices.
    const indices: number[] = [];
    for (let i = 0; i < dataset.rows.length && indices.length < cap; i++) {
      if (enabledRows.has(i)) indices.push(i);
    }
    runIndices(indices);
  }

  function retryFailedOnly() {
    if (!dataset || !results.length) return;
    const failures = results.filter(r => !r.ok).map(r => r.index);
    if (!failures.length) { toast("Nothing to retry — everything passed", { icon: "🎉" }); return; }
    runIndices(failures);
  }

  function cancel() { cancelFlag.current.stop = true; }

  // ── Export results CSV ────────────────────────────────────────────────
  function exportCSV() {
    if (!results.length) return;
    const cols = dataset ? dataset.columns : [];
    const header = ["#", ...cols, "status", "ok", "duration_ms", "bytes", "error", "resolved_url"];
    const out: (string | number)[][] = [header];
    for (const r of results) {
      const rowOut: (string | number)[] = [r.index + 1];
      for (const c of cols) rowOut.push(r.rowSnapshot[c] ?? "");
      rowOut.push(r.status, r.ok ? "PASS" : "FAIL", r.durationMs, r.bytes, r.error ?? "", r.resolvedURL);
      out.push(rowOut);
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlob(`runner-results-${ts}.csv`, toCSVText(out));
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  const elapsedMs = startedAt ? (running ? Date.now() - startedAt : 0) : 0;
  const eta = useMemo(() => {
    if (!running || !startedAt || !progress.done) return "—";
    const elapsed = Date.now() - startedAt;
    const perItem = elapsed / progress.done;
    return formatMs((progress.total - progress.done) * perItem);
  }, [running, startedAt, progress]);
  const avgLatency = results.length
    ? Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length)
    : 0;

  // For the spreadsheet preview: with a search filter we precompute a list of
  // matching original indices once per debounced query change. Without a
  // filter we just use the natural index sequence (no allocation).
  const filteredIndices = useMemo<number[] | null>(() => {
    if (!dataset) return null;
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return null;
    const out: number[] = [];
    const rows = dataset.rows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Stop at the first column that matches.
      for (const k in row) {
        const v = row[k];
        if (v != null && String(v).toLowerCase().includes(q)) { out.push(i); break; }
      }
    }
    return out;
  }, [dataset, debouncedSearch]);

  const previewRowCount = filteredIndices ? filteredIndices.length : totalRowCount;
  const getPreviewIndex = (visualIx: number) =>
    filteredIndices ? filteredIndices[visualIx] : visualIx;

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg">
      {/* Header bar */}
      <div className="shrink-0 border-b border-bg-border bg-bg-panel/40 px-4 py-3 flex flex-wrap items-center gap-3">
        {onExit && (
          <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                       text-ink-muted ring-1 ring-bg-border hover:text-ink hover:ring-sky-500/40 transition"
            title="Exit Runner — back to the request editor"
          >
            <X className="w-3.5 h-3.5" /> Exit
          </button>
        )}
        <FileSpreadsheet className="w-5 h-5 text-sky-400" />
        <div className="font-display text-base font-bold">Runner</div>
        <span className="text-[10px] uppercase tracking-wider text-ink-dim font-mono px-1.5 py-0.5 rounded bg-sky-500/10 ring-1 ring-sky-500/30 text-sky-400">
          BETA
        </span>

        <div className="h-5 w-px bg-bg-border mx-2" />

        <select
          value={selReqID}
          onChange={(e) => setSelReqID(e.target.value)}
          className="input text-xs py-1 max-w-[260px]"
          title="Request to run"
        >
          <option value="">— Pick a saved request —</option>
          {requests.map(r => (
            <option key={r.id} value={r.id}>
              {r.method} · {r.name || r.url || "(unnamed)"}
            </option>
          ))}
        </select>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.json,.xlsx,.xls,.xlsm,.ods"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={!!parsing}
          className="btn-ghost text-xs disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" /> {dataset ? "Replace data" : "Upload CSV / Excel / JSON"}
        </button>

        {dataset && dataset.sheetNames && dataset.sheetNames.length > 1 && (
          <select
            value={dataset.activeSheet}
            onChange={(e) => switchSheet(e.target.value)}
            className="input text-xs py-1"
            disabled={!!parsing}
            title="Sheet"
          >
            {dataset.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <div className="flex-1" />

        {results.length > 0 && (
          <button onClick={exportCSV} className="btn-ghost text-xs" title="Export results to CSV">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
        {!running && results.some(r => !r.ok) && (
          <button onClick={retryFailedOnly} className="btn-ghost text-xs" title="Retry only the failed rows">
            <RotateCcw className="w-3.5 h-3.5" /> Retry failed ({results.filter(r => !r.ok).length})
          </button>
        )}

        {!running ? (
          <button
            onClick={startRun}
            disabled={!selectedReq || !dataset || effectiveIterations === 0 || !!parsing}
            className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title={!selectedReq ? "Pick a request" : !dataset ? "Upload a dataset" : `Run ${effectiveIterations.toLocaleString()} iterations`}
          >
            <Play className="w-3.5 h-3.5" /> Run · {effectiveIterations.toLocaleString()}
          </button>
        ) : (
          <button onClick={cancel} className="btn-secondary text-xs ring-bad/40 text-bad hover:bg-bad/10">
            <Square className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {parsing && (
          <div className="card p-3 flex items-center gap-3 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <div className="text-ink-muted">
              <span className="font-mono uppercase tracking-wider mr-2">{parsing.phase}</span>
              parsing{" "}
              {parsing.total
                ? `${parsing.parsed.toLocaleString()} / ${parsing.total.toLocaleString()}`
                : parsing.parsed.toLocaleString()}
              {" rows"}
            </div>
            <div className="flex-1 h-1.5 bg-bg-border rounded overflow-hidden ml-2">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: parsing.total ? `${Math.min(100, (parsing.parsed / parsing.total) * 100)}%` : "30%" }}
              />
            </div>
          </div>
        )}

        {/* Settings strip */}
        <div className="card p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <Field label="Iterations">
            <input
              type="number" min={0} step={1}
              value={settings.iterations || ""}
              onChange={(e) => setSettings(s => ({ ...s, iterations: Math.max(0, Number(e.target.value) || 0) }))}
              placeholder={dataset ? `all (${enabledRowCount.toLocaleString()})` : "—"}
              className="input w-full text-xs py-1"
              title="0 = run every enabled row"
            />
          </Field>
          <Field label="Delay (ms)">
            <input
              type="number" min={0} step={50}
              value={settings.delayMs}
              onChange={(e) => setSettings(s => ({ ...s, delayMs: Math.max(0, Number(e.target.value) || 0) }))}
              className="input w-full text-xs py-1"
            />
          </Field>
          <Field label="Concurrency">
            <input
              type="number" min={1} max={10} step={1}
              value={settings.concurrency}
              onChange={(e) => setSettings(s => ({ ...s, concurrency: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }))}
              className="input w-full text-xs py-1"
              title="1–10 parallel iterations"
            />
          </Field>
          <Field label="Pass rule">
            <PassRuleEditor value={settings.passRule} onChange={(passRule) => setSettings(s => ({ ...s, passRule }))} />
          </Field>
          <Field label="Stop on error">
            <label className="flex items-center gap-2 mt-1.5">
              <input
                type="checkbox"
                checked={settings.stopOnError}
                onChange={(e) => setSettings(s => ({ ...s, stopOnError: e.target.checked }))}
              />
              <span className="text-ink-muted">Halt on first failure</span>
            </label>
          </Field>
          <Field label="Save to history">
            <label className="flex items-center gap-2 mt-1.5" title="Off by default at lakh-scale to keep the DB happy.">
              <input
                type="checkbox"
                checked={saveHistory}
                onChange={(e) => setSaveHistory(e.target.checked)}
              />
              <span className="text-ink-muted">Persist each iteration</span>
            </label>
          </Field>
          <Field label="Helpers">
            <button type="button" onClick={() => setShowFakers(s => !s)} className="btn-ghost text-xs w-full">
              <Sparkles className="w-3.5 h-3.5" /> {showFakers ? "Hide" : "Show"} macros
            </button>
          </Field>
        </div>

        {showFakers && <FakersHelp />}

        {!dataset && !parsing && (
          <div className="card p-10 text-center">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-ink-dim mb-3" />
            <div className="text-ink-muted text-sm mb-4">
              Upload a CSV, Excel sheet, or JSON array to drive iterations.
              <br />Each column becomes a <code className="text-sky-400">{"{{column_name}}"}</code> variable
              you can use in the URL, headers, query, or body of any saved request.
              <br /><span className="text-ink-dim text-xs">Files are parsed off the main thread; previews and results are virtualised so the UI stays smooth even at lakhs of rows.</span>
            </div>
            <button onClick={() => fileInput.current?.click()} className="btn-primary text-xs">
              <Upload className="w-3.5 h-3.5" /> Choose file
            </button>
          </div>
        )}

        {dataset && (
          <>
            <div className="card p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                <div className="text-sm font-bold">{dataset.sourceName}</div>
                <span className="text-[10px] text-ink-dim font-mono">
                  {totalRowCount.toLocaleString()} rows · {dataset.columns.length} cols · {enabledRowCount.toLocaleString()} enabled
                </span>
                <div className="flex-1" />
                <div className="relative">
                  <Filter className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input
                    placeholder="Filter rows…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input text-xs pl-7 py-1 w-44"
                  />
                </div>
                <button
                  onClick={() => {
                    if (enabledRows.size === totalRowCount) setEnabledRows(new Set());
                    else {
                      const indices = new Array(totalRowCount);
                      for (let i = 0; i < totalRowCount; i++) indices[i] = i;
                      setEnabledRows(new Set(indices));
                    }
                  }}
                  className="btn-ghost text-xs"
                >
                  {enabledRows.size === totalRowCount ? "Deselect all" : "Select all"}
                </button>
              </div>

              {/* Column toggles */}
              <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
                {dataset.columns.map(c => (
                  <label
                    key={c}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ring-1 cursor-pointer transition select-none
                      ${enabledCols[c]
                        ? "ring-sky-500/40 bg-sky-500/10 text-sky-300"
                        : "ring-bg-border bg-bg-card/40 text-ink-dim line-through"}`}
                    title="Toggle this column on/off as a variable"
                  >
                    <input
                      type="checkbox" className="hidden"
                      checked={!!enabledCols[c]}
                      onChange={(e) => setEnabledCols(s => ({ ...s, [c]: e.target.checked }))}
                    />
                    {c}
                  </label>
                ))}
              </div>

              <VirtualSpreadsheet
                columns={dataset.columns}
                rows={dataset.rows}
                rowCount={previewRowCount}
                getRowIndex={getPreviewIndex}
                enabledRows={enabledRows}
                onToggleRow={(i) => setEnabledRows(prev => {
                  const next = new Set(prev);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                })}
                previewIx={previewIx}
                onPickPreview={setPreviewIx}
                results={results}
                enabledCols={enabledCols}
              />
            </div>

            {selectedReq && dataset.rows[previewIx] && (
              <VarPreview
                request={selectedReq}
                row={dataset.rows[previewIx]}
                enabledCols={enabledCols}
                rowIx={previewIx}
              />
            )}
          </>
        )}

        {(running || results.length > 0) && (
          <div className="card p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-sm font-bold">Results</div>
              <span className="text-[11px] font-mono text-ink-dim">
                {progress.done.toLocaleString()} / {(progress.total || effectiveIterations).toLocaleString()}
                {" · "}<span className="text-good">{progress.ok.toLocaleString()} pass</span>
                {" · "}<span className="text-bad">{progress.fail.toLocaleString()} fail</span>
                {" · avg "}{avgLatency} ms
              </span>
              <div className="flex-1" />
              {running && (
                <span className="text-[11px] text-ink-muted flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> ETA {eta}
                </span>
              )}
              {!running && elapsedMs === 0 && results.length > 0 && (
                <span className="text-[11px] text-ink-muted">done</span>
              )}
            </div>
            <div className="h-1.5 bg-bg-border rounded overflow-hidden mb-3">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>

            <VirtualResults results={results} onInspect={setInspectIx} />
          </div>
        )}

        {inspectIx !== null && results[inspectIx] && (
          <InspectorPanel
            result={results[inspectIx]}
            onClose={() => setInspectIx(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">{label}</div>
      {children}
    </div>
  );
}

function PassRuleEditor({ value, onChange }: { value: PassRule; onChange: (v: PassRule) => void }) {
  return (
    <div className="flex gap-1">
      <select
        value={value.kind}
        onChange={(e) => {
          const k = e.target.value as PassRule["kind"];
          if (k === "status_2xx") onChange({ kind: "status_2xx" });
          if (k === "status_eq") onChange({ kind: "status_eq", value: 200 });
          if (k === "status_range") onChange({ kind: "status_range", min: 200, max: 299 });
        }}
        className="input text-xs py-1 flex-1"
      >
        <option value="status_2xx">2xx OK</option>
        <option value="status_eq">status =</option>
        <option value="status_range">status in range</option>
      </select>
      {value.kind === "status_eq" && (
        <input
          type="number" value={value.value} className="input text-xs py-1 w-16"
          onChange={(e) => onChange({ kind: "status_eq", value: Number(e.target.value) || 0 })}
        />
      )}
      {value.kind === "status_range" && (
        <>
          <input type="number" value={value.min} className="input text-xs py-1 w-14"
            onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 0 })} />
          <input type="number" value={value.max} className="input text-xs py-1 w-14"
            onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })} />
        </>
      )}
    </div>
  );
}

function FakersHelp() {
  const macros: [string, string][] = [
    ["{{$uuid}}", "RFC4122 v4 uuid"],
    ["{{$now}}", "current Date.toString()"],
    ["{{$now:iso}}", "ISO-8601 timestamp"],
    ["{{$timestampMs}}", "epoch ms"],
    ["{{$timestamp}}", "epoch seconds"],
    ["{{$randomEmail}}", "throwaway email"],
    ["{{$randomString}}", "8-char alnum"],
    ["{{$randomInt:1-100}}", "int in inclusive range"],
  ];
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-dim font-mono mb-2">Built-in macros</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {macros.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <code className="text-sky-400 font-mono text-[11px]">{k}</code>
            <span className="text-ink-muted">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Virtualised spreadsheet (windowed list) ─────────────────────────────
type VirtualSpreadsheetProps = {
  columns: string[];
  rows: Row[];
  rowCount: number;
  getRowIndex: (visualIx: number) => number;
  enabledRows: Set<number>;
  onToggleRow: (i: number) => void;
  previewIx: number;
  onPickPreview: (i: number) => void;
  results: RunResult[];
  enabledCols: Record<string, boolean>;
};

function VirtualSpreadsheet({
  columns, rows, rowCount, getRowIndex,
  enabledRows, onToggleRow, previewIx, onPickPreview, results, enabledCols,
}: VirtualSpreadsheetProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const resByIx = useMemo(() => {
    const m = new Map<number, RunResult>();
    for (const r of results) m.set(r.index, r);
    return m;
  }, [results]);

  const start = Math.max(0, Math.floor(scrollTop / PREVIEW_ROW_H) - 6);
  const end = Math.min(rowCount, Math.ceil((scrollTop + PREVIEW_HEIGHT) / PREVIEW_ROW_H) + 6);

  // Column layout: fixed widths give predictable rendering; first two cols
  // are control/index, then user columns, last is the result chip.
  const colWidth = Math.max(110, Math.min(220, 1100 / Math.max(1, columns.length)));
  const totalRowWidth = 32 + 56 + columns.length * colWidth + 56;

  return (
    <div className="rounded ring-1 ring-bg-border overflow-hidden">
      {/* Header */}
      <div className="bg-bg-panel/95 backdrop-blur border-b border-bg-border overflow-x-auto">
        <div
          className="flex text-[10px] uppercase tracking-wider text-ink-muted font-mono"
          style={{ width: totalRowWidth, minWidth: "100%" }}
        >
          <div className="px-2 py-1.5 shrink-0" style={{ width: 32 }}>use</div>
          <div className="px-2 py-1.5 text-right shrink-0" style={{ width: 56 }}>#</div>
          {columns.map(c => (
            <div
              key={c}
              className={`px-2 py-1.5 truncate shrink-0 ${!enabledCols[c] ? "text-ink-dim line-through" : ""}`}
              style={{ width: colWidth }}
              title={c}
            >
              {c}
            </div>
          ))}
          <div className="px-2 py-1.5 shrink-0" style={{ width: 56 }}>res</div>
        </div>
      </div>

      {/* Body — virtualised */}
      <div
        ref={containerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: PREVIEW_HEIGHT, overflow: "auto" }}
      >
        <div style={{ height: rowCount * PREVIEW_ROW_H, position: "relative", width: totalRowWidth, minWidth: "100%" }}>
          {rowCount === 0 ? (
            <div className="text-center text-ink-muted py-6 text-xs">No rows match the filter.</div>
          ) : Array.from({ length: end - start }, (_, k) => {
            const visualIx = start + k;
            const i = getRowIndex(visualIx);
            const row = rows[i];
            if (!row) return null;
            const en = enabledRows.has(i);
            const res = resByIx.get(i);
            const sel = previewIx === i;
            return (
              <div
                key={i}
                onClick={() => onPickPreview(i)}
                className={`flex items-center text-xs font-mono cursor-pointer border-t border-bg-border/60
                  ${sel ? "bg-sky-500/10" : "hover:bg-white/[.03]"}
                  ${!en ? "opacity-40" : ""}`}
                style={{
                  position: "absolute",
                  top: visualIx * PREVIEW_ROW_H,
                  left: 0,
                  height: PREVIEW_ROW_H,
                  width: "100%",
                }}
              >
                <div
                  className="px-2 shrink-0"
                  style={{ width: 32 }}
                  onClick={(e) => { e.stopPropagation(); onToggleRow(i); }}
                >
                  <input type="checkbox" checked={en} readOnly />
                </div>
                <div className="px-2 text-right text-ink-dim shrink-0" style={{ width: 56 }}>
                  {(i + 1).toLocaleString()}
                </div>
                {columns.map(c => (
                  <div
                    key={c}
                    className={`px-2 truncate shrink-0 ${!enabledCols[c] ? "text-ink-dim" : ""}`}
                    style={{ width: colWidth }}
                    title={String(row[c] ?? "")}
                  >
                    {String(row[c] ?? "")}
                  </div>
                ))}
                <div className="px-2 shrink-0" style={{ width: 56 }}>
                  {res ? (res.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-good" />
                    : <XCircle className="w-3.5 h-3.5 text-bad" />)
                    : <span className="text-ink-dim">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VarPreview({
  request, row, enabledCols, rowIx,
}: { request: any; row: Row; enabledCols: Record<string, boolean>; rowIx: number }) {
  const [open, setOpen] = useState(true);
  const vars: Row = {};
  for (const k in row) if (enabledCols[k]) vars[k] = row[k];
  const resolved = resolveRequest(request, vars);
  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm font-bold border-b border-bg-border"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Eye className="w-4 h-4 text-sky-400" />
        Preview against row {(rowIx + 1).toLocaleString()}
        <span className="ml-auto text-[10px] font-mono text-ink-dim">{request.method}</span>
      </button>
      {open && (
        <div className="p-3 space-y-2 text-xs font-mono">
          <div>
            <span className="text-ink-dim">URL:</span>{" "}
            <span className="text-ink break-all">{resolved.url}</span>
          </div>
          {Object.keys(resolved.headers || {}).length > 0 && (
            <div>
              <div className="text-ink-dim mb-1">Headers:</div>
              <div className="space-y-0.5 pl-2">
                {Object.entries(resolved.headers).map(([k, v]) => (
                  <div key={k} className="break-all"><span className="text-cool">{k}</span>: {String(v)}</div>
                ))}
              </div>
            </div>
          )}
          {(resolved.body_kind === "raw" || resolved.body_kind === "json") && resolved.body?.raw && (
            <div>
              <div className="text-ink-dim mb-1">Body:</div>
              <pre className="bg-bg-card/60 p-2 rounded ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-48 overflow-auto">
                {String(resolved.body.raw)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Virtualised results table ───────────────────────────────────────────
function VirtualResults({ results, onInspect }: { results: RunResult[]; onInspect: (ix: number) => void }) {
  const [scrollTop, setScrollTop] = useState(0);
  const total = results.length;
  const start = Math.max(0, Math.floor(scrollTop / RESULTS_ROW_H) - 6);
  const end = Math.min(total, Math.ceil((scrollTop + RESULTS_HEIGHT) / RESULTS_ROW_H) + 6);

  return (
    <div className="rounded ring-1 ring-bg-border overflow-hidden">
      <div className="bg-bg-panel/95 backdrop-blur border-b border-bg-border">
        <div className="flex text-[10px] uppercase tracking-wider text-ink-muted font-mono">
          <div className="px-2 py-1.5 text-right shrink-0" style={{ width: 64 }}>#</div>
          <div className="px-2 py-1.5 shrink-0" style={{ width: 48 }}>res</div>
          <div className="px-2 py-1.5 text-right shrink-0" style={{ width: 64 }}>status</div>
          <div className="px-2 py-1.5 text-right shrink-0" style={{ width: 72 }}>ms</div>
          <div className="px-2 py-1.5 text-right shrink-0" style={{ width: 80 }}>bytes</div>
          <div className="px-2 py-1.5 flex-1">url / error</div>
          <div className="px-2 py-1.5 shrink-0" style={{ width: 48 }}></div>
        </div>
      </div>
      <div
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: RESULTS_HEIGHT, overflow: "auto" }}
      >
        <div style={{ height: total * RESULTS_ROW_H, position: "relative" }}>
          {Array.from({ length: end - start }, (_, k) => {
            const ix = start + k;
            const r = results[ix];
            if (!r) return null;
            return (
              <div
                key={ix}
                className="flex items-center text-xs font-mono border-t border-bg-border/60 hover:bg-white/[.03]"
                style={{ position: "absolute", top: ix * RESULTS_ROW_H, height: RESULTS_ROW_H, width: "100%" }}
              >
                <div className="px-2 text-right text-ink-dim shrink-0" style={{ width: 64 }}>{(r.index + 1).toLocaleString()}</div>
                <div className="px-2 shrink-0" style={{ width: 48 }}>
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-good" />
                    : r.error
                      ? <AlertCircle className="w-3.5 h-3.5 text-bad" />
                      : <XCircle className="w-3.5 h-3.5 text-bad" />}
                </div>
                <div className="px-2 text-right shrink-0" style={{ width: 64 }}>{r.status || "—"}</div>
                <div className="px-2 text-right shrink-0" style={{ width: 72 }}>{r.durationMs}</div>
                <div className="px-2 text-right shrink-0" style={{ width: 80 }}>{r.bytes.toLocaleString()}</div>
                <div className="px-2 truncate flex-1">
                  <span className={r.error ? "text-bad" : "text-ink"}>
                    {r.error || r.resolvedURL}
                  </span>
                </div>
                <div className="px-2 shrink-0" style={{ width: 48 }}>
                  <button onClick={() => onInspect(ix)} className="btn-ghost text-[10px] py-0.5 px-1.5">
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InspectorPanel({ result, onClose }: { result: RunResult; onClose: () => void }) {
  return (
    <div className="card">
      <div className="px-3 py-2 border-b border-bg-border flex items-center gap-2">
        <Eye className="w-4 h-4 text-sky-400" />
        <div className="text-sm font-bold">Iteration #{(result.index + 1).toLocaleString()}</div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ring-1 ${result.ok ? "text-good ring-good/40 bg-good/10" : "text-bad ring-bad/40 bg-bad/10"}`}>
          {result.ok ? "PASS" : "FAIL"} · {result.status || "—"} · {result.durationMs}ms
        </span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-3 grid md:grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <div className="text-ink-dim mb-1">Row data</div>
          <pre className="bg-bg-card/60 p-2 rounded ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-72 overflow-auto">
            {JSON.stringify(result.rowSnapshot, null, 2)}
          </pre>
          <div className="text-ink-dim mt-2 mb-1">Resolved request</div>
          <pre className="bg-bg-card/60 p-2 rounded ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-72 overflow-auto">
            {JSON.stringify(
              {
                method: result.resolvedRequest?.method,
                url: result.resolvedRequest?.url,
                headers: result.resolvedRequest?.headers,
                body: result.resolvedRequest?.body,
              },
              null, 2,
            )}
          </pre>
        </div>
        <div>
          <div className="text-ink-dim mb-1">Response</div>
          <pre className="bg-bg-card/60 p-2 rounded ring-1 ring-bg-border whitespace-pre-wrap break-all max-h-[36rem] overflow-auto">
            {result.error
              ? result.error
              : (typeof result.response?.body === "string"
                  ? result.response.body
                  : JSON.stringify(result.response, null, 2))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60), rs = Math.floor(s % 60);
  return `${m}m ${rs}s`;
}
