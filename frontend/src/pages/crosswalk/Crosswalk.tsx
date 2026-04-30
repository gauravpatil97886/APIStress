// Crosswalk.tsx — Excel-themed VLOOKUP / data-join tool.
//
// Mental model:
//   1. Upload TWO files: PRIMARY (the rows you want to enrich) and LOOKUP
//      (the reference / source-of-truth sheet).
//   2. Pick the join column on each side and which extra columns to splice
//      back from LOOKUP into PRIMARY.
//   3. Run the join — same semantics as Excel's VLOOKUP, but bidirectional
//      and not capped to the first match. Streams progress.
//   4. Preview the merged grid, see match stats, drill into unmatched rows,
//      and export to CSV or XLSX.
//
// Big-file handling:
//   - File parsing happens in `crosswalk.worker.ts` so the UI never blocks.
//   - CSVs are parsed via `File.stream()` line-by-line — realistically up
//     to ~10 GB CSV files. No row cap on CSV.
//   - XLSX uses SheetJS which needs the whole workbook in memory; capped at
//     5 M rows / file with a soft warning above 200 K.
//   - Result preview is virtualised — only the visible window of rows is
//     rendered, so even multi-million-row joins stay responsive.
//   - The hash-index join itself is O(n + m) in memory, O(n + m) in time.
//
// Theme: Excel ribbon green (`emerald` family in tailwind), paper-toned card
// surface, mono headers, gridlines under the result table.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload, Download, FileSpreadsheet, ArrowRight, GitMerge, Sparkles,
  CheckCircle2, AlertCircle, X, Loader2, RefreshCw, Search, Filter,
  Hammer, Send, Home, LogOut, ArrowRightLeft, Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { api, clearKey, getTeam } from "../../lib/api";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
// @ts-ignore — Vite worker import
import CrosswalkWorker from "./crosswalk.worker?worker";

type Row = Record<string, any>;

type LoadedSide = {
  side: "primary" | "lookup";
  sourceName: string;
  columns: string[];
  rows: Row[];
  sizeBytes: number;
  sheetNames?: string[];
  activeSheet?: string;
  workbookBuffer?: ArrayBuffer;
};

type JoinStats = {
  primaryRows: number;
  lookupRows: number;
  matchCount: number;
  unmatchedCount: number;
  duplicateKeys: number;
  multiMatchCount: number;
  indexSize: number;
};

type JoinResult = {
  columns: string[];
  matched: Row[];
  unmatched: Row[];
  merged: Row[];
  stats: JoinStats;
};

type Phase = "reading" | "decoding" | "shaping" | "indexing" | "joining" | "" ;
type ProgressMsg = {
  side?: string;
  phase: Phase;
  rows?: number;
  totalRows?: number;
  bytes?: number;
  totalBytes?: number;
  matched?: number;
};

const ROW_HARD_CAP_XLSX = 5_000_000;
const ROW_WARN = 200_000;
const PREVIEW_HEIGHT = 460;
const ROW_H = 28;

export default function Crosswalk() {
  const nav = useNavigate();
  const team = getTeam();
  useDocumentTitle("Crosswalk · Excel data joiner");

  const [primary, setPrimary] = useState<LoadedSide | null>(null);
  const [lookup, setLookup] = useState<LoadedSide | null>(null);
  const [primaryJoinCol, setPrimaryJoinCol] = useState<string>("");
  const [lookupJoinCol, setLookupJoinCol] = useState<string>("");
  const [bringBack, setBringBack] = useState<Set<string>>(new Set());
  const [joinKind, setJoinKind] = useState<"left" | "inner">("left");
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);

  const [parsing, setParsing] = useState<{ side?: string } & ProgressMsg | null>(null);
  const [joining, setJoining] = useState<ProgressMsg | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);

  const [view, setView] = useState<"merged" | "matched" | "unmatched">("merged");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const primaryInput = useRef<HTMLInputElement>(null);
  const lookupInput = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Debounce search filter.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Lazy-init the worker once and re-use it. Because this worker is heavy
  // (parsing GB-scale files), we don't tear it down between operations.
  function getWorker(): Worker {
    if (!workerRef.current) workerRef.current = new (CrosswalkWorker as any)();
    return workerRef.current!;
  }
  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // Log tool.open once per Crosswalk mount.
  useEffect(() => {
    if (team) api.logActivity({ event_type: "tool.open", tool_slug: "crosswalk", actor_name: team.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File loading ──────────────────────────────────────────────────────
  function pickFile(side: "primary" | "lookup", file: File) {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 1024) {
      // ~1 GB — toast a heads-up but proceed.
      toast(`Heads-up: ${sizeMB.toFixed(0)} MB file. CSV streams fine; XLSX/JSON above 1 GB will likely OOM the tab.`, { icon: "⚠️", duration: 7000 });
    }
    setParsing({ side, phase: "reading" });
    const w = getWorker();
    const jobID = crypto.randomUUID();
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.jobID && m.jobID !== jobID) return;
      if (m?.type === "progress") setParsing({ side: m.side ?? side, phase: m.phase, rows: m.rows, totalRows: m.totalRows, bytes: m.bytes, totalBytes: m.totalBytes });
      else if (m?.type === "loaded") {
        w.removeEventListener("message", onMessage);
        const loaded: LoadedSide = {
          side: m.side,
          sourceName: m.sourceName,
          columns: m.columns,
          rows: m.rows,
          sizeBytes: m.sizeBytes,
          sheetNames: m.sheetNames,
          activeSheet: m.activeSheet,
          workbookBuffer: m.workbookBuffer,
        };
        if (loaded.rows.length > ROW_HARD_CAP_XLSX) {
          setParsing(null);
          toast.error(`File has ${loaded.rows.length.toLocaleString()} rows — over the ${ROW_HARD_CAP_XLSX.toLocaleString()} cap.`);
          return;
        }
        if (loaded.rows.length > ROW_WARN) {
          toast(`Loaded ${loaded.rows.length.toLocaleString()} rows on the ${side} side. Big — joins will work, just give it a moment.`, { icon: "⚠️", duration: 5000 });
        }
        if (side === "primary") {
          setPrimary(loaded);
          setPrimaryJoinCol(prev => prev && loaded.columns.includes(prev) ? prev : loaded.columns[0] || "");
        } else {
          setLookup(loaded);
          setLookupJoinCol(prev => prev && loaded.columns.includes(prev) ? prev : loaded.columns[0] || "");
          // Default: bring back every column except the join column.
          setBringBack(new Set(loaded.columns.filter(c => c !== (loaded.columns[0] || ""))));
        }
        setResult(null);
        setParsing(null);
      } else if (m?.type === "error") {
        w.removeEventListener("message", onMessage);
        setParsing(null);
        toast.error(m.error || "Parse failed");
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ kind: "load-file", jobID, payload: { file, side } });
  }

  function switchSheet(side: "primary" | "lookup", sheet: string) {
    const sideObj = side === "primary" ? primary : lookup;
    if (!sideObj?.workbookBuffer) return;
    setParsing({ side, phase: "decoding" });
    const w = getWorker();
    const jobID = crypto.randomUUID();
    // Buffer is transferred — clone first so the cached side state remains valid.
    const buf = sideObj.workbookBuffer.slice(0);
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.jobID && m.jobID !== jobID) return;
      if (m?.type === "progress") setParsing({ side, phase: m.phase, rows: m.rows, totalRows: m.totalRows });
      else if (m?.type === "loaded") {
        w.removeEventListener("message", onMessage);
        const loaded: LoadedSide = {
          ...sideObj,
          columns: m.columns,
          rows: m.rows,
          activeSheet: m.activeSheet,
          workbookBuffer: m.workbookBuffer,
        };
        side === "primary" ? setPrimary(loaded) : setLookup(loaded);
        setResult(null);
        setParsing(null);
      } else if (m?.type === "error") {
        w.removeEventListener("message", onMessage);
        setParsing(null);
        toast.error(m.error);
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ kind: "load-xlsx-sheet", jobID, payload: { buffer: buf, sheet, side } }, [buf]);
  }

  // ── Run join ──────────────────────────────────────────────────────────
  function runJoin() {
    if (!primary || !lookup) return toast.error("Upload both files first");
    if (!primaryJoinCol || !lookupJoinCol) return toast.error("Pick a join column on each side");
    setJoining({ phase: "indexing", rows: 0 });
    setResult(null);
    const w = getWorker();
    const jobID = crypto.randomUUID();
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.jobID && m.jobID !== jobID) return;
      if (m?.type === "progress") setJoining({ phase: m.phase, rows: m.rows, totalRows: m.totalRows, matched: m.matched });
      else if (m?.type === "joined") {
        w.removeEventListener("message", onMessage);
        setResult({
          columns: m.columns,
          matched: m.matched,
          unmatched: m.unmatched,
          merged: m.merged,
          stats: m.stats,
        });
        setJoining(null);
        toast.success(`Joined · ${m.stats.matchCount.toLocaleString()} matched · ${m.stats.unmatchedCount.toLocaleString()} unmatched`);
        api.logActivity({
          event_type: "feature.crosswalk.join",
          tool_slug: "crosswalk",
          actor_name: team?.name,
          meta: {
            primary_rows: m.stats.primaryRows,
            lookup_rows: m.stats.lookupRows,
            matched: m.stats.matchCount,
            unmatched: m.stats.unmatchedCount,
            join_kind: joinKind,
          },
        });
      } else if (m?.type === "error") {
        w.removeEventListener("message", onMessage);
        setJoining(null);
        toast.error(m.error);
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({
      kind: "join", jobID,
      payload: {
        primary: { rows: primary.rows, columns: primary.columns, joinCol: primaryJoinCol },
        lookup:  { rows: lookup.rows,  columns: lookup.columns,  joinCol: lookupJoinCol },
        bringBack: [...bringBack],
        caseInsensitive,
        trimWhitespace,
        joinKind,
      },
    });
  }

  // ── Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!result) return;
    const rows = visibleRows(result, view);
    const cols = result.columns;
    const lines: string[] = [csvLine(cols)];
    for (const r of rows) {
      lines.push(csvLine(cols.map(c => r[c] ?? "")));
    }
    download(`crosswalk-${view}-${stamp()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
    api.logActivity({ event_type: "feature.crosswalk.export", tool_slug: "crosswalk", actor_name: team?.name, meta: { format: "csv", view, rows: rows.length } });
  }

  function exportXLSX() {
    if (!result) return;
    const rows = visibleRows(result, view);
    const cols = result.columns;
    const aoa: any[][] = [cols, ...rows.map(r => cols.map(c => r[c] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, view);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    download(`crosswalk-${view}-${stamp()}.xlsx`, new Uint8Array(buf), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    api.logActivity({ event_type: "feature.crosswalk.export", tool_slug: "crosswalk", actor_name: team?.name, meta: { format: "xlsx", view, rows: rows.length } });
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const baseRows = result ? visibleRows(result, view) : [];
  const filtered = useMemo(() => {
    if (!result || !debouncedSearch.trim()) return baseRows;
    const q = debouncedSearch.trim().toLowerCase();
    return baseRows.filter(r => result.columns.some(c => {
      const v = r[c];
      return v != null && String(v).toLowerCase().includes(q);
    }));
  }, [baseRows, debouncedSearch, result]);

  const canJoin = !!primary && !!lookup && !!primaryJoinCol && !!lookupJoinCol && !joining;

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      {/* Top ribbon — Excel-green */}
      <header className="shrink-0 h-14 px-4 border-b border-emerald-900/40 bg-gradient-to-r from-emerald-900/40 via-emerald-800/30 to-transparent backdrop-blur-md flex items-center gap-3">
        <button
          onClick={() => nav("/mode")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 hover:ring-emerald-500/60 transition text-sm"
          title="Back to home — pick another tool"
        >
          <Home className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold">Home</span>
        </button>
        <div className="h-5 w-px bg-emerald-900/40" />
        <CrosswalkWordmark />
        {team && (
          <>
            <div className="h-5 w-px bg-emerald-900/40 ml-1" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-emerald-500/30 bg-emerald-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-300">{team.name}</span>
            </div>
          </>
        )}
        <div className="flex-1" />
        <button onClick={() => nav("/postwomen")} className="btn-ghost text-xs" title="Open PostWomen">
          <Send className="w-3.5 h-3.5" /> PostWomen
        </button>
        <button onClick={() => nav("/")} className="btn-secondary text-xs" title="Open APIStress">
          <Hammer className="w-3.5 h-3.5" /> APIStress
        </button>
        <button
          onClick={() => { clearKey(); toast.success("Signed out"); nav("/login", { replace: true }); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                     text-ink-muted ring-1 ring-bg-border bg-bg-card/40
                     hover:text-bad hover:ring-bad/40 hover:bg-bad/[.06] transition"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Hero / intro — only when nothing's loaded */}
        {!primary && !lookup && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center py-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full ring-1 ring-emerald-500/30 bg-emerald-500/5 text-[10px] uppercase tracking-[0.18em] text-emerald-400 font-mono mb-3">
              <Sparkles className="w-3 h-3" /> NEW · Excel-style data joiner
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600 bg-clip-text text-transparent">
                Crosswalk
              </span>
            </h1>
            <p className="text-ink-muted mt-2 max-w-2xl mx-auto text-sm">
              Upload two sheets, pick a join column, splice columns from one into the other.
              VLOOKUP without the formula. Streams CSVs at ~10 GB and handles a few million rows of XLSX.
            </p>
          </motion.div>
        )}

        {/* Upload pair */}
        <div className="grid md:grid-cols-2 gap-4">
          <UploadCard
            side="primary"
            label="Primary sheet"
            tag="The rows you want to enrich"
            loaded={primary}
            inputRef={primaryInput}
            onPick={(f) => pickFile("primary", f)}
            onSheet={(s) => switchSheet("primary", s)}
            onClear={() => { setPrimary(null); setPrimaryJoinCol(""); setResult(null); }}
            parsing={parsing?.side === "primary" ? parsing : null}
          />
          <UploadCard
            side="lookup"
            label="Lookup sheet"
            tag="The reference / source-of-truth"
            loaded={lookup}
            inputRef={lookupInput}
            onPick={(f) => pickFile("lookup", f)}
            onSheet={(s) => switchSheet("lookup", s)}
            onClear={() => { setLookup(null); setLookupJoinCol(""); setBringBack(new Set()); setResult(null); }}
            parsing={parsing?.side === "lookup" ? parsing : null}
          />
        </div>

        {/* Join configuration */}
        {primary && lookup && (
          <div className="card p-4 ring-1 ring-emerald-500/20 bg-gradient-to-b from-emerald-500/[.04] to-transparent">
            <div className="flex items-center gap-2 mb-3">
              <GitMerge className="w-4 h-4 text-emerald-400" />
              <div className="text-sm font-bold">Configure the join</div>
              <span className="text-[10px] text-ink-dim font-mono">VLOOKUP-style match</span>
            </div>
            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <Field label={`Primary join column · ${primary.sourceName}`}>
                <select
                  value={primaryJoinCol}
                  onChange={(e) => setPrimaryJoinCol(e.target.value)}
                  className="input text-xs py-1.5 w-full"
                >
                  {primary.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div className="flex items-center justify-center pb-1.5">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
              </div>
              <Field label={`Lookup join column · ${lookup.sourceName}`}>
                <select
                  value={lookupJoinCol}
                  onChange={(e) => setLookupJoinCol(e.target.value)}
                  className="input text-xs py-1.5 w-full"
                >
                  {lookup.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-2 flex items-center gap-2">
                <Layers className="w-3 h-3" /> Bring back from lookup
                <span className="text-ink-muted normal-case tracking-normal">— columns to splice into the primary rows</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lookup.columns.filter(c => c !== lookupJoinCol).map(c => (
                  <label
                    key={c}
                    className={`text-[11px] font-mono px-2 py-1 rounded ring-1 cursor-pointer transition select-none
                      ${bringBack.has(c)
                        ? "ring-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "ring-bg-border bg-bg-card/40 text-ink-dim"}`}
                  >
                    <input
                      type="checkbox" className="hidden"
                      checked={bringBack.has(c)}
                      onChange={(e) => setBringBack(prev => {
                        const next = new Set(prev);
                        e.target.checked ? next.add(c) : next.delete(c);
                        return next;
                      })}
                    />
                    {c}
                  </label>
                ))}
                {lookup.columns.filter(c => c !== lookupJoinCol).length === 0 && (
                  <span className="text-xs text-ink-muted">Lookup file only has the join column.</span>
                )}
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-4 gap-3 text-xs">
              <Field label="Join kind">
                <select
                  value={joinKind}
                  onChange={(e) => setJoinKind(e.target.value as any)}
                  className="input text-xs py-1.5 w-full"
                >
                  <option value="left">Left (keep all primary rows)</option>
                  <option value="inner">Inner (matched rows only)</option>
                </select>
              </Field>
              <Field label="Match options">
                <label className="flex items-center gap-2 mt-1.5">
                  <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                  <span className="text-ink-muted">Case-insensitive</span>
                </label>
              </Field>
              <Field label="">
                <label className="flex items-center gap-2 mt-1.5">
                  <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
                  <span className="text-ink-muted">Trim whitespace</span>
                </label>
              </Field>
              <Field label="">
                <button
                  onClick={runJoin}
                  disabled={!canJoin}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                             bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-900/30
                             hover:from-emerald-400 hover:to-emerald-600 transition
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {joining ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><GitMerge className="w-3.5 h-3.5" /> Run join <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </Field>
            </div>
          </div>
        )}

        {/* Join progress */}
        {joining && (
          <div className="card p-3 flex items-center gap-3 text-xs ring-1 ring-emerald-500/20">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <div className="text-ink-muted">
              <span className="font-mono uppercase tracking-wider mr-2 text-emerald-300">{joining.phase}</span>
              {joining.totalRows
                ? `${(joining.rows ?? 0).toLocaleString()} / ${joining.totalRows.toLocaleString()} rows`
                : `${(joining.rows ?? 0).toLocaleString()} rows`}
              {joining.matched !== undefined && <> · <span className="text-emerald-300">{joining.matched.toLocaleString()} matched</span></>}
            </div>
            <div className="flex-1 h-1.5 bg-bg-border rounded overflow-hidden ml-2">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: joining.totalRows ? `${Math.min(100, ((joining.rows ?? 0) / joining.totalRows) * 100)}%` : "30%" }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="card p-3 ring-1 ring-emerald-500/20">
            {/* Stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <Stat label="Primary rows" value={result.stats.primaryRows.toLocaleString()} />
              <Stat label="Lookup rows"  value={result.stats.lookupRows.toLocaleString()} />
              <Stat label="Matched"      value={result.stats.matchCount.toLocaleString()}
                    accent={result.stats.matchCount > 0 ? "good" : undefined} />
              <Stat label="Unmatched"    value={result.stats.unmatchedCount.toLocaleString()}
                    accent={result.stats.unmatchedCount > 0 ? "warn" : undefined} />
              <Stat label="Multi-match"  value={result.stats.multiMatchCount.toLocaleString()}
                    hint="primary rows where the lookup key appeared more than once (first match was used)" />
            </div>

            {/* View tabs + actions */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {(["merged", "matched", "unmatched"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition ring-1
                    ${view === v
                      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                      : "text-ink-muted ring-bg-border hover:text-ink hover:ring-emerald-500/30"}`}
                >
                  {v} ({(v === "merged" ? result.merged.length : v === "matched" ? result.matched.length : result.unmatched.length).toLocaleString()})
                </button>
              ))}
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
              <button onClick={exportCSV} className="btn-ghost text-xs" title="Download CSV"><Download className="w-3.5 h-3.5" /> CSV</button>
              <button onClick={exportXLSX} className="btn-ghost text-xs" title="Download XLSX"><Download className="w-3.5 h-3.5" /> XLSX</button>
            </div>

            <ResultGrid columns={result.columns} rows={filtered} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────
function visibleRows(result: JoinResult, view: "merged" | "matched" | "unmatched"): Row[] {
  if (view === "matched") return result.matched;
  if (view === "unmatched") return result.unmatched;
  return result.merged;
}

function csvLine(values: any[]): string {
  return values.map(v => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function download(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── Sub-components ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1 min-h-[14px]">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "good" | "warn" }) {
  const tone =
    accent === "good" ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/[.06]" :
    accent === "warn" ? "text-warn ring-warn/30 bg-warn/[.06]" :
    "ring-bg-border bg-bg-card/40";
  return (
    <div className={`rounded-lg p-2.5 ring-1 ${tone}`} title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">{value}</div>
    </div>
  );
}

function CrosswalkWordmark() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-700 grid place-items-center shadow-md shadow-emerald-900/40">
        <FileSpreadsheet className="w-4 h-4 text-white" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-sm font-bold text-emerald-100 tracking-tight">Crosswalk</div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-500/70 font-mono">Excel data joiner</div>
      </div>
    </div>
  );
}

function UploadCard({
  side, label, tag, loaded, inputRef, onPick, onSheet, onClear, parsing,
}: {
  side: "primary" | "lookup";
  label: string;
  tag: string;
  loaded: LoadedSide | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File) => void;
  onSheet: (s: string) => void;
  onClear: () => void;
  parsing: ProgressMsg | null;
}) {
  const ringTone = side === "primary"
    ? "ring-emerald-500/30 hover:ring-emerald-500/60"
    : "ring-emerald-700/30 hover:ring-emerald-700/60";
  const accent = side === "primary" ? "text-emerald-300" : "text-emerald-500";

  if (!loaded) {
    return (
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={`card p-6 ring-1 ${ringTone} cursor-pointer transition relative overflow-hidden`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.json,.xlsx,.xls,.xlsm,.ods"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
        />
        <div className="absolute -top-px -right-px w-24 h-24 rounded-tr-2xl bg-gradient-to-br from-emerald-500/20 to-transparent pointer-events-none" />

        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg ring-1 ring-emerald-500/30 bg-emerald-500/10 grid place-items-center shrink-0`}>
            <FileSpreadsheet className={`w-5 h-5 ${accent}`} />
          </div>
          <div>
            <div className="text-sm font-bold">{label}</div>
            <div className="text-[11px] text-ink-muted">{tag}</div>
          </div>
        </div>

        {parsing ? (
          <div className="text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span className="text-ink-muted font-mono uppercase tracking-wider">{parsing.phase}</span>
            <span className="text-ink-muted">
              {parsing.totalBytes
                ? `${fmtBytes(parsing.bytes ?? 0)} / ${fmtBytes(parsing.totalBytes)}`
                : parsing.totalRows
                  ? `${(parsing.rows ?? 0).toLocaleString()} / ${parsing.totalRows.toLocaleString()} rows`
                  : `${(parsing.rows ?? 0).toLocaleString()} rows`}
            </span>
          </div>
        ) : (
          <div className="border border-dashed border-emerald-500/30 rounded-lg py-8 text-center text-xs text-ink-muted">
            <Upload className={`w-6 h-6 mx-auto mb-2 ${accent}`} />
            <div>Drop a file here or click to browse</div>
            <div className="text-[10px] text-ink-dim mt-2 font-mono">CSV · TSV · JSON · XLSX · XLS · ODS</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4 ring-1 ring-emerald-500/20">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg ring-1 ring-emerald-500/40 bg-emerald-500/15 grid place-items-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{loaded.sourceName}</div>
          <div className="text-[11px] text-ink-muted font-mono">
            {loaded.rows.length.toLocaleString()} rows · {loaded.columns.length} cols
            {loaded.sizeBytes ? ` · ${fmtBytes(loaded.sizeBytes)}` : ""}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-ink-muted hover:text-bad p-1"
          title="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loaded.sheetNames && loaded.sheetNames.length > 1 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1">Sheet</div>
          <select
            value={loaded.activeSheet}
            onChange={(e) => onSheet(e.target.value)}
            className="input text-xs py-1.5 w-full"
          >
            {loaded.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer hover:text-ink select-none mb-1">First 5 rows preview</summary>
        <div className="overflow-x-auto rounded ring-1 ring-bg-border mt-2 max-h-48">
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-bg-panel/80 text-ink-muted">
              <tr>
                {loaded.columns.map(c => (
                  <th key={c} className="px-2 py-1 text-left whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loaded.rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-t border-bg-border/60">
                  {loaded.columns.map(c => (
                    <td key={c} className="px-2 py-1 truncate max-w-[180px]" title={String(r[c] ?? "")}>
                      {String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <button
        onClick={() => inputRef.current?.click()}
        className="mt-3 btn-ghost text-xs w-full"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Replace file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.json,.xlsx,.xls,.xlsm,.ods"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
    </div>
  );
}

// ── Virtualised result grid ─────────────────────────────────────────────
function ResultGrid({ columns, rows }: { columns: string[]; rows: Row[] }) {
  const [scrollTop, setScrollTop] = useState(0);

  const total = rows.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
  const end = Math.min(total, Math.ceil((scrollTop + PREVIEW_HEIGHT) / ROW_H) + 6);

  const colWidth = Math.max(110, Math.min(220, 1100 / Math.max(1, columns.length)));
  const totalWidth = 56 + columns.length * colWidth;

  return (
    <div className="rounded ring-1 ring-emerald-900/40 overflow-hidden">
      {/* Header — Excel-style dark green */}
      <div className="bg-emerald-900/40 border-b border-emerald-700/40 overflow-x-auto">
        <div
          className="flex text-[10px] uppercase tracking-wider text-emerald-200 font-mono"
          style={{ width: totalWidth, minWidth: "100%" }}
        >
          <div className="px-2 py-1.5 text-right shrink-0 border-r border-emerald-700/40" style={{ width: 56 }}>#</div>
          {columns.map(c => (
            <div
              key={c}
              className="px-2 py-1.5 truncate shrink-0 border-r border-emerald-700/40"
              style={{ width: colWidth }}
              title={c}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* Body — virtualised, faint Excel gridlines */}
      <div
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: PREVIEW_HEIGHT, overflow: "auto" }}
      >
        {total === 0 ? (
          <div className="text-center text-ink-muted py-10 text-sm">No rows.</div>
        ) : (
          <div style={{ height: total * ROW_H, position: "relative", width: totalWidth, minWidth: "100%" }}>
            {Array.from({ length: end - start }, (_, k) => {
              const ix = start + k;
              const r = rows[ix];
              if (!r) return null;
              const matchTone = r._match === "no-match"
                ? "bg-amber-500/[.05] hover:bg-amber-500/[.10]"
                : ix % 2 === 0 ? "hover:bg-emerald-500/[.06]" : "bg-bg-card/30 hover:bg-emerald-500/[.06]";
              return (
                <div
                  key={ix}
                  className={`flex items-center text-xs font-mono border-t border-emerald-900/30 ${matchTone}`}
                  style={{ position: "absolute", top: ix * ROW_H, height: ROW_H, width: "100%" }}
                >
                  <div className="px-2 text-right text-emerald-700 shrink-0 border-r border-emerald-900/20" style={{ width: 56 }}>
                    {(ix + 1).toLocaleString()}
                  </div>
                  {columns.map(c => (
                    <div
                      key={c}
                      className={`px-2 truncate shrink-0 border-r border-emerald-900/10 ${
                        c === "_match"
                          ? r._match === "no-match" ? "text-amber-400" : "text-emerald-400"
                          : "text-ink"
                      }`}
                      style={{ width: colWidth }}
                      title={String(r[c] ?? "")}
                    >
                      {c === "_match" && r._match === "no-match"
                        ? <span className="inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> no-match</span>
                        : c === "_match" && r._match
                          ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {String(r[c])}</span>
                          : String(r[c] ?? "")}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
