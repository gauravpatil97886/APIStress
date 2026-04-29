import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FlaskConical, Activity, FileText, LogOut, Server, Plus,
  History as HistoryIcon, Menu, X, BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { Wordmark } from "./Logo";
import { clearKey } from "../../lib/api";
import { RunNotifier } from "./RunNotifier";
import { CreatedBy } from "./CreatedBy";

const items = [
  { to: "/",         label: "Dashboard",   Icon: LayoutDashboard },
  { to: "/overview", label: "Guide",       Icon: BookOpen, highlight: true },
  { to: "/builder",  label: "New Test",    Icon: Plus },
  { to: "/history",  label: "History",     Icon: HistoryIcon },
  { to: "/tests",    label: "Saved Tests", Icon: FlaskConical },
  { to: "/runs",     label: "Active Runs", Icon: Activity },
  { to: "/reports",  label: "Reports",     Icon: FileText },
  { to: "/environments", label: "Environments", Icon: Server },
];

export default function AppShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // close drawer when route changes
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  function logout() {
    clearKey();
    toast.success("Signed out");
    nav("/login", { replace: true });
  }

  const sidebar = (
    <aside className="w-64 shrink-0 h-full border-r border-bg-border bg-bg-panel/70 backdrop-blur-md p-4 flex flex-col">
      <div className="px-2 py-3 flex items-center justify-between">
        <Wordmark />
        <button onClick={() => setMobileOpen(false)} className="md:hidden text-ink-muted hover:text-ink p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav className="mt-6 flex flex-col gap-1">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `relative group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition
               ${isActive ? "text-white" : "text-ink-muted hover:text-ink hover:bg-white/5"}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="active-pill"
                    className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-brand/20 to-brand/5 ring-1 ring-brand/30"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="w-4 h-4" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2">
        <button onClick={logout} className="btn-ghost w-full justify-start text-ink-muted hover:text-bad">
          <LogOut className="w-4 h-4" />Sign out
        </button>
        <CreatedBy compact />
        <div className="text-[9px] text-ink-dim text-center tracking-wider uppercase">
          APIStress · v1.0 · open-source
        </div>
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
          <div className="w-8" />
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
