import { motion } from "framer-motion";

/**
 * Choice Techlab brand mark — a hexagonal "C" interlocked with a "T",
 * gradient-stroked. Modern, geometric, distinctive.
 */
export function ChoiceTechlabMark({ size = 56, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Choice Techlab">
      <defs>
        <linearGradient id="ctl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#FF7A2A" />
          <stop offset="50%" stopColor="#E0341A" />
          <stop offset="100%" stopColor="#7C1D6F" />
        </linearGradient>
        <linearGradient id="ctl-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ctl-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stopColor="#FF7A2A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FF7A2A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hex container */}
      <motion.path
        d="M32 4 L57 18 L57 46 L32 60 L7 46 L7 18 Z"
        fill="url(#ctl-grad)"
        animate={animated ? { scale: [1, 1.02, 1] } : undefined}
        transition={animated ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : undefined}
        style={{ transformOrigin: "32px 32px" }}
      />
      <path d="M32 4 L57 18 L57 32 L32 18 L7 32 L7 18 Z" fill="url(#ctl-shine)" />

      {/* Inner glow */}
      <circle cx="32" cy="32" r="20" fill="url(#ctl-glow)" />

      {/* Stylised C */}
      <motion.path
        d="M 38 19 A 13 13 0 1 0 38 45"
        stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round"
        animate={animated ? { pathLength: [0.85, 1, 0.85] } : undefined}
        transition={animated ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : undefined}
      />
      {/* Crossbar of T (intersects through the C, giving the mark its identity) */}
      <line x1="22" y1="32" x2="46" y2="32" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      {/* Vertical of T */}
      <line x1="34" y1="32" x2="34" y2="48" stroke="#fff" strokeWidth="4" strokeLinecap="round" />

      {/* Tiny accent dot */}
      <motion.circle
        cx="46" cy="22" r="2" fill="#fff"
        animate={animated ? { opacity: [1, 0.4, 1], scale: [1, 1.3, 1] } : undefined}
        transition={animated ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined}
        style={{ transformOrigin: "46px 22px" }}
      />
    </svg>
  );
}
