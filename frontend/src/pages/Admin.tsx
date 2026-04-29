import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield, Plus, Copy, Trash2, KeyRound, Users, RefreshCw, ArrowLeft,
  Sparkles, Check, X, Edit3, Power, Activity as ActivityIcon, History as HistoryIcon,
  Search, Filter, TrendingUp, BarChart3, Eye,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";
import { ChoiceTechlabMark } from "../components/ui/ChoiceTechlabMark";
import { adminApi, getAdminKey, setAdminKey, clearAdminKey } from "../lib/api";
import { TOOLS, type ToolAccent } from "../tools/registry";

type Team = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  tools_access: string[];
  member_count: number;
  key_prefix: string;
  last_used_at?: string | null;
  created_at: string;
};

// Sourced from the canonical tool registry so adding a new tool here is
// just a one-line entry in `frontend/src/tools/registry.tsx`.
const ALL_TOOLS = TOOLS.map(t => ({
  id: t.slug,
  label: t.label,
  desc: t.tagline,
  Icon: t.Icon,
  tone: t.accent as ToolAccent,
  chip: t.chip,
}));

// Tailwind class atoms per accent. Keep these in sync with `themeFor()`
// in the registry; we duplicate here so JSX can use them inline.
function adminTone(a: ToolAccent) {
  if (a === "brand") return { active: "bg-brand/15 text-brand ring-brand/40 border-brand/40", chip: "bg-brand/15 text-brand ring-brand/30" };
  if (a === "sky")   return { active: "bg-sky-500/15 text-sky-400 ring-sky-500/40 border-sky-500/40", chip: "bg-sky-500/15 text-sky-400 ring-sky-500/30" };
  return { active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40 border-emerald-500/40", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" };
}

export default function Admin() {
  const [authed, setAuthed] = useState<boolean>(() => !!getAdminKey());
  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;
  return <AdminConsole onLogout={() => { clearAdminKey(); setAuthed(false); }} />;
}

function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pass.trim()) return toast.error("Enter the admin passphrase");
    setBusy(true);
    try {
      await adminApi.auth(pass.trim());
      setAdminKey(pass.trim());
      onAuthed();
      toast.success("Welcome, admin");
    } catch (err: any) {
      toast.error(err.message || "Wrong passphrase");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative min-h-screen grid place-items-center px-4 overflow-hidden">
      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-brand/10 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full bg-violet-500/10 blur-3xl pointer-events-none"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative card p-8 w-full max-w-md ring-1 ring-bg-border shadow-2xl shadow-black/40"
      >
        <div className="absolute -top-px -right-px w-24 h-24 rounded-tr-2xl bg-gradient-to-br from-brand/30 to-transparent pointer-events-none" />
        <div className="flex flex-col items-center text-center mb-6">
          <motion.div animate={{ rotate: [0, 6, -3, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
            <ChoiceTechlabMark size={64} />
          </motion.div>
          <h1 className="font-display text-2xl font-bold mt-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand" /> Admin console
          </h1>
          <p className="text-xs text-ink-muted mt-1">Restricted area — passphrase required.</p>
          <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-ink-muted font-mono">
            ━ Choice Techlab ━
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label flex items-center gap-1.5"><Shield className="w-3 h-3" /> Admin passphrase</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <input
                type="password" autoFocus
                value={pass} onChange={(e) => setPass(e.target.value)}
                placeholder="Enter admin key & press Enter"
                className="input w-full pl-9 font-mono py-3"
              />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? "Verifying…" : <>Enter <Shield className="w-4 h-4" /></>}
          </button>
        </form>
        <button onClick={() => nav("/login")} className="mt-4 text-xs text-ink-muted hover:text-brand inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to login
        </button>
      </motion.div>
    </div>
  );
}

function AdminConsole({ onLogout }: { onLogout: () => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ teamID: string; key: string } | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"teams" | "activity" | "audit">("teams");

  async function toggleActive(t: Team) {
    try {
      await adminApi.setActive(t.id, !t.is_active);
      toast.success(t.is_active ? `${t.name} disabled` : `${t.name} enabled`);
      reload();
    } catch (e: any) { toast.error(e.message); }
  }

  async function reload() {
    setLoading(true);
    try { setTeams(await adminApi.listTeams()); }
    catch (e: any) { toast.error(e.message, { id: "admin-error", duration: 5000 }); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function rotate(id: string, name: string) {
    if (!confirm(`Rotate "${name}"'s key? Existing members will be locked out.`)) return;
    try {
      const { plain_key } = await adminApi.rotateKey(id);
      setRevealed({ teamID: id, key: plain_key });
      reload();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Their key stops working immediately. All their data is removed.`)) return;
    try { await adminApi.deleteTeam(id); toast.success("Team deleted"); reload(); }
    catch (e: any) { toast.error(e.message, { id: "admin-error", duration: 5000 }); }
  }
  function copy(s: string) { navigator.clipboard.writeText(s); toast.success("Key copied"); }

  const filtered = useMemo(() =>
    teams.filter((t) =>
      !search.trim() ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    ), [teams, search]);

  const totalMembers = teams.reduce((acc, t) => acc + t.member_count, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 h-14 border-b border-bg-border bg-bg-panel/70 backdrop-blur-md flex items-center px-4 gap-3">
        <Link to="/login" className="btn-ghost text-xs"><ArrowLeft className="w-4 h-4" />Back to login</Link>
        <div className="h-5 w-px bg-bg-border" />
        <ChoiceTechlabMark size={28} />
        <div>
          <div className="font-display text-base font-bold leading-none">Admin console</div>
          <div className="text-[10px] text-ink-muted uppercase tracking-[0.16em] font-mono">
            Choice Techlab · teams &amp; access keys
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={onLogout} className="btn-ghost text-xs text-ink-muted hover:text-bad">
          Sign out admin
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Tabs */}
        <nav className="flex items-center gap-1 border-b border-bg-border -mb-2">
          {[
            { id: "teams" as const,    label: "Teams",    Icon: Users },
            { id: "activity" as const, label: "Activity", Icon: ActivityIcon },
            { id: "audit" as const,    label: "Audit",    Icon: HistoryIcon },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition
                ${tab === t.id ? "text-brand" : "text-ink-muted hover:text-ink"}`}
            >
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
              {tab === t.id && (
                <motion.span layoutId="admin-tab-pill" className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {tab === "activity" && <ActivityTab teams={teams} />}
        {tab === "audit" && <AuditTab />}

        {tab === "teams" && (<>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat icon={Users} label="Teams" value={teams.length} tone="brand" />
          <Stat icon={KeyRound} label="Active keys" value={teams.length} tone="good" />
          <Stat icon={Sparkles} label="Total members" value={totalMembers} tone="cool" />
        </div>

        <section className="card p-3 flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams…" className="input flex-1 min-w-[200px] text-sm" />
          <button onClick={() => setCreating(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> New team
          </button>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="card p-12 text-center text-ink-muted">
              <RefreshCw className="w-6 h-6 mx-auto opacity-30 mb-3 animate-spin" />
              Loading teams…
            </div>
          ) : filtered.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="card p-5 ring-1 ring-bg-border"
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-light to-brand-dark grid place-items-center text-white font-bold text-lg shrink-0">
                  {t.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-bold flex items-center gap-2">
                    {t.name}
                    {!t.is_active && (
                      <span className="pill ring-1 bg-warn/15 text-warn ring-warn/30 text-[10px] uppercase tracking-wider font-mono">
                        DISABLED
                      </span>
                    )}
                  </h3>
                  {t.description && <p className="text-xs text-ink-muted mt-0.5">{t.description}</p>}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="pill ring-1 ring-bg-border bg-bg-card text-[10px] font-mono uppercase tracking-wider">
                      <Users className="w-3 h-3" /> {t.member_count} member{t.member_count === 1 ? "" : "s"}
                    </span>
                    <span className="pill ring-1 ring-bg-border bg-bg-card text-[10px] text-ink-muted">
                      Created {new Date(t.created_at).toLocaleDateString()}
                    </span>
                    {t.last_used_at && (
                      <span className="pill ring-1 ring-bg-border bg-bg-card text-[10px] text-ink-muted">
                        Last used {new Date(t.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted font-bold mr-1">Tools:</span>
                    {ALL_TOOLS.map((tool) => {
                      const enabled = t.tools_access?.includes(tool.id);
                      const Icon = tool.Icon;
                      return (
                        <span key={tool.id}
                          className={`pill ring-1 text-[11px] inline-flex items-center gap-1.5
                            ${enabled
                              ? adminTone(tool.tone).chip
                              : "bg-bg-card text-ink-muted/40 ring-bg-border line-through"}`}>
                          {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          <Icon className="w-3 h-3" />
                          {tool.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setEditing(t)} className="btn-ghost text-xs" title="Edit team / tools">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => toggleActive(t)}
                    className={`btn-ghost text-xs ${t.is_active ? "text-warn" : "text-good"}`}
                    title={t.is_active ? "Disable team (block login)" : "Enable team"}>
                    <Power className="w-3.5 h-3.5" /> {t.is_active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => rotate(t.id, t.name)} className="btn-ghost text-xs" title="Rotate key">
                    <RefreshCw className="w-3.5 h-3.5" /> Rotate
                  </button>
                  <button onClick={() => del(t.id, t.name)} className="btn-ghost text-xs text-bad hover:text-bad" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-bg-card ring-1 ring-bg-border">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-ink-muted flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Access key
                  </span>
                  {revealed?.teamID === t.id ? (
                    <button onClick={() => copy(revealed.key)} className="btn-ghost text-xs">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  ) : (
                    <span className="text-[10px] text-ink-dim font-mono">
                      Plain key shown only at creation / rotation
                    </span>
                  )}
                </div>
                <div className="font-mono text-sm select-all break-all">
                  {revealed?.teamID === t.id
                    ? <span className="text-brand">{revealed.key}</span>
                    : <span className="text-ink-muted">{t.key_prefix}••••••••••••••••••</span>}
                </div>
              </div>
            </motion.div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="card p-12 text-center text-ink-muted">
              <Users className="w-10 h-10 mx-auto opacity-30 mb-3" />
              <div className="text-sm">{teams.length === 0 ? "No teams yet — create the first one." : "No teams match your search."}</div>
              {teams.length === 0 && (
                <button onClick={() => setCreating(true)} className="btn-primary text-sm mt-4">
                  <Plus className="w-4 h-4" /> Create first team
                </button>
              )}
            </div>
          )}
        </section>
        </>)}
      </main>

      {creating && (
        <CreateTeamModal
          onCancel={() => setCreating(false)}
          onCreated={(team, plainKey) => {
            setCreating(false);
            setRevealed({ teamID: team.id, key: plainKey });
            reload();
            toast.success(`Team "${team.name}" created`);
          }}
        />
      )}

      {editing && (
        <EditTeamModal
          team={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); toast.success("Team updated"); }}
        />
      )}
    </div>
  );
}

function EditTeamModal({
  team, onCancel, onSaved,
}: {
  team: Team;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description);
  const [tools, setTools] = useState<string[]>(team.tools_access || []);
  const [busy, setBusy] = useState(false);

  function toggleTool(id: string) {
    setTools((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Team name required");
    if (tools.length === 0) return toast.error("Pick at least one tool");
    setBusy(true);
    try {
      await adminApi.renameTeam(team.id, { name, description: desc, tools });
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="card p-6 w-full max-w-lg ring-1 ring-bg-border shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-light to-brand-dark grid place-items-center text-white">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Edit team</h2>
            <p className="text-xs text-ink-muted">Update name, description, and tool access.</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Team name <span className="text-bad">*</span></label>
            <input className="input w-full" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input w-full text-sm" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="label">Tools this team can use <span className="text-bad">*</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_TOOLS.map((tool) => {
                const active = tools.includes(tool.id);
                const Icon = tool.Icon;
                const tone = active
                  ? adminTone(tool.tone).active
                  : "ring-bg-border text-ink-muted hover:ring-emerald-500/30";
                const iconWrap = tool.tone === "brand"
                  ? "from-brand/30 to-brand-dark/40 ring-brand/30"
                  : tool.tone === "sky"
                    ? "from-sky-400/30 to-sky-700/40 ring-sky-500/30"
                    : "from-emerald-400/30 to-emerald-700/40 ring-emerald-500/30";
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl ring-2 transition ${tone}`}>
                    <span className={`w-9 h-9 rounded-lg ring-1 bg-gradient-to-br ${iconWrap} grid place-items-center shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white/90" />
                    </span>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-bold text-sm flex items-center gap-2">
                        {tool.label}
                        <span className="text-[9px] font-mono uppercase tracking-wider text-ink-dim">{tool.chip}</span>
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">{tool.desc}</div>
                    </div>
                    <span className={`w-5 h-5 rounded-md grid place-items-center shrink-0 transition
                      ${active ? "bg-current" : "ring-1 ring-current"}`}>
                      {active && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-dim">
              Members will need to log out and back in for the change to take effect.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? "Saving…" : <><Check className="w-4 h-4" />Save changes</>}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: any) {
  const t = tone === "brand" ? "text-brand bg-brand/10"
    : tone === "good"  ? "text-good bg-good/10"
    : tone === "cool"  ? "text-cool bg-cool/10"
    : "text-ink bg-bg-card";
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${t} grid place-items-center`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function CreateTeamModal({
  onCancel, onCreated,
}: {
  onCancel: () => void;
  onCreated: (team: Team, plainKey: string) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tools, setTools] = useState<string[]>(TOOLS.map(t => t.slug));
  const [busy, setBusy] = useState(false);

  function toggleTool(id: string) {
    setTools((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Team name required");
    if (tools.length === 0) return toast.error("Pick at least one tool");
    setBusy(true);
    try {
      const { team, plain_key } = await adminApi.createTeam({ name, description: desc, tools });
      onCreated(team, plain_key);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="card p-6 w-full max-w-lg ring-1 ring-bg-border shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-light to-brand-dark grid place-items-center text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">New team</h2>
            <p className="text-xs text-ink-muted">A unique access key will be auto-generated.</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Team name <span className="text-bad">*</span></label>
            <input className="input w-full" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend, Mobile, QA…" />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input w-full text-sm" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this team owns" />
          </div>
          <div>
            <label className="label">Tools this team can use <span className="text-bad">*</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_TOOLS.map((tool) => {
                const active = tools.includes(tool.id);
                const Icon = tool.Icon;
                const tone = active
                  ? adminTone(tool.tone).active
                  : "ring-bg-border text-ink-muted hover:ring-emerald-500/30";
                const iconWrap = tool.tone === "brand"
                  ? "from-brand/30 to-brand-dark/40 ring-brand/30"
                  : tool.tone === "sky"
                    ? "from-sky-400/30 to-sky-700/40 ring-sky-500/30"
                    : "from-emerald-400/30 to-emerald-700/40 ring-emerald-500/30";
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl ring-2 transition ${tone}`}>
                    <span className={`w-9 h-9 rounded-lg ring-1 bg-gradient-to-br ${iconWrap} grid place-items-center shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white/90" />
                    </span>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-bold text-sm flex items-center gap-2">
                        {tool.label}
                        <span className="text-[9px] font-mono uppercase tracking-wider text-ink-dim">{tool.chip}</span>
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">{tool.desc}</div>
                    </div>
                    <span className={`w-5 h-5 rounded-md grid place-items-center shrink-0 transition
                      ${active ? "bg-current" : "ring-1 ring-current"}`}>
                      {active && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? "Creating…" : <><Plus className="w-4 h-4" />Create team</>}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────
// Live cross-tool feed + adoption charts. Polls /api/admin/activity and
// /api/admin/activity/stats. Filterable by team, tool, event-type, free
// text, and date range. Auto-refresh toggle for a live-tail feel.

const TOOL_ACCENT_FOR: Record<string, string> = {
  apistress: "text-brand bg-brand/10 ring-brand/30",
  postwomen: "text-sky-400 bg-sky-500/10 ring-sky-500/30",
  crosswalk: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30",
  admin:     "text-violet-300 bg-violet-500/10 ring-violet-500/30",
};

const EVENT_ACCENT: Record<string, string> = {
  "auth.login":              "text-good bg-good/10 ring-good/30",
  "auth.login_failed":       "text-bad bg-bad/10 ring-bad/30",
  "auth.logout":             "text-ink-muted bg-bg-card ring-bg-border",
  "tool.open":               "text-cool bg-cool/10 ring-cool/30",
  "feature.run.start":       "text-brand bg-brand/15 ring-brand/30",
  "feature.run.stop":        "text-warn bg-warn/15 ring-warn/30",
  "feature.pw.send":         "text-sky-400 bg-sky-500/15 ring-sky-500/30",
  "feature.crosswalk.join":  "text-emerald-300 bg-emerald-500/15 ring-emerald-500/30",
  "feature.crosswalk.export":"text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
  "admin.action":            "text-violet-300 bg-violet-500/15 ring-violet-500/30",
};

function ActivityTab({ teams }: { teams: Team[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [windowHours, setWindowHours] = useState(168);

  const [filterTeam, setFilterTeam] = useState("");
  const [filterTool, setFilterTool] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [search, setSearch] = useState("");
  const [inspect, setInspect] = useState<any | null>(null);

  async function load() {
    try {
      const [feed, st] = await Promise.all([
        adminApi.activity({
          team_id: filterTeam || undefined,
          tool: filterTool || undefined,
          event: filterEvent || undefined,
          q: search || undefined,
          limit: 200,
        }),
        adminApi.activityStats(windowHours),
      ]);
      setItems(feed);
      setStats(st);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load activity", { id: "activity-error" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterTeam, filterTool, filterEvent, search, windowHours]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [autoRefresh, filterTeam, filterTool, filterEvent, search, windowHours]);

  function exportCSV() {
    const cols = ["ts", "team", "actor", "event_type", "tool", "resource_type", "resource_id", "ip"];
    const lines: string[] = [cols.join(",")];
    items.forEach((r) => {
      lines.push([
        r.ts, r.team_name ?? "", r.actor_name ?? "", r.event_type,
        r.tool_slug ?? "", r.resource_type ?? "", r.resource_id ?? "", r.ip ?? "",
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `activity-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Stats KPIs */}
      <div className="grid sm:grid-cols-4 gap-3">
        <KpiCard icon={ActivityIcon} label="Events" value={stats?.total_events ?? 0} tone="brand"
          hint={`Last ${stats?.window_hours ?? windowHours}h`} />
        <KpiCard icon={Users} label="Active teams" value={stats?.unique_teams ?? 0} tone="cool" />
        <KpiCard icon={Sparkles} label="Active actors" value={stats?.unique_actors ?? 0} tone="good" />
        <div className="card p-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand shrink-0" />
          <select value={windowHours} onChange={(e) => setWindowHours(+e.target.value)}
            className="input text-xs py-1 w-full">
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
            <option value={336}>Last 14d</option>
            <option value={720}>Last 30d</option>
          </select>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-brand" />
            <div className="text-sm font-bold">Events over time</div>
            <span className="text-[10px] text-ink-dim font-mono">hourly buckets</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer>
              <AreaChart data={(stats?.hourly_timeline ?? []).map((r: any) => ({
                t: new Date(r.bucket).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }),
                count: Number(r.count),
              }))}>
                <defs>
                  <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#FF7A2A" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#FF7A2A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#23262d" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: "#7c8693", fontSize: 10 }} />
                <YAxis tick={{ fill: "#7c8693", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#181a20", border: "1px solid #23262d", borderRadius: 6 }} />
                <Area type="monotone" dataKey="count" stroke="#FF7A2A" strokeWidth={2} fill="url(#aGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-brand" />
            <div className="text-sm font-bold">Tool adoption</div>
            <span className="text-[10px] text-ink-dim font-mono">events per tool</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={(stats?.tool_breakdown ?? []).map((r: any) => ({
                tool: r.tool, count: Number(r.count), teams: Number(r.teams),
              }))}>
                <CartesianGrid stroke="#23262d" strokeDasharray="3 3" />
                <XAxis dataKey="tool" tick={{ fill: "#7c8693", fontSize: 10 }} />
                <YAxis tick={{ fill: "#7c8693", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#181a20", border: "1px solid #23262d", borderRadius: 6 }} />
                <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top teams + event breakdown */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-cool" /> Most active teams
          </div>
          <div className="space-y-1.5">
            {(stats?.top_teams ?? []).map((t: any, i: number) => {
              const max = stats?.top_teams?.[0]?.count || 1;
              const pct = (t.count / max) * 100;
              return (
                <div key={t.team_id || i} className="flex items-center gap-2 text-xs">
                  <div className="w-32 truncate font-bold" title={t.team_name}>{t.team_name}</div>
                  <div className="flex-1 h-2 bg-bg-card rounded overflow-hidden ring-1 ring-bg-border">
                    <div className="h-full bg-gradient-to-r from-brand-light to-brand-dark" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="font-mono tabular-nums w-16 text-right">{t.count.toLocaleString()}</div>
                </div>
              );
            })}
            {(!stats?.top_teams || stats.top_teams.length === 0) && (
              <div className="text-xs text-ink-muted py-6 text-center">No activity yet in this window.</div>
            )}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            <ActivityIcon className="w-4 h-4 text-good" /> Event types
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(stats?.event_breakdown ?? []).map((r: any) => (
              <span key={r.event_type}
                className={`pill ring-1 text-[11px] ${EVENT_ACCENT[r.event_type] || "ring-bg-border bg-bg-card text-ink-muted"}`}>
                <code>{r.event_type}</code> · <b>{r.count.toLocaleString()}</b>
              </span>
            ))}
            {(!stats?.event_breakdown || stats.event_breakdown.length === 0) && (
              <div className="text-xs text-ink-muted py-2">—</div>
            )}
          </div>
        </div>
      </div>

      {/* Filters + feed */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-ink-muted" />
        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="input text-xs py-1">
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterTool} onChange={(e) => setFilterTool(e.target.value)} className="input text-xs py-1">
          <option value="">All tools</option>
          <option value="apistress">APIStress</option>
          <option value="postwomen">PostWomen</option>
          <option value="crosswalk">Crosswalk</option>
          <option value="admin">Admin</option>
        </select>
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className="input text-xs py-1">
          <option value="">All events</option>
          {(stats?.event_breakdown ?? []).map((r: any) =>
            <option key={r.event_type} value={r.event_type}>{r.event_type}</option>
          )}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor / event…" className="input text-xs pl-7 py-1 w-48" />
        </div>
        <div className="flex-1" />
        <label className="text-[11px] text-ink-muted inline-flex items-center gap-1.5">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh
        </label>
        <button onClick={() => load()} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button onClick={exportCSV} className="btn-ghost text-xs">Export CSV</button>
      </div>

      <div className="card p-0 ring-1 ring-bg-border overflow-hidden">
        <div className="bg-bg-panel/80 backdrop-blur border-b border-bg-border">
          <div className="grid grid-cols-[140px_140px_160px_220px_1fr_60px] text-[10px] uppercase tracking-wider text-ink-muted font-mono">
            <div className="px-3 py-2">Time</div>
            <div className="px-3 py-2">Team</div>
            <div className="px-3 py-2">Actor</div>
            <div className="px-3 py-2">Event</div>
            <div className="px-3 py-2">Resource</div>
            <div className="px-3 py-2"></div>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-bg-border/60">
          {loading ? (
            <div className="p-8 text-center text-ink-muted text-xs">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 opacity-30 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-ink-muted text-xs">No events match the current filters.</div>
          ) : items.map((r) => {
            const tone = EVENT_ACCENT[r.event_type] || "ring-bg-border bg-bg-card text-ink-muted";
            const toolTone = TOOL_ACCENT_FOR[r.tool_slug] || "ring-bg-border bg-bg-card text-ink-muted";
            const time = new Date(r.ts);
            return (
              <div key={r.id}
                className="grid grid-cols-[140px_140px_160px_220px_1fr_60px] items-center text-xs hover:bg-white/[.03]">
                <div className="px-3 py-1.5 font-mono text-ink-muted tabular-nums" title={r.ts}>
                  {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  <span className="ml-2 text-[10px] text-ink-dim">{time.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                </div>
                <div className="px-3 py-1.5 truncate" title={r.team_name || "(no team)"}>
                  {r.team_name || <span className="text-ink-dim italic">none</span>}
                </div>
                <div className="px-3 py-1.5 truncate" title={r.actor_name}>
                  <span className={`pill ring-1 text-[10px] mr-1 ${r.actor_type === "admin" ? "bg-violet-500/15 text-violet-300 ring-violet-500/30" : "bg-bg-card ring-bg-border text-ink-muted"}`}>
                    {r.actor_type}
                  </span>
                  {r.actor_name || "—"}
                </div>
                <div className="px-3 py-1.5">
                  <span className={`pill ring-1 text-[10px] ${tone} font-mono`}>{r.event_type}</span>
                  {r.tool_slug && (
                    <span className={`pill ring-1 text-[10px] ml-1 ${toolTone} font-mono uppercase tracking-wider`}>
                      {r.tool_slug}
                    </span>
                  )}
                </div>
                <div className="px-3 py-1.5 truncate text-ink-muted font-mono">
                  {r.resource_type ? `${r.resource_type}` : "—"}
                  {r.resource_id ? <span className="text-ink-dim ml-1">{String(r.resource_id).slice(0, 12)}</span> : null}
                </div>
                <div className="px-2 py-1.5">
                  <button onClick={() => setInspect(r)} className="btn-ghost text-[10px] py-0.5 px-1.5" title="Inspect event">
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {inspect && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setInspect(null)}>
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            className="card p-5 w-full max-w-2xl ring-1 ring-bg-border shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-brand" />
              <div className="text-sm font-bold">Event #{inspect.id}</div>
              <span className={`pill ring-1 text-[10px] font-mono ml-auto ${EVENT_ACCENT[inspect.event_type] || "ring-bg-border bg-bg-card text-ink-muted"}`}>
                {inspect.event_type}
              </span>
              <button onClick={() => setInspect(null)} className="text-ink-muted hover:text-ink ml-2"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <KV k="When" v={new Date(inspect.ts).toString()} />
              <KV k="Team" v={inspect.team_name || "—"} />
              <KV k="Actor" v={`${inspect.actor_type}: ${inspect.actor_name || "(blank)"}`} />
              <KV k="Tool" v={inspect.tool_slug || "—"} />
              <KV k="Resource" v={`${inspect.resource_type ?? "—"}${inspect.resource_id ? " · " + inspect.resource_id : ""}`} />
              <KV k="IP" v={inspect.ip || "—"} />
            </div>
            <div className="mt-3 text-xs">
              <div className="text-ink-dim mb-1 uppercase tracking-wider font-mono text-[10px]">User-Agent</div>
              <div className="font-mono text-[11px] break-all bg-bg-card/60 p-2 rounded ring-1 ring-bg-border">
                {inspect.ua || "—"}
              </div>
            </div>
            <div className="mt-3 text-xs">
              <div className="text-ink-dim mb-1 uppercase tracking-wider font-mono text-[10px]">Meta</div>
              <pre className="font-mono text-[11px] break-all whitespace-pre-wrap bg-bg-card/60 p-2 rounded ring-1 ring-bg-border max-h-64 overflow-auto">
                {JSON.stringify(inspect.meta || {}, null, 2)}
              </pre>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-ink-dim uppercase tracking-wider font-mono text-[10px]">{k}</div>
      <div className="text-ink break-all">{v}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone, hint }: any) {
  const t = tone === "brand" ? "text-brand bg-brand/10"
    : tone === "good" ? "text-good bg-good/10"
    : tone === "cool" ? "text-cool bg-cool/10"
    : "text-ink bg-bg-card";
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl grid place-items-center ${t}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-tight">{Number(value).toLocaleString()}</div>
        {hint && <div className="text-[10px] text-ink-dim mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

// ─── Audit tab — admin-mutation history ───────────────────────────────────
function AuditTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    try { setItems(await adminApi.audit()); }
    catch (e: any) { toast.error(e?.message || "Failed to load audit", { id: "audit-error" }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="card p-0 ring-1 ring-bg-border overflow-hidden">
      <div className="px-3 py-2 border-b border-bg-border flex items-center gap-2">
        <HistoryIcon className="w-4 h-4 text-brand" />
        <div className="text-sm font-bold">Admin audit log</div>
        <span className="text-[10px] text-ink-dim font-mono">last 100 admin actions</span>
        <div className="flex-1" />
        <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      <div className="bg-bg-panel/80 border-b border-bg-border grid grid-cols-[170px_140px_160px_1fr] text-[10px] uppercase tracking-wider text-ink-muted font-mono">
        <div className="px-3 py-2">Time</div>
        <div className="px-3 py-2">Actor</div>
        <div className="px-3 py-2">Action</div>
        <div className="px-3 py-2">Target</div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-bg-border/60">
        {loading ? (
          <div className="p-8 text-center text-ink-muted text-xs">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 opacity-30 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-xs">No admin actions recorded yet.</div>
        ) : items.map((r, i) => (
          <div key={i} className="grid grid-cols-[170px_140px_160px_1fr] text-xs hover:bg-white/[.03]">
            <div className="px-3 py-1.5 font-mono text-ink-muted">{new Date(r.ts).toLocaleString()}</div>
            <div className="px-3 py-1.5">
              <span className="pill ring-1 text-[10px] bg-violet-500/15 text-violet-300 ring-violet-500/30 mr-1">admin</span>
              {r.actor}
            </div>
            <div className="px-3 py-1.5 font-mono text-ink">{r.action}</div>
            <div className="px-3 py-1.5 truncate text-ink-muted font-mono">
              {r.target_type ? `${r.target_type} · ${r.target_id || "—"}` : "—"}
              {r.ip && <span className="text-ink-dim ml-2">[{r.ip}]</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
