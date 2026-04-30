// ModePicker — landing page after login. Designed to scale to many tools
// without breaking visually:
//   - Cards laid out in an auto-fit grid (CSS `grid-template-columns:
//     repeat(auto-fill, minmax(280px, 1fr))`) so anywhere from 1 to N tools
//     reflow naturally without us hand-coding column counts.
//   - Each card is fully driven by `tools/registry.tsx` — no per-tool
//     special-casing in this file. Adding a new tool = one entry in the
//     registry; this page picks it up.
//   - Header is compact (no giant serif headline) so vertical real estate
//     stays available for the grid as the tool list grows.
//   - Search appears once there are ≥ 6 enabled tools — keeps the page
//     scannable when the catalogue grows.
//   - "Recently used" pill stays so single-click returns are still fast.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight, Clock, LogOut, Search, Sparkles, Shield, ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { ChoiceTechlabMark } from "../components/ui/ChoiceTechlabMark";
import { CreatedBy } from "../components/ui/CreatedBy";
import { getTeam, clearKey } from "../lib/api";
import { TOOLS, TOOL_BY_SLUG, themeFor, type ToolDef, type ToolAccent } from "../tools/registry";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export const MODE_KEY = "ch_last_mode";

// Show search once we have this many tools — under that, the grid fits in
// a single glance and search would just be visual noise.
const SEARCH_THRESHOLD = 6;

export default function ModePicker() {
  useDocumentTitle("Choose a tool · Choice Techlab");
  const nav = useNavigate();
  const team = getTeam();
  const tools = team?.tools_access || Object.keys(TOOL_BY_SLUG);
  const enabled = useMemo(() => TOOLS.filter(t => tools.includes(t.slug)), [tools]);

  // Skip the picker entirely if the team only has access to one tool.
  useEffect(() => {
    if (enabled.length === 1) {
      nav(enabled[0].routePath, { replace: true });
    }
  }, [enabled, nav]);

  // Sticky last-used tool so the user can re-open it with a single click.
  const lastUsed = localStorage.getItem(MODE_KEY) || "";
  const lastUsedTool = TOOL_BY_SLUG[lastUsed];

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return enabled;
    const q = query.trim().toLowerCase();
    return enabled.filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.tagline.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      (t.highlights || []).some(h => h.toLowerCase().includes(q))
    );
  }, [enabled, query]);

  function pick(slug: string) {
    localStorage.setItem(MODE_KEY, slug);
    const t = TOOL_BY_SLUG[slug];
    nav(t ? t.routePath : "/", { replace: true });
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center px-4 sm:px-6 py-5 overflow-x-hidden">
      <BackgroundOrbs />
      <GridPattern />

      {/* ── Compact top bar — brand left, account/clock/sign-out right ── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 w-full max-w-7xl flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChoiceTechlabMark size={36} />
          <div className="leading-tight min-w-0">
            <div className="font-display text-lg font-bold tracking-tight">Choice Techlab</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-mono">
              Internal toolkit · v1.0
            </div>
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

      {/* ── Hero — short headline + welcome line + search ───────────── */}
      <main className="relative z-10 w-full max-w-7xl flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-5 sm:mb-7"
        >
          <h1 className="font-display font-bold tracking-tight leading-[1.05] text-3xl sm:text-4xl md:text-5xl">
            <span className="text-ink">Welcome back</span>
            {team?.name && (
              <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
                , {team.name}
              </span>
            )}
            <span className="text-ink">.</span>
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-ink-muted max-w-2xl mx-auto">
            {enabled.length === 1
              ? "Opening your tool…"
              : <>Pick a tool. {enabled.length} {enabled.length === 1 ? "is" : "are"} available to your team — same login, zero context switching.</>}
          </p>
        </motion.div>

        {/* Recent + search row */}
        {enabled.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap items-center gap-3 mb-4"
          >
            {lastUsedTool && (
              <button
                onClick={() => pick(lastUsedTool.slug)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-card/60 hover:ring-brand/40 transition text-xs"
                title={`Re-open ${lastUsedTool.label}`}
              >
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                <span className="text-ink-muted">Last used:</span>
                <span className="font-bold text-ink">{lastUsedTool.label}</span>
                <ArrowRight className="w-3 h-3 text-ink-muted" />
              </button>
            )}
            {enabled.length >= SEARCH_THRESHOLD && (
              <div className="ml-auto relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter tools…"
                  autoFocus
                  className="input text-xs pl-8 py-1.5 w-56"
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ── Tool grid — auto-fit so 1, 4, 10, 20+ tools all look right ─ */}
        <div
          className="grid gap-3 sm:gap-4 w-full"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {filtered.map((t, i) => (
            <ToolCard
              key={t.slug}
              tool={t}
              isLast={t.slug === lastUsed}
              onClick={() => pick(t.slug)}
              delay={0.3 + i * 0.04}
            />
          ))}
          {filtered.length === 0 && query && (
            <div className="col-span-full text-center text-ink-muted text-sm py-12">
              No tools match "{query}". Try a different keyword.
            </div>
          )}
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 sm:mt-12 flex flex-col items-center gap-2 text-center"
        >
          <CreatedBy />
          <p className="text-[10px] text-ink-dim font-mono uppercase tracking-[0.16em] flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-good" />
            Choice Techlab · Internal Tools · MIT
          </p>
        </motion.footer>
      </main>
    </div>
  );
}

// ─── Tool card ──────────────────────────────────────────────────────────
function ToolCard({
  tool, isLast, onClick, delay,
}: { tool: ToolDef; isLast: boolean; onClick: () => void; delay: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [3, -3]), { stiffness: 240, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-3, 3]), { stiffness: 240, damping: 22 });

  function onMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  }
  function onMouseLeave() { mx.set(0.5); my.set(0.5); }

  const theme = themeFor(tool.accent);
  const accentClasses = accentChrome(tool.accent);
  const Icon = tool.Icon;

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
      className={`group card relative overflow-hidden p-4 sm:p-5 text-left ring-1 transition-shadow duration-300
                  shadow-md hover:shadow-2xl ${accentClasses.ring}`}
    >
      {/* Recently-used flag */}
      {isLast && (
        <span className="absolute top-3 right-3 pill ring-1 text-[9px] uppercase tracking-wider font-mono bg-bg-card/80 ring-bg-border text-ink-muted inline-flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> recent
        </span>
      )}

      {/* Hover-only corner glow */}
      <div className={`pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${accentClasses.glow}`} />

      {/* Top row: icon + name + tagline */}
      <div className="relative flex items-start gap-3" style={{ transform: "translateZ(15px)" }}>
        <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 shadow-md ${accentClasses.iconBg}`}>
          <Icon className="w-5.5 h-5.5 text-white" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight">{tool.label}</h3>
            <span className={`pill ring-1 text-[9px] uppercase tracking-wider font-mono ${theme.chipBg} ${theme.chipText} ${theme.chipRing}`}>
              {tool.chip}
            </span>
          </div>
          <p className={`text-[12px] mt-0.5 ${theme.text}`}>{tool.tagline}</p>
        </div>
      </div>

      {/* Description */}
      {tool.description && (
        <p className="relative mt-3 text-[12px] text-ink-muted leading-relaxed line-clamp-3" style={{ transform: "translateZ(10px)" }}>
          {tool.description}
        </p>
      )}

      {/* Highlights */}
      {tool.highlights && tool.highlights.length > 0 && (
        <div className="relative mt-3 flex flex-wrap gap-1" style={{ transform: "translateZ(15px)" }}>
          {tool.highlights.slice(0, 4).map((h, i) => (
            <span key={i} className={`pill ring-1 text-[10px] bg-bg-card/60 ring-bg-border text-ink-muted`}>
              {h}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <div
        className={`relative mt-4 flex items-center gap-1.5 text-[12px] font-bold transition ${theme.text} group-hover:translate-x-0.5`}
        style={{ transform: "translateZ(20px)" }}
      >
        {tool.cta || `Open ${tool.label}`}
        <ArrowRight className="w-3.5 h-3.5 ml-auto group-hover:translate-x-1 transition-transform" />
      </div>

      {/* Bottom shimmer underline */}
      <span className={`absolute left-5 right-5 bottom-0 h-px bg-gradient-to-r from-transparent ${accentClasses.underline} to-transparent
                       opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
    </motion.button>
  );
}

// ─── Per-accent chrome (rings, gradients, glows) ────────────────────────
function accentChrome(a: ToolAccent) {
  switch (a) {
    case "brand":
      return {
        ring: "ring-brand/30 hover:ring-brand/60 hover:shadow-brand/20",
        iconBg: "bg-gradient-to-br from-brand-light to-brand-dark shadow-brand/30 ring-1 ring-brand/30",
        glow:   "bg-brand/30",
        underline: "via-brand/50",
      };
    case "sky":
      return {
        ring: "ring-sky-500/30 hover:ring-sky-500/60 hover:shadow-sky-500/20",
        iconBg: "bg-gradient-to-br from-sky-400 to-violet-500 shadow-sky-500/30 ring-1 ring-sky-400/30",
        glow:   "bg-sky-500/30",
        underline: "via-sky-500/50",
      };
    case "green":
      return {
        ring: "ring-emerald-500/30 hover:ring-emerald-500/60 hover:shadow-emerald-500/20",
        iconBg: "bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-emerald-500/30 ring-1 ring-emerald-400/30",
        glow:   "bg-emerald-500/30",
        underline: "via-emerald-500/50",
      };
    case "violet":
    default:
      return {
        ring: "ring-violet-500/30 hover:ring-violet-500/60 hover:shadow-violet-500/20",
        iconBg: "bg-gradient-to-br from-violet-500 via-violet-700 to-fuchsia-700 shadow-violet-500/40 ring-1 ring-violet-400/30",
        glow:   "bg-violet-500/30",
        underline: "via-violet-500/50",
      };
  }
}

// ─── Live clock pill ────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm">
      <Clock className="w-3.5 h-3.5 text-brand" />
      <span className="text-[11px] font-mono tabular-nums text-ink">{time}</span>
    </div>
  );
}

// ─── Decorative background ──────────────────────────────────────────────
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
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="mode-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" className="text-ink" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mode-grid)" />
    </svg>
  );
}
