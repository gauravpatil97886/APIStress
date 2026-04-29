const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8080";

export const KEY_STORAGE = "ch_access_key";
export const USER_STORAGE = "ch_user_name";

export function getKey(): string {
  return localStorage.getItem(KEY_STORAGE) || "";
}
export function setKey(k: string) { localStorage.setItem(KEY_STORAGE, k); }
export function clearKey() { localStorage.removeItem(KEY_STORAGE); }

export function getUser(): string { return localStorage.getItem(USER_STORAGE) || ""; }
export function setUser(u: string) { localStorage.setItem(USER_STORAGE, u); }

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
  login: (key: string) => req<{ ok: boolean; token: string }>("/api/auth/login", {
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
  compare: (a: string, b: string) => req<any>(`/api/compare?a=${a}&b=${b}`),
  costPricing: () => req<any>(`/api/cost/pricing`),
};
