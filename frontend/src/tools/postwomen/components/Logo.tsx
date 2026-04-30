import { motion } from "framer-motion";

/** PostWomen logo — paper-plane envelope, sky-violet gradient. */
export function PWLogo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const Plane = animated ? motion.path : "path";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="PostWomen">
      <defs>
        <linearGradient id="pw-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
        <linearGradient id="pw-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#pw-grad)" />
      <rect x="4" y="4" width="56" height="32" rx="14" fill="url(#pw-shine)" />
      {/* Envelope body */}
      <rect x="14" y="22" width="32" height="22" rx="2.5" fill="#fff" opacity="0.95" />
      <path d="M14 24 L30 36 L46 24" stroke="#0EA5E9" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Paper plane swooping out */}
      <Plane
        d="M50 18 L34 22 L40 26 L48 24 L42 30 L48 32 Z"
        fill="#fff"
        stroke="#fff" strokeWidth="0.6" strokeLinejoin="round"
        {...(animated && {
          animate: { x: [0, 4, 0], y: [0, -2, 0] },
          transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
        })}
      />
    </svg>
  );
}

export function PWWordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <PWLogo size={size + 18} />
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight" style={{ fontSize: size }}>
          Post<span className="bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-transparent">Women</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Try your APIs nicely
        </div>
      </div>
    </div>
  );
}
