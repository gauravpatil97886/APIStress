import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ReactNode } from "react";
import {
  ArrowRight, Hammer, Send, Zap, FileText, GitCompare, Layers, Sparkles, Clock, LogOut,
  FileSpreadsheet, GitMerge, Database,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logo as ASLogo } from "../components/ui/Logo";
import { PWLogo } from "../components/postwomen/Logo";
import { ChoiceTechlabMark } from "../components/ui/ChoiceTechlabMark";
import { CreatedBy } from "../components/ui/CreatedBy";
import { getTeam, clearKey } from "../lib/api";
import { TOOL_BY_SLUG } from "../tools/registry";

export const MODE_KEY = "ch_last_mode";

export default function ModePicker() {
  const nav = useNavigate();
  const team = getTeam();
  const tools = team?.tools_access || Object.keys(TOOL_BY_SLUG);
  const showAS = tools.includes("apistress");
  const showPW = tools.includes("postwomen");
  const showCW = tools.includes("crosswalk");
  const enabledCount = [showAS, showPW, showCW].filter(Boolean).length;

  // If team has only one tool, skip the picker entirely.
  useEffect(() => {
    if (enabledCount !== 1) return;
    if (showAS) nav("/", { replace: true });
    else if (showPW) nav("/postwomen", { replace: true });
    else if (showCW) nav("/crosswalk", { replace: true });
  }, [enabledCount, showAS, showPW, showCW, nav]);

  function pick(mode: string) {
    localStorage.setItem(MODE_KEY, mode);
    const t = TOOL_BY_SLUG[mode];
    nav(t ? t.routePath : "/", { replace: true });
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center px-4 sm:px-6 py-4 sm:py-6 md:py-8 overflow-x-hidden">
      <BackgroundOrbs />
      <FloatingParticles />
      <GridPattern />

      {/* ── Top brand bar ──────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 w-full max-w-6xl flex items-center justify-between mb-4 sm:mb-6 gap-2 flex-wrap"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChoiceTechlabMark size={36} />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-base sm:text-lg font-bold tracking-tight truncate">Choice Techlab</span>
            <span className="hidden sm:inline-block text-[10px] uppercase tracking-[0.18em] text-ink-muted font-mono px-2 py-0.5 rounded ring-1 ring-bg-border">
              v1.0
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveClock />
          {team && (
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
          )}
        </div>
      </motion.header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 w-full max-w-5xl flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-3 sm:mb-4 flex flex-col items-center"
        >
          <motion.div
            animate={{ y: [0, -4, 0], rotate: [0, 2, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="mb-3 sm:mb-4"
          >
            <span className="hidden md:block"><ChoiceTechlabMark size={76} /></span>
            <span className="hidden sm:block md:hidden"><ChoiceTechlabMark size={60} /></span>
            <span className="sm:hidden"><ChoiceTechlabMark size={48} /></span>
          </motion.div>
          <ChipDivider text="An internal toolkit" />
        </motion.div>

        {/* Big serif wordmark with letter reveal */}
        <BigBrandHeadline />

        {/* Sub-tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.9 }}
          className="mt-3 sm:mt-4 md:mt-5 text-sm sm:text-base text-ink-muted max-w-2xl leading-relaxed px-2"
        >
          Two precision tools, designed by engineers, for engineers.{" "}
          <span className="text-ink">Hit your APIs hard</span> with APIStress, or{" "}
          <span className="text-ink">try them nicely</span> with PostWomen — same workspace, same login, zero context switching.
        </motion.p>

        {/* Pick-your-tool ribbon */}
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "0.24em" }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="mt-6 sm:mt-8 mb-3 sm:mb-4 text-[10px] uppercase font-bold inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3 text-brand" />
          <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
            CHOOSE YOUR TOOL
          </span>
          <Sparkles className="w-3 h-3 text-brand" />
        </motion.div>

        {/* Cards — gated by team's tools_access */}
        <div className={`grid grid-cols-1 gap-4 sm:gap-6 w-full
          ${enabledCount === 1 ? "max-w-md mx-auto" : ""}
          ${enabledCount === 2 ? "md:grid-cols-2" : ""}
          ${enabledCount >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {showAS && (
            <ModeCard
              onClick={() => pick("apistress")}
              mode="stress"
              logo={<ASLogo size={64} animated />}
              name={<>API<span className="text-brand">Stress</span></>}
              tagline="Hit your APIs hard."
              description="Real load tests with virtual users, live charts, plain-English insights, PDF reports, and run comparison."
              chips={[
                { Icon: Zap,        text: "Live charts" },
                { Icon: GitCompare, text: "Comparison" },
                { Icon: FileText,   text: "PDF reports" },
              ]}
              cta="Start a load test"
              ctaIcon={<Hammer className="w-4 h-4" />}
              delay={1.4}
            />
          )}
          {showPW && (
            <ModeCard
              onClick={() => pick("postwomen")}
              mode="post"
              logo={<PWLogo size={64} animated />}
              name={<>Post<span className="bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-transparent">Women</span></>}
              tagline="Try your APIs nicely."
              description="A clean, fast API client — collections, environments, curl import/export, Postman-compatible. Right next to APIStress."
              chips={[
                { Icon: Send,     text: "Send & inspect" },
                { Icon: Layers,   text: "Collections" },
                { Icon: FileText, text: "Postman import" },
              ]}
              cta="Open the client"
              ctaIcon={<Send className="w-4 h-4" />}
              delay={1.55}
            />
          )}
          {showCW && (
            <ModeCard
              onClick={() => pick("crosswalk")}
              mode="cross"
              logo={
                <div className="w-16 h-16 rounded-xl grid place-items-center bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg shadow-emerald-900/40">
                  <FileSpreadsheet className="w-8 h-8 text-white" />
                </div>
              }
              name={<>Cross<span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600 bg-clip-text text-transparent">walk</span></>}
              tagline="VLOOKUP without the formula."
              description="Upload two sheets, pick a join column, splice columns from one into the other. Streams CSV at gigabyte scale; matches in seconds."
              chips={[
                { Icon: GitMerge,        text: "VLOOKUP joins" },
                { Icon: Database,        text: "10 GB CSVs" },
                { Icon: FileSpreadsheet, text: "Excel-ready" },
              ]}
              cta="Open Crosswalk"
              ctaIcon={<GitMerge className="w-4 h-4" />}
              delay={1.7}
            />
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <motion.footer
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.8 }}
        className="relative z-10 mt-6 sm:mt-10 mb-2 flex flex-col items-center gap-2 sm:gap-3 text-center"
      >
        <CreatedBy />
        <p className="text-[11px] text-ink-dim font-mono uppercase tracking-[0.16em]">
          Choice Techlab · Internal Tools · Open-source · MIT
        </p>
      </motion.footer>
    </div>
  );
}

// ── Big serif wordmark with letter-by-letter blur reveal ────────────────
function BigBrandHeadline() {
  const word = "Choice";
  const accent = "Techlab";
  return (
    <h1 className="font-display font-bold tracking-tight leading-none text-center px-2">
      <div className="text-[2.5rem] sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem]">
        {[...word].map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.7, delay: 0.3 + i * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="inline-block text-ink"
          >
            {ch}
          </motion.span>
        ))}
        <span className="inline-block w-3" />
        {[...accent].map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.7, delay: 0.55 + i * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="inline-block italic bg-gradient-to-br from-brand-light via-brand to-brand-dark bg-clip-text text-transparent"
          >
            {ch}
          </motion.span>
        ))}
      </div>
    </h1>
  );
}

// ── Decorative chip divider ─────────────────────────────────────────────
function ChipDivider({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-3">
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand/60" />
      <span className="text-[10px] uppercase tracking-[0.3em] text-ink-muted font-mono">
        {text}
      </span>
      <span className="h-px w-10 bg-gradient-to-l from-transparent to-brand/60" />
    </div>
  );
}

// ── Live clock in the top bar ───────────────────────────────────────────
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

// ── Background mesh orbs ────────────────────────────────────────────────
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
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-sky-500/8 blur-3xl pointer-events-none"
      />
    </>
  );
}

// ── Faint grid for premium feel ─────────────────────────────────────────
function GridPattern() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="ctl-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" className="text-ink" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ctl-grid)" />
    </svg>
  );
}

// ── Floating sparkle particles ──────────────────────────────────────────
function FloatingParticles() {
  const particles = [
    { x: 8,  y: 12, d: 6, c: "#FF7A2A" },
    { x: 88, y: 18, d: 5, c: "#A855F7" },
    { x: 14, y: 78, d: 7, c: "#0EA5E9" },
    { x: 92, y: 72, d: 6, c: "#FF5A1F" },
    { x: 50, y: 6,  d: 8, c: "#22c55e" },
    { x: 34, y: 90, d: 5, c: "#A855F7" },
    { x: 70, y: 88, d: 6, c: "#0EA5E9" },
    { x: 22, y: 40, d: 9, c: "#FF7A2A" },
  ];
  return (
    <>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0], y: [0, -16, 0] }}
          transition={{
            duration: p.d,
            delay: i * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: p.c,
            boxShadow: `0 0 12px ${p.c}, 0 0 24px ${p.c}`,
          }}
        />
      ))}
    </>
  );
}

// ── Mode card with 3D tilt + magnetic hover (unchanged) ─────────────────
function ModeCard({
  onClick, mode, logo, name, tagline, description, chips, cta, ctaIcon, delay,
}: {
  onClick: () => void;
  mode: "stress" | "post" | "cross";
  logo: ReactNode;
  name: ReactNode;
  tagline: string;
  description: string;
  chips: { Icon: any; text: string }[];
  cta: string;
  ctaIcon: ReactNode;
  delay: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [6, -6]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-6, 6]), { stiffness: 200, damping: 20 });
  const glowX = useTransform(mx, [0, 1], ["0%", "100%"]);
  const glowY = useTransform(my, [0, 1], ["0%", "100%"]);

  function onMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  }
  function onMouseLeave() { mx.set(0.5); my.set(0.5); }

  const ringClass =
    mode === "stress" ? "ring-brand/30 hover:ring-brand/60 hover:shadow-brand/30"
    : mode === "cross" ? "ring-emerald-500/30 hover:ring-emerald-500/60 hover:shadow-emerald-500/30"
    : "ring-sky-500/30 hover:ring-sky-500/60 hover:shadow-sky-500/30";
  const corner =
    mode === "stress" ? "from-brand-light to-brand-dark"
    : mode === "cross" ? "from-emerald-300 to-emerald-700"
    : "from-sky-400 to-violet-500";
  const chipIconColor =
    mode === "stress" ? "text-brand"
    : mode === "cross" ? "text-emerald-400"
    : "text-sky-400";
  const underlineGrad =
    mode === "stress" ? "via-brand/40"
    : mode === "cross" ? "via-emerald-500/40"
    : "via-sky-500/40";

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
      className={`group card relative overflow-hidden p-5 sm:p-7 text-left ring-1 transition-shadow duration-300 shadow-2xl shadow-black/40 ${ringClass}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [glowX, glowY] as any,
            ([x, y]: any) => `radial-gradient(400px circle at ${x} ${y}, rgba(255,255,255,0.06), transparent 50%)`
          ) as any,
        }}
      />
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.08, 1], opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={`pointer-events-none absolute -top-16 -right-16 w-52 h-52 rounded-full bg-gradient-to-br ${corner} blur-3xl group-hover:opacity-50 transition`}
      />

      <div className="relative flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4" style={{ transform: "translateZ(20px)" }}>
        <motion.div
          animate={{ rotate: [0, 5, -3, 0], y: [0, -2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="shrink-0"
        >
          {logo}
        </motion.div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">{name}</h2>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">{tagline}</p>
        </div>
      </div>

      <p className="relative text-xs sm:text-sm text-ink-muted leading-relaxed" style={{ transform: "translateZ(15px)" }}>
        {description}
      </p>

      <div className="relative mt-3 sm:mt-5 flex flex-wrap gap-1.5 sm:gap-2" style={{ transform: "translateZ(20px)" }}>
        {chips.map((chip, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: delay + 0.1 + i * 0.06 }}
            className="pill ring-1 bg-bg-card ring-bg-border text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5"
          >
            <chip.Icon className={`w-3 h-3 ${chipIconColor}`} />
            {chip.text}
          </motion.span>
        ))}
      </div>

      <div
        className="relative mt-4 sm:mt-6 flex items-center gap-2 text-sm font-bold text-ink group-hover:text-brand transition"
        style={{ transform: "translateZ(25px)" }}
      >
        <motion.span
          animate={{ x: [0, 2, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="inline-flex items-center gap-2"
        >
          {ctaIcon}{cta}
        </motion.span>
        <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-2 transition-transform duration-300" />
      </div>

      <span className={`absolute left-7 right-7 bottom-0 h-px bg-gradient-to-r from-transparent ${underlineGrad} to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
    </motion.button>
  );
}
