// Kavach — API VAPT (Vulnerability Assessment + Penetration Testing) tool.
//
// "Kavach" (कवच) is Sanskrit for shield / armour — the tool's job is to
// armour your APIs against the same probes attackers run.
//
// The page is a small state machine over three views:
//   - "about"      — landing page when the user first opens the tool
//   - "setup"      — paste curl, configure scan, confirm hostname, run
//   - "live/:id"   — SSE-driven progress + findings stream
//   - "report/:id" — final findings dashboard

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Home, Hammer, Send, FileSpreadsheet, LogOut, BookOpen, Clock, Info } from "lucide-react";
import toast from "react-hot-toast";
import { api, clearKey, getTeam } from "../../../platform/api/client";
import { useDocumentTitle } from "../../../platform/hooks/useDocumentTitle";
import { KavachAbout } from "./KavachAbout";
import { KavachSetup } from "./KavachSetup";
import { KavachLive } from "./KavachLive";
import { KavachReport } from "./KavachReport";
import { KavachHistory } from "./KavachHistory";
import { KavachDetails } from "./KavachDetails";

type View =
  | { kind: "about" }
  | { kind: "details" }
  | { kind: "setup" }
  | { kind: "history" }
  | { kind: "live"; scanID: string }
  | { kind: "report"; scanID: string };

export default function Kavach() {
  const nav = useNavigate();
  const team = getTeam();
  const [params] = useSearchParams();

  // Initial view derived from the query string so deep links work.
  const initial: View =
    params.get("scan") && params.get("view") === "live"
      ? { kind: "live", scanID: params.get("scan")! }
    : params.get("scan")
      ? { kind: "report", scanID: params.get("scan")! }
    : params.get("view") === "setup"
      ? { kind: "setup" }
      : { kind: "about" };

  const [view, setView] = useState<View>(initial);

  // Per-view tab title — keeps Chrome tabs distinguishable when the user
  // has APIStress / PostWomen / Crosswalk / Kavach open side-by-side.
  useDocumentTitle(
    view.kind === "live"    ? "Kavach · Scanning…" :
    view.kind === "report"  ? "Kavach · Report" :
    view.kind === "setup"   ? "Kavach · New scan" :
    view.kind === "history" ? "Kavach · History" :
    view.kind === "details" ? "Kavach · Product details" :
                              "Kavach · API security shield"
  );

  // Log tool.open once per mount (registry-driven activity).
  useEffect(() => {
    if (team) api.logActivity({ event_type: "tool.open", tool_slug: "kavach", actor_name: team.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-ink overflow-x-hidden">
      {/* Top ribbon — cyan-teal gradient, distinct from the other tools */}
      <header className="sticky top-0 z-30 h-14 px-4 border-b border-teal-900/40 bg-gradient-to-r from-teal-950/70 via-slate-950/80 to-slate-950/40 backdrop-blur-md flex items-center gap-3">
        <button
          onClick={() => nav("/mode")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/30 hover:ring-cyan-500/60 transition text-sm"
          title="Back to home — pick another tool"
        >
          <Home className="w-4 h-4 text-cyan-300" />
          <span className="font-semibold">Home</span>
        </button>

        <div className="h-5 w-px bg-teal-900/40" />

        <KavachWordmark onClick={() => setView({ kind: "about" })} />

        <nav className="ml-3 hidden md:flex items-center gap-1">
          <NavTab active={view.kind === "about"} onClick={() => setView({ kind: "about" })}>
            <BookOpen className="w-3.5 h-3.5" /> Overview
          </NavTab>
          <NavTab active={view.kind === "setup"} onClick={() => setView({ kind: "setup" })}>
            <Shield className="w-3.5 h-3.5" /> New scan
          </NavTab>
          <NavTab active={view.kind === "history" || view.kind === "report"} onClick={() => setView({ kind: "history" })}>
            <Clock className="w-3.5 h-3.5" /> History
          </NavTab>
          <NavTab active={view.kind === "details"} onClick={() => setView({ kind: "details" })}>
            <Info className="w-3.5 h-3.5" /> Details
          </NavTab>
        </nav>

        {team && (
          <div className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-cyan-500/30 bg-cyan-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
            <span className="text-xs font-bold text-cyan-200">{team.name}</span>
          </div>
        )}

        <div className="flex-1" />

        <button onClick={() => nav("/")} className="btn-ghost text-xs" title="APIStress">
          <Hammer className="w-3.5 h-3.5" /> APIStress
        </button>
        <button onClick={() => nav("/postwomen")} className="btn-ghost text-xs" title="PostWomen">
          <Send className="w-3.5 h-3.5" /> PostWomen
        </button>
        <button onClick={() => nav("/crosswalk")} className="btn-ghost text-xs" title="Crosswalk">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Crosswalk
        </button>
        <button
          onClick={() => { clearKey(); toast.success("Signed out"); nav("/login", { replace: true }); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                     text-ink-muted ring-1 ring-bg-border bg-bg-card/40
                     hover:text-bad hover:ring-bad/40 hover:bg-bad/[.06] transition"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </header>

      {/* Decorative cyan glow + scanlines — purely visual identity. */}
      <ScanlinesBg />

      <main className="relative z-10">
        {view.kind === "about" && (
          <KavachAbout
            onStartScan={() => setView({ kind: "setup" })}
          />
        )}
        {view.kind === "setup" && (
          <KavachSetup
            onScanStarted={(id) => setView({ kind: "live", scanID: id })}
            onCancel={() => setView({ kind: "about" })}
          />
        )}
        {view.kind === "history" && (
          <KavachHistory
            onPick={(id) => setView({ kind: "report", scanID: id })}
            onNewScan={() => setView({ kind: "setup" })}
          />
        )}
        {view.kind === "details" && (
          <KavachDetails
            onBack={() => setView({ kind: "about" })}
            onStartScan={() => setView({ kind: "setup" })}
          />
        )}
        {view.kind === "live" && (
          <KavachLive
            scanID={view.scanID}
            onDone={() => setView({ kind: "report", scanID: view.scanID })}
            onCancel={() => setView({ kind: "about" })}
          />
        )}
        {view.kind === "report" && (
          <KavachReport
            scanID={view.scanID}
            onNewScan={() => setView({ kind: "setup" })}
          />
        )}
      </main>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────
function KavachWordmark({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 group" title="Kavach overview">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-500 via-teal-700 to-teal-700 grid place-items-center shadow-md shadow-teal-900/50 ring-1 ring-cyan-400/30">
        <Shield className="w-4 h-4 text-white" />
      </div>
      <div className="leading-tight text-left">
        <div className="font-display text-sm font-bold text-cyan-100 tracking-tight group-hover:text-cyan-50">
          Kavach
        </div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-500/80 font-mono">
          API security shield
        </div>
      </div>
    </button>
  );
}

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition rounded-lg
        ${active
          ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/40"
          : "text-ink-muted hover:text-cyan-200 hover:bg-cyan-500/[.06]"}`}
    >
      {children}
      {active && (
        <motion.span
          layoutId="kavach-tab-pill"
          className="absolute inset-0 -z-10 rounded-lg ring-1 ring-cyan-500/40"
        />
      )}
    </button>
  );
}

function ScanlinesBg() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[.025]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(196,181,253,1) 0 1px, transparent 1px 4px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-32 -left-32 w-[36rem] h-[36rem] rounded-full bg-cyan-500/10 blur-3xl z-0"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-32 -right-32 w-[36rem] h-[36rem] rounded-full bg-teal-500/10 blur-3xl z-0"
      />
    </>
  );
}
