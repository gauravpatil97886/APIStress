import { motion } from "framer-motion";

export function Logo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const Bolt = animated ? motion.path : "path";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="APIStress">
      <defs>
        <linearGradient id="as-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="55%" stopColor="#E0341A" />
          <stop offset="100%" stopColor="#7C1D6F" />
        </linearGradient>
        <linearGradient id="as-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="as-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFB347" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FFB347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#as-grad)" />
      <rect x="4" y="4" width="56" height="32" rx="14" fill="url(#as-shine)" />
      <circle cx="32" cy="32" r="24" fill="url(#as-glow)" />
      {/* Stress gauge */}
      <path d="M 14 38 A 18 18 0 0 1 50 38" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 38 22 A 18 18 0 0 1 50 38" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
      {/* Lightning bolt */}
      <Bolt
        d="M 30 18 L 22 36 L 30 36 L 26 50 L 40 30 L 32 30 L 36 18 Z"
        fill="#fff"
        stroke="#fff"
        strokeWidth="0.6"
        strokeLinejoin="round"
        {...(animated && {
          animate: { opacity: [1, 0.6, 1], scale: [1, 1.05, 1] },
          style: { transformOrigin: "32px 34px" },
          transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
        })}
      />
      <circle cx="32" cy="38" r="2.5" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size + 18} />
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight" style={{ fontSize: size }}>
          API<span className="text-brand">Stress</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Internal load testing
        </div>
      </div>
    </div>
  );
}
