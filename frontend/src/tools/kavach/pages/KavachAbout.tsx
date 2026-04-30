// KavachAbout — the about / description / "what does this tool do?" page.
//
// Goals:
//   - Audience is application developers, NOT security specialists. Plain
//     English everywhere. Where security jargon (CWE / OWASP) appears it's
//     in a "Technical reference" subsection, not the headline copy.
//   - Visually communicate that Kavach is a SECURITY tool — cyan/teal
//     gradient, shield icons, scanline motifs.
//   - Functional: prominent "Run my first scan" CTA at top, plus the same
//     CTA at the bottom of every section.

import { motion } from "framer-motion";
import {
  Shield, ShieldAlert, ShieldCheck, ArrowRight, Sparkles, Lock, Bug,
  Zap, FileText, AlertOctagon, BookOpen, Eye, GitBranch, ClipboardCheck,
  CheckCircle2, AlertTriangle, KeyRound, FileSearch, ServerCrash, ArrowDownLeft,
} from "lucide-react";

type Props = {
  onStartScan: () => void;
};

export function KavachAbout({ onStartScan }: Props) {
  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <Hero onStartScan={onStartScan} />

      {/* ── What is Kavach? ────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionEyebrow text="In one sentence" />
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight max-w-3xl">
          Kavach runs the same checks an attacker would on your API,
          {" "}<span className="text-cyan-300">and tells you in plain English what to fix.</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <BigPoint
            Icon={Bug}
            title="Hostile probes, automated"
            desc="Paste a curl. Kavach mutates it dozens of ways an attacker would — bad headers, weird payloads, wrong methods, sneaky inputs — and watches how your server responds."
          />
          <BigPoint
            Icon={ShieldCheck}
            title="No security PhD required"
            desc="Every finding has a 'What's happening / Why it matters / How to fix it' explanation written for app developers. Click an issue, read three paragraphs, ship the fix."
          />
          <BigPoint
            Icon={FileText}
            title="A report you can actually share"
            desc="Download a professional PDF for your security review, or file individual findings as new Jira tickets — one click, with the assignee tagged automatically."
          />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="space-y-6">
        <SectionEyebrow text="How it works" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          From paste to report in under two minutes
        </h2>
        <div className="grid md:grid-cols-4 gap-4">
          <Step
            n={1} Icon={ClipboardCheck}
            title="Paste your request"
            desc="Drop in a curl, an HAR snippet, or just a URL + headers. Kavach uses your real auth so the scan tests authenticated routes."
          />
          <Step
            n={2} Icon={Shield}
            title="Confirm the target"
            desc="Type the hostname to confirm — a deliberate friction step so you can't accidentally fire attacks at the wrong server."
          />
          <Step
            n={3} Icon={Zap}
            title="Watch it run"
            desc="A live progress view streams findings as they're discovered. Each category fills its own progress bar — typically finishes in 30–90 seconds."
          />
          <Step
            n={4} Icon={FileSearch}
            title="Read & ship"
            desc="Severity-grouped findings with copy-paste fixes. File any of them as Jira tickets, or download the full PDF for your team."
          />
        </div>
      </section>

      {/* ── What we test ──────────────────────────────────────────── */}
      <section className="space-y-6">
        <SectionEyebrow text="What we look for" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Four categories of attacker behaviour
        </h2>
        <p className="text-ink-muted max-w-3xl">
          Each category contains several individual checks. We deliberately stick to deterministic
          tests — things we can prove from a single response — to keep false positives near zero.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <CategoryCard
            Icon={Lock}
            title="Browser safety headers"
            blurb="Headers that tell browsers how to protect your users."
            examples={[
              "HSTS missing — browser can be tricked into plain HTTP.",
              "X-Frame-Options missing — your page can be iframed for clickjacking.",
              "CORS reflects attacker origin with credentials — other websites can act as a logged-in user.",
              "Server / X-Powered-By leaks your stack version.",
            ]}
            severity="Mostly Low / Medium with one High"
          />
          <CategoryCard
            Icon={ServerCrash}
            title="Server leaks info"
            blurb="Spots where the server reveals stack traces, hidden files, or internal details."
            examples={[
              "/.git/HEAD reachable — your repo is on the public internet.",
              "/.env exposed — environment file with secrets.",
              "Stack trace markers in error responses (`Traceback (most recent call last)`, `at java.lang.…`).",
              "Open Swagger / actuator / debug endpoints.",
            ]}
            severity="Low → High"
          />
          <CategoryCard
            Icon={Bug}
            title="Hostile input"
            blurb="What happens when an attacker sends weird characters in fields you trust."
            examples={[
              "SQL-style payload (`'`, `OR 1=1`) returns a SQL error.",
              "NoSQL operator (`{\"$gt\":\"\"}`) bypasses login.",
              "Command-injection semicolon causes the response to delay, suggesting a shell ran.",
              "Server-side template payload (`{{7*7}}`) returns `49`.",
            ]}
            severity="Mostly Critical / High"
          />
          <CategoryCard
            Icon={ArrowDownLeft}
            title="Wrong verbs allowed"
            blurb="Tries HTTP methods (GET / POST / PUT / DELETE / TRACE / OPTIONS) you didn't intend to support."
            examples={[
              "OPTIONS reveals every supported verb.",
              "TRACE is enabled (lets attackers steal cookies via reflection).",
              "PUT or DELETE returns 200 on a route you assumed was GET-only.",
              "X-HTTP-Method-Override smuggles DELETE through a POST.",
            ]}
            severity="Info → High"
          />
        </div>

        <p className="text-[12px] text-ink-dim italic">
          More categories — auth tampering, SSRF, path traversal, mass assignment, XSS detection —
          land in v2 once we've ironed out false positives in the heuristic tests.
        </p>
      </section>

      {/* ── Plain-language severity ─────────────────────────────── */}
      <section className="space-y-4">
        <SectionEyebrow text="How we rank findings" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Severity in human language
        </h2>
        <p className="text-ink-muted max-w-3xl">
          Security tools love jargon. We translate it. Each finding gets one of these tags so you
          can prioritise without reading the CWE catalogue.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <SeverityRow tone="bad" label="Fix this now"          desc="Critical — typically allows account takeover or data theft." />
          <SeverityRow tone="warn" label="Fix this week"        desc="High — a real vulnerability with a clear attack path." />
          <SeverityRow tone="amber" label="Fix when you can"    desc="Medium — defence-in-depth gap; not directly exploitable today." />
          <SeverityRow tone="cool" label="Nice to have"         desc="Low — best-practice improvement." />
          <SeverityRow tone="muted" label="Heads-up"            desc="Informational — no fix required, just be aware." />
        </div>
      </section>

      {/* ── Jira integration ───────────────────────────────────── */}
      <section className="space-y-6">
        <SectionEyebrow text="Two ways to send to Jira" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          File findings where your team already works
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureBlock
            Icon={GitBranch}
            title="One Jira ticket per finding"
            desc={
              <>
                Click <strong>File as Jira issue</strong> on any finding. Kavach creates a brand-new
                ticket with severity-mapped priority, the request that triggered the bug, the
                response evidence, the fix steps, and labels like <code>security</code>, <code>vapt</code>, <code>cwe-89</code>.
                The issue assignee gets tagged automatically.
              </>
            }
          />
          <FeatureBlock
            Icon={Eye}
            title="Attach the full report to a tracking ticket"
            desc={
              <>
                Already have a quarterly security audit ticket? Click <strong>Attach full report</strong>{" "}
                to upload the PDF + post a wiki-formatted summary comment with severity rollup +
                top findings. Same flow APIStress uses — every attach is logged in the admin's
                Jira tab.
              </>
            }
          />
        </div>
      </section>

      {/* ── Safety rails ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionEyebrow text="Safety rails" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          We keep the trigger heavy on purpose
        </h2>
        <p className="text-ink-muted max-w-3xl">
          Kavach fires real attacks. To make sure that's never an accident, we enforce these rules
          on every scan:
        </p>
        <ul className="grid md:grid-cols-2 gap-3 mt-4">
          <SafetyItem Icon={KeyRound} title="Type the hostname to confirm">
            Before each scan starts, you must re-type the target hostname. If you're scanning the
            wrong server, you'll spot it here.
          </SafetyItem>
          <SafetyItem Icon={Zap} title="Rate-limited to 5 rps by default">
            We never burst-fire. Defaults to 5 requests/second; configurable up to 50 with a hard
            ceiling. A scan never runs longer than 30 minutes total.
          </SafetyItem>
          <SafetyItem Icon={ShieldAlert} title="Tokens are redacted before storage">
            Authorization headers, JWTs, and known API-key patterns are scrubbed from every
            request and response we save to the database — so a scan report you share can't leak
            credentials.
          </SafetyItem>
          <SafetyItem Icon={CheckCircle2} title="Every action shows up in the admin Activity feed">
            Who started a scan, against which host, what they filed to Jira — all visible in the
            admin dashboard for compliance / audit.
          </SafetyItem>
        </ul>
      </section>

      {/* ── What's NOT here yet ──────────────────────────────────── */}
      <section className="space-y-4">
        <SectionEyebrow text="On the roadmap" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          We're honest about what's not here yet
        </h2>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <NotYetCard label="Auth tampering" />
          <NotYetCard label="SSRF / path traversal" />
          <NotYetCard label="Mass assignment" />
          <NotYetCard label="Reflected XSS detection" />
          <NotYetCard label="Scheduled / recurring scans" />
          <NotYetCard label="Scan-to-scan regression diff" />
        </div>
        <p className="text-[12px] text-ink-dim italic max-w-3xl">
          These need response-shape heuristics with a higher false-positive risk — we're shipping
          them once we've stabilised the deterministic checks first.
        </p>
      </section>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <section className="card p-5 ring-1 ring-amber-500/30 bg-amber-500/[.04]">
        <div className="flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-ink-muted leading-relaxed">
            <strong className="text-ink">Authorised testing only.</strong> Kavach fires real attacks
            against real endpoints. Only scan APIs your organisation owns or has explicit
            authorisation to test. Even within your own organisation: run scans against staging /
            UAT first, not Production, until you're confident the rate-limit + payload set won't
            disrupt traffic.
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <CTABand onStart={onStartScan} />

      {/* ── Technical reference (collapsible) ────────────────────── */}
      <TechnicalReference />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────
function Hero({ onStartScan }: { onStartScan: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative pt-8 pb-10 text-center"
    >
      <motion.div
        animate={{ rotate: [0, 4, -3, 0], y: [0, -3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-grid place-items-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 via-teal-700 to-teal-700 shadow-2xl shadow-teal-900/50 ring-1 ring-cyan-400/30 mb-5"
      >
        <Shield className="w-10 h-10 text-white" />
      </motion.div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80 font-mono mb-2 inline-flex items-center gap-2 justify-center">
        <Sparkles className="w-3 h-3" /> KAVACH · API SECURITY SHIELD
      </div>
      <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight">
        Find the bugs <span className="bg-gradient-to-r from-cyan-300 via-cyan-500 to-teal-500 bg-clip-text text-transparent">attackers look for</span>
      </h1>
      <p className="mt-4 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto">
        Paste an API request. Kavach runs the same probes a hostile attacker would, then tells
        you — in plain English — exactly what to fix and how.
      </p>
      <button
        onClick={onStartScan}
        className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                   bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-teal-900/40
                   hover:from-cyan-500 hover:to-teal-500 transition"
      >
        <Shield className="w-4 h-4" /> Run my first security scan <ArrowRight className="w-4 h-4" />
      </button>
      <div className="mt-3 text-[11px] text-ink-dim">
        Takes ~30–90 seconds. Defaults are safe for staging environments.
      </div>
    </motion.div>
  );
}

function SectionEyebrow({ text }: { text: string }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80 font-mono inline-flex items-center gap-2">
      <Sparkles className="w-3 h-3" /> {text}
    </div>
  );
}

function BigPoint({ Icon, title, desc }: { Icon: any; title: string; desc: string }) {
  return (
    <div className="card p-5 ring-1 ring-cyan-500/20 bg-gradient-to-br from-teal-950/40 to-transparent">
      <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 grid place-items-center mb-3">
        <Icon className="w-5 h-5 text-cyan-300" />
      </div>
      <h3 className="text-base font-bold mb-1.5">{title}</h3>
      <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ n, Icon, title, desc }: { n: number; Icon: any; title: string; desc: string }) {
  return (
    <div className="card p-4 ring-1 ring-bg-border bg-bg-card/40">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/40 grid place-items-center font-mono text-xs text-cyan-200 font-bold">
          {n}
        </span>
        <Icon className="w-4 h-4 text-cyan-300" />
      </div>
      <div className="text-sm font-bold mb-1">{title}</div>
      <div className="text-[12px] text-ink-muted leading-relaxed">{desc}</div>
    </div>
  );
}

function CategoryCard({
  Icon, title, blurb, examples, severity,
}: {
  Icon: any; title: string; blurb: string; examples: string[]; severity: string;
}) {
  return (
    <div className="card p-5 ring-1 ring-cyan-500/20 bg-teal-950/30">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 grid place-items-center shrink-0">
          <Icon className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          <p className="text-[12px] text-ink-muted mt-0.5">{blurb}</p>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mb-1.5">
        Examples of what we catch
      </div>
      <ul className="space-y-1 mb-3">
        {examples.map((e, i) => (
          <li key={i} className="text-[12px] text-ink leading-snug pl-3 relative">
            <span className="absolute left-0 top-2 w-1 h-1 rounded-full bg-cyan-400/70" />
            {e}
          </li>
        ))}
      </ul>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim font-mono mt-2">
        Severity range: <span className="text-cyan-200 normal-case tracking-normal">{severity}</span>
      </div>
    </div>
  );
}

function SeverityRow({
  tone, label, desc,
}: { tone: "bad" | "warn" | "amber" | "cool" | "muted"; label: string; desc: string }) {
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

function FeatureBlock({ Icon, title, desc }: { Icon: any; title: string; desc: any }) {
  return (
    <div className="card p-5 ring-1 ring-cyan-500/20 bg-gradient-to-br from-teal-950/30 to-transparent">
      <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 grid place-items-center mb-3">
        <Icon className="w-5 h-5 text-cyan-300" />
      </div>
      <h3 className="text-base font-bold mb-1.5">{title}</h3>
      <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
    </div>
  );
}

function SafetyItem({ Icon, title, children }: { Icon: any; title: string; children: any }) {
  return (
    <li className="card p-3.5 ring-1 ring-bg-border bg-bg-card/40 list-none">
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="text-[12px] text-ink-muted mt-1 leading-relaxed">{children}</div>
        </div>
      </div>
    </li>
  );
}

function NotYetCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg p-3 ring-1 ring-bg-border bg-bg-card/30 text-ink-muted flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="text-[12px]">{label}</span>
      <span className="ml-auto pill ring-1 text-[9px] bg-bg-card ring-bg-border text-ink-dim font-mono uppercase tracking-wider">
        soon
      </span>
    </div>
  );
}

function CTABand({ onStart }: { onStart: () => void }) {
  return (
    <div className="card p-6 ring-1 ring-cyan-500/30 bg-gradient-to-br from-teal-700/20 via-teal-800/15 to-teal-700/15 text-center">
      <h3 className="text-xl sm:text-2xl font-display font-bold mb-2">
        Ready to find the bugs first?
      </h3>
      <p className="text-ink-muted text-sm max-w-xl mx-auto mb-5">
        It's faster to scan and fix than to explain a breach. Paste a curl, type the hostname,
        click Run.
      </p>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                   bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-teal-900/40
                   hover:from-cyan-500 hover:to-teal-500 transition"
      >
        <Shield className="w-4 h-4" /> Start a security scan <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function TechnicalReference() {
  return (
    <details className="card p-5 ring-1 ring-bg-border">
      <summary className="cursor-pointer text-sm font-bold flex items-center gap-2 select-none">
        <BookOpen className="w-4 h-4 text-cyan-300" />
        Technical reference (OWASP API Top 10 mapping, CWE, methodology)
      </summary>
      <div className="mt-4 space-y-4 text-sm text-ink-muted">
        <p>
          Kavach maps each finding to OWASP API Security Top 10 (2023) and a corresponding CWE
          identifier so security teams can integrate with existing risk frameworks. Mapping is
          shown on each finding's <em>Technical reference</em> tab.
        </p>
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
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
        <p className="text-[12px] text-ink-dim">
          Methodology: synchronous probes from a single goroutine pool with a shared token-bucket
          rate limiter. Each test is deterministic — it asserts a specific response shape (header
          present / absent, body marker, status code) — and never relies on machine learning or
          fuzzy matching. False positives, when they happen, are reproducible.
        </p>
      </div>
    </details>
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
