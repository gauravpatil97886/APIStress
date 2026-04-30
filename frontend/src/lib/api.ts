const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8080";

export const KEY_STORAGE = "ch_access_key";
export const USER_STORAGE = "ch_user_name";
export const TEAM_STORAGE = "ch_team";

export function getKey(): string {
  return localStorage.getItem(KEY_STORAGE) || "";
}
export function setKey(k: string) { localStorage.setItem(KEY_STORAGE, k); }
export function clearKey() {
  localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(TEAM_STORAGE);
}

export function getUser(): string { return localStorage.getItem(USER_STORAGE) || ""; }
export function setUser(u: string) { localStorage.setItem(USER_STORAGE, u); }

export type TeamInfo = {
  id: string;
  name: string;
  description?: string;
  tools_access?: string[];
};

export function getTeam(): TeamInfo | null {
  try { return JSON.parse(localStorage.getItem(TEAM_STORAGE) || "null"); } catch { return null; }
}
export function setTeam(t: TeamInfo | null) {
  if (t) localStorage.setItem(TEAM_STORAGE, JSON.stringify(t));
  else localStorage.removeItem(TEAM_STORAGE);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  const k = getKey();
  if (k) headers.set("X-Access-Key", k);
  const res = await fetch(BASE + path, { ...init, headers });
  if (res.status === 401) {
    clearKey();
    if (location.pathname !== "/login") location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    let msg = `http ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  login: (key: string) => req<{ ok: boolean; token: string; team: TeamInfo }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ key }),
  }),
  verify: () => req<{ ok: boolean }>("/api/auth/verify"),

  listTests: () => req<any[]>("/api/tests"),
  getTest: (id: string) => req<any>(`/api/tests/${id}`),
  createTest: (b: any) => req<{ id: string }>("/api/tests", { method: "POST", body: JSON.stringify(b) }),
  updateTest: (id: string, b: any) => req<void>(`/api/tests/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteTest: (id: string) => req<void>(`/api/tests/${id}`, { method: "DELETE" }),

  listRuns:   () => req<any[]>("/api/runs"),
  startRun:   (b: any) => req<{ run_id: string }>("/api/runs", { method: "POST", body: JSON.stringify(b) }),
  runStatus:  (id: string) => req<any>(`/api/runs/${id}`),
  stopRun:    (id: string) => req<{ ok: boolean }>(`/api/runs/${id}/stop`, { method: "POST" }),

  report:     (id: string) => req<any>(`/api/reports/${id}`),
  reportHTMLUrl: (id: string) => `${BASE}/api/reports/${id}/html?key=${encodeURIComponent(getKey())}`,
  reportPDFUrl:  (id: string) => `${BASE}/api/reports/${id}/pdf?key=${encodeURIComponent(getKey())}`,

  listEnvs: () => req<any[]>("/api/environments"),
  createEnv: (b: any) => req<{ id: string }>("/api/environments", { method: "POST", body: JSON.stringify(b) }),
  deleteEnv: (id: string) => req<void>(`/api/environments/${id}`, { method: "DELETE" }),

  liveURL: (id: string) => `${BASE}/api/runs/${id}/live?key=${encodeURIComponent(getKey())}`,

  // Jira integration — health probe + one-shot attach-run-to-issue.
  jiraHealth: () => req<{
    configured: boolean; ok?: boolean; base_url?: string; auth_kind?: string;
    project?: string; account?: string; error?: string;
  }>("/api/jira/health"),
  jiraAttachRun: (runID: string, body: { jira_id?: string; comment?: string } = {}) =>
    req<{ ok: boolean; jira_id: string; jira_url: string; filename: string }>(
      `/api/runs/${runID}/attach-jira`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  jiraAttachments: (runID: string) =>
    req<Array<{
      id: number; jira_id: string; jira_url: string; filename: string;
      bytes: number; attached_by: string; attached_at: string;
    }>>(`/api/runs/${runID}/jira-attachments`),
  // Kavach — VAPT security scanner.
  kavach: {
    startScan: (b: {
      curl?: string;
      request?: any;
      created_by?: string;
      jira_id?: string;
      jira_link?: string;
      notes?: string;
      categories?: string[];
      rate_limit_rps?: number;
      max_duration_sec?: number;
      severity_threshold?: string;
      confirm_hostname: string;
    }) => req<{ scan_id: string }>("/api/kavach/scans", { method: "POST", body: JSON.stringify(b) }),
    listScans: () => req<any[]>("/api/kavach/scans"),
    getScan: (id: string) => req<any>(`/api/kavach/scans/${id}`),
    stopScan: (id: string) => req<{ ok: boolean }>(`/api/kavach/scans/${id}/stop`, { method: "POST" }),
    liveURL: (id: string) => `${BASE}/api/kavach/scans/${id}/live?key=${encodeURIComponent(getKey())}`,
    pdfURL:  (id: string) => `${BASE}/api/kavach/scans/${id}/pdf?key=${encodeURIComponent(getKey())}`,
    fileFinding: (findingID: number, b: {
      project_key?: string; issue_type?: string; summary?: string;
      comment?: string; priority?: string; labels?: string[];
    }) => req<{ ok: boolean; jira_id: string; jira_url: string }>(
      `/api/kavach/findings/${findingID}/file-jira`,
      { method: "POST", body: JSON.stringify(b) },
    ),
    attachReport: (id: string, b: { jira_id: string; comment?: string }) =>
      req<{ ok: boolean; jira_id: string; jira_url: string; filename: string }>(
        `/api/kavach/scans/${id}/attach-jira`,
        { method: "POST", body: JSON.stringify(b) },
      ),
    jiraLinks: (id: string) => req<Array<{
      id: number; finding_id?: number | null; kind: "issue_created" | "report_attached";
      jira_id: string; jira_url: string; filename?: string; bytes?: number;
      actor: string; created_at: string;
    }>>(`/api/kavach/scans/${id}/jira-links`),
  },

  jiraLookupIssue: (key: string) => req<{
    key: string;
    summary: string;
    status?: string;
    issue_type?: string;
    priority?: string;
    url?: string;
    assignee_name?: string;
    assignee_email?: string;
    assignee_avatar?: string;
  }>(`/api/jira/issue/${encodeURIComponent(key)}`),

  compare: (a: string, b: string) => req<any>(`/api/compare?a=${a}&b=${b}`),
  costPricing: () => req<any>(`/api/cost/pricing`),

  // ─── PostWomen ───────────────────────────────────────────────────────
  pwListWorkspaces: () => req<any[]>(`/api/postwomen/workspaces`),
  pwCreateWorkspace: (name: string) =>
    req<{ id: string }>(`/api/postwomen/workspaces`, { method: "POST", body: JSON.stringify({ name }) }),
  pwDeleteWorkspace: (id: string) =>
    req<void>(`/api/postwomen/workspaces/${id}`, { method: "DELETE" }),
  pwTree: (workspaceID: string) =>
    req<{ collections: any[]; requests: any[] }>(`/api/postwomen/workspaces/${workspaceID}/tree`),
  pwCreateCollection: (b: any) =>
    req<{ id: string }>(`/api/postwomen/collections`, { method: "POST", body: JSON.stringify(b) }),
  pwRenameCollection: (id: string, name: string) =>
    req<void>(`/api/postwomen/collections/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  pwDeleteCollection: (id: string) =>
    req<void>(`/api/postwomen/collections/${id}`, { method: "DELETE" }),
  pwCreateRequest: (b: any) =>
    req<{ id: string }>(`/api/postwomen/requests`, { method: "POST", body: JSON.stringify(b) }),
  pwUpdateRequest: (id: string, b: any) =>
    req<void>(`/api/postwomen/requests/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  pwDeleteRequest: (id: string) =>
    req<void>(`/api/postwomen/requests/${id}`, { method: "DELETE" }),
  pwSend: (request: any, vars: Record<string, string> = {}, opts?: { saveHistory?: boolean }) =>
    req<any>(`/api/postwomen/send`, {
      method: "POST",
      body: JSON.stringify({
        request, vars,
        // default true to preserve the existing single-send behaviour;
        // the Runner passes false at lakh-scale to skip pw_history writes.
        save_history: opts?.saveHistory ?? true,
      }),
    }),
  pwImport: (workspaceID: string, body: string) =>
    req<{ collection_id: string; counts: any }>(`/api/postwomen/import?workspace_id=${workspaceID}`, {
      method: "POST",
      body,
    }),
  pwExportURL: (collectionID: string) =>
    `${BASE}/api/postwomen/export/${collectionID}?key=${encodeURIComponent(getKey())}`,
  pwHistory: () => req<any[]>(`/api/postwomen/history`),

  // Activity logger — fires events to populate the admin's audit feed.
  // Best-effort: never let a logging failure break a real user flow.
  logActivity: (e: {
    event_type: string;
    tool_slug?: string;
    resource_type?: string;
    resource_id?: string;
    actor_name?: string;
    meta?: Record<string, any>;
  }) => req<{ ok: true }>("/api/activity", { method: "POST", body: JSON.stringify(e) }).catch(() => undefined),
};

// ── Admin API ────────────────────────────────────────────────────────────
export const ADMIN_KEY_STORAGE = "ch_admin_key";

export function getAdminKey(): string {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}
export function setAdminKey(k: string) { sessionStorage.setItem(ADMIN_KEY_STORAGE, k); }
export function clearAdminKey() { sessionStorage.removeItem(ADMIN_KEY_STORAGE); }

async function adminReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  const k = getAdminKey();
  if (k) headers.set("X-Admin-Key", k);
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) {
    let msg = `http ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const adminApi = {
  auth: (key: string) =>
    fetch(BASE + "/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }).then(async (r) => {
      if (!r.ok) {
        let msg = "wrong admin passphrase";
        try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return true;
    }),
  listTeams:    () => adminReq<any[]>("/api/admin/teams"),
  createTeam:   (b: { name: string; description: string; tools: string[] }) =>
    adminReq<{ team: any; plain_key: string }>("/api/admin/teams", {
      method: "POST", body: JSON.stringify(b),
    }),
  renameTeam:   (id: string, b: any) =>
    adminReq<void>(`/api/admin/teams/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteTeam:   (id: string) =>
    adminReq<void>(`/api/admin/teams/${id}`, { method: "DELETE" }),
  rotateKey:    (id: string) =>
    adminReq<{ plain_key: string }>(`/api/admin/teams/${id}/rotate`, { method: "POST" }),
  setActive:    (id: string, active: boolean) =>
    adminReq<void>(`/api/admin/teams/${id}/active`, { method: "POST", body: JSON.stringify({ active }) }),
  audit:        () => adminReq<any[]>("/api/admin/audit"),
  // Cross-tool activity feed (POST /api/admin/activity).
  activity: (params: {
    team_id?: string; tool?: string; event?: string; q?: string;
    since?: string; until?: string; limit?: number; offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    const s = qs.toString();
    return adminReq<any[]>(`/api/admin/activity${s ? "?" + s : ""}`);
  },
  activityStats: (hours = 168) =>
    adminReq<any>(`/api/admin/activity/stats?hours=${hours}`),
  jiraHealth: () => adminReq<{
    configured: boolean; ok?: boolean; account?: string; base_url?: string;
    auth_kind?: string; project?: string; error?: string;
    email?: string; account_id?: string; avatar?: string; timezone?: string;
    locale?: string; active?: boolean;
  }>("/api/admin/jira/health"),
};
