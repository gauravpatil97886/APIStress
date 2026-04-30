import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileDown, X, Image as ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { api, getKey } from "../../api/client";

type Props = {
  open: boolean;
  onClose: () => void;
  runID: string;
  defaultName?: string;
  envTag?: string;
  jiraID?: string;
};

function suggestFilename(name?: string, envTag?: string, jiraID?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const cleanName = (name || "apistress-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "report";
  const parts = [cleanName, envTag?.toLowerCase(), jiraID?.toLowerCase(), today].filter(Boolean);
  return parts.join("_") + ".pdf";
}

export function PDFDownloadModal({ open, onClose, runID, defaultName, envTag, jiraID }: Props) {
  const [filename, setFilename] = useState("");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [includeCharts, setIncludeCharts] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFilename(suggestFilename(defaultName, envTag, jiraID));
      setOrientation("portrait");
      setIncludeCharts(true);
    }
  }, [open, defaultName, envTag, jiraID]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!filename.trim()) {
      toast.error("Please enter a filename.");
      return;
    }
    setBusy(true);
    const safeName = filename.trim().endsWith(".pdf") ? filename.trim() : filename.trim() + ".pdf";
    const params = new URLSearchParams({
      key: getKey(),
      filename: safeName,
      orientation,
      include_charts: String(includeCharts),
    });
    const url = `${api.base}/api/reports/${runID}/pdf?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobURL = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobURL;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobURL);
      toast.success(`Downloaded ${safeName}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={onClose}
        >
          <motion.form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="card w-full max-w-md p-6 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-light to-brand-dark
                                grid place-items-center text-white shadow-lg shadow-brand/30">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Download PDF report</h2>
                  <p className="text-xs text-ink-muted">Customise before saving.</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Filename</label>
                <div className="relative">
                  <input
                    autoFocus
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    className="input w-full font-mono pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-dim font-mono">.pdf</span>
                </div>
                <p className="text-[11px] text-ink-dim mt-1.5">
                  Special characters become underscores. Auto-suggested from run name + env + Jira + date.
                </p>
              </div>

              <div>
                <label className="label">Page orientation</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["portrait", "landscape"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrientation(o)}
                      className={`p-3 rounded-xl border transition flex items-center gap-3
                        ${orientation === o
                          ? "bg-brand/10 border-brand text-ink ring-1 ring-brand/40"
                          : "bg-bg-card border-bg-border text-ink-muted hover:border-brand/40"}`}
                    >
                      <div className={`shrink-0 border-2 rounded-sm
                        ${o === "portrait" ? "w-4 h-5" : "w-5 h-4"}
                        ${orientation === o ? "border-brand" : "border-ink-muted"}`} />
                      <div className="text-left">
                        <div className="text-sm font-semibold capitalize">{o}</div>
                        <div className="text-[10px] text-ink-dim">
                          {o === "portrait" ? "Standard A4 — recommended" : "Wide — good for printing"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-bg-border bg-bg-card hover:border-brand/40 transition">
                  <input
                    type="checkbox"
                    checked={includeCharts}
                    onChange={(e) => setIncludeCharts(e.target.checked)}
                    className="mt-0.5 accent-brand w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-brand" />
                      Include charts
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      Adds the latency-over-time and throughput charts. Untick for a smaller, text-only PDF.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy
                  ? "Generating…"
                  : <><Download className="w-4 h-4" />Download</>}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
