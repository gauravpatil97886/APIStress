import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { api, getUser } from "../../../platform/api/client";

export default function SavedTests() {
  const [tests, setTests] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { reload(); }, []);
  async function reload() { try { setTests(await api.listTests()); } catch { setTests([]); } }

  async function run(t: any) {
    const by = (getUser() || prompt("Your name?") || "").trim();
    if (!by) { toast.error("Please enter your name."); return; }
    const jira = (prompt("Jira ticket ID (e.g. CT-1234)?") || "").trim();
    if (!jira) { toast.error("Please enter the Jira ticket ID."); return; }
    setBusy(t.id);
    try {
      const { run_id } = await api.startRun({
        test_id: t.id, created_by: by, jira_id: jira, jira_link: "",
      });
      toast.success("Started");
      location.href = `/runs/${run_id}`;
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  async function del(id: string) {
    if (!confirm("Delete this test?")) return;
    try { await api.deleteTest(id); toast.success("Deleted"); reload(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Tests</h1>
          <p className="text-ink-muted mt-1">Reusable test configurations.</p>
        </div>
        <Link to="/builder" className="btn-primary">+ New Test</Link>
      </header>
      <div className="grid lg:grid-cols-2 gap-3">
        {tests.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="card p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{t.name}</div>
              <div className="text-xs text-ink-muted truncate">
                {t.config?.protocol?.toUpperCase()} {t.config?.request?.method} {t.config?.request?.url}
              </div>
            </div>
            <button onClick={() => run(t)} disabled={busy === t.id} className="btn-primary text-sm">
              <Play className="w-4 h-4" />Run
            </button>
            <button onClick={() => del(t.id)} className="btn-ghost text-bad text-sm">
              <Trash2 className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
        {tests.length === 0 && (
          <div className="col-span-full text-center py-16 text-ink-muted">No saved tests yet.</div>
        )}
      </div>
    </div>
  );
}
