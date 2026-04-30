import { FormEvent, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { api } from "../../../platform/api/client";

export default function Environments() {
  const [envs, setEnvs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [base, setBase] = useState("");

  async function reload() { try { setEnvs(await api.listEnvs()); } catch { setEnvs([]); } }
  useEffect(() => { reload(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !base.trim()) return toast.error("name and base url required");
    try {
      await api.createEnv({ name, base_url: base, headers: {} });
      toast.success("Environment added");
      setName(""); setBase(""); reload();
    } catch (err: any) { toast.error(err.message); }
  }

  async function del(id: string) {
    try { await api.deleteEnv(id); toast.success("Removed"); reload(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Environments</h1>
        <p className="text-ink-muted mt-1">Reusable target hosts and headers.</p>
      </header>

      <form onSubmit={add} className="card p-5 grid sm:grid-cols-[1fr_2fr_auto] gap-3">
        <input className="input" placeholder="Name (staging, prod-eu, …)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input font-mono text-xs" placeholder="https://api.staging.example.com" value={base} onChange={(e) => setBase(e.target.value)} />
        <button className="btn-primary">Add</button>
      </form>

      <div className="grid lg:grid-cols-2 gap-3">
        {envs.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="card p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{e.name}</div>
              <div className="text-xs text-ink-muted truncate font-mono">{e.base_url}</div>
            </div>
            <button onClick={() => del(e.id)} className="btn-ghost text-bad"><Trash2 className="w-4 h-4" /></button>
          </motion.div>
        ))}
        {envs.length === 0 && <div className="col-span-full text-center py-16 text-ink-muted">No environments yet.</div>}
      </div>
    </div>
  );
}
