import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";
import {
  ArrowRight, Hammer, Send, Zap, FileText, GitCompare, Layers, Sparkles,
} from "lucide-react";
import { Logo as ASLogo } from "../components/ui/Logo";
import { PWLogo } from "../components/postwomen/Logo";
import { CreatedBy } from "../components/ui/CreatedBy";

export const MODE_KEY = "ch_last_mode";

export default function ModePicker() {
  const nav = useNavigate();

  function pick(mode: "apistress" | "postwomen") {
    localStorage.setItem(MODE_KEY, mode);
    nav(mode === "apistress" ? "/" : "/postwomen", { replace: true });
  }

  const heading = "Two tools.";
  const headingAccent = "One workspace.";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <BackgroundOrbs />
      <FloatingParticles />

      {/* Brand banner */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-8 text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full ring-1 ring-bg-border bg-bg-panel/60 backdrop-blur-sm mb-3">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-muted">
            Choice Techlab · v1.0
          </span>
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 12, letterSpacing: "0.05em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0em" }}
          transition={{ duration: 1.1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl sm:text-4xl md:text-[2.6rem] font-extrabold tracking-tight leading-tight max-w-4xl mx-auto"
        >
          <span className="bg-[linear-gradient(110deg,#FF7A2A,45%,#FFFFFF,55%,#FF7A2A)] bg-[length:250%_100%] bg-clip-text text-transparent shimmer-text">
            Internal Developer Tools
          </span>
          <br />
          <span className="text-ink-muted text-xl sm:text-2xl md:text-3xl font-bold">
            built for engineers who ship fast.
          </span>
        </motion.h1>
      </motion.div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="relative text-center mb-12 z-10"
      >
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "0.24em" }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-[10px] uppercase font-bold mb-4 inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3 text-brand" />
          <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
            CHOOSE YOUR TOOL
          </span>
          <Sparkles className="w-3 h-3 text-brand" />
        </motion.div>

        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-ink">
          <AnimatedWords text={heading} />{" "}
          <AnimatedWords
            text={headingAccent}
            className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent"
            delayOffset={heading.split(" ").length * 0.08}
          />
        </h2>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-ink-muted mt-4 max-w-xl mx-auto text-base"
        >
          Pick what you want to do today. You can switch any time from the sidebar.
        </motion.p>
      </motion.div>

      {/* Cards */}
      <div className="relative z-10 grid md:grid-cols-2 gap-6 w-full max-w-4xl">
        <ModeCard
          onClick={() => pick("apistress")}
          mode="stress"
          logo={<ASLogo size={72} animated />}
          name={<>API<span className="text-brand">Stress</span></>}
          tagline="Hit your APIs hard. Know exactly what breaks."
          description="Run real load tests with virtual users, real-time charts, plain-English insights, PDF reports, and run comparison."
          chips={[
            { Icon: Zap,        text: "Live charts" },
            { Icon: GitCompare, text: "Comparison" },
            { Icon: FileText,   text: "PDF reports" },
          ]}
          cta="Start a load test"
          ctaIcon={<Hammer className="w-4 h-4" />}
          delay={0.7}
        />
        <ModeCard
          onClick={() => pick("postwomen")}
          mode="post"
          logo={<PWLogo size={72} animated />}
          name={<>Post<span className="bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-transparent">Women</span></>}
          tagline="Try your APIs nicely."
          description="A clean, fast API client — collections, environments, curl import/export, Postman-compatible. Built right next to APIStress."
          chips={[
            { Icon: Send,     text: "Send & inspect" },
            { Icon: Layers,   text: "Collections" },
            { Icon: FileText, text: "Postman import" },
          ]}
          cta="Open the client"
          ctaIcon={<Send className="w-4 h-4" />}
          delay={0.85}
        />
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="relative z-10 mt-12 flex flex-col items-center gap-3"
      >
        <CreatedBy />
        <p className="text-[11px] text-ink-dim">
          Open-source · MIT · Same login key for both tools
        </p>
      </motion.div>
    </div>
  );
}

// ── Animated word-by-word headline ──────────────────────────────────────
function AnimatedWords({
  text, className = "", delayOffset = 0,
}: { text: string; className?: string; delayOffset?: number }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.7,
            delay: delayOffset + 0.1 + i * 0.08,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="inline-block mr-3 last:mr-0"
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

// ── Background mesh orbs (slowly drifting) ──────────────────────────────
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

// ── Floating sparkle particles ──────────────────────────────────────────
function FloatingParticles() {
  // Deterministic positions (don't reshuffle on each render)
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

// ── Mode card with 3D tilt + magnetic hover ─────────────────────────────
function ModeCard({
  onClick, mode, logo, name, tagline, description, chips, cta, ctaIcon, delay,
}: {
  onClick: () => void;
  mode: "stress" | "post";
  logo: ReactNode;
  name: ReactNode;
  tagline: string;
  description: string;
  chips: { Icon: any; text: string }[];
  cta: string;
  ctaIcon: ReactNode;
  delay: number;
}) {
  // Mouse-tracked 3D tilt
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

  const ringClass = mode === "stress"
    ? "ring-brand/30 hover:ring-brand/60 hover:shadow-brand/30"
    : "ring-sky-500/30 hover:ring-sky-500/60 hover:shadow-sky-500/30";
  const corner = mode === "stress"
    ? "from-brand-light to-brand-dark"
    : "from-sky-400 to-violet-500";

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 30, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
      className={`group card relative overflow-hidden p-7 text-left ring-1 transition-shadow duration-300 shadow-2xl shadow-black/40 ${ringClass}`}
    >
      {/* Spotlight that follows the mouse */}
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

      {/* Glowing corner orb that grows on hover */}
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.08, 1], opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={`pointer-events-none absolute -top-16 -right-16 w-52 h-52 rounded-full bg-gradient-to-br ${corner} blur-3xl group-hover:opacity-50 transition`}
      />

      {/* Animated border gradient on hover */}
      <span aria-hidden className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500
            bg-gradient-to-tr ${corner} [mask:linear-gradient(#000,#000)_content-box,linear-gradient(#000,#000)] [mask-composite:exclude] p-px`} />

      <div className="relative flex items-start gap-4 mb-4" style={{ transform: "translateZ(20px)" }}>
        <motion.div
          animate={{ rotate: [0, 5, -3, 0], y: [0, -2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          {logo}
        </motion.div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight">{name}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{tagline}</p>
        </div>
      </div>

      <p className="relative text-sm text-ink-muted leading-relaxed" style={{ transform: "translateZ(15px)" }}>
        {description}
      </p>

      <div className="relative mt-5 flex flex-wrap gap-2" style={{ transform: "translateZ(20px)" }}>
        {chips.map((chip, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: delay + 0.1 + i * 0.06 }}
            className="pill ring-1 bg-bg-card ring-bg-border text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5"
          >
            <chip.Icon className={`w-3 h-3 ${mode === "stress" ? "text-brand" : "text-sky-400"}`} />
            {chip.text}
          </motion.span>
        ))}
      </div>

      <div
        className="relative mt-7 flex items-center gap-2 text-sm font-bold text-ink group-hover:text-brand transition"
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

      {/* Bottom shine line */}
      <span className={`absolute left-7 right-7 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-500
                        ${mode === "post" ? "via-sky-500/40" : ""}`} />
    </motion.button>
  );
}
