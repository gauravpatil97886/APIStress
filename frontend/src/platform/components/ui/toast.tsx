// Custom toast components for the Choice Techlab Internal Tools dashboard.
//
// We use react-hot-toast under the hood but render fully styled Tailwind /
// Framer Motion components via `toast.custom(...)`, so success / error /
// warning / info variants all share consistent visuals (left-border accent,
// icon, optional dismiss button, animated progress bar).
//
// Usage:
//
//     import { showToast } from "../components/ui/toast";
//
//     showToast.success("Signed in — welcome back, Acme");
//     showToast.error("Unauthorized — check your access key");
//     showToast.warning("Connection lost — retrying");
//     showToast.info("Loading your scan…");
//
// All four variants accept either a string or `{ title, description }`.

import { motion } from "framer-motion";
import {
  CheckCircle2, AlertTriangle, AlertCircle, Loader2, X,
} from "lucide-react";
import toast, { Toast } from "react-hot-toast";

type Variant = "success" | "error" | "warning" | "info";

type ToastInput = string | { title: string; description?: string };

const VARIANT_STYLES: Record<Variant, {
  border: string;
  iconBg: string;
  iconColor: string;
  progress: string;
  Icon: React.ComponentType<{ className?: string }>;
  defaultDuration: number;
  spin?: boolean;
}> = {
  success: {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    progress: "bg-emerald-500",
    Icon: CheckCircle2,
    defaultDuration: 3500,
  },
  error: {
    border: "border-l-red-500",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-400",
    progress: "bg-red-500",
    Icon: AlertTriangle,
    defaultDuration: 7000,
  },
  warning: {
    border: "border-l-amber-500",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
    progress: "bg-amber-500",
    Icon: AlertCircle,
    defaultDuration: 5000,
  },
  info: {
    border: "border-l-cyan-500",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
    progress: "bg-cyan-500",
    Icon: Loader2,
    defaultDuration: 4000,
    spin: true,
  },
};

function unwrap(input: ToastInput): { title: string; description?: string } {
  if (typeof input === "string") return { title: input };
  return input;
}

function ToastBody({
  t,
  variant,
  title,
  description,
  duration,
  dismissable,
}: {
  t: Toast;
  variant: Variant;
  title: string;
  description?: string;
  duration: number;
  dismissable: boolean;
}) {
  const cfg = VARIANT_STYLES[variant];
  const Icon = cfg.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={
        t.visible
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: -10, scale: 0.97 }
      }
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={[
        "relative pointer-events-auto flex items-start gap-3 overflow-hidden",
        "min-w-[280px] max-w-[420px] rounded-xl border-l-4",
        "bg-[#1c1f2b]/95 backdrop-blur-md ring-1 ring-white/5",
        "shadow-2xl shadow-black/40",
        "px-4 py-3 pr-3",
        cfg.border,
      ].join(" ")}
    >
      {/* Icon */}
      <div
        className={[
          "shrink-0 grid place-items-center w-8 h-8 rounded-lg mt-0.5",
          cfg.iconBg,
        ].join(" ")}
      >
        <Icon className={[
          "w-4 h-4",
          cfg.iconColor,
          cfg.spin ? "animate-spin" : "",
        ].join(" ")} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="text-[13px] font-semibold text-white leading-snug break-words">
          {title}
        </div>
        {description && (
          <div className="text-[12px] text-white/70 leading-snug mt-0.5 break-words">
            {description}
          </div>
        )}
      </div>

      {/* Dismiss */}
      {dismissable && (
        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          aria-label="Dismiss"
          className="shrink-0 -mr-1 -mt-0.5 w-6 h-6 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Progress bar */}
      <motion.div
        className={["absolute bottom-0 left-0 h-[2px]", cfg.progress].join(" ")}
        initial={{ width: "100%" }}
        animate={{ width: t.visible ? "0%" : "0%" }}
        transition={{ duration: duration / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}

type Opts = {
  /** Override the auto-dismiss duration (ms). */
  duration?: number;
  /** Stable id — re-emitting the same id replaces the existing toast. */
  id?: string;
  /** Show the X dismiss button. Defaults: errors & warnings = true, others = false. */
  dismissable?: boolean;
};

function emit(variant: Variant, input: ToastInput, opts: Opts = {}) {
  const { title, description } = unwrap(input);
  const cfg = VARIANT_STYLES[variant];
  const duration = opts.duration ?? cfg.defaultDuration;
  const dismissable =
    opts.dismissable ?? (variant === "error" || variant === "warning");

  return toast.custom(
    (t) => (
      <ToastBody
        t={t}
        variant={variant}
        title={title}
        description={description}
        duration={duration}
        dismissable={dismissable}
      />
    ),
    { duration, id: opts.id },
  );
}

export const showToast = {
  success: (input: ToastInput, opts?: Opts) => emit("success", input, opts),
  error:   (input: ToastInput, opts?: Opts) => emit("error",   input, opts),
  warning: (input: ToastInput, opts?: Opts) => emit("warning", input, opts),
  info:    (input: ToastInput, opts?: Opts) => emit("info",    input, opts),
  /** Pass-through to react-hot-toast for advanced cases. */
  raw: toast,
  dismiss: (id?: string) => toast.dismiss(id),
};

export type { Variant as ToastVariant };
