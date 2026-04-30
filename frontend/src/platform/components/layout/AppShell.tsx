import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FlaskConical, Activity, FileText, LogOut, Server, Plus,
  History as HistoryIcon, Menu, X, BookOpen, Home,
} from "lucide-react";
import toast from "react-hot-toast";
import { Wordmark } from "./Logo";
import { api, clearKey, getTeam } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { RunNotifier } from "../ui/RunNotifier";
import { TOOLS, enabledTools, type ToolAccent } from "../../../tools/registry";

// Tailwind chip classes per tool accent. Centralised here so the team card
// and quick-jump buttons stay visually consistent regardless of how many
// tools the registry grows to.
function chipClass(a: ToolAccent): string {
  if (a === "brand")  return "bg-brand/15 text-brand ring-brand/30";
  if (a === "sky")    return "bg-sky-500/15 text-sky-400 ring-sky-500/30";
  if (a === "violet") return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
  if (a === "cyan")   return "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30";
  return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
}
function quickJumpClass(a: ToolAccent): string {
  if (a === "brand")  return "text-brand ring-brand/30 bg-brand/[.06] hover:bg-brand/[.12]";
  if (a === "sky")    return "text-sky-400 ring-sky-500/30 bg-sky-500/[.06] hover:bg-sky-500/[.12]";
  if (a === "violet") return "text-violet-300 ring-violet-500/30 bg-violet-500/[.06] hover:bg-violet-500/[.12]";
  if (a === "cyan")   return "text-cyan-300 ring-cyan-500/30 bg-cyan-500/[.06] hover:bg-cyan-500/[.12]";
  return "text-emerald-300 ring-emerald-500/30 bg-emerald-500/[.06] hover:bg-emerald-500/[.12]";
}

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/",         label: "Dashboard",  Icon: LayoutDashboard },
      { to: "/builder",  label: "New Test",   Icon: Plus },
      { to: "/history",  label: "History",    Icon: HistoryIcon },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/tests",    label: "Saved Tests", Icon: FlaskConical },
      { to: "/runs",     label: "Active Runs", Icon: Activity },
      { to: "/reports",  label: "Reports",     Icon: FileText },
      { to: "/environments", label: "Environments", Icon: Server },
    ],
  },
  {
    label: "Help",
    items: [
      { to: "/overview", label: "Guide",      Icon: BookOpen },
    ],
  },
];

function teamInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AppShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const team = getTeam();
  const tools = team?.tools_access || TOOLS.map(t => t.slug);
  const enabled = enabledTools(tools);
  const otherTools = enabled.filter(t => t.slug !== "apistress");

  // Enforce gating: if the team doesn't have APIStress access, redirect to
  // their next-best tool, or to /login if they have nothing at all.
  useEffect(() => {
    if (!team) return;
    if (!tools.includes("apistress")) {
      const fallback = enabled[0];
      nav(fallback ? fallback.routePath : "/login", { replace: true });
    }
  }, [team, tools, enabled, nav]);

  // close drawer when route changes
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  // Per-route browser-tab title for APIStress's many sub-pages.
  const apiStressTitle = (() => {
    const p = loc.pathname;
    if (p === "/")               return "APIStress · Dashboard";
    if (p.startsWith("/builder")) return "APIStress · New test";
    if (p.startsWith("/history")) return "APIStress · History";
    if (p.startsWith("/tests"))   return "APIStress · Saved tests";
    if (p.startsWith("/runs/"))   return "APIStress · Live run";
    if (p === "/runs")            return "APIStress · Active runs";
    if (p.startsWith("/reports/")) return "APIStress · Report";
    if (p === "/reports")         return "APIStress · Reports";
    if (p.startsWith("/environments")) return "APIStress · Environments";
    if (p.startsWith("/compare")) return "APIStress · Compare";
    if (p.startsWith("/overview")) return "APIStress · Guide";
    return "APIStress · Hit your APIs hard";
  })();
  useDocumentTitle(apiStressTitle);

  // Log tool.open once per APIStress mount so the admin sees adoption.
  useEffect(() => {
    if (team) {
      api.logActivity({ event_type: "tool.open", tool_slug: "apistress", actor_name: team.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    api.logActivity({ event_type: "auth.logout", actor_name: team?.name });
    clearKey();
    toast.success("Signed out");
    nav("/login", { replace: true });
  }

  const sidebar = (
    <aside className="w-64 shrink-0 h-full border-r border-bg-border bg-bg-panel/60 backdrop-blur-md flex flex-col">
      {/* Brand */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <Wordmark />
        <button onClick={() => setMobileOpen(false)} className="md:hidden text-ink-muted hover:text-ink p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Slim home/switch button */}
      <div className="px-3 pb-3 border-b border-bg-border">
        <NavLink
          to="/mode"
          className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
                     text-ink-muted hover:text-brand hover:bg-white/5 transition"
          title="Back to home — pick another tool"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="font-medium">Switch tool</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider opacity-60">/mode</span>
        </NavLink>
      </div>

      {/* Nav with groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1.5 text-[9px] uppercase tracking-[0.18em] text-ink-dim font-mono font-bold">
              {g.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `relative group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition
                     ${isActive ? "text-white" : "text-ink-muted hover:text-ink hover:bg-white/[.04]"}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="active-pill"
                          className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-brand/20 to-brand/5 ring-1 ring-brand/30"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: team card + actions */}
      <div className="border-t border-bg-border p-3 space-y-2.5">
        {team && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-bg-card/60 ring-1 ring-bg-border">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-light to-brand-dark grid place-items-center text-white font-bold text-sm shrink-0 shadow-md shadow-brand/20">
              {teamInitials(team.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-[0.16em] text-ink-dim font-mono">Team</div>
              <div className="text-sm font-bold text-ink truncate leading-tight">{team.name}</div>
              <div className="mt-1 flex gap-1 flex-wrap">
                {enabled.map((t) => (
                  <span
                    key={t.slug}
                    className={`text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${chipClass(t.accent)}`}
                    title={t.label}
                  >
                    {t.chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick actions row — one button per non-APIStress enabled tool */}
        <div className="flex gap-1 flex-wrap">
          {otherTools.map((t) => {
            const Icon = t.Icon;
            return (
              <NavLink
                key={t.slug}
                to={t.routePath}
                className={`flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px]
                           ring-1 transition ${quickJumpClass(t.accent)}`}
                title={`Switch to ${t.label}`}
              >
                <Icon className="w-3 h-3" /> {t.label}
              </NavLink>
            );
          })}
          <button
            onClick={logout}
            className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px]
                       text-ink-muted ring-1 ring-bg-border bg-bg-card/40 hover:text-bad hover:ring-bad/30 transition"
            title="Sign out"
          >
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>

        {/* Crafted-by single line */}
        <a
          href="https://github.com/gauravpatil97886"
          target="_blank"
          rel="noopener"
          className="block text-center text-[10px] text-ink-dim hover:text-brand transition"
        >
          Crafted by <b className="text-ink-muted">Gaurav Patil</b> · v1.0
        </a>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex relative">
      <RunNotifier />

      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen sticky top-0 z-30">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 h-full"
            >
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 bg-bg-panel/80 backdrop-blur-md border-b border-bg-border px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-ink p-1.5 rounded-lg hover:bg-white/5"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Wordmark size={18} />
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px]
                       text-ink-muted ring-1 ring-bg-border hover:text-bad hover:ring-bad/40 transition"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
