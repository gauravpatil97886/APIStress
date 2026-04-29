import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { ArrowRight, KeyRound } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { CreatedBy } from "../components/ui/CreatedBy";
import { api, setKey } from "../lib/api";
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
      await api.login(key.trim());
      setKey(key.trim());
      toast.success("Welcome to ChoiceHammer");
      // Route to last-used mode if known, otherwise show the chooser.
      const last = localStorage.getItem(MODE_KEY);
      const dest = last === "postwomen" ? "/postwomen" : last === "apistress" ? "/" : "/mode";
      nav(dest, { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="card p-8 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="flex flex-col items-center text-center mb-7">
            <motion.div
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Logo size={72} animated />
            </motion.div>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
              API<span className="text-brand">Stress</span>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Hit your APIs hard. Know exactly what breaks.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Access Key</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <input
                  type="password"
                  autoFocus
                  value={key}
                  onChange={(e) => setKeyVal(e.target.value)}
                  placeholder="Paste or type your key, then press Enter"
                  className="input w-full pl-9 font-mono"
                />
              </div>
              <p className="mt-2 text-[11px] text-ink-dim">
                Just enter your shared key — no username, no password.
              </p>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
              {busy ? "Verifying…" : (<>Enter APIStress <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-ink-dim">
            Open-source load testing — self-hosted
          </p>
          <CreatedBy />
        </div>
      </motion.div>
    </div>
  );
}
