import { ExternalLink, User as UserIcon } from "lucide-react";
import { motion } from "framer-motion";
import { EnvPill } from "../layout/EnvPill";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TestedBy({
  name, jiraID, jiraLink, startedAt, finishedAt, runID, notes, envTag,
}: {
  name?: string;
  jiraID?: string;
  jiraLink?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  runID: string;
  notes?: string;
  envTag?: string;
}) {
  const start = startedAt ? new Date(startedAt) : null;
  const end = finishedAt ? new Date(finishedAt) : null;
  const dur = start && end ? Math.max(0, (end.getTime() - start.getTime()) / 1000) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card p-5"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-light to-brand-dark
                        text-white grid place-items-center text-xl font-extrabold shadow-lg shadow-brand/20">
          {initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold flex items-center gap-1.5">
            <UserIcon className="w-3 h-3" /> Tested by
          </div>
          <div className="text-xl font-bold text-ink mt-1 truncate flex items-center gap-2 flex-wrap">
            {name || "Unknown"}
            {envTag && <EnvPill tag={envTag} size="md" />}
          </div>
          <div className="text-xs font-mono text-ink-muted mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {jiraID && (
              jiraLink ? (
                <a href={jiraLink} target="_blank" rel="noopener" className="text-brand hover:underline inline-flex items-center gap-1">
                  Jira <b className="text-brand">{jiraID}</b> <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span>Jira <b className="text-ink">{jiraID}</b></span>
              )
            )}
            <span>Run <b className="text-ink">{runID.slice(0, 8)}</b></span>
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold space-y-1">
          {start && (
            <div>
              <div>Started</div>
              <div className="text-xs text-ink font-mono normal-case tracking-normal mt-0.5">{start.toLocaleString()}</div>
            </div>
          )}
          {end && (
            <div className="mt-2">
              <div>Finished</div>
              <div className="text-xs text-ink font-mono normal-case tracking-normal mt-0.5">{end.toLocaleString()}</div>
            </div>
          )}
          {dur != null && (
            <div className="text-brand text-xs normal-case tracking-normal mt-2 font-bold">
              took {dur.toFixed(1)}s
            </div>
          )}
        </div>
      </div>
      {notes && (
        <div className="mt-4 text-sm text-ink-muted bg-bg-card rounded-lg px-3 py-2 border-l-2 border-brand">
          <div className="text-[10px] uppercase tracking-wider text-ink-dim mb-1">Notes</div>
          {notes}
        </div>
      )}
    </motion.div>
  );
}
