import { FormEvent, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, KeyRound, ShieldCheck, Eye, EyeOff, Loader2,
  Hammer, Send, FileSpreadsheet, Shield, Lock, Clock,
} from "lucide-react";

import { ChoiceTechlabMark } from "../components/layout/ChoiceTechlabMark";
import { CreatedBy } from "../components/ui/CreatedBy";
import { showToast } from "../components/ui/toast";
import { api, setKey, setTeam } from "../api/client";
import { MODE_KEY } from "./ModePicker";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const TOOL_STRIP: { name: string; Icon: typeof Hammer; tone: string }[] = [
  { name: "APIStress", Icon: Hammer,          tone: "text-brand"    },
  { name: "PostWomen", Icon: Send,            tone: "text-sky-400"  },
  { name: "Crosswalk", Icon: FileSpreadsheet, tone: "text-emerald-400" },
  { name: "Kavach",    Icon: Shield,          tone: "text-cyan-400" },
];

export default function Login() {
  useDocumentTitle("Sign in · Choice Techlab Internal Tools");
  const [keyVal, setKeyVal] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!keyVal.trim()) {
      showToast.warning("Enter your team access key to continue.");
      return;
    }
    setBusy(true);
    const loadingId = showToast.info("Verifying your access key…", { id: "login-verify" });
    try {
      const r = await api.login(keyVal.trim());
      setKey(keyVal.trim());
      setTeam(r.team || null);
      showToast.dismiss(loadingId as unknown as string);
      showToast.success({
        title: `Welcome back, ${r.team?.name || "team"}`,
        description: "You're signed in to the Choice Techlab Internal Tools.",
      }, { id: "login-welcome" });

      const last = localStorage.getItem(MODE_KEY);
      const tools = r.team?.tools_access || ["apistress", "postwomen"];
      const wantsAS = last === "apistress";
      const wantsPW = last === "postwomen";
      let dest = "/mode";
      if (wantsAS && tools.includes("apistress")) dest = "/";
      else if (wantsPW && tools.includes("postwomen")) dest = "/postwomen";
      else if (tools.length === 1) dest = tools[0] === "apistress" ? "/" : "/postwomen";
      nav(dest, { replace: true });
    } catch (err: any) {
      showToast.dismiss(loadingId as unknown as string);
      const msg: string = err?.message || "Login failed";
      const looksUnauth = /401|unauthor|invalid|wrong|key/i.test(msg);
      showToast.error({
        title: looksUnauth ? "Unauthorized — check your access key" : "Sign-in failed",
        description: looksUnauth
          ? "The key you entered isn't valid. Ask your admin if you don't have one."
          : msg,
      }, { id: "login-error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg">
      {/* Animated background sits behind everything */}
      <BackgroundFX />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* ── Brand panel (left on desktop, slim header on mobile) ─────── */}
        <BrandPanel />

        {/* ── Login form panel (right) ─────────────────────────────────── */}
        <section className="relative flex flex-col px-4 sm:px-8 lg:px-12 py-6 lg:py-10">
          {/* Top-right utilities (admin link + clock) */}
          <div className="flex items-center justify-end gap-2 mb-6 lg:mb-10">
            <LiveClock />
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm text-[11px] hover:ring-brand/40 hover:text-brand transition"
              title="Admin console"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin console
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex-1 grid place-items-center">
            <LoginCard
              k={keyVal}
              setK={setKeyVal}
              showKey={showKey}
              setShowKey={setShowKey}
              busy={busy}
              onSubmit={submit}
            />
          </div>

          <Footer />
        </section>
      </div>
    </div>
  );
}

// ── Left brand panel ─────────────────────────────────────────────────────
function BrandPanel() {
  const year = new Date().getFullYear();
  return (
    <aside
      className={[
        "relative flex flex-col overflow-hidden",
        // gradient background with brand orange → violet
        "bg-gradient-to-br from-[#1a0f1c] via-[#241126] to-[#0e0f13]",
        // mobile: slim header; desktop: full panel
        "px-5 sm:px-8 lg:px-12 py-6 lg:py-10",
        "border-b lg:border-b-0 lg:border-r border-white/5",
      ].join(" ")}
    >
      {/* gradient orbs locked to the panel */}
      <motion.div
        aria-hidden
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand/30 blur-3xl pointer-events-none"
      />
      <motion.div
        aria-hidden
        animate={{ x: [0, -30, 20, 0], y: [0, 40, -20, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full bg-violet-600/30 blur-3xl pointer-events-none"
      />
      <GridPattern />

      {/* Brand wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex items-center gap-3"
      >
        <AnimatedShield />
        <div className="leading-tight">
          <div className="font-display text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-white">
            Choice Techlab
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/60 font-mono">
            Internal Tools
          </div>
        </div>
      </motion.div>

      {/* Hero copy — only visible on lg+ */}
      <div className="relative z-10 hidden lg:flex flex-col flex-1 justify-center mt-10">
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "0.24em" }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-[10px] uppercase font-bold mb-4 inline-flex items-center gap-2"
        >
          <Lock className="w-3 h-3 text-brand" />
          <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
            INTERNAL ORGANISATION USE ONLY
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="font-display font-bold tracking-tight leading-[1.05] text-4xl xl:text-5xl text-white"
        >
          The Choice Techlab{" "}
          <span className="italic bg-gradient-to-br from-brand-light via-brand to-violet-400 bg-clip-text text-transparent">
            engineering toolkit
          </span>
          .
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-5 text-base text-white/70 leading-relaxed max-w-md"
        >
          Load testing, API exploration, data joins, and security scans —
          one sign-in, one workspace, used inside Choice Techlab only.
        </motion.p>

        {/* Tool strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-8 grid grid-cols-2 gap-3 max-w-md"
        >
          {TOOL_STRIP.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.75 + i * 0.06 }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] ring-1 ring-white/10 hover:ring-white/20 transition"
            >
              <t.Icon className={`w-4 h-4 ${t.tone}`} />
              <span className="text-sm text-white/90 font-medium">{t.name}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="mt-10 flex items-center gap-2 text-xs text-white/55"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Self-hosted on Choice Techlab infrastructure · your data stays internal</span>
        </motion.div>
      </div>

      {/* Bottom-of-panel meta on desktop */}
      <div className="relative z-10 hidden lg:flex items-center justify-between text-[11px] text-white/40 font-mono mt-6">
        <span>© {year} Choice Techlab</span>
        <span className="uppercase tracking-[0.18em]">Internal · v0.1</span>
      </div>
    </aside>
  );
}

// ── Animated shield/lock icon ────────────────────────────────────────────
function AnimatedShield() {
  return (
    <motion.div
      animate={{ rotate: [0, 4, -2, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      className="relative shrink-0"
    >
      <ChoiceTechlabMark size={42} />
      <motion.div
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.18, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full bg-brand/40 blur-xl pointer-events-none"
      />
    </motion.div>
  );
}

// ── Login card (right side) ──────────────────────────────────────────────
function LoginCard({
  k, setK, showKey, setShowKey, busy, onSubmit,
}: {
  k: string;
  setK: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-md"
    >
      <motion.div
        aria-hidden
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-brand/20 via-violet-500/15 to-transparent blur-3xl pointer-events-none"
      />

      <form
        onSubmit={onSubmit}
        className="relative card p-7 sm:p-9 ring-1 ring-bg-border shadow-2xl shadow-black/40 backdrop-blur-md"
      >
        <div className="absolute -top-px -right-px w-24 h-24 rounded-tr-2xl bg-gradient-to-br from-brand/30 to-transparent pointer-events-none" />

        {/* Heading */}
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-ink-muted font-mono mb-2">
            Sign in
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome to the toolkit
          </h2>
          <p className="text-sm text-ink-muted mt-1.5">
            Use your team access key — ask your admin if you don't have one.
          </p>
        </div>

        {/* Access-key input */}
        <div>
          <label className="label flex items-center gap-1.5 mb-2">
            <KeyRound className="w-3 h-3 text-brand" /> Team access key
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            <input
              type={showKey ? "text" : "password"}
              autoFocus
              value={k}
              onChange={(e) => setK(e.target.value)}
              placeholder="Paste your team key"
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              className="input w-full pl-9 pr-11 font-mono py-3 text-sm focus:ring-2 focus:ring-brand/40"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide key" : "Show key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md text-ink-muted hover:text-ink hover:bg-bg-card transition"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full py-3 mt-5 text-sm font-bold inline-flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing you in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Footnotes */}
        <div className="mt-5 flex items-center justify-between text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-good" /> Encrypted in transit
          </span>
          <Link to="/admin" className="hover:text-brand transition inline-flex items-center gap-1">
            Admin console <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </form>
    </motion.div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────
function Footer() {
  const year = new Date().getFullYear();
  return (
    <motion.footer
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 1.2 }}
      className="mt-8 flex flex-col items-center gap-2"
    >
      <CreatedBy />
      <p className="text-[11px] text-ink-dim font-mono uppercase tracking-[0.16em] text-center px-3">
        Choice Techlab · Internal · v0.1 · © {year}
      </p>
    </motion.footer>
  );
}

// ── Live clock ───────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm">
      <Clock className="w-3.5 h-3.5 text-brand" />
      <span className="text-[11px] font-mono tabular-nums text-ink">{time}</span>
    </div>
  );
}

// ── Background FX (right-side ambient) ───────────────────────────────────
function BackgroundFX() {
  return (
    <>
      <motion.div
        aria-hidden
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 right-[-6rem] w-[26rem] h-[26rem] rounded-full bg-sky-500/10 blur-3xl pointer-events-none"
      />
      <motion.div
        aria-hidden
        animate={{ x: [0, -25, 15, 0], y: [0, 30, -15, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute bottom-[-6rem] right-[-2rem] w-[22rem] h-[22rem] rounded-full bg-violet-500/10 blur-3xl pointer-events-none"
      />
    </>
  );
}

// ── Subtle grid overlay used inside the brand panel ──────────────────────
function GridPattern() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="login-grid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M 44 0 L 0 0 0 44" fill="none" stroke="currentColor" strokeWidth="1" className="text-white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-grid)" />
    </svg>
  );
}
