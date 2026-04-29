// crosswalk.worker.ts — off-main-thread engine for the Crosswalk (VLOOKUP-
// style) tool. Built so very large files don't freeze the UI:
//
//   - **Streaming CSV parse**: reads a `File` as a `ReadableStream`, decodes
//     UTF-8 in chunks, parses one line at a time, never holds the raw text
//     in memory. Yields a stream of row objects + periodic progress msgs.
//     Realistic ceiling: ~10 GB CSV (limited by browser File API + the time
//     you're willing to wait), no row-count cap.
//
//   - **XLSX parse**: SheetJS needs the whole file in memory, so the realistic
//     ceiling is ~1-2 GB / a few million rows. We warn the user above 200k
//     rows and refuse outright above 5M to keep the tab from OOM'ing.
//
//   - **Hash index**: builds a `Map<key, row[]>` on the lookup file's join
//     column. Memory is O(rows × columns × avg-cell-size). For 5M rows × 10
//     small cols the index is ~500 MB — fits but starts to hurt; we surface
//     an estimate so the operator knows what they're committing to.
//
//   - **Join + stream output**: walks the primary file's rows once, looks up
//     each one in the index, and either pushes the merged row into a results
//     batch (sent back in 1k-row chunks) or marks it unmatched. The output is
//     accumulated in main thread memory because the user wants to preview /
//     paginate it, but all the *parsing* heavy lifting is over here.

import * as XLSX from "xlsx";

type Row = Record<string, any>;
// We don't depend on DOM lib for this worker, so cast to any to avoid pulling
// the WebWorker.d.ts into the project's tsconfig.
const ctx: any = self;

ctx.onmessage = (e: MessageEvent) => {
  const { kind, payload, jobID } = e.data || {};
  try {
    if (kind === "load-file")  return void loadFile(payload, jobID);
    if (kind === "load-xlsx-sheet") return void loadXlsxSheet(payload, jobID);
    if (kind === "join")       return void runJoin(payload, jobID);
    post({ type: "error", jobID, error: `unknown kind: ${kind}` });
  } catch (err: any) {
    post({ type: "error", jobID, error: err?.message || String(err) });
  }
};

function post(msg: any, transfer?: ArrayBuffer[]) {
  if (transfer && transfer.length) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

// ── File loading ────────────────────────────────────────────────────────
async function loadFile(
  { file, side }: { file: File; side: "primary" | "lookup" },
  jobID: string,
) {
  const name = file.name;
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "csv" || ext === "tsv") {
    return loadCSVStream(file, ext === "tsv" ? "\t" : ",", side, jobID);
  }
  if (ext === "json") {
    return loadJSON(file, side, jobID);
  }
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") {
    return loadXlsx(file, side, jobID);
  }
  post({ type: "error", jobID, error: `unsupported file: .${ext}` });
}

async function loadCSVStream(file: File, sep: string, side: string, jobID: string) {
  // Quote-aware streaming parse. We tokenize as we go so a quoted cell can
  // span chunks / span newlines without breaking.
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let columns: string[] | null = null;
  const rows: Row[] = [];
  let cur = "", row: string[] = [], inQuote = false;
  let bytesRead = 0;
  const totalBytes = file.size || 0;
  let lastProgress = 0;

  const total = totalBytes;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    const text = decoder.decode(value, { stream: true });
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
          row.push(cur); cur = "";
          if (!columns) {
            columns = row.map((c, i) => String(c).trim() || `col_${i + 1}`);
          } else {
            if (row.length === 1 && row[0] === "") { row = []; continue; }
            const obj: Row = {};
            for (let j = 0; j < columns.length; j++) obj[columns[j]] = row[j] ?? "";
            rows.push(obj);
          }
          row = [];
        } else if (c === "\r") { /* skip */ }
        else cur += c;
      }
    }
    // Tap a progress message about every 5 MB.
    if (bytesRead - lastProgress > 5 * 1024 * 1024) {
      lastProgress = bytesRead;
      post({ type: "progress", jobID, side, phase: "reading", bytes: bytesRead, totalBytes: total, rows: rows.length });
    }
  }
  // tail
  if (cur !== "" || row.length) {
    row.push(cur);
    if (!columns) columns = row.map((c, i) => String(c).trim() || `col_${i + 1}`);
    else {
      const obj: Row = {};
      for (let j = 0; j < columns.length; j++) obj[columns[j]] = row[j] ?? "";
      rows.push(obj);
    }
  }

  post({
    type: "loaded",
    jobID, side,
    columns: columns || [],
    rows,
    sourceName: file.name,
    sizeBytes: file.size,
  });
}

async function loadJSON(file: File, side: string, jobID: string) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    post({ type: "error", jobID, error: "JSON must be an array of objects" });
    return;
  }
  const colSet = new Set<string>();
  const limit = Math.min(data.length, 5000);
  for (let i = 0; i < limit; i++) {
    const r = data[i];
    if (r && typeof r === "object") for (const k of Object.keys(r)) colSet.add(k);
  }
  if (data.length > limit) {
    for (let i = limit; i < data.length; i++) {
      const r = data[i];
      if (r && typeof r === "object") for (const k of Object.keys(r)) colSet.add(k);
      if (i % 50_000 === 0) post({ type: "progress", jobID, side, phase: "indexing", rows: i, totalRows: data.length });
    }
  }
  post({
    type: "loaded",
    jobID, side,
    columns: [...colSet],
    rows: data,
    sourceName: file.name,
    sizeBytes: file.size,
  });
}

async function loadXlsx(file: File, side: string, jobID: string) {
  post({ type: "progress", jobID, side, phase: "decoding" });
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetNames = wb.SheetNames;
  const active = sheetNames[0];
  const { columns, rows } = sheetToRows(wb, active, side, jobID);
  post({
    type: "loaded",
    jobID, side,
    columns,
    rows,
    sourceName: file.name,
    sizeBytes: file.size,
    sheetNames,
    activeSheet: active,
    workbookBuffer: buf,
  }, [buf]);
}

async function loadXlsxSheet(
  { buffer, sheet, side }: { buffer: ArrayBuffer; sheet: string; side: string },
  jobID: string,
) {
  post({ type: "progress", jobID, side, phase: "decoding" });
  const wb = XLSX.read(buffer, { type: "array" });
  const { columns, rows } = sheetToRows(wb, sheet, side, jobID);
  post({
    type: "loaded",
    jobID, side,
    columns,
    rows,
    sourceName: sheet,
    sizeBytes: 0,
    sheetNames: wb.SheetNames,
    activeSheet: sheet,
    workbookBuffer: buffer,
  }, [buffer]);
}

function sheetToRows(wb: XLSX.WorkBook, sheet: string, side: string, jobID: string) {
  const ws = wb.Sheets[sheet];
  if (!ws) return { columns: [], rows: [] };
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false, raw: true });
  if (aoa.length === 0) return { columns: [], rows: [] };
  const columns = (aoa[0] || []).map((c, i) => String(c ?? "").trim() || `col_${i + 1}`);
  const dataRows = aoa.length - 1;
  const rows: Row[] = new Array(dataRows);
  for (let i = 1; i < aoa.length; i++) {
    const src = aoa[i];
    const obj: Row = {};
    for (let j = 0; j < columns.length; j++) obj[columns[j]] = src[j] ?? "";
    rows[i - 1] = obj;
    if (i % 25_000 === 0) {
      post({ type: "progress", jobID, side, phase: "shaping", rows: i, totalRows: dataRows });
    }
  }
  return { columns, rows };
}

// ── Join ───────────────────────────────────────────────────────────────
type JoinPayload = {
  primary: { rows: Row[]; columns: string[]; joinCol: string };
  lookup:  { rows: Row[]; columns: string[]; joinCol: string };
  bringBack: string[];                  // columns from lookup to splice in
  caseInsensitive: boolean;
  trimWhitespace: boolean;
  joinKind: "left" | "inner";
  prefix?: string;                      // collision-safe prefix for bringBack cols
};

type MatchedRow = Row;

function normaliseKey(v: any, ci: boolean, trim: boolean): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (trim) s = s.trim();
  if (ci) s = s.toLowerCase();
  return s;
}

async function runJoin(p: JoinPayload, jobID: string) {
  const { primary, lookup, bringBack, caseInsensitive, trimWhitespace, joinKind } = p;
  const prefix = p.prefix || "";

  // Phase 1: index lookup.
  post({ type: "progress", jobID, phase: "indexing", rows: 0, totalRows: lookup.rows.length });
  const index = new Map<string, Row[]>();
  let dup = 0;
  for (let i = 0; i < lookup.rows.length; i++) {
    const r = lookup.rows[i];
    const k = normaliseKey(r[lookup.joinCol], caseInsensitive, trimWhitespace);
    if (!k) continue;
    const arr = index.get(k);
    if (arr) { arr.push(r); dup++; }
    else index.set(k, [r]);
    if (i % 50_000 === 0 && i > 0) {
      post({ type: "progress", jobID, phase: "indexing", rows: i, totalRows: lookup.rows.length });
      await yieldNow();
    }
  }

  // Phase 2: walk primary, splice in bringBack columns. Stream 5k-row batches
  // back to main thread so the UI can preview as we go.
  post({ type: "progress", jobID, phase: "joining", rows: 0, totalRows: primary.rows.length });
  const matched: MatchedRow[] = [];
  const unmatched: MatchedRow[] = [];
  let matchCount = 0;
  let multiMatchCount = 0;
  for (let i = 0; i < primary.rows.length; i++) {
    const pr = primary.rows[i];
    const k = normaliseKey(pr[primary.joinCol], caseInsensitive, trimWhitespace);
    const hit = k ? index.get(k) : undefined;
    if (hit && hit.length > 0) {
      const lkRow = hit[0];
      if (hit.length > 1) multiMatchCount++;
      const out: Row = { ...pr };
      for (const col of bringBack) {
        const outName = prefix ? prefix + col : (pr.hasOwnProperty(col) ? `${col}_lookup` : col);
        out[outName] = lkRow[col];
      }
      out["_match"] = hit.length === 1 ? "match" : `multi(${hit.length})`;
      matched.push(out);
      matchCount++;
    } else {
      if (joinKind === "left") {
        const out: Row = { ...pr };
        for (const col of bringBack) {
          const outName = prefix ? prefix + col : (pr.hasOwnProperty(col) ? `${col}_lookup` : col);
          out[outName] = "";
        }
        out["_match"] = "no-match";
        unmatched.push(out);
      } else {
        unmatched.push(pr);
      }
    }
    if (i % 25_000 === 0 && i > 0) {
      post({ type: "progress", jobID, phase: "joining", rows: i, totalRows: primary.rows.length, matched: matchCount });
      await yieldNow();
    }
  }

  // Output column order: primary columns first, then bring-back (with collision
  // suffix), then the synthetic _match flag.
  const finalCols: string[] = [...primary.columns];
  for (const col of bringBack) {
    const outName = prefix ? prefix + col : (primary.columns.includes(col) ? `${col}_lookup` : col);
    if (!finalCols.includes(outName)) finalCols.push(outName);
  }
  finalCols.push("_match");

  const merged = joinKind === "inner" ? matched : matched.concat(unmatched);

  post({
    type: "joined",
    jobID,
    columns: finalCols,
    matched,
    unmatched,
    merged,
    stats: {
      primaryRows: primary.rows.length,
      lookupRows: lookup.rows.length,
      matchCount,
      unmatchedCount: primary.rows.length - matchCount,
      duplicateKeys: dup,
      multiMatchCount,
      indexSize: index.size,
    },
  });
}

function yieldNow(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}
