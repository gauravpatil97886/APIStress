import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Send, Plus, Folder, FolderOpen, ChevronRight, ChevronDown,
  Trash2, Upload, Download, Hammer, Home, X, LogOut,
  Search, RefreshCw, Copy, Check, AlertCircle, Sparkles, Save, Terminal,
  FileSpreadsheet,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, getTeam, clearKey } from "../../../platform/api/client";
import { useDocumentTitle } from "../../../platform/hooks/useDocumentTitle";
import { PWWordmark, PWLogo } from "../components/Logo";
import { parseCurl, prettyJSON } from "../../../platform/api/curl";
import Runner from "./Runner";

type Collection = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  is_folder: boolean;
};
type Request = {
  id: string;
  collection_id: string | null;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query: { key: string; value: string; enabled: boolean }[];
  body_kind: string;
  body: any;
  auth: { kind: string; token?: string; username?: string; password?: string; key?: string; value?: string; in?: string };
  tests?: string;
  pre_script?: string;
  position?: number;
};
type HistoryItem = {
  request_id?: string;
  method: string;
  url: string;
  status: number;
  duration_ms: number;
  response_bytes: number;
  request?: Request;
  response?: any;
  ran_at: string;
};
type PWEnvironment = {
  id: string;
  workspace_id: string;
  name: string;
  values: Record<string, string>;
  created_at: string;
};

const ENV_TAGS = ["Production", "Broking", "UAT"] as const;
type EnvTag = typeof ENV_TAGS[number] | "";

const METHOD_TONE: Record<string, string> = {
  GET:    "text-good",
  POST:   "text-warn",
  PUT:    "text-cool",
  PATCH:  "text-brand",
  DELETE: "text-bad",
  HEAD:   "text-ink-muted",
  OPTIONS:"text-ink-muted",
};
const METHOD_BG: Record<string, string> = {
  GET:    "bg-good/15 ring-good/30",
  POST:   "bg-warn/15 ring-warn/30",
  PUT:    "bg-cool/15 ring-cool/30",
  PATCH:  "bg-brand/15 ring-brand/30",
  DELETE: "bg-bad/15 ring-bad/30",
};

function isValidURL(u: string): boolean {
  if (!u.trim()) return false;
  try { new URL(u); return true; } catch { return false; }
}

function generateCurl(req: Request): string {
  const parts = [`curl -X ${req.method} '${req.url}'`];
  Object.entries(req.headers || {}).forEach(([k, v]) => {
    if (k) parts.push(`  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`);
  });
  if (req.body_kind === "raw" || req.body_kind === "json") {
    if (req.body?.raw) {
      const b = String(req.body.raw).replace(/'/g, "'\\''");
      parts.push(`  -d '${b}'`);
    }
  }
  if (req.body_kind === "urlencoded" || req.body_kind === "form-data") {
    (req.body?.form || []).forEach((f: any) => {
      if (f.enabled && f.key) {
        parts.push(`  -d '${f.key}=${String(f.value).replace(/'/g, "'\\''")}'`);
      }
    });
  }
  return parts.join(" \\\n");
}

function cloneRequest(req: Request): Request {
  return JSON.parse(JSON.stringify(req));
}

function isScratchRequest(req: Request | null | undefined): boolean {
  return !!req?.id && (req.id.startsWith("scratch-") || req.id.startsWith("history-"));
}

function makeScratchRequest(base: Partial<Request> = {}): Request {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: `scratch-${stamp}`,
    collection_id: null,
    name: base.name || "Scratch request",
    method: base.method || "GET",
    url: base.url || "",
    headers: base.headers || {},
    query: base.query || [],
    body_kind: base.body_kind || "none",
    body: base.body || {},
    auth: base.auth || { kind: "none" },
    tests: base.tests || "",
    pre_script: base.pre_script || "",
    position: base.position || 0,
  };
}

function promptForEnvSeed(existing?: PWEnvironment): { name: string; values: Record<string, string> } | null {
  const name = prompt("Environment name:", existing?.name || "Production");
  if (!name?.trim()) return null;
  const sample = JSON.stringify(existing?.values || { base_url: "", token: "", user_id: "" }, null, 2);
  const raw = prompt("Variables as JSON object:", sample);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw || "{}");
    const values = Object.fromEntries(
      Object.entries(parsed || {}).map(([k, v]) => [String(k), v == null ? "" : String(v)])
    );
    return { name: name.trim(), values };
  } catch {
    toast.error("Environment variables must be valid JSON");
    return null;
  }
}

export default function PostWomen() {
  const nav = useNavigate();
  const team = getTeam();
  useDocumentTitle("PostWomen · Try your APIs nicely");
  const tools = team?.tools_access || ["apistress", "postwomen"];

  // Gate: team without postwomen access can't be here.
  useEffect(() => {
    if (team && !tools.includes("postwomen")) {
      toast.error(`"${team.name}" doesn't have access to PostWomen`, { id: "no-pw-access", duration: 5000 });
      if (tools.includes("apistress")) nav("/", { replace: true });
      else nav("/login", { replace: true });
      return;
    }
    if (team) {
      api.logActivity({ event_type: "tool.open", tool_slug: "postwomen", actor_name: team.name });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWS, setActiveWS] = useState<string>("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [envs, setEnvs] = useState<PWEnvironment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string>("");
  const [envTag, setEnvTag] = useState<EnvTag>("");
  // ── Multi-tab state ──────────────────────────────────────────
  const [openTabs, setOpenTabs] = useState<Request[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [savedSnaps, setSavedSnaps] = useState<Record<string, Request>>({});
  const savedSnapsRef = useRef<Record<string, Request>>({});

  const activeReq = useMemo(
    () => openTabs.find((t) => t.id === activeTabId) ?? null,
    [openTabs, activeTabId]
  );
  const savedReq = activeTabId ? savedSnaps[activeTabId] ?? null : null;
  const response = activeTabId ? responses[activeTabId] ?? null : null;

  useEffect(() => {
    savedSnapsRef.current = savedSnaps;
  }, [savedSnaps]);

  // Mutator that target the active tab.
  function setActiveReq(next: Request | null) {
    if (!next) return;
    setOpenTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }
  function setResponse(r: any) {
    if (!activeTabId) return;
    setResponses((prev) => ({ ...prev, [activeTabId]: r }));
  }
  function setResponseForTab(id: string, r: any) {
    setResponses((prev) => ({ ...prev, [id]: r }));
  }
  function setSavedReq(r: Request | null) {
    if (!activeTabId || !r) return;
    setSavedSnaps((prev) => ({ ...prev, [activeTabId]: r }));
  }

  // Open a tab (or focus an already-open one).
  function openTab(r: Request, opts?: { preserveDirty?: boolean }) {
    const incoming = cloneRequest(r);
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const current = prev[idx];
      const saved = savedSnapsRef.current[incoming.id];
      const dirty = saved ? JSON.stringify(saved) !== JSON.stringify(current) : false;
      if (dirty && opts?.preserveDirty) return prev;
      const next = prev.slice();
      next[idx] = incoming;
      return next;
    });
    setSavedSnaps((prev) => ({ ...prev, [incoming.id]: incoming }));
    setActiveTabId(r.id);
  }
  function closeTab(id: string) {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId) {
        const newActive = next[idx] || next[idx - 1] || null;
        setActiveTabId(newActive?.id ?? null);
      }
      return next;
    });
    setResponses((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setSavedSnaps((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarTab, setSidebarTab] = useState<"collections" | "history" | "environments">("collections");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyEnvTag, setHistoryEnvTag] = useState<EnvTag>("");
  const [mainView, setMainView] = useState<"request" | "runner">("request");
  const [searchResults, setSearchResults] = useState<Request[] | null>(null);

  const isDirty = useMemo(() => {
    if (!activeReq || !savedReq) return false;
    return JSON.stringify(activeReq) !== JSON.stringify(savedReq);
  }, [activeReq, savedReq]);
  const activeEnv = useMemo(
    () => envs.find((env) => env.id === activeEnvId) || null,
    [envs, activeEnvId]
  );
  const activeVars = useMemo(
    () => ({ ...(activeEnv?.values || {}) }),
    [activeEnv]
  );

  // ── Bootstrap workspaces ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const list = await api.pwListWorkspaces();
      let chosen = "";
      if (list.length === 0) {
        const { id } = await api.pwCreateWorkspace("My Workspace");
        chosen = id;
        setWorkspaces([{ id, name: "My Workspace" }]);
      } else {
        setWorkspaces(list);
        chosen = list[0].id;
      }
      setActiveWS(chosen);
    })().catch((e) => toast.error(e.message));
  }, []);

  // ── Load tree ─────────────────────────────────────────────────────
  async function reload() {
    if (!activeWS) return;
    try {
      const { collections, requests } = await api.pwTree(activeWS);
      const nextCollections = collections || [];
      const nextRequests = requests || [];
      setCollections(nextCollections);
      setRequests(nextRequests);
      const reqMap = new Map(nextRequests.map((req: Request) => [req.id, req]));
      setSavedSnaps((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const fresh = reqMap.get(id);
          if (fresh) next[id] = cloneRequest(fresh);
        });
        return next;
      });
      setOpenTabs((prev) => prev.map((tab) => {
        const fresh = reqMap.get(tab.id);
        if (!fresh) return tab;
        const saved = savedSnapsRef.current[tab.id];
        const dirty = saved ? JSON.stringify(saved) !== JSON.stringify(tab) : false;
        return dirty ? tab : cloneRequest(fresh);
      }));
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => { reload(); }, [activeWS]);

  async function reloadEnvs() {
    if (!activeWS) return;
    try {
      const list = await api.pwListEnvironments(activeWS);
      setEnvs(list);
      setActiveEnvId((prev) => prev && list.some((env: PWEnvironment) => env.id === prev) ? prev : (list[0]?.id || ""));
    } catch (e: any) {
      toast.error(e.message);
      setEnvs([]);
      setActiveEnvId("");
    }
  }
  useEffect(() => { reloadEnvs(); }, [activeWS]);

  // Refresh history when its tab is opened or after each send
  useEffect(() => {
    if (sidebarTab !== "history") return;
    api.pwHistory({ q: historyQuery, env_tag: historyEnvTag || undefined }).then(setHistory).catch(() => setHistory([]));
  }, [sidebarTab, response, historyQuery, historyEnvTag]);

  useEffect(() => {
    if (!activeWS) return;
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      api.pwSearch(activeWS, q).then(setSearchResults).catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [activeWS, search]);

  // Duplicate a request: copy fields, change name, drop into same folder.
  async function duplicateRequest(r: Request) {
    const { id } = await api.pwCreateRequest({ ...r, id: undefined, name: r.name + " (copy)" });
    toast.success("Duplicated");
    await reload();
    const fresh = (await api.pwTree(activeWS)).requests.find((x: any) => x.id === id);
    if (fresh) openTab(fresh);
  }

  // ── Tree helpers ─────────────────────────────────────────────────
  const tree = useMemo(() => {
    const byParent: Record<string, Collection[]> = {};
    collections.forEach((c) => {
      const k = c.parent_id || "root";
      (byParent[k] ||= []).push(c);
    });
    const reqByColl: Record<string, Request[]> = {};
    requests.forEach((r) => {
      const k = r.collection_id || "root";
      (reqByColl[k] ||= []).push(r);
    });
    return { byParent, reqByColl };
  }, [collections, requests]);

  function toggleFolder(id: string) {
    setOpenFolders((o) => ({ ...o, [id]: !o[id] }));
  }

  // ── CRUD actions ─────────────────────────────────────────────────
  async function newCollection() {
    const name = prompt("Collection name:", "New Collection");
    if (!name) return;
    await api.pwCreateCollection({ workspace_id: activeWS, name, is_folder: false });
    toast.success("Collection created");
    reload();
  }
  async function renameWorkspace() {
    const current = workspaces.find((w) => w.id === activeWS);
    const name = prompt("Workspace name:", current?.name || "");
    if (!name?.trim()) return;
    await api.pwRenameWorkspace(activeWS, name.trim());
    setWorkspaces((prev) => prev.map((w) => w.id === activeWS ? { ...w, name: name.trim() } : w));
    toast.success("Workspace renamed");
  }
  async function renameCollection(id: string, currentName: string) {
    const name = prompt("Collection name:", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    await api.pwRenameCollection(id, name.trim());
    toast.success("Collection renamed");
    reload();
  }
  async function renameRequest(request: Request) {
    const name = prompt("Request name:", request.name);
    if (!name?.trim() || name.trim() === request.name) return;
    const next = { ...request, name: name.trim() };
    await api.pwUpdateRequest(request.id, next);
    if (activeReq?.id === request.id) setActiveReq(next);
    toast.success("Request renamed");
    reload();
  }
  async function newRequest(collectionID?: string | null) {
    // Requests without a collection don't surface in the tree (sidebar shows
    // collection > requests). If the user has no collection yet, auto-create
    // a "Drafts" one so the new request is visible immediately.
    let coll = collectionID || null;
    if (!coll) {
      const existing = collections.find((c) => !c.parent_id);
      if (existing) {
        coll = existing.id;
      } else {
        const created = await api.pwCreateCollection({
          workspace_id: activeWS, name: "Drafts", is_folder: false,
        });
        coll = created.id;
      }
    }
    const id = (await api.pwCreateRequest({
      collection_id: coll,
      name: "Untitled request",
      method: "GET",
      url: "",
      headers: {},
      query: [],
      body_kind: "none",
      body: {},
      auth: { kind: "none" },
    })).id;
    toast.success("Request created");
    setOpenFolders((o) => coll ? { ...o, [coll]: true } : o);
    await reload();
    const tree = await api.pwTree(activeWS);
    const fresh = tree.requests.find((r: any) => r.id === id);
    if (fresh) openTab(fresh);
  }

  async function ensureCollectionID(collectionID?: string | null) {
    if (collectionID) return collectionID;
    const existing = collections.find((c) => !c.parent_id);
    if (existing) return existing.id;
    const created = await api.pwCreateCollection({
      workspace_id: activeWS, name: "Drafts", is_folder: false,
    });
    return created.id;
  }
  async function createEnvironment() {
    const payload = promptForEnvSeed();
    if (!payload) return;
    await api.pwCreateEnvironment(activeWS, payload);
    toast.success("Environment created");
    reloadEnvs();
    setSidebarTab("environments");
  }
  async function editEnvironment(env: PWEnvironment) {
    const payload = promptForEnvSeed(env);
    if (!payload) return;
    await api.pwUpdateEnvironment(env.id, payload);
    toast.success("Environment updated");
    reloadEnvs();
  }
  async function deleteEnvironment(id: string) {
    if (!confirm("Delete this environment?")) return;
    await api.pwDeleteEnvironment(id);
    toast.success("Environment deleted");
    reloadEnvs();
  }

  async function deleteWorkspace(id: string) {
    if (!id) return;
    const doomed = workspaces.find((w) => w.id === id);
    if (!doomed) return;
    if (!confirm(`Delete workspace "${doomed.name}" and everything inside it?`)) return;
    await api.pwDeleteWorkspace(id);
    const nextWorkspaces = workspaces.filter((w) => w.id !== id);
    setWorkspaces(nextWorkspaces);
    setOpenTabs([]);
    setActiveTabId(null);
    setCollections([]);
    setRequests([]);
    setHistory([]);
    if (nextWorkspaces.length > 0) {
      setActiveWS(nextWorkspaces[0].id);
      toast.success("Workspace deleted");
      return;
    }
    const { id: freshID } = await api.pwCreateWorkspace("My Workspace");
    setWorkspaces([{ id: freshID, name: "My Workspace" }]);
    setActiveWS(freshID);
    toast.success("Workspace reset");
  }

  // Open a request as a tab (or focus an already-open one).
  function openRequest(r: Request) {
    openTab(r);
  }

  // Ref for the keyboard-shortcut handler so it stays stable across renders.
  const sendRef = useRef<() => void>(() => {});

  // ── Save the open request (declared early so effects below can use it) ──
  const saveActive = useCallback(async (silent = false) => {
    if (!activeReq) return;
    setSaving(true);
    try {
      if (isScratchRequest(activeReq)) {
        const collectionID = await ensureCollectionID(activeReq.collection_id);
        const { id } = await api.pwCreateRequest({
          ...activeReq,
          id: undefined,
          collection_id: collectionID,
        });
        await reload();
        const tree = await api.pwTree(activeWS);
        const fresh = tree.requests.find((r: Request) => r.id === id);
        if (fresh) {
          closeTab(activeReq.id);
          openTab(fresh);
        }
        if (!silent) toast.success("Saved as new request");
        return;
      }
      await api.pwUpdateRequest(activeReq.id, activeReq);
      setSavedReq(activeReq);
      if (!silent) toast.success("Saved");
      reload();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq, activeWS, collections]);

  // Auto-save 1.2s after the last edit while dirty
  useEffect(() => {
    if (isScratchRequest(activeReq)) return;
    if (!isDirty || !activeReq) return;
    const t = setTimeout(() => { void saveActive(true); }, 1200);
    return () => clearTimeout(t);
  }, [activeReq, isDirty, saveActive]);

  async function deleteRequest(id: string) {
    if (!confirm("Delete this request?")) return;
    await api.pwDeleteRequest(id);
    closeTab(id);
    reload();
  }
  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection and all requests inside?")) return;
    await api.pwDeleteCollection(id);
    reload();
  }

  // ── Send ─────────────────────────────────────────────────────────
  const sendRequest = useCallback(async () => {
    if (!activeReq) return;
    if (!activeReq.url.trim()) return toast.error("Set a URL first.");
    if (!isValidURL(activeReq.url)) return toast.error("URL must be a full http(s):// address.");
    setSending(true);
    setResponse(null);
    try {
      const payload = isScratchRequest(activeReq) ? { ...activeReq, id: "" } : activeReq;
      const r = await api.pwSend(payload, activeVars, { envTag });
      setResponse(r);
      if (r.error) toast.error(r.error); else toast.success(`${r.status} · ${r.duration_ms} ms`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq]);
  useEffect(() => { sendRef.current = sendRequest; }, [sendRequest]);

  // ── Keyboard shortcuts: Cmd/Ctrl+Enter to send, Cmd/Ctrl+S to save ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key === "Enter") { e.preventDefault(); sendRef.current(); }
      else if (e.key.toLowerCase() === "s") { e.preventDefault(); void saveActive(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive]);

  // ── Apply a parsed curl to the active request ─────────────────────
  function applyCurlToActive(curl: string) {
    if (!activeReq) return false;
    try {
      const p = parseCurl(curl);
      if (!p.url) return false;
      const next: Request = {
        ...activeReq,
        method: p.method,
        url: p.url,
        headers: p.headers,
      };
      const looksJSON = (p.body || "").trim().startsWith("{") || (p.body || "").trim().startsWith("[");
      if (p.body) {
        next.body_kind = looksJSON ? "json" : "raw";
        next.body = { ...(next.body || {}), raw: prettyJSON(p.body), content_type: looksJSON ? "application/json" : "" };
      } else {
        next.body_kind = "none";
        next.body = {};
      }
      setActiveReq(next);
      const headerCount = Object.keys(p.headers).length;
      toast.success(`Curl synced · ${p.method} · ${headerCount} header${headerCount === 1 ? "" : "s"}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Import ───────────────────────────────────────────────────────
  async function importFile(f: File) {
    if (!activeWS) return;
    const text = await f.text();
    try {
      const { counts } = await api.pwImport(activeWS, text);
      toast.success(`Imported · ${counts.folders} folders · ${counts.requests} requests`);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // ── Export ───────────────────────────────────────────────────────
  function exportRoot(rootID: string) {
    window.open(api.pwExportURL(rootID), "_blank");
  }

  // ── Send to APIStress ────────────────────────────────────────────
  function loadTestActive() {
    if (!activeReq) return;
    const cfg = encodeURIComponent(JSON.stringify({
      name: activeReq.name,
      protocol: "http",
      request: {
        method: activeReq.method,
        url: activeReq.url,
        headers: activeReq.headers,
        body: activeReq.body?.raw || "",
        timeout_ms: 30000,
      },
    }));
    nav(`/builder?prefill=${cfg}`);
  }

  function openHistoryItem(h: HistoryItem) {
    if (h.request) {
      const req = cloneRequest(h.request);
      if (!req.id || req.id.startsWith("history-")) {
        const scratch = makeScratchRequest({
          ...req,
          id: undefined,
          name: req.name || `${h.method} from history`,
        });
        openTab(scratch);
        setResponseForTab(scratch.id, h.response || null);
        toast.success("Opened history request as a scratch tab");
      } else {
        openTab(req, { preserveDirty: true });
        setResponse(h.response || null);
        toast.success("Opened full request from history");
      }
      return;
    }
    if (activeReq) {
      setActiveReq({ ...activeReq, method: h.method, url: h.url });
      toast.success("URL/method loaded into current tab");
      return;
    }
    const scratch = makeScratchRequest({
      name: `${h.method} from history`,
      method: h.method,
      url: h.url,
    });
    openTab(scratch);
    setResponseForTab(scratch.id, h.response || null);
    toast.success("Loaded from history as a scratch tab");
  }

  function openRunnerRequestInEditor(req: Request) {
    openTab(req, { preserveDirty: true });
    setMainView("request");
  }

  function openScratchFromRunner(req: Partial<Request>) {
    const scratch = makeScratchRequest({
      ...req,
      name: req.name || "Runner preview",
    });
    openTab(scratch);
    setMainView("request");
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 h-14 px-4 border-b border-bg-border bg-bg-panel/70 backdrop-blur-md flex items-center gap-3">
        <button
          onClick={() => nav("/mode")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500/10 to-violet-500/10
                     ring-1 ring-sky-500/30 hover:ring-sky-500/60 transition text-sm"
          title="Back to home — pick another tool"
        >
          <Home className="w-4 h-4 text-sky-400" />
          <span className="font-semibold">Home</span>
        </button>
        <div className="h-5 w-px bg-bg-border" />
        <PWWordmark size={18} />
        {team && (
          <>
            <div className="h-5 w-px bg-bg-border ml-1" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-sky-500/30 bg-sky-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-xs font-bold text-sky-400">{team.name}</span>
            </div>
          </>
        )}
        {workspaces.length > 0 && (
          <>
            <div className="h-5 w-px bg-bg-border ml-3" />
            <select
              value={activeWS}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  const name = prompt("New workspace name:");
                  if (name?.trim()) {
                    api.pwCreateWorkspace(name.trim()).then(({ id }) => {
                      setWorkspaces([...workspaces, { id, name }]);
                      setActiveWS(id);
                    });
                  }
                  return;
                }
                setActiveWS(e.target.value);
                setOpenTabs([]);
                setActiveTabId(null);
                setCollections([]);
                setRequests([]);
                setHistory([]);
                setEnvs([]);
                setActiveEnvId("");
                setMainView("request");
              }}
              className="input text-xs py-1 pr-7 max-w-[200px]"
              title="Workspace"
            >
              {workspaces.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value="__new__">+ New workspace…</option>
            </select>
            <button
              onClick={() => reload()}
              className="btn-ghost text-xs"
              title="Refresh workspace tree"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={renameWorkspace}
              disabled={!activeWS}
              className="btn-ghost text-xs disabled:opacity-40"
              title="Rename current workspace"
            >
              <Save className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => deleteWorkspace(activeWS)}
              disabled={!activeWS}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                         text-ink-muted ring-1 ring-bg-border bg-bg-card/40
                         hover:text-bad hover:ring-bad/40 hover:bg-bad/[.06] transition disabled:opacity-40"
              title="Delete current workspace"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <select
              value={activeEnvId}
              onChange={(e) => setActiveEnvId(e.target.value)}
              className="input text-xs py-1 pr-7 max-w-[180px]"
              title="Variables environment"
            >
              <option value="">No env</option>
              {envs.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
            </select>
            <select
              value={envTag}
              onChange={(e) => setEnvTag(e.target.value as EnvTag)}
              className="input text-xs py-1 pr-7 max-w-[140px]"
              title="Environment tag"
            >
              <option value="">No tag</option>
              {ENV_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </>
        )}
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        <button onClick={() => fileInputRef.current?.click()} className="btn-ghost text-xs">
          <Upload className="w-3.5 h-3.5" /> Import
        </button>
        <button
          onClick={() => setMainView(v => v === "runner" ? "request" : "runner")}
          className={`text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 transition
            ${mainView === "runner"
              ? "bg-sky-500/15 text-sky-300 ring-sky-500/40"
              : "text-ink-muted ring-bg-border hover:text-ink hover:ring-sky-500/30"}`}
          title="Data-driven runner (CSV / Excel / JSON)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          {mainView === "runner" ? "Exit runner" : "Runner"}
        </button>
        <button onClick={() => nav("/")} className="btn-secondary text-xs" title="Open APIStress (load testing)">
          <Hammer className="w-3.5 h-3.5" /> Load test
        </button>
        <button
          onClick={() => {
            clearKey();
            toast.success("Signed out");
            nav("/login", { replace: true });
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                     text-ink-muted ring-1 ring-bg-border bg-bg-card/40
                     hover:text-bad hover:ring-bad/40 hover:bg-bad/[.06] transition"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── Left sidebar: collections / history ─────────────────── */}
        <aside className="w-72 shrink-0 border-r border-bg-border bg-bg-panel/40 flex flex-col min-h-0">
          <div className="flex border-b border-bg-border">
            {(["collections", "history", "environments"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSidebarTab(t)}
                className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition border-b-2
                  ${sidebarTab === t ? "border-sky-400 text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {sidebarTab === "collections" ? (
            <>
              <div className="p-3 border-b border-bg-border space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input w-full text-xs pl-7 py-1.5"
                  />
                </div>
                <div className="flex gap-1">
                  <button onClick={newCollection} className="btn-ghost text-xs flex-1">
                    <Folder className="w-3.5 h-3.5" /> New collection
                  </button>
                  <button onClick={() => newRequest(null)} className="btn-primary text-xs" title="New request">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {searchResults ? (
                  <SearchResults
                    items={searchResults}
                    activeReqID={activeReq?.id}
                    onPick={openRequest}
                    onRename={renameRequest}
                    onDuplicate={duplicateRequest}
                    onDelete={deleteRequest}
                  />
                ) : (
                  <Tree
                    parentID="root"
                    byParent={tree.byParent}
                    reqByColl={tree.reqByColl}
                    activeReqID={activeReq?.id}
                    openFolders={openFolders}
                    search={search.toLowerCase()}
                    onToggle={toggleFolder}
                    onPick={openRequest}
                    onAddRequest={newRequest}
                    onDeleteRequest={deleteRequest}
                    onDeleteCollection={deleteCollection}
                    onRenameCollection={renameCollection}
                    onRenameRequest={renameRequest}
                    onDuplicate={duplicateRequest}
                    onExport={exportRoot}
                  />
                )}
                {collections.length === 0 && (
                  <div className="text-center text-ink-muted text-xs py-8 px-4">
                    <PWLogo size={48} />
                    <div className="mt-3">No collections yet.</div>
                    <button onClick={newCollection} className="btn-primary text-xs mt-3">
                      <Plus className="w-3.5 h-3.5" /> Create first collection
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            sidebarTab === "history" ? (
            <HistoryList
              items={history}
              query={historyQuery}
              envTag={historyEnvTag}
              onQueryChange={setHistoryQuery}
              onEnvTagChange={setHistoryEnvTag}
              onLoad={openHistoryItem}
            />
            ) : (
              <EnvironmentList
                items={envs}
                activeEnvId={activeEnvId}
                onPick={setActiveEnvId}
                onCreate={createEnvironment}
                onEdit={editEnvironment}
                onDelete={deleteEnvironment}
              />
            )
          )}
        </aside>

        {/* ── Centre + right: request editor + response, OR runner ── */}
        <main className="flex-1 flex flex-col min-w-0">
          {mainView === "runner" ? (
            <Runner
              requests={requests}
              initialReq={activeReq}
              activeReq={activeReq}
              baseVars={activeVars}
              envTag={envTag}
              onOpenRequest={openRunnerRequestInEditor}
              onCreateScratchRequest={openScratchFromRunner}
              onExit={() => setMainView("request")}
            />
          ) : (
            <>
              {/* Tab bar (Postman-style) — only when at least one tab is open */}
              {openTabs.length > 0 && (
                <TabBar
                  tabs={openTabs}
                  activeTabId={activeTabId}
                  savedSnaps={savedSnaps}
                  onPick={(id) => setActiveTabId(id)}
                  onClose={closeTab}
                  onNew={() => newRequest(null)}
                />
              )}

              {!activeReq ? (
                <EmptyState onNew={() => newRequest(null)} onImport={() => fileInputRef.current?.click()} />
              ) : (
                <RequestPane
                  req={activeReq}
                  scratch={isScratchRequest(activeReq)}
                  collections={collections}
                  activeEnv={activeEnv}
                  envTag={envTag}
                  setReq={setActiveReq}
                  response={response}
                  sending={sending}
                  saving={saving}
                  dirty={isDirty}
                  onSend={sendRequest}
                  onSave={() => saveActive(false)}
                  onLoadTest={loadTestActive}
                  onApplyCurl={applyCurlToActive}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Tree component ──────────────────────────────────────────────────────
function Tree({
  parentID, byParent, reqByColl, activeReqID, openFolders, search,
  onToggle, onPick, onAddRequest, onDeleteRequest, onDeleteCollection, onRenameCollection, onRenameRequest, onDuplicate, onExport,
}: any) {
  const cols = (byParent[parentID] || []) as Collection[];
  const reqs = (reqByColl[parentID] || []) as Request[];
  return (
    <div className={parentID === "root" ? "" : "ml-3"}>
      {cols.map((c) => {
        const open = openFolders[c.id] !== false; // open by default
        return (
          <div key={c.id} className="select-none">
            <div className="group flex items-center gap-1 px-1.5 py-1 rounded hover:bg-white/5">
              <button onClick={() => onToggle(c.id)} className="text-ink-muted">
                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {open ? <FolderOpen className="w-3.5 h-3.5 text-brand" /> : <Folder className="w-3.5 h-3.5 text-brand" />}
              <span className="flex-1 text-sm truncate font-medium">{c.name}</span>
              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition">
                <button title="Add request" onClick={() => onAddRequest(c.id)} className="text-ink-muted hover:text-brand p-0.5">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button title="Rename collection" onClick={() => onRenameCollection(c.id, c.name)} className="text-ink-muted hover:text-brand p-0.5">
                  <Save className="w-3 h-3" />
                </button>
                <button title="Export collection" onClick={() => onExport(c.id)} className="text-ink-muted hover:text-brand p-0.5">
                  <Download className="w-3 h-3" />
                </button>
                <button title="Delete" onClick={() => onDeleteCollection(c.id)} className="text-ink-muted hover:text-bad p-0.5">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {open && (
              <Tree
                parentID={c.id}
                byParent={byParent}
                reqByColl={reqByColl}
                activeReqID={activeReqID}
                openFolders={openFolders}
                search={search}
                onToggle={onToggle}
                onPick={onPick}
                onAddRequest={onAddRequest}
                onDeleteRequest={onDeleteRequest}
                onDeleteCollection={onDeleteCollection}
                onRenameCollection={onRenameCollection}
                onRenameRequest={onRenameRequest}
                onDuplicate={onDuplicate}
                onExport={onExport}
              />
            )}
          </div>
        );
      })}
      {reqs
        .filter((r) => !search || r.name.toLowerCase().includes(search) || r.url.toLowerCase().includes(search))
        .map((r) => (
          <div
            key={r.id}
            onClick={() => onPick(r)}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition
              ${activeReqID === r.id
                ? "bg-brand/10 ring-1 ring-brand/40 shadow-sm"
                : "hover:bg-white/5"}`}
          >
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ring-1 w-12 text-center shrink-0
              ${METHOD_BG[r.method] || "bg-bg-card ring-bg-border"} ${METHOD_TONE[r.method] || "text-ink"}`}>
              {r.method}
            </span>
            <span className={`flex-1 text-xs truncate ${activeReqID === r.id ? "text-ink font-semibold" : "text-ink"}`}>
              {r.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRenameRequest?.(r); }}
              title="Rename"
              className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-brand p-0.5 transition"
            >
              <Save className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate?.(r); }}
              title="Duplicate"
              className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-brand p-0.5 transition"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteRequest(r.id); }}
              title="Delete"
              className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-bad p-0.5 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
    </div>
  );
}

function SearchResults({
  items, activeReqID, onPick, onRename, onDuplicate, onDelete,
}: {
  items: Request[];
  activeReqID?: string | null;
  onPick: (r: Request) => void;
  onRename: (r: Request) => void;
  onDuplicate: (r: Request) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="text-xs text-ink-muted px-2 py-6">No matching requests.</div>;
  }
  return (
    <div className="space-y-1">
      {items.map((r) => (
        <div
          key={r.id}
          onClick={() => onPick(r)}
          className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition
            ${activeReqID === r.id ? "bg-brand/10 ring-1 ring-brand/40 shadow-sm" : "hover:bg-white/5"}`}
        >
          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ring-1 w-12 text-center shrink-0
            ${METHOD_BG[r.method] || "bg-bg-card ring-bg-border"} ${METHOD_TONE[r.method] || "text-ink"}`}>
            {r.method}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate">{r.name}</div>
            <div className="text-[10px] text-ink-dim truncate font-mono">{r.url}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onRename(r); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-brand p-0.5 transition" title="Rename">
            <Save className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(r); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-brand p-0.5 transition" title="Duplicate">
            <Copy className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(r.id); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-bad p-0.5 transition" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EnvironmentList({
  items, activeEnvId, onPick, onCreate, onEdit, onDelete,
}: {
  items: PWEnvironment[];
  activeEnvId: string;
  onPick: (id: string) => void;
  onCreate: () => void;
  onEdit: (env: PWEnvironment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <div className="flex gap-2">
        <button onClick={onCreate} className="btn-primary text-xs flex-1">
          <Plus className="w-3.5 h-3.5" /> New environment
        </button>
      </div>
      {items.length === 0 && (
        <div className="text-xs text-ink-muted px-2 py-6">No environments yet. Add one with variables like `base_url`, `token`, or `user_id`.</div>
      )}
      {items.map((env) => (
        <div
          key={env.id}
          onClick={() => onPick(env.id)}
          className={`group rounded-lg p-2 ring-1 cursor-pointer transition
            ${activeEnvId === env.id ? "ring-sky-500/40 bg-sky-500/10" : "ring-bg-border bg-bg-card/40 hover:bg-white/5"}`}
        >
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold flex-1 truncate">{env.name}</div>
            <button onClick={(e) => { e.stopPropagation(); onEdit(env); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-brand p-0.5 transition" title="Edit">
              <Save className="w-3 h-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(env.id); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-bad p-0.5 transition" title="Delete">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="mt-1 text-[10px] text-ink-dim font-mono">
            {Object.keys(env.values || {}).length} vars
          </div>
          <div className="mt-1 text-[10px] text-ink-muted truncate font-mono">
            {Object.entries(env.values || {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────
function EmptyState({ onNew, onImport }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
      {/* soft accent gradient */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

      <div className="relative">
        <DancingFigure size={140} />
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="relative text-2xl font-bold mt-5"
      >
        Try your APIs nicely
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="relative text-ink-muted text-sm mt-1 max-w-md"
      >
        Create a request, paste a curl, or import a Postman collection — then send it.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="relative mt-6 flex gap-2 flex-wrap justify-center"
      >
        <button onClick={onNew} className="btn-primary"><Plus className="w-4 h-4" /> New request</button>
        <button onClick={onImport} className="btn-secondary"><Upload className="w-4 h-4" /> Import collection</button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="relative mt-8 grid sm:grid-cols-3 gap-2 max-w-2xl w-full text-xs"
      >
        <Hint kbd="⌘ ⏎" label="Send request" />
        <Hint kbd="⌘ S" label="Save" />
        <Hint kbd="paste" label="curl auto-syncs into URL" />
      </motion.div>
    </div>
  );
}

function Hint({ kbd, label }: { kbd: string; label: string }) {
  return (
    <div className="card px-3 py-2 flex items-center justify-between gap-2 ring-1 ring-bg-border">
      <span className="text-ink-muted">{label}</span>
      <kbd className="px-1.5 py-0.5 rounded bg-bg-card ring-1 ring-bg-border font-mono text-[10px]">{kbd}</kbd>
    </div>
  );
}

// ── Request + Response panes ────────────────────────────────────────────
function RequestPane({ req, scratch, collections, activeEnv, envTag, setReq, response, sending, saving, dirty, onSend, onSave, onLoadTest, onApplyCurl }: any) {
  const [tab, setTab] = useState<"params" | "headers" | "body" | "auth">("body");
  const [respTab, setRespTab] = useState<"body" | "headers" | "cookies">("body");

  function patch(p: Partial<Request>) { setReq({ ...req, ...p }); }
  function patchAuth(p: any) { setReq({ ...req, auth: { ...req.auth, ...p } }); }

  const urlValid = !req.url.trim() || isValidURL(req.url);

  function copyAsCurl() {
    if (!req.url) return toast.error("URL is empty.");
    navigator.clipboard.writeText(generateCurl(req));
    toast.success("Copied as curl");
  }

  function copyURL() {
    if (!req.url) return toast.error("URL is empty.");
    navigator.clipboard.writeText(req.url);
    toast.success("Copied URL");
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* URL bar */}
      <div className="p-3 border-b border-bg-border bg-bg-panel/40 flex items-center gap-2">
        <select
          value={req.method}
          onChange={(e) => patch({ method: e.target.value })}
          className={`input w-24 font-mono font-bold text-sm ${METHOD_TONE[req.method] || "text-ink"}`}
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}
        </select>

        <div className="flex-1 relative">
          <input
            value={req.url}
            onChange={(e) => patch({ url: e.target.value })}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text").trim();
              if (t.toLowerCase().startsWith("curl ") || t.toLowerCase().startsWith("curl\n")) {
                e.preventDefault();
                onApplyCurl(t);
              }
            }}
            placeholder="Paste a curl, or type https://api.example.com/v1/widgets"
            className={`input w-full font-mono text-sm pr-9 transition
              ${urlValid ? "" : "ring-1 ring-bad/50 border-bad/40"}`}
          />
          {req.url && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  title={urlValid ? "Valid URL" : "Invalid URL — needs http(s)://"}>
              {urlValid
                ? <Check className="w-3.5 h-3.5 text-good" />
                : <AlertCircle className="w-3.5 h-3.5 text-bad" />}
            </span>
          )}
        </div>

        <button
          onClick={onSend}
          disabled={sending || !urlValid || !req.url}
          className="btn-primary disabled:opacity-40"
          title="Send (⌘/Ctrl+Enter)"
        >
          {sending
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <><Send className="w-4 h-4" /> Send</>}
        </button>
      </div>

      {/* Name + status row */}
      <div className="px-4 py-2 border-b border-bg-border bg-bg-panel/30 flex items-center gap-2">
        <input
          value={req.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="bg-transparent outline-none text-sm font-semibold flex-1 min-w-0"
          placeholder="Request name"
        />
        <select
          value={req.collection_id || ""}
          onChange={(e) => patch({ collection_id: e.target.value || null })}
          className="input text-xs py-1 max-w-[180px]"
          title="Collection"
        >
          <option value="">No collection</option>
          {collections.filter((c: Collection) => !c.is_folder).map((c: Collection) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {activeEnv && (
          <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30 shrink-0">
            {activeEnv.name}
          </span>
        )}
        {envTag && (
          <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded-full bg-cool/10 text-cool ring-1 ring-cool/30 shrink-0">
            {envTag}
          </span>
        )}
        {scratch && (
          <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30 shrink-0">
            scratch
          </span>
        )}
        {/* Save / dirty indicator */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-mono shrink-0">
          {saving
            ? <span className="text-ink-muted flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />saving…</span>
            : dirty
              ? <span className="text-warn flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />unsaved</span>
              : <span className="text-good flex items-center gap-1"><Check className="w-3 h-3" />saved</span>}
        </div>
        <button onClick={onSave} className="btn-ghost text-xs" title="Save (⌘/Ctrl+S)">
          <Save className="w-3.5 h-3.5" />{scratch ? "Save as new" : "Save"}
        </button>
        <button onClick={copyURL} className="btn-ghost text-xs" title="Copy URL">
          <Copy className="w-3.5 h-3.5" />URL
        </button>
        <button onClick={copyAsCurl} className="btn-ghost text-xs" title="Copy as curl">
          <Terminal className="w-3.5 h-3.5" />curl
        </button>
        <button onClick={onLoadTest} className="btn-ghost text-xs" title="Open this request in APIStress for load testing">
          <Hammer className="w-3.5 h-3.5" />Load
        </button>
      </div>

      {/* Tabs: request body */}
      <div className="flex border-b border-bg-border">
        {(["params", "headers", "body", "auth"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition
              ${tab === t ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t}
            {t === "headers" && Object.keys(req.headers || {}).length > 0 &&
              <span className="ml-1.5 text-[9px] bg-brand text-white px-1 rounded">{Object.keys(req.headers).length}</span>}
            {t === "params" && (req.query || []).filter((q: any) => q.enabled).length > 0 &&
              <span className="ml-1.5 text-[9px] bg-brand text-white px-1 rounded">{req.query.filter((q: any) => q.enabled).length}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-rows-2 min-h-0">
        {/* Editor */}
        <div className="overflow-y-auto p-4">
          {tab === "params"  && <ParamsEditor value={req.query || []} onChange={(v) => patch({ query: v })} />}
          {tab === "headers" && <HeadersEditor value={req.headers || {}} onChange={(v) => patch({ headers: v })} />}
          {tab === "body"    && <BodyEditor req={req} onChange={(p: Partial<Request>) => patch(p)} />}
          {tab === "auth"    && <AuthEditor value={req.auth || {kind:"none"}} onChange={patchAuth} />}
        </div>

        {/* Response */}
        <div className="border-t border-bg-border bg-bg-panel/30 flex flex-col min-h-0">
          <ResponseTabs response={response} sending={sending} tab={respTab} setTab={setRespTab} />
        </div>
      </div>
    </div>
  );
}

// ── Editors ─────────────────────────────────────────────────────────────
function ParamsEditor({ value, onChange }: { value: any[]; onChange: (v: any[]) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-[10px] uppercase tracking-wider text-ink-muted">
        <span className="w-6"></span><span>Key</span><span>Value</span><span></span>
      </div>
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
          <input type="checkbox" checked={row.enabled} onChange={(e) => {
            const next = value.slice(); next[i] = { ...row, enabled: e.target.checked }; onChange(next);
          }} />
          <input className="input text-xs py-1" value={row.key} onChange={(e) => {
            const next = value.slice(); next[i] = { ...row, key: e.target.value }; onChange(next);
          }} placeholder="key" />
          <input className="input text-xs py-1" value={row.value} onChange={(e) => {
            const next = value.slice(); next[i] = { ...row, value: e.target.value }; onChange(next);
          }} placeholder="value" />
          <button className="text-ink-muted hover:text-bad" onClick={() => {
            const next = value.slice(); next.splice(i, 1); onChange(next);
          }}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { key: "", value: "", enabled: true }])}
        className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add param</button>
    </div>
  );
}

function HeadersEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const rows = Object.entries(value);
  return (
    <div className="space-y-1.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input className="input text-xs py-1 font-mono" value={k} onChange={(e) => {
            const next: Record<string, string> = {};
            rows.forEach(([kk, vv], j) => { next[j === i ? e.target.value : kk] = vv; }); onChange(next);
          }} placeholder="Header-Name" />
          <input className="input text-xs py-1 font-mono" value={v} onChange={(e) => {
            onChange({ ...value, [k]: e.target.value });
          }} placeholder="value" />
          <button className="text-ink-muted hover:text-bad" onClick={() => {
            const next = { ...value }; delete next[k]; onChange(next);
          }}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => onChange({ ...value, "": "" })} className="btn-ghost text-xs">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
        <button onClick={() => onChange({ ...value, "Authorization": "Bearer " })} className="btn-ghost text-xs">+ Bearer</button>
        <button onClick={() => onChange({ ...value, "Content-Type": "application/json" })} className="btn-ghost text-xs">+ JSON</button>
      </div>
    </div>
  );
}

function BodyEditor({ req, onChange }: any) {
  const raw = req.body?.raw || "";
  const isJSON = req.body_kind === "json";
  const jsonStatus: "ok" | "bad" | "empty" = useMemo(() => {
    if (!isJSON) return "empty";
    if (!raw.trim()) return "empty";
    try { JSON.parse(raw); return "ok"; } catch { return "bad"; }
  }, [raw, isJSON]);

  function format() {
    try {
      const v = JSON.parse(raw);
      onChange({ body: { ...req.body, raw: JSON.stringify(v, null, 2), content_type: "application/json" } });
      toast.success("Formatted");
    } catch (e: any) {
      toast.error("Invalid JSON: " + (e.message || "syntax error"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          {(["none", "json", "raw", "urlencoded", "form-data", "graphql"] as const).map((k) => (
            <button
              key={k}
              onClick={() => onChange({ body_kind: k })}
              className={`px-2.5 py-1 rounded-full text-xs ring-1 transition
                ${req.body_kind === k
                  ? "bg-brand/15 text-brand ring-brand/30"
                  : "bg-bg-card text-ink-muted ring-bg-border hover:text-ink"}`}
            >
              {k}
            </button>
          ))}
        </div>
        {isJSON && (
          <div className="flex items-center gap-2">
            {jsonStatus === "ok" && (
              <span className="text-[10px] uppercase tracking-wider font-mono text-good flex items-center gap-1">
                <Check className="w-3 h-3" />valid JSON
              </span>
            )}
            {jsonStatus === "bad" && (
              <span className="text-[10px] uppercase tracking-wider font-mono text-bad flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />invalid JSON
              </span>
            )}
            <button onClick={format} className="btn-ghost text-xs">
              <Sparkles className="w-3.5 h-3.5" />Format
            </button>
          </div>
        )}
      </div>
      {(req.body_kind === "raw" || req.body_kind === "json") && (
        <textarea
          value={raw}
          onChange={(e) => onChange({ body: { ...req.body, raw: e.target.value, content_type: isJSON ? "application/json" : (req.body?.content_type || "") } })}
          placeholder='{"hello": "world"}'
          spellCheck={false}
          className={`input w-full font-mono text-xs h-48 transition
            ${isJSON && jsonStatus === "bad" ? "ring-1 ring-bad/40" : ""}`}
        />
      )}
      {req.body_kind === "graphql" && (
        <div className="space-y-2">
          <textarea
            value={req.body?.graphql?.query || ""}
            onChange={(e) => onChange({ body: { ...req.body, graphql: { ...(req.body?.graphql || {}), query: e.target.value } } })}
            placeholder="query { me { id } }"
            className="input w-full font-mono text-xs h-32"
          />
          <textarea
            value={JSON.stringify(req.body?.graphql?.variables || {}, null, 2)}
            onChange={(e) => {
              try {
                const v = JSON.parse(e.target.value || "{}");
                onChange({ body: { ...req.body, graphql: { ...(req.body?.graphql || {}), variables: v } } });
              } catch {}
            }}
            placeholder='{"id": "..."}'
            className="input w-full font-mono text-xs h-24"
          />
        </div>
      )}
      {(req.body_kind === "urlencoded" || req.body_kind === "form-data") && (
        <FormBodyEditor value={req.body?.form || []} onChange={(form) => onChange({ body: { ...req.body, form } })} />
      )}
      {req.body_kind === "none" && (
        <div className="text-xs text-ink-muted text-center py-8">This request has no body.</div>
      )}
    </div>
  );
}

function FormBodyEditor({ value, onChange }: { value: any[]; onChange: (v: any[]) => void }) {
  return (
    <div className="space-y-1.5">
      {value.map((f, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
          <input type="checkbox" checked={f.enabled} onChange={(e) => {
            const n = value.slice(); n[i] = { ...f, enabled: e.target.checked }; onChange(n);
          }} />
          <input className="input text-xs py-1" value={f.key} onChange={(e) => {
            const n = value.slice(); n[i] = { ...f, key: e.target.value }; onChange(n);
          }} placeholder="key" />
          <input className="input text-xs py-1" value={f.value} onChange={(e) => {
            const n = value.slice(); n[i] = { ...f, value: e.target.value }; onChange(n);
          }} placeholder="value" />
          <button className="text-ink-muted hover:text-bad" onClick={() => {
            const n = value.slice(); n.splice(i, 1); onChange(n);
          }}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { key: "", value: "", type: "text", enabled: true }])}
        className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add field</button>
    </div>
  );
}

function AuthEditor({ value, onChange }: any) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(["none", "bearer", "basic", "api_key"] as const).map((k) => (
          <button key={k} onClick={() => onChange({ kind: k })}
            className={`px-2.5 py-1 rounded-full text-xs ring-1 transition uppercase font-mono font-bold
              ${value.kind === k ? "bg-brand/15 text-brand ring-brand/30" : "bg-bg-card text-ink-muted ring-bg-border"}`}>
            {k}
          </button>
        ))}
      </div>
      {value.kind === "bearer" && (
        <input className="input w-full font-mono text-xs" placeholder="Token (or {{token_var}})"
          value={value.token || ""} onChange={(e) => onChange({ token: e.target.value })} />
      )}
      {value.kind === "basic" && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input text-xs" placeholder="Username" value={value.username || ""}
            onChange={(e) => onChange({ username: e.target.value })} />
          <input className="input text-xs" placeholder="Password" type="password" value={value.password || ""}
            onChange={(e) => onChange({ password: e.target.value })} />
        </div>
      )}
      {value.kind === "api_key" && (
        <div className="grid grid-cols-3 gap-2">
          <input className="input text-xs" placeholder="Header / param name" value={value.key || ""}
            onChange={(e) => onChange({ key: e.target.value })} />
          <input className="input text-xs" placeholder="Value" value={value.value || ""}
            onChange={(e) => onChange({ value: e.target.value })} />
          <select className="input text-xs" value={value.in || "header"} onChange={(e) => onChange({ in: e.target.value })}>
            <option value="header">in header</option>
            <option value="query">in query</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ── Response viewer ─────────────────────────────────────────────────────
function ResponseTabs({ response, sending, tab, setTab }: any) {
  const [search, setSearch] = useState("");
  if (sending) {
    return <div className="flex-1 grid place-items-center text-ink-muted text-sm">
      <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</div>
    </div>;
  }
  if (!response) {
    return <div className="flex-1 grid place-items-center text-ink-muted text-xs text-center px-6">
      <div>
        <Send className="w-7 h-7 mx-auto mb-2 opacity-40" />
        Hit <b className="text-ink">Send</b> to see the response here.
      </div>
    </div>;
  }
  const status = response.status || 0;
  const tone = status === 0 ? "text-bad"
    : status < 300 ? "text-good"
    : status < 400 ? "text-cool"
    : status < 500 ? "text-warn"
    : "text-bad";
  return (
    <>
      <div className="px-4 py-2 border-b border-bg-border flex items-center gap-3 flex-wrap">
        <span className={`text-base font-mono font-bold ${tone}`}>
          {status || "ERR"} {response.status_text}
        </span>
        <span className="text-xs text-ink-muted font-mono">{response.duration_ms} ms</span>
        <span className="text-xs text-ink-muted font-mono">{formatBytes(response.size_bytes)}</span>
        {response.error && <span className="text-xs text-bad">{response.error}</span>}
        <div className="flex-1" />
        <div className="flex gap-1">
          {(["body", "headers", "cookies"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded
                ${tab === t ? "bg-brand/15 text-brand" : "text-ink-muted hover:text-ink"}`}>
              {t}
              {t === "headers" && Object.keys(response.headers || {}).length > 0 &&
                <span className="ml-1 text-[9px] opacity-60">{Object.keys(response.headers).length}</span>}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search response…"
          className="input text-xs py-1 w-40"
        />
        <button onClick={() => copy(Object.entries(response.headers || {}).map(([k, vs]: any) => `${k}: ${Array.isArray(vs) ? vs.join(", ") : String(vs)}`).join("\n"))} className="text-ink-muted hover:text-brand p-1" title="Copy headers">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => downloadText(`response-${status || "err"}.txt`, prettyMaybe(response.body || ""))} className="text-ink-muted hover:text-brand p-1" title="Download body">
          <Download className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => copy(prettyMaybe(response.body || ""))} className="text-ink-muted hover:text-brand p-1" title="Copy body">
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {tab === "body" && <BodyView body={response.body} truncated={response.body_truncated} search={search} />}
        {tab === "headers" && (
          <div className="space-y-0.5">
            {Object.entries(response.headers || {})
              .filter(([k, vs]: any) => {
                if (!search.trim()) return true;
                const hay = `${k} ${Array.isArray(vs) ? vs.join(", ") : String(vs)}`.toLowerCase();
                return hay.includes(search.toLowerCase());
              })
              .map(([k, vs]: any) => (
              <div key={k} className="grid grid-cols-[200px_1fr] gap-2 py-1 border-b border-bg-border">
                <span className="text-brand">{k}</span>
                <span className="text-ink break-all">{Array.isArray(vs) ? vs.join(", ") : String(vs)}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "cookies" && (
          (response.cookies || []).length === 0
            ? <div className="text-ink-muted">No cookies set.</div>
            : <div className="space-y-1">{(response.cookies || [])
                .filter((c: string) => !search.trim() || c.toLowerCase().includes(search.toLowerCase()))
                .map((c: string, i: number) => (
                <div key={i} className="text-ink break-all">{c}</div>
              ))}</div>
        )}
      </div>
    </>
  );
}

function BodyView({ body, truncated, search }: { body: string; truncated?: boolean; search?: string }) {
  const pretty = prettyMaybe(body || "");
  const visible = !search?.trim()
    ? pretty
    : pretty.split("\n").filter((line) => line.toLowerCase().includes(search.toLowerCase())).join("\n");
  return (
    <>
      <pre className="whitespace-pre-wrap break-all text-ink-muted">{visible || pretty}</pre>
      {truncated && (
        <div className="text-warn text-[10px] mt-2 uppercase tracking-wider">
          ⚠ Body truncated at 2 MB
        </div>
      )}
    </>
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function prettyMaybe(s: string): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function formatBytes(n: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function copy(t: string) {
  navigator.clipboard.writeText(t);
  toast.success("Copied");
}

// ── Tab bar (Postman-style) ─────────────────────────────────────────────
function TabBar({
  tabs, activeTabId, savedSnaps, onPick, onClose, onNew,
}: {
  tabs: Request[];
  activeTabId: string | null;
  savedSnaps: Record<string, Request>;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="shrink-0 flex items-stretch h-9 border-b border-bg-border bg-bg-panel/30 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.id === activeTabId;
        const saved = savedSnaps[t.id];
        const dirty = saved ? JSON.stringify(saved) !== JSON.stringify(t) : false;
        return (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className={`group relative flex items-center gap-2 px-3 border-r border-bg-border min-w-[160px] max-w-[260px] cursor-pointer transition
              ${active
                ? "bg-bg-panel/60 text-ink"
                : "bg-transparent text-ink-muted hover:bg-white/[.03] hover:text-ink"}`}
            onClick={() => onPick(t.id)}
          >
            <span className={`text-[9px] font-mono font-bold w-9 text-center px-1 py-0.5 rounded ring-1 shrink-0
              ${METHOD_BG[t.method] || "bg-bg-card ring-bg-border"} ${METHOD_TONE[t.method] || ""}`}>
              {t.method}
            </span>
            <span className="text-xs truncate flex-1 min-w-0">{t.name || "Untitled"}</span>
            {dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse shrink-0" title="Unsaved changes" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-bad p-0.5 transition shrink-0"
              title="Close tab"
            >
              <X className="w-3 h-3" />
            </button>
            {/* Active indicator stripe */}
            {active && (
              <motion.span
                layoutId="active-tab-stripe"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-400"
              />
            )}
          </motion.div>
        );
      })}
      {/* + new tab */}
      <button
        onClick={onNew}
        className="w-9 grid place-items-center text-ink-muted hover:text-brand hover:bg-white/[.03] transition shrink-0"
        title="New request (opens in a new tab)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── History list ────────────────────────────────────────────────────────
function HistoryList({
  items, query, envTag, onQueryChange, onEnvTagChange, onLoad,
}: {
  items: HistoryItem[];
  query: string;
  envTag: EnvTag;
  onQueryChange: (v: string) => void;
  onEnvTagChange: (v: EnvTag) => void;
  onLoad: (h: HistoryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-2 border-b border-bg-border flex gap-2">
          <input className="input text-xs flex-1" placeholder="Search history…" value={query} onChange={(e) => onQueryChange(e.target.value)} />
          <select className="input text-xs" value={envTag} onChange={(e) => onEnvTagChange(e.target.value as EnvTag)}>
            <option value="">All tags</option>
            {ENV_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>
        <div className="flex-1 grid place-items-center text-center px-6 text-xs text-ink-muted">
          <div>
            <Search className="w-7 h-7 mx-auto mb-2 opacity-40" />
            No requests sent yet.<br />Hit Send and history will fill up here.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-bg-border flex gap-2">
        <input className="input text-xs flex-1" placeholder="Search history…" value={query} onChange={(e) => onQueryChange(e.target.value)} />
        <select className="input text-xs" value={envTag} onChange={(e) => onEnvTagChange(e.target.value as EnvTag)}>
          <option value="">All tags</option>
          {ENV_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {items.map((h, i) => {
        const tone = h.status >= 500 || h.status === 0 ? "text-bad"
          : h.status >= 400 ? "text-warn"
          : h.status >= 300 ? "text-cool"
          : "text-good";
        return (
          <button
            key={i}
            onClick={() => onLoad(h)}
            className="w-full text-left p-2 rounded-md hover:bg-white/5 ring-1 ring-bg-border bg-bg-card/40 transition"
          >
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-mono font-bold w-12 text-center px-1.5 py-0.5 rounded ring-1
                ${METHOD_BG[h.method] || "bg-bg-card ring-bg-border"} ${METHOD_TONE[h.method] || ""}`}>
                {h.method}
              </span>
              <span className={`text-[10px] font-mono font-bold ${tone}`}>{h.status || "ERR"}</span>
              <span className="text-[10px] text-ink-muted ml-auto">{h.duration_ms} ms</span>
            </div>
            <div className="text-xs text-ink mt-1 truncate font-mono">{h.url}</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[10px] text-ink-dim">{new Date(h.ran_at).toLocaleString()}</span>
              {h.env_tag && <span className="text-[10px] text-cool">{h.env_tag}</span>}
              <span className="text-[10px] text-sky-300">{h.request ? "full request available" : "URL only"}</span>
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}

// ── Dancing women — silly little SVG that wiggles around ────────────────
export function DancingFigure({ size = 110 }: { size?: number }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg"
      animate={{ y: [0, -2, 0, 2, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* head */}
      <motion.circle
        cx="50" cy="22" r="10" fill="url(#pwgrad-d)"
        animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50px 30px" }}
      />
      {/* hair (long flowing) */}
      <motion.path
        d="M 40 18 Q 38 32 42 40 M 60 18 Q 62 32 58 40"
        stroke="#a855f7" strokeWidth="3" fill="none" strokeLinecap="round"
        animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50px 22px" }}
      />
      {/* body (dress) */}
      <path d="M 38 32 L 36 70 L 64 70 L 62 32 Z" fill="url(#pwgrad-d)" />
      {/* skirt swing */}
      <motion.path
        d="M 36 70 L 28 95 L 72 95 L 64 70 Z" fill="url(#pwgrad-d)"
        animate={{ skewX: [-4, 4, -4] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50px 70px" }}
      />
      {/* arms waving */}
      <motion.line
        x1="38" y1="38" x2="20" y2="22"
        stroke="url(#pwgrad-d)" strokeWidth="6" strokeLinecap="round"
        animate={{ rotate: [-30, 20, -30] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "38px 38px" }}
      />
      <motion.line
        x1="62" y1="38" x2="80" y2="22"
        stroke="url(#pwgrad-d)" strokeWidth="6" strokeLinecap="round"
        animate={{ rotate: [30, -20, 30] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "62px 38px" }}
      />
      {/* legs tap */}
      <motion.line
        x1="44" y1="95" x2="40" y2="118"
        stroke="url(#pwgrad-d)" strokeWidth="6" strokeLinecap="round"
        animate={{ rotate: [-8, 8, -8] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "44px 95px" }}
      />
      <motion.line
        x1="56" y1="95" x2="60" y2="118"
        stroke="url(#pwgrad-d)" strokeWidth="6" strokeLinecap="round"
        animate={{ rotate: [8, -8, 8] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "56px 95px" }}
      />
      {/* musical notes around */}
      <motion.text x="14" y="40" fontSize="14" fill="#0EA5E9"
        animate={{ y: [40, 30, 40], opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
      >♪</motion.text>
      <motion.text x="84" y="50" fontSize="14" fill="#A855F7"
        animate={{ y: [50, 40, 50], opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.4, repeat: Infinity, delay: 0.6 }}
      >♫</motion.text>
      <defs>
        <linearGradient id="pwgrad-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}
