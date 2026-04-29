// runner.worker.ts — off-main-thread parsing for the PostWomen Runner.
//
// Why a worker: a 5-lakh-row XLSX or 200 MB CSV will block the main thread
// for many seconds if parsed inline. Doing it here keeps the UI responsive
// and lets us emit periodic `progress` messages so the user sees something
// happening for a multi-second parse.

import * as XLSX from "xlsx";

type Row = Record<string, any>;

type ProgressMsg = { type: "progress"; parsed: number; total?: number; phase: string };
type DoneMsg = {
  type: "done";
  columns: string[];
  rows: Row[];
  sheetNames?: string[];
  activeSheet?: string;
};
type ErrorMsg = { type: "error"; error: string };

const ctx: any = self;

ctx.onmessage = (e: MessageEvent) => {
  const { kind, payload } = e.data || {};
  try {
    if (kind === "parse-csv")  return void parseCSVMsg(payload);
    if (kind === "parse-json") return void parseJSONMsg(payload);
    if (kind === "parse-xlsx") return void parseXLSXMsg(payload);
    post<ErrorMsg>({ type: "error", error: `unknown kind: ${kind}` });
  } catch (err: any) {
    post<ErrorMsg>({ type: "error", error: err?.message || String(err) });
  }
};

function post<T>(msg: T) { ctx.postMessage(msg as any); }

// ── CSV ─────────────────────────────────────────────────────────────────
async function parseCSVMsg({ text, delimiter }: { text: string; delimiter?: string }) {
  const sep = delimiter || ",";
  const out: string[][] = [];
  let cur = "", row: string[] = [], inQuote = false;
  let lineCount = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n") {
        row.push(cur); out.push(row); row = []; cur = "";
        lineCount++;
        if (lineCount % 10_000 === 0) {
          post<ProgressMsg>({ type: "progress", parsed: lineCount, phase: "reading" });
          await yieldNow();
        }
      } else if (c === "\r") { /* ignore */ }
      else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  if (out.length === 0) {
    post<DoneMsg>({ type: "done", columns: [], rows: [] });
    return;
  }
  const columns = out[0].map((c, i) => String(c).trim() || `col_${i + 1}`);
  const dataRows = out.length - 1;
  const rows: Row[] = new Array(dataRows);
  for (let r = 1; r < out.length; r++) {
    const src = out[r];
    if (src.length === 1 && src[0] === "") continue; // skip blank lines
    const obj: Row = {};
    for (let c = 0; c < columns.length; c++) obj[columns[c]] = src[c] ?? "";
    rows[r - 1] = obj;
    if (r % 20_000 === 0) {
      post<ProgressMsg>({ type: "progress", parsed: r, total: dataRows, phase: "shaping" });
      await yieldNow();
    }
  }
  // Compact in-place: skipped blank lines leave undefined holes.
  const compact = rows.filter(Boolean);
  post<DoneMsg>({ type: "done", columns, rows: compact });
}

// ── JSON ────────────────────────────────────────────────────────────────
async function parseJSONMsg({ text }: { text: string }) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    post<ErrorMsg>({ type: "error", error: "JSON must be an array of objects" });
    return;
  }
  const colSet = new Set<string>();
  // Sample first 1000 rows for column discovery to avoid O(n*k) on giant files.
  const sample = Math.min(data.length, 1000);
  for (let i = 0; i < sample; i++) {
    const r = data[i];
    if (r && typeof r === "object") for (const k of Object.keys(r)) colSet.add(k);
  }
  // If sampled, fall back to scanning all rows in a chunked pass.
  if (data.length > sample) {
    for (let i = sample; i < data.length; i++) {
      const r = data[i];
      if (r && typeof r === "object") for (const k of Object.keys(r)) colSet.add(k);
      if (i % 50_000 === 0) {
        post<ProgressMsg>({ type: "progress", parsed: i, total: data.length, phase: "indexing" });
        await yieldNow();
      }
    }
  }
  post<DoneMsg>({ type: "done", columns: [...colSet], rows: data });
}

// ── XLSX (binary) ───────────────────────────────────────────────────────
async function parseXLSXMsg({ buffer, sheet }: { buffer: ArrayBuffer; sheet?: string }) {
  post<ProgressMsg>({ type: "progress", parsed: 0, phase: "decoding" });
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetNames = wb.SheetNames;
  const active = sheet && sheetNames.includes(sheet) ? sheet : sheetNames[0];
  if (!active) {
    post<DoneMsg>({ type: "done", columns: [], rows: [], sheetNames });
    return;
  }
  const ws = wb.Sheets[active];
  // sheet_to_json with raw:true keeps numeric/date types intact.
  // header:1 gives us an array-of-arrays (faster to walk than objects).
  post<ProgressMsg>({ type: "progress", parsed: 0, phase: "shaping" });
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false, raw: true });
  if (aoa.length === 0) {
    post<DoneMsg>({ type: "done", columns: [], rows: [], sheetNames, activeSheet: active });
    return;
  }
  const columns = (aoa[0] || []).map((c, i) => String(c ?? "").trim() || `col_${i + 1}`);
  const dataRows = aoa.length - 1;
  const rows: Row[] = new Array(dataRows);
  for (let i = 1; i < aoa.length; i++) {
    const src = aoa[i];
    const obj: Row = {};
    for (let j = 0; j < columns.length; j++) obj[columns[j]] = src[j] ?? "";
    rows[i - 1] = obj;
    if (i % 20_000 === 0) {
      post<ProgressMsg>({ type: "progress", parsed: i, total: dataRows, phase: "shaping" });
      await yieldNow();
    }
  }
  post<DoneMsg>({ type: "done", columns, rows, sheetNames, activeSheet: active });
}

// Cooperative yield so progress messages get flushed and the worker stays
// interruptible-feeling. setTimeout(0) is enough — we just need to break the
// macrotask.
function yieldNow(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}
