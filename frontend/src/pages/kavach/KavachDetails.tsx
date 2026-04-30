// KavachDetails — the deep product-details page. Lives behind the
// "Product details" link on the overview / inside the nav. Written for two
// audiences:
//   1. The developer trying Kavach for the first time who wants the full
//      story in plain English.
//   2. A VAPT / security reviewer who wants assurance that what we're
//      doing is rigorous and that they can map it to OWASP / CWE.

import {
  ArrowLeft, Shield, Bug, Lock, ServerCrash, ArrowDownLeft, KeyRound,
  Sparkles, FileText, GitBranch, AlertOctagon, ShieldCheck, ClipboardCheck,
  Eye, Zap, BookOpen, CheckCircle2, AlertTriangle, Layers, Filter,
  Settings as SettingsIcon, Cpu, Database, FileSpreadsheet, FileSignature,
  Activity, Users, Globe,
} from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  onBack: () => void;
  onStartScan: () => void;
};

export function KavachDetails({ onBack, onStartScan }: Props) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      <button onClick={onBack} className="text-xs text-ink-muted hover:text-cyan-200 inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to overview
      </button>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <div className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 via-teal-700 to-teal-700 shadow-2xl shadow-teal-900/50 ring-1 ring-cyan-400/30">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80 font-mono inline-flex items-center gap-2 justify-center">
          <Sparkles className="w-3 h-3" /> Kavach · Product details
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          The complete <span className="bg-gradient-to-r from-cyan-300 via-cyan-500 to-teal-500 bg-clip-text text-transparent">product guide</span>
        </h1>
        <p className="text-base text-ink-muted max-w-2xl mx-auto">
          Everything Kavach does — explained the way you'd explain it to a teammate.
          Plain English first; OWASP / CWE references at the end.
        </p>
      </motion.div>

      {/* ── What it does (one paragraph) ─────────────────────────── */}
      <Section title="What is Kavach?" eyebrow="The 30-second explanation">
        <p>
          <b>Kavach</b> is an automated security scanner for HTTP APIs. You paste a request
          (a curl command, an HTTP call), Kavach mutates it dozens of ways an attacker would,
          watches how your server responds, and tells you in plain English what's broken and how to fix it.
        </p>
        <p>
          It's deterministic — no AI, no fuzzy matching. Every finding is reproducible. False
          positives are rare and traceable.
        </p>
        <p>
          The audience is <b>application developers</b>, not security specialists. You don't need
          to know what CWE-89 is — Kavach explains it. (We also include the CWE / OWASP refs for the
          security reviewers who do.)
        </p>
      </Section>

      {/* ── Why it exists ─────────────────────────────────────────── */}
      <Section title="Why we built it" eyebrow="The problem we're solving">
        <BulletList items={[
          "Most teams ship features faster than they can review them for security. \"We'll get to it\" never happens.",
          "External pen-tests cost real money and run twice a year. They miss everything between.",
          "Existing security scanners are aimed at security teams — verbose CVE-speak, false-positive heavy, hard to action without context.",
          "Developers need a fast first-pass that: (1) runs in seconds, (2) tests authenticated routes (not just public ones), (3) explains findings without jargon.",
        ]} />
      </Section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <Section title="How a scan works" eyebrow="From paste to report in under two minutes">
        <div className="grid md:grid-cols-2 gap-3">
          <Step n={1} Icon={ClipboardCheck} title="Paste your request">
            curl, raw HTTP, or just URL + headers. Kavach uses your real auth — so the scan
            tests authenticated routes the same way your real users hit them.
          </Step>
          <Step n={2} Icon={Shield} title="Confirm the host">
            Kavach refuses to start a scan until you re-type the target hostname. A
            deliberate friction step so you never fire attacks at the wrong server.
          </Step>
          <Step n={3} Icon={Cpu} title="Tests run in parallel">
            A worker pool fires every check (currently 24 of them) at your endpoint, with a
            shared rate limiter (default 5 rps, configurable up to 50). Each test gets at
            most 15 seconds.
          </Step>
          <Step n={4} Icon={Activity} title="Findings stream live">
            As each test finishes, you see it land in the live view — pass or fail. By the
            time the scan is done you have the full picture.
          </Step>
          <Step n={5} Icon={FileSignature} title="Plain-English report">
            Findings are grouped by severity, each with "what's happening / why it matters /
            how to fix it". Click any one for full evidence.
          </Step>
          <Step n={6} Icon={GitBranch} title="File or attach to Jira">
            One click files a new ticket per finding (severity-mapped priority + evidence +
            labels) — or attach the full PDF to an existing tracking issue.
          </Step>
        </div>
      </Section>

      {/* ── What it tests (categories) ───────────────────────────── */}
      <Section title="What Kavach tests" eyebrow="24 checks across 4 attacker behaviour categories">
        <div className="grid md:grid-cols-2 gap-4">
          <Cat Icon={Lock}
               title="Browser safety headers" count={6}
               items={[
                 "HSTS missing — browser can be downgraded to HTTP",
                 "X-Frame-Options / frame-ancestors — clickjacking",
                 "X-Content-Type-Options — MIME-sniff attacks",
                 "CORS reflects attacker origin with credentials — account takeover",
                 "Server / X-Powered-By leaks the stack version",
                 "Content-Security-Policy missing on HTML responses",
               ]} />
          <Cat Icon={ServerCrash}
               title="Server leaks info" count={5}
               items={[
                 "Stack-trace markers in error responses (Traceback, java.lang, …)",
                 "/.git/HEAD reachable — your repo on the internet",
                 "/.env reachable — secrets exposed",
                 "/swagger.json — public API map",
                 "/actuator — Spring ops endpoints",
               ]} />
          <Cat Icon={Bug}
               title="Hostile input" count={9}
               items={[
                 "SQL injection (single-quote error fingerprint)",
                 "Boolean SQLi (TRUE/FALSE size triangulation)",
                 "Time-blind SQLi (pg_sleep / WAITFOR DELAY)",
                 "NoSQL operator injection ($gt, $ne) — auth bypass",
                 "Command injection (timing-based ;sleep 4;)",
                 "Server-side template injection {{7*7}} → 49",
                 "Path traversal (../../../etc/passwd)",
                 "SSRF via cloud metadata (169.254.169.254)",
                 "Open redirect / HTTP parameter pollution",
               ]} />
          <Cat Icon={ArrowDownLeft}
               title="Wrong verbs allowed" count={4}
               items={[
                 "OPTIONS reveals every supported verb",
                 "TRACE enabled — XST cookie theft",
                 "Alternate verb (PUT/DELETE) returns 200 unexpectedly",
                 "X-HTTP-Method-Override header smuggling",
               ]} />
        </div>
      </Section>

      {/* ── Severity language ─────────────────────────────────────── */}
      <Section title="Severity in human language" eyebrow="What Critical / High / Medium actually mean">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <SeverityCard tone="bad"  label="Fix this now"      desc="Critical — typically allows account takeover or data theft." />
          <SeverityCard tone="warn" label="Fix this week"     desc="High — a real vulnerability with a clear attack path." />
          <SeverityCard tone="amber" label="Fix when you can" desc="Medium — defence-in-depth gap; not directly exploitable today." />
          <SeverityCard tone="cool" label="Nice to have"      desc="Low — best-practice improvement." />
          <SeverityCard tone="muted" label="Heads-up"         desc="Informational — no fix required, just be aware." />
        </div>
      </Section>

      {/* ── Reports ───────────────────────────────────────────────── */}
      <Section title="The report you get" eyebrow="Three formats, one source of truth">
        <div className="grid md:grid-cols-3 gap-3">
          <ReportFormat Icon={Eye}           title="Live dashboard"
            desc="As the scan runs, you watch every test finish — passes in green, failures in red. Severity counts roll forward in real time." />
          <ReportFormat Icon={FileText}      title="In-app report"
            desc="Severity-grouped finding cards. Click one to see what's happening, why it matters, fix steps, and the exact request/response evidence." />
          <ReportFormat Icon={FileSpreadsheet} title="Compliance PDF"
            desc="A multi-page PDF audit document. Cover page, severity rollup, top priorities, every finding, and a complete VAPT compliance table listing every check that ran (PASS/FAIL)." />
        </div>
      </Section>

      {/* ── Jira integration ──────────────────────────────────────── */}
      <Section title="Jira integration" eyebrow="Two flows, deliberately different">
        <div className="grid md:grid-cols-2 gap-3">
          <FeatureBlock Icon={GitBranch} title="One Jira ticket per finding">
            Click <b>File as Jira issue</b> on any finding. Kavach creates a brand-new ticket
            with severity-mapped priority (Critical → Highest, etc.), the request that
            triggered the bug, the evidence, the fix steps, and labels like{" "}
            <code className="font-mono text-cyan-300">security</code>,{" "}
            <code className="font-mono text-cyan-300">vapt</code>,{" "}
            <code className="font-mono text-cyan-300">cwe-89</code>.
            The issue's existing assignee gets tagged automatically.
          </FeatureBlock>
          <FeatureBlock Icon={ShieldCheck} title="Attach the full report to an existing ticket">
            Have a quarterly security audit ticket? Click <b>Attach to Jira</b> — Kavach
            uploads the PDF and posts a wiki-formatted summary comment with the severity
            rollup, top findings, and a link back. Same flow APIStress uses.
          </FeatureBlock>
        </div>
      </Section>

      {/* ── Safety rails ──────────────────────────────────────────── */}
      <Section title="Safety rails" eyebrow="Kavach fires real attacks, so we keep the trigger heavy">
        <div className="grid md:grid-cols-2 gap-3">
          <SafetyItem Icon={KeyRound} title="Type the hostname to confirm">
            Before each scan starts, you must re-type the target hostname into the
            confirmation box. Catches typos and "wrong env" disasters.
          </SafetyItem>
          <SafetyItem Icon={Zap} title="Rate-limited by default">
            5 requests/second by default; configurable 1–50 with a hard ceiling. A scan never
            runs longer than 30 minutes total.
          </SafetyItem>
          <SafetyItem Icon={ShieldCheck} title="Tokens redacted before storage">
            Authorization headers, JWTs, and known API-key shapes are scrubbed from every
            request and response we save. So a shared report can't accidentally leak a secret.
          </SafetyItem>
          <SafetyItem Icon={Activity} title="Every action shows up in the admin Activity feed">
            Who ran a scan, against which host, what they filed to Jira — visible in the
            admin dashboard for compliance / audit.
          </SafetyItem>
          <SafetyItem Icon={Filter} title="Team-scoped">
            Every scan, finding, and Jira link is filtered by team. Other teams in your
            organisation can't see your scans even if they share the same Kavach instance.
          </SafetyItem>
          <SafetyItem Icon={Database} title="Honest data retention">
            Scans persist in Postgres until deleted. Evidence text is capped at 2 KB and
            response bodies at 8 KB to keep the database honest.
          </SafetyItem>
        </div>
      </Section>

      {/* ── Roadmap ────────────────────────────────────────────────── */}
      <Section title="What's NOT here yet" eyebrow="On the roadmap (we're being honest)">
        <p className="text-ink-muted">
          We deliberately ship deterministic checks first. These need response-shape
          heuristics and have higher false-positive risk — they're scheduled for v2/v3:
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          <NotYet label="Auth tampering (JWT alg-none, BOLA / IDOR)" />
          <NotYet label="SSRF / path traversal" />
          <NotYet label="Mass assignment (extra JSON fields)" />
          <NotYet label="Reflected XSS detection" />
          <NotYet label="Scheduled / recurring scans" />
          <NotYet label="Scan-to-scan regression diff" />
          <NotYet label="Bulk-file all Criticals to Jira" />
          <NotYet label="Multi-endpoint enumeration (sitemap, swagger import)" />
          <NotYet label="Auth-flow recording (login → token → scan)" />
        </div>
      </Section>

      {/* ── Pro tips ──────────────────────────────────────────────── */}
      <Section title="Pro tips" eyebrow="Get more out of every scan">
        <BulletList items={[
          "Scan a representative sample of endpoints, not just one. Public route + authenticated route + write route covers 80% of the surface.",
          "Run scans against staging / UAT first, not Production, until you're comfortable with the rate limit + payload set.",
          "Tag scans with the Jira ticket you're scanning under. The history view groups by ticket, and the auto-attach flow uses it.",
          "When a finding gets fixed, re-run the scan to confirm the test now passes. The compliance PDF then shows it as PASS.",
          "Use the comment-template selector on Jira attaches: \"Brief\" for engineers, \"Detailed\" for the security review meeting, \"Critical/urgent\" for incident tickets.",
        ]} />
      </Section>

      {/* ── Disclaimer ─────────────────────────────────────────────── */}
      <div className="card p-5 ring-1 ring-amber-500/30 bg-amber-500/[.04]">
        <div className="flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-ink-muted leading-relaxed">
            <strong className="text-ink">Authorised testing only.</strong> Kavach fires real attacks
            against real endpoints. Only scan APIs your organisation owns or has explicit
            authorisation to test. The tool, your access key, and every action you take are
            logged.
          </div>
        </div>
      </div>

      {/* ── Technical reference ──────────────────────────────────── */}
      <Section title="OWASP / CWE reference" eyebrow="For security reviewers">
        <p className="text-ink-muted">
          Each finding maps to OWASP API Security Top 10 (2023) and a corresponding CWE
          identifier so security teams can integrate with existing risk frameworks. Mapping
          is shown on each finding's <em>Technical reference</em> tab and in the PDF report.
        </p>
        <div className="grid sm:grid-cols-2 gap-2 text-xs mt-3">
          <CWEItem owasp="API1:2023" name="Broken Object Level Authorization" cwes="CWE-639, CWE-285" />
          <CWEItem owasp="API2:2023" name="Broken Authentication" cwes="CWE-287, CWE-298" />
          <CWEItem owasp="API3:2023" name="Broken Object Property Level Authorization" cwes="CWE-915" />
          <CWEItem owasp="API4:2023" name="Unrestricted Resource Consumption" cwes="CWE-770" />
          <CWEItem owasp="API5:2023" name="Broken Function Level Authorization" cwes="CWE-285, CWE-650" />
          <CWEItem owasp="API6:2023" name="Unrestricted Access to Sensitive Business Flows" cwes="CWE-840" />
          <CWEItem owasp="API7:2023" name="Server Side Request Forgery" cwes="CWE-918" />
          <CWEItem owasp="API8:2023" name="Security Misconfiguration" cwes="CWE-200, CWE-209, CWE-693, CWE-942, CWE-1021" />
          <CWEItem owasp="API9:2023" name="Improper Inventory Management" cwes="CWE-1059" />
          <CWEItem owasp="API10:2023" name="Unsafe Consumption of APIs" cwes="CWE-20" />
        </div>
      </Section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <div className="card p-6 ring-1 ring-cyan-500/30 bg-gradient-to-br from-teal-700/20 via-teal-800/15 to-teal-700/15 text-center">
        <h3 className="text-2xl font-display font-bold mb-2">Run your first scan</h3>
        <p className="text-ink-muted text-sm max-w-xl mx-auto mb-5">
          Faster than reading the rest of this page. Paste a curl, type the hostname, click Run.
        </p>
        <button
          onClick={onStartScan}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                     bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-teal-900/40
                     hover:from-cyan-500 hover:to-teal-500 transition"
        >
          <Shield className="w-4 h-4" /> Start a security scan
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────
function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: any }) {
  return (
    <section className="space-y-4">
      {eyebrow && (
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80 font-mono inline-flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> {eyebrow}
        </div>
      )}
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-3 text-ink-muted leading-relaxed">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-ink">
          <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, Icon, title, children }: { n: number; Icon: any; title: string; children: any }) {
  return (
    <div className="card p-4 ring-1 ring-bg-border bg-teal-950/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/40 grid place-items-center font-mono text-xs text-cyan-200 font-bold">
          {n}
        </span>
        <Icon className="w-4 h-4 text-cyan-300" />
        <span className="text-sm font-bold">{title}</span>
      </div>
      <div className="text-[12px] text-ink-muted leading-relaxed">{children}</div>
    </div>
  );
}

function Cat({ Icon, title, count, items }: { Icon: any; title: string; count: number; items: string[] }) {
  return (
    <div className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/30">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 grid place-items-center shrink-0">
          <Icon className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          <p className="text-[12px] text-ink-muted mt-0.5">{count} checks</p>
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[12px] text-ink leading-snug pl-3 relative">
            <span className="absolute left-0 top-2 w-1 h-1 rounded-full bg-cyan-400/70" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityCard({ tone, label, desc }: { tone: "bad" | "warn" | "amber" | "cool" | "muted"; label: string; desc: string }) {
  const ringByTone =
    tone === "bad"   ? "ring-bad/40 bg-bad/[.06] text-bad" :
    tone === "warn"  ? "ring-warn/40 bg-warn/[.06] text-warn" :
    tone === "amber" ? "ring-amber-500/40 bg-amber-500/[.06] text-amber-400" :
    tone === "cool"  ? "ring-sky-500/40 bg-sky-500/[.06] text-sky-400" :
                       "ring-bg-border bg-bg-card/40 text-ink-muted";
  return (
    <div className={`rounded-xl p-3 ring-1 ${ringByTone}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[11px] text-ink-muted mt-1 leading-snug">{desc}</div>
    </div>
  );
}

function ReportFormat({ Icon, title, desc }: { Icon: any; title: string; desc: string }) {
  return (
    <div className="card p-4 ring-1 ring-cyan-500/20 bg-teal-950/20">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-cyan-300" />
        <span className="text-sm font-bold">{title}</span>
      </div>
      <p className="text-[12px] text-ink-muted leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureBlock({ Icon, title, children }: { Icon: any; title: string; children: any }) {
  return (
    <div className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/20">
      <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 grid place-items-center mb-3">
        <Icon className="w-5 h-5 text-cyan-300" />
      </div>
      <h3 className="text-base font-bold mb-1.5">{title}</h3>
      <p className="text-[13px] text-ink-muted leading-relaxed">{children}</p>
    </div>
  );
}

function SafetyItem({ Icon, title, children }: { Icon: any; title: string; children: any }) {
  return (
    <div className="card p-3.5 ring-1 ring-bg-border bg-bg-card/40">
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="text-[12px] text-ink-muted mt-1 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

function NotYet({ label }: { label: string }) {
  return (
    <div className="rounded-lg p-2.5 ring-1 ring-bg-border bg-bg-card/30 text-ink-muted flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="text-[12px]">{label}</span>
      <span className="ml-auto pill ring-1 text-[9px] bg-bg-card ring-bg-border text-ink-dim font-mono uppercase tracking-wider">
        soon
      </span>
    </div>
  );
}

function CWEItem({ owasp, name, cwes }: { owasp: string; name: string; cwes: string }) {
  return (
    <div className="rounded-lg ring-1 ring-bg-border bg-bg-card/30 p-2.5">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="pill ring-1 text-[9px] bg-cyan-500/15 text-cyan-300 ring-cyan-500/30 font-mono">{owasp}</span>
        <span className="text-[11px] text-ink-dim font-mono">{cwes}</span>
      </div>
      <div className="text-[12px] text-ink">{name}</div>
    </div>
  );
}
