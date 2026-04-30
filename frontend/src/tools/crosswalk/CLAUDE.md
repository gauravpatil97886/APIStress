# Crosswalk — frontend

Excel-themed VLOOKUP / data-join tool. Upload a primary file + a lookup file, pick join columns, splice columns from one into the other. **Frontend-only — no backend storage.**

## Layout

```
src/tools/crosswalk/
└── pages/
    ├── Crosswalk.tsx           # the entire app — single page
    └── crosswalk.worker.ts     # streaming CSV + XLSX + hash-index join
```

Theme accent: **green** (emerald) — calibrated to feel like a real Microsoft Excel ribbon.

## Streaming CSV (the hard part)

`crosswalk.worker.ts` consumes `File.stream()` line-by-line via the WHATWG Streams API:

1. **`reading`** — `File.stream().getReader()` pulls 64 KB chunks.
2. **`decoding`** — `TextDecoder` accumulates UTF-8 across chunk boundaries (multi-byte chars don't break the split).
3. **`shaping`** — split on newlines, parse a CSV row each (RFC 4180 quoting respected). The header is captured from the first non-empty row.
4. **`indexing`** — for the lookup file, bucket each row by its join-column hash → `Map<string, Row[]>`. O(n) memory, O(1) lookup later.
5. **`joining`** — stream the primary file again; for each row, look up by the join column. Three views are emitted simultaneously:
   - **Merged** — primary ⊕ matched columns (or empty if no match).
   - **Matched** — primary rows that did match.
   - **Unmatched** — primary rows that did NOT match.

Realistic ceiling: ~10 GB CSV (limited by browser TextDecoder + Map overhead, not the algorithm).

## XLSX path

SheetJS in-memory. Cap: 5 M rows / file. (XLSX has no streaming reader in the browser today.)

## Synthetic columns

`_match` flags `match` / `multi(N)` / `no-match`. Useful when the user expects 1-1 and gets 1-many.

## UI

- Three views (Merged / Matched / Unmatched) with a quick-filter input.
- Virtualised result grid (Excel-paper alternating rows + faint gridlines).
- CSV / XLSX export of the **current view**.
- Progress bar over the 5 worker phases.

## Tool isolation

- Imports `platform/api/client` (only for activity logging).
- Does NOT touch any other tool. Has no backend handler.
