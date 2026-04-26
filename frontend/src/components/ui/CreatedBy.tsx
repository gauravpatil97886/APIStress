import { Github, Heart } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Small, tasteful "Created by" credit.
 * Used in the sidebar bottom and the login page.
 */
export function CreatedBy({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <a
        href="https://github.com/gauravpatil97886"
        target="_blank"
        rel="noopener"
        className="group block rounded-xl border border-bg-border hover:border-brand/40
                   bg-bg-card/60 hover:bg-bg-card transition-all p-2.5 text-center"
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-muted font-semibold flex items-center justify-center gap-1">
          Crafted with
          <motion.span
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="text-brand inline-flex"
          >
            <Heart className="w-3 h-3 fill-current" />
          </motion.span>
          by
        </div>
        <div className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition flex items-center justify-center gap-1.5">
          Gaurav Patil
          <Github className="w-3 h-3 opacity-60 group-hover:opacity-100" />
        </div>
      </a>
    );
  }

  return (
    <a
      href="https://github.com/gauravpatil97886"
      target="_blank"
      rel="noopener"
      className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5
                 bg-bg-card border border-bg-border hover:border-brand/40
                 transition-all text-xs"
    >
      <span className="text-ink-muted">Crafted by</span>
      <span className="font-bold text-ink group-hover:text-brand transition">Gaurav Patil</span>
      <motion.span
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="text-brand inline-flex"
      >
        <Heart className="w-3 h-3 fill-current" />
      </motion.span>
      <Github className="w-3 h-3 text-ink-muted group-hover:text-brand transition" />
    </a>
  );
}
