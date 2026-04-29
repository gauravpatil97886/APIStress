import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight, KeyRound, Sparkles, ShieldCheck, Zap, Send, Clock, Shield,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logo as ASLogo } from "../components/ui/Logo";
import { PWLogo } from "../components/postwomen/Logo";
import { ChoiceTechlabMark } from "../components/ui/ChoiceTechlabMark";
import { CreatedBy } from "../components/ui/CreatedBy";
import { api, setKey, setTeam } from "../lib/api";
import { MODE_KEY } from "./ModePicker";

export default function Login() {
  const [key, setKeyVal] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      toast.error("Enter your access key");
      return;
    }
    setBusy(true);
    try {
      const r = await api.login(key.trim());
      setKey(key.trim());
      setTeam(r.team || null);
      toast.success(`Welcome, ${r.team?.name || "team"} 👋`, { id: "login-welcome", duration: 4000 });
      // Honour tools_access — pick a sensible default landing route.
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
      toast.error(err.message || "Login failed", { id: "login-error", duration: 5000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <BackgroundOrbs />
      <FloatingParticles />
      <GridPattern />

      {/* ── Top bar — admin link on right, clock on right ─────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 w-full px-4 sm:px-6 py-4 sm:py-5 max-w-6xl mx-auto flex items-center justify-between gap-2"
      >
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm text-xs hover:ring-brand/40 hover:text-brand transition"
            title="Admin console — for org admins only"
          >
            <Shield className="w-3.5 h-3.5" />
            Admin console
          </Link>
          <LiveClock />
        </div>
      </motion.header>

      {/* ── Centered Choice Techlab brand ribbon (above the split) ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full flex justify-center mt-2"
      >
        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-md shadow-lg shadow-black/20">
          <motion.div
            animate={{ rotate: [0, 6, -3, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChoiceTechlabMark size={42} />
          </motion.div>
          <div className="leading-tight text-left">
            <div className="font-display text-xl sm:text-2xl font-bold tracking-tight">
              Choice Techlab
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-ink-muted font-mono">
              Internal Developer Tools · v1.0
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Main split: pitch on the left, sign-in on the right ─── */}
      <main className="relative z-10 flex-1 grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-16 items-center px-4 sm:px-6 lg:px-12 max-w-6xl w-full mx-auto py-6 lg:py-10">
        <BrandPitch />
        <LoginCard
          k={key}
          setK={setKeyVal}
          busy={busy}
          onSubmit={submit}
        />
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <motion.footer
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.4 }}
        className="relative z-10 mt-4 mb-4 flex flex-col items-center gap-2"
      >
        <CreatedBy />
        <p className="text-[11px] text-ink-dim font-mono uppercase tracking-[0.16em] text-center px-3">
          Choice Techlab · Internal Tools · Open-source · MIT
        </p>
      </motion.footer>
    </div>
  );
}

// ── Left side: brand pitch + serif headline ────────────────────────────
function BrandPitch() {
  return (
    <div className="flex flex-col text-center lg:text-left">
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.4em" }}
        animate={{ opacity: 1, letterSpacing: "0.24em" }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="text-[10px] uppercase font-bold mb-3 inline-flex items-center gap-2 self-center lg:self-start"
      >
        <Sparkles className="w-3 h-3 text-brand" />
        <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
          INTERNAL DEVELOPER TOOLS
        </span>
      </motion.div>

      <h1 className="font-display font-bold tracking-tight leading-[1] text-center lg:text-left">
        <div className="text-4xl sm:text-5xl md:text-6xl xl:text-[5rem]">
          {[..."Welcome"].map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.25 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="inline-block text-ink"
            >
              {ch}
            </motion.span>
          ))}
          <span className="inline-block w-3" />
          {[..."back"].map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.55 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="inline-block italic bg-gradient-to-br from-brand-light via-brand to-brand-dark bg-clip-text text-transparent"
            >
              {ch}
            </motion.span>
          ))}
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.85, duration: 0.4 }}
            className="inline-block text-ink"
          >.</motion.span>
        </div>
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.95 }}
        className="mt-5 text-base sm:text-lg text-ink-muted leading-relaxed max-w-xl mx-auto lg:mx-0"
      >
        Sign in with your shared team key to open{" "}
        <b className="text-ink">APIStress</b> for load testing or{" "}
        <b className="text-ink">PostWomen</b> for API exploration.{" "}
        <span className="hidden sm:inline">Same key, same workspace, zero context switching.</span>
      </motion.p>

      {/* Tool preview chips */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.05 }}
        className="mt-7 flex gap-3 justify-center lg:justify-start flex-wrap"
      >
        <ToolChip Icon={Zap}  Logo={<ASLogo size={28} />}   name="APIStress"  tag="Load testing" tone="brand" />
        <ToolChip Icon={Send} Logo={<PWLogo size={28} />}   name="PostWomen"  tag="API client"   tone="sky"   />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="mt-6 flex items-center gap-2 text-xs text-ink-muted justify-center lg:justify-start"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-good" />
        <span>Self-hosted · your data stays on your servers</span>
      </motion.div>
    </div>
  );
}

function ToolChip({ Logo, name, tag, tone }: any) {
  const ring = tone === "brand" ? "ring-brand/30 hover:ring-brand/60"
                                 : "ring-sky-500/30 hover:ring-sky-500/60";
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ring-1 ${ring} bg-bg-card/40 transition`}>
      <div className="shrink-0">{Logo}</div>
      <div>
        <div className="text-sm font-bold leading-none">{name}</div>
        <div className="text-[10px] uppercase tracking-wider text-ink-muted mt-1">{tag}</div>
      </div>
    </div>
  );
}

// ── Right side: actual login card ──────────────────────────────────────
function LoginCard({ k, setK, busy, onSubmit }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-md mx-auto lg:max-w-none"
    >
      {/* glowing aura behind the card */}
      <motion.div
        animate={{ opacity: [0.4, 0.65, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-brand/30 via-brand-dark/20 to-violet-500/20 blur-3xl pointer-events-none"
      />

      <form
        onSubmit={onSubmit}
        className="relative card p-7 sm:p-9 ring-1 ring-bg-border shadow-2xl shadow-black/40 backdrop-blur-md"
      >
        {/* corner accent */}
        <div className="absolute -top-px -right-px w-24 h-24 rounded-tr-2xl bg-gradient-to-br from-brand/30 to-transparent pointer-events-none" />

        {/* mark */}
        <div className="flex flex-col items-center text-center mb-7 relative">
          <motion.div
            animate={{ rotate: [0, 4, -2, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="mb-3"
          >
            <ChoiceTechlabMark size={64} />
          </motion.div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-ink-muted font-mono">
            ━ SIGN IN ━
          </div>
        </div>

        {/* key input */}
        <div>
          <label className="label flex items-center gap-1.5 mb-2">
            <KeyRound className="w-3 h-3 text-brand" /> Access key
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            <input
              type="password"
              autoFocus
              value={k}
              onChange={(e) => setK(e.target.value)}
              placeholder="Paste your team key & press Enter"
              spellCheck={false}
              autoComplete="off"
              className="input w-full pl-9 font-mono py-3 text-sm focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <p className="mt-2 text-[11px] text-ink-dim leading-relaxed">
            Just enter your shared team key — no username, no password.
            Keys are issued by your admin in the <code className="px-1 py-0.5 rounded bg-bg-card text-brand font-mono">/admin</code> console.
          </p>
        </div>

        {/* submit */}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3 mt-5 text-sm font-bold">
          {busy
            ? <span className="inline-flex items-center gap-2">Verifying<DotPulse /></span>
            : <>Continue <ArrowRight className="w-4 h-4" /></>}
        </button>

        <div className="mt-5 flex items-center justify-between text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-good" /> Encrypted in transit
          </span>
          <a href="#" onClick={(e) => { e.preventDefault(); toast("Ask your team admin for a fresh key."); }}
             className="hover:text-brand transition">Lost your key?</a>
        </div>
      </form>
    </motion.div>
  );
}

function DotPulse() {
  return (
    <span className="inline-flex gap-0.5 items-end">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1 h-1 rounded-full bg-current"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

// ── Live clock ─────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm">
      <Clock className="w-3.5 h-3.5 text-brand" />
      <span className="text-[11px] font-mono tabular-nums text-ink">{time}</span>
      <span className="h-3 w-px bg-bg-border" />
      <span className="text-[11px] font-mono text-ink-muted">{date}</span>
    </div>
  );
}

// ── Background mesh orbs ───────────────────────────────────────────────
function BackgroundOrbs() {
  return (
    <>
      <motion.div
        animate={{ x: [0, 60, -40, 0], y: [0, -30, 40, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-brand/10 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ x: [0, -50, 30, 0], y: [0, 40, -30, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full bg-violet-500/10 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ x: [0, 40, 0], y: [0, -50, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[28rem] h-[28rem] rounded-full bg-sky-500/8 blur-3xl pointer-events-none"
      />
    </>
  );
}

function GridPattern() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="login-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" className="text-ink" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-grid)" />
    </svg>
  );
}

function FloatingParticles() {
  const particles = [
    { x: 10, y: 14, d: 6, c: "#FF7A2A" },
    { x: 86, y: 22, d: 5, c: "#A855F7" },
    { x: 18, y: 80, d: 7, c: "#0EA5E9" },
    { x: 90, y: 70, d: 6, c: "#FF5A1F" },
    { x: 50, y: 8,  d: 8, c: "#22c55e" },
    { x: 38, y: 88, d: 5, c: "#A855F7" },
    { x: 72, y: 86, d: 6, c: "#0EA5E9" },
  ];
  return (
    <>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0], y: [0, -16, 0] }}
          transition={{ duration: p.d, delay: i * 0.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            background: p.c,
            boxShadow: `0 0 12px ${p.c}, 0 0 24px ${p.c}`,
          }}
        />
      ))}
    </>
  );
}
