/**
 * Tokenize a shell-style command line. Handles single quotes, double quotes,
 * backslash escapes, and `\<newline>` line continuations.
 * (Same algorithm as backend/internal/curl/parser.go.)
 */
export function tokenize(input: string): string[] {
  let s = input.replace(/\\\r?\n/g, " ");
  const out: string[] = [];
  let buf = "";
  let inSingle = false, inDouble = false, escape = false;
  const flush = () => { if (buf.length) { out.push(buf); buf = ""; } };
  for (const c of s) {
    if (escape)                                    { buf += c; escape = false; continue; }
    if (c === "\\" && !inSingle)                   { escape = true; continue; }
    if (c === "'" && !inDouble)                    { inSingle = !inSingle; continue; }
    if (c === '"' && !inSingle)                    { inDouble = !inDouble; continue; }
    if (/\s/.test(c) && !inSingle && !inDouble)    { flush(); continue; }
    buf += c;
  }
  flush();
  return out;
}

export type ParsedCurl = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Friendly suggested test name derived from URL + method. */
  suggestedName: string;
};

/** Parse a curl command line into a clean request shape. */
export function parseCurl(input: string): ParsedCurl {
  let tokens = tokenize(input.trim());
  if (tokens[0]?.toLowerCase() === "curl") tokens = tokens.slice(1);

  let method = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  let body = "";

  const setHeader = (raw: string) => {
    const i = raw.indexOf(":");
    if (i <= 0) return;
    const k = raw.slice(0, i).trim();
    const v = raw.slice(i + 1).trim();
    if (k) headers[k] = v;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i];
    switch (true) {
      case t === "-X" || t === "--request":
        method = (next() || "GET").toUpperCase(); break;
      case t === "-H" || t === "--header":
        setHeader(next() || ""); break;
      case t === "-d" || t === "--data" || t === "--data-raw" ||
           t === "--data-binary" || t === "--data-ascii": {
        const v = next() || "";
        body = body ? body + "&" + v : v;
        if (method === "GET") method = "POST";
        break;
      }
      case t === "-u" || t === "--user": {
        const v = next() || "";
        if (v) headers["Authorization"] = "Basic " + btoa(v);
        break;
      }
      case t === "--url":
        url = next() || ""; break;
      case t === "-A" || t === "--user-agent":
        headers["User-Agent"] = next() || ""; break;
      case t === "-e" || t === "--referer":
        headers["Referer"] = next() || ""; break;
      // No-op flags
      case t === "-L" || t === "--location":
      case t === "-k" || t === "--insecure":
      case t === "--compressed":
      case t === "-s" || t === "--silent":
      case t === "-i" || t === "--include":
      case t === "-v" || t === "--verbose":
        break;
      case t.startsWith("-"):
        // Unknown flag — if next token isn't another flag, consume it as the value.
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) i++;
        break;
      default:
        if (!url) url = t;
    }
  }

  // If body looks like JSON and Content-Type wasn't set, guess it.
  if (body && !headers["Content-Type"] && !headers["content-type"]) {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      headers["Content-Type"] = "application/json";
    }
  }

  return { method, url, headers, body, suggestedName: suggestName(method, url) };
}

/**
 * Build a friendly, short test name from a method + URL.
 *   POST https://api.example.com/v1/widgets/12  →  "POST widgets"
 *   GET  https://x.com/users?id=42              →  "GET users"
 *   /                                            →  "GET request"
 */
export function suggestName(method: string, url: string): string {
  if (!url) return "";
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split("?")[0];
  }
  const segments = path
    .split("/")
    .filter(Boolean)
    // skip pure-numeric / uuid-like ids
    .filter((s) => !/^[0-9a-f-]{8,}$/i.test(s) && !/^\d+$/.test(s));
  const last = segments[segments.length - 1] || "request";
  return `${(method || "GET").toUpperCase()} ${last}`.slice(0, 60);
}

/** Try to pretty-print a JSON body. Returns the original string if not JSON. */
export function prettyJSON(body: string): string {
  if (!body) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Render a `Record<string,string>` of headers back into the textarea format. */
export function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
