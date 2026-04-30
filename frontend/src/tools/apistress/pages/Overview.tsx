import { motion } from "framer-motion";
import {
  BookOpen, Rocket, Target, Zap, ChartLine, Activity, AlertOctagon,
  CheckCircle2, AlertTriangle, Info, BarChart3, Hash, Clock, Server,
  Database, Globe, FileText, Hammer, TrendingDown, GitCompare, DollarSign,
  Layers, Gauge, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function Overview() {
  return (
    <div className="space-y-10 pb-12">
      <Hero />
      <Mission />
      <FeatureGrid />
      <LoadPatterns />
      <Glossary />
      <PercentileCheatSheet />
      <StatusCodeGuide />
      <HowToReadReport />
      <BestPractices />
      <CallToAction />
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative card p-8 sm:p-10 overflow-hidden ring-1 ring-brand/30"
      style={{
        background: "radial-gradient(800px 300px at 100% 0%, rgba(255,107,53,0.18), transparent 60%), radial-gradient(600px 400px at 0% 100%, rgba(124,29,111,0.18), transparent 60%), rgba(28,31,43,0.7)",
      }}
    >
      {/* Floating orbs */}
      <motion.div
        animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-6 right-8 w-2 h-2 rounded-full bg-brand/60 shadow-lg shadow-brand/50"
      />
      <motion.div
        animate={{ y: [0, 6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-16 right-24 w-1.5 h-1.5 rounded-full bg-cool/60"
      />
      <motion.div
        animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute bottom-10 right-16 w-1 h-1 rounded-full bg-good/60"
      />

      <div className="relative flex items-start gap-5 flex-wrap">
        <motion.div
          animate={{ rotate: [0, 8, -4, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-light to-brand-dark grid place-items-center shrink-0 shadow-2xl shadow-brand/40"
        >
          <BookOpen className="w-8 h-8 text-white" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-[10px] uppercase tracking-[0.24em] text-brand font-bold mb-2"
          >
            ━ Choice Techlab · Internal Tools · For internal use only
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            Welcome to{" "}
            <span className="bg-gradient-to-r from-brand-light via-brand to-brand-dark bg-clip-text text-transparent">
              APIStress
            </span>{" "}
            <motion.span
              animate={{ rotate: [0, 14, -8, 14, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block"
            >
              👋
            </motion.span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="mt-4 text-base sm:text-lg text-ink-muted leading-relaxed max-w-3xl"
          >
            Hit your APIs with simulated traffic and see exactly how they behave. Paste a curl command, set a load
            pattern, click Start — watch real-time charts, plain-English insights, and a polished PDF report appear
            in seconds.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="mt-3 text-sm text-ink-muted"
          >
            This guide explains <b className="text-ink">what every number means</b>,{" "}
            <b className="text-ink">which load pattern to pick</b>, and{" "}
            <b className="text-ink">how to read your reports</b>. No prior load-testing experience needed.
          </motion.p>
        </div>
      </div>
    </motion.section>
  );
}

// ── Why ──────────────────────────────────────────────────────────────────
function Mission() {
  const items = [
    {
      Icon: Target, color: "text-bad", bg: "bg-bad/10",
      title: "The question we answer",
      body: "Will your API hold up when real traffic arrives? You're about to deploy. Half the team is nervous. Run a 30-second test here and you'll know."
    },
    {
      Icon: Rocket, color: "text-brand", bg: "bg-brand/10",
      title: "The way we answer it",
      body: "Spawn N virtual users, fire requests as fast as they can, capture latency in an HDR histogram, then translate the result into plain English: PASSED / DEGRADED / FAILED — with reasons and fixes."
    },
    {
      Icon: CheckCircle2, color: "text-good", bg: "bg-good/10",
      title: "What you walk away with",
      body: "A live dashboard during the test, a beautiful HTML/PDF report you can attach to a Jira ticket, and a verdict the rest of your team can understand without a load-testing PhD."
    },
  ];
  return (
    <section>
      <SectionTitle Icon={Hash} title="What is APIStress?" sub="Three things to remember." />
      <div className="grid md:grid-cols-3 gap-4">
        {items.map((it, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="card p-5 hover:border-brand/30 transition"
          >
            <div className={`w-10 h-10 rounded-xl ${it.bg} grid place-items-center mb-3`}>
              <it.Icon className={`w-5 h-5 ${it.color}`} />
            </div>
            <h3 className="font-bold mb-1.5">{it.title}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{it.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────
function FeatureGrid() {
  const features = [
    { Icon: Zap,         title: "Curl import",            text: "Paste any curl command — we parse method, URL, headers, and body." },
    { Icon: Activity,    title: "Live SSE charts",        text: "Latency, throughput, active VUs, errors update every second." },
    { Icon: ChartLine,   title: "HDR-histogram metrics",  text: "Real p50/p75/p90/p95/p99 — same accuracy as k6 or Gatling." },
    { Icon: AlertOctagon,title: "Plain-English insights", text: "Why it failed, in human words. With recommendations on what to fix." },
    { Icon: FileText,    title: "PDF + HTML reports",     text: "Branded reports with verdict, executive summary, breakdowns." },
    { Icon: GitCompare,  title: "Run comparison",         text: "Pick any two runs, see overlaid charts and per-metric deltas." },
    { Icon: DollarSign,  title: "Cost estimation",        text: "Tag your stack (DB, cache, CDN…) and get a monthly cost projection." },
    { Icon: Layers,      title: "Environment tags",       text: "Production, Broking (pre-prod), UAT — every run is colour-coded." },
    { Icon: Hammer,      title: "CLI for CI",             text: "hammer run --by … --jira … — perfect for your pipeline." },
  ];
  return (
    <section>
      <SectionTitle Icon={Rocket} title="What APIStress can do" sub="Everything that ships in v1." />
      <motion.div
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-30px" }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
      >
        {features.map((f, i) => (
          <motion.div
            key={i}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ duration: 0.25 }}
            className="card p-4 flex items-start gap-3 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/10 group relative overflow-hidden"
          >
            <motion.div className="w-9 h-9 rounded-lg bg-brand/15 grid place-items-center shrink-0 group-hover:bg-brand/25 transition">
              <f.Icon className="w-4 h-4 text-brand" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink">{f.title}</div>
              <div className="text-xs text-ink-muted mt-1 leading-relaxed">{f.text}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ── Load patterns ────────────────────────────────────────────────────────
function LoadPatterns() {
  const patterns = [
    {
      key: "constant",
      title: "Constant",
      pitch: "Hold the same number of users for the whole test.",
      when: "Use when you want to confirm a steady state — e.g. \"can we handle 50 RPS for 5 minutes?\"",
      shape: "▁▁▆▆▆▆▆▆▆▆▁▁",
    },
    {
      key: "ramp",
      title: "Ramp Up",
      pitch: "Linearly grow from 0 → N users.",
      when: "Use when you want to find the breaking point — watch where latency hockey-sticks.",
      shape: "▁▂▃▄▅▆▇█",
    },
    {
      key: "spike",
      title: "Spike",
      pitch: "Warm up, then jump straight to N users, hold, then drop.",
      when: "Use to simulate a viral moment — Black Friday, marketing campaign, deploy storm.",
      shape: "▁▂█████▂▁",
    },
    {
      key: "stages",
      title: "Stages",
      pitch: "Multi-step custom shape: 50 VUs for 1 min → 200 VUs for 2 min → 500 VUs for 30 s.",
      when: "Use to replay a real-world traffic profile from your APM.",
      shape: "▂▂▆▆▆█▂",
    },
  ];
  return (
    <section>
      <SectionTitle Icon={Activity} title="Load patterns explained" sub="Pick the one that matches what you're trying to test." />
      <div className="grid sm:grid-cols-2 gap-3">
        {patterns.map((p, i) => (
          <motion.div
            key={p.key}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-5 hover:border-brand/30 transition"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold">{p.title}</h3>
              <code className="text-2xl text-brand font-mono tracking-tight">{p.shape}</code>
            </div>
            <p className="text-sm text-ink mb-2"><b>{p.pitch}</b></p>
            <p className="text-xs text-ink-muted leading-relaxed">{p.when}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Glossary ─────────────────────────────────────────────────────────────
function Glossary() {
  const terms = [
    { term: "RPS", expand: "Requests Per Second", text: "How many requests your API handled per second on average. The headline throughput number." },
    { term: "VU",  expand: "Virtual User",       text: "One simulated user firing requests in a tight loop. 50 VUs = 50 simultaneous in-flight requests (max)." },
    { term: "Latency", expand: "Response time",  text: "How long a single request took to come back, in milliseconds. Lower is better." },
    { term: "Throughput", expand: "Requests / time", text: "How much work the API got through. Often the same as RPS at steady state." },
    { term: "Mean", expand: "Average",          text: "Total time divided by request count. Hides slow outliers — never trust mean alone." },
    { term: "p50",  expand: "50th percentile (median)", text: "Half of users got a response faster than this number. The typical experience." },
    { term: "p75",  expand: "75th percentile",  text: "75% of users were faster. 25% waited longer." },
    { term: "p95",  expand: "95th percentile",  text: "Industry-standard SLO target. \"p95 < 500 ms\" means most users see a snappy API." },
    { term: "p99",  expand: "99th percentile",  text: "Worst 1%. Usually GC pauses, lock contention, slow downstream calls — your tail latency." },
    { term: "Std Dev", expand: "Standard deviation", text: "How spread out latencies are. Lower = more predictable. High = some users got a great experience, others terrible." },
    { term: "Error Rate", expand: "% of failed requests", text: "Failures ÷ total requests. Targets: <1% great, 1–5% warning, >5% bad." },
    { term: "Verdict",   expand: "Pass / Warn / Fail", text: "Our headline call: did the API meet error and latency targets, or not?" },
  ];
  return (
    <section>
      <SectionTitle Icon={BookOpen} title="Glossary — every term explained" sub="If a number on a report confuses you, look it up here." />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted bg-white/[.02]">
            <tr>
              <th className="text-left px-5 py-2.5 w-24">Term</th>
              <th className="text-left px-3 py-2.5 w-48">Stands for</th>
              <th className="text-left px-5 py-2.5">In plain English</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {terms.map((t, i) => (
              <motion.tr
                key={t.term}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                className="hover:bg-white/[.02]"
              >
                <td className="px-5 py-2.5 font-mono font-bold text-brand">{t.term}</td>
                <td className="px-3 py-2.5 text-ink">{t.expand}</td>
                <td className="px-5 py-2.5 text-ink-muted">{t.text}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Percentile cheat sheet ──────────────────────────────────────────────
function PercentileCheatSheet() {
  const examples = [
    { p50: "120 ms", p95: "180 ms", p99: "240 ms", verdict: "Healthy", tone: "good", note: "Tight spread (p95 ≈ 1.5× p50). Predictable." },
    { p50: "120 ms", p95: "600 ms", p99: "2,400 ms", verdict: "Tail-latency problem", tone: "warn", note: "p99 is 20× p50 — a small population is suffering." },
    { p50: "1,200 ms", p95: "1,400 ms", p99: "1,500 ms", verdict: "Slow but consistent", tone: "warn", note: "Everyone is slow, but predictably so. Fix the bottleneck." },
    { p50: "60 ms", p95: "5,000 ms", p99: "30,000 ms", verdict: "Broken under load", tone: "bad", note: "Bimodal distribution — likely a queue or a deadlock." },
  ];
  return (
    <section>
      <SectionTitle Icon={Gauge} title="How to read percentiles" sub="The single most important skill in load testing." />
      <div className="card p-5 mb-3 border-l-4 border-brand">
        <p className="text-sm leading-relaxed">
          <b>"p95 = 400 ms"</b> means <b className="text-brand">95% of users got a response in 400 ms or less</b>, and 5% waited longer.
          Percentiles reveal real user experience far better than averages, which hide slow outliers.
        </p>
        <p className="text-sm leading-relaxed mt-2 text-ink-muted">
          <b className="text-ink">Industry rule of thumb:</b> if <code className="text-brand">p95 &gt; 3 × p50</code>, you have unpredictable performance.
          Either fix tail latency or add capacity.
        </p>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted bg-white/[.02]">
            <tr>
              <th className="text-left px-5 py-2.5">p50</th>
              <th className="text-left px-3 py-2.5">p95</th>
              <th className="text-left px-3 py-2.5">p99</th>
              <th className="text-left px-3 py-2.5">Verdict</th>
              <th className="text-left px-5 py-2.5">What it tells you</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {examples.map((e, i) => (
              <tr key={i}>
                <td className="px-5 py-2.5 font-mono">{e.p50}</td>
                <td className="px-3 py-2.5 font-mono">{e.p95}</td>
                <td className="px-3 py-2.5 font-mono">{e.p99}</td>
                <td className="px-3 py-2.5">
                  <span className={`pill ring-1 text-[10px] font-bold uppercase tracking-wider
                    ${e.tone === "good" ? "bg-good/15 text-good ring-good/30"
                    : e.tone === "warn" ? "bg-warn/15 text-warn ring-warn/30"
                    : "bg-bad/15 text-bad ring-bad/30"}`}>
                    {e.verdict}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-ink-muted text-xs">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Status codes ────────────────────────────────────────────────────────
function StatusCodeGuide() {
  const codes = [
    { range: "2xx", color: "text-good",  bg: "bg-good/15 ring-good/30",   meaning: "Success.",                 hint: "200 = OK, 201 = Created, 204 = No Content." },
    { range: "3xx", color: "text-cool",  bg: "bg-cool/15 ring-cool/30",   meaning: "Redirect.",                hint: "Usually fine. 301/302 most common." },
    { range: "4xx", color: "text-warn",  bg: "bg-warn/15 ring-warn/30",   meaning: "Client mistake.",          hint: "401 auth, 403 forbidden, 404 wrong URL, 429 rate-limit." },
    { range: "5xx", color: "text-bad",   bg: "bg-bad/15 ring-bad/30",     meaning: "Server failure.",          hint: "500 crash, 502 upstream down, 503 unavailable, 504 timeout." },
    { range: "0",   color: "text-bad",   bg: "bg-bad/15 ring-bad/30",     meaning: "Network failure.",         hint: "Request never reached the server (DNS, refused, TLS, timeout)." },
  ];
  return (
    <section>
      <SectionTitle Icon={Globe} title="Status code guide" sub="What each HTTP code is telling you." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {codes.map((c, i) => (
          <div key={c.range} className="card p-4">
            <div className={`pill ring-1 ${c.bg} font-mono text-base font-bold mb-2`}>{c.range}</div>
            <div className={`font-bold ${c.color}`}>{c.meaning}</div>
            <div className="text-xs text-ink-muted mt-1">{c.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How to read the report ───────────────────────────────────────────────
function HowToReadReport() {
  const steps = [
    {
      Icon: AlertTriangle, color: "text-warn",
      title: "1. Verdict banner first",
      text: "Green = passed all targets. Amber = degraded but recoverable. Red = ship-blocker. Read this and you already know what to do."
    },
    {
      Icon: Hash, color: "text-brand",
      title: "2. Executive summary",
      text: "Plain-English paragraph: how many users, for how long, with what success rate. Designed for managers."
    },
    {
      Icon: BarChart3, color: "text-good",
      title: "3. KPI tiles",
      text: "Total requests, throughput, error rate, p50/p95/p99, peak VUs. The numbers your boss will quote in the standup."
    },
    {
      Icon: Activity, color: "text-cool",
      title: "4. Charts",
      text: "Latency-over-time and throughput-over-time. Look for sudden spikes — that's where things broke."
    },
    {
      Icon: AlertOctagon, color: "text-bad",
      title: "5. Insights & recommendations",
      text: "Each insight tells you a) what we detected b) why it matters c) what to do about it. Read these before the charts if you're in a hurry."
    },
    {
      Icon: Server, color: "text-ink-muted",
      title: "6. Test config + standards",
      text: "Reproducibility — exact parameters used and the SLO targets we judged against (Google SRE, Web Vitals, AWS Well-Architected)."
    },
  ];
  return (
    <section>
      <SectionTitle Icon={FileText} title="How to read your report" sub="In the order your eye should travel." />
      <div className="grid sm:grid-cols-2 gap-3">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="card p-4 flex gap-3"
          >
            <s.Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.color}`} />
            <div>
              <div className="font-bold text-sm">{s.title}</div>
              <div className="text-xs text-ink-muted mt-1 leading-relaxed">{s.text}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Best practices ──────────────────────────────────────────────────────
function BestPractices() {
  const tips = [
    { Icon: Clock,  text: "Run for at least 30 seconds — shorter tests don't fill the HDR histogram." },
    { Icon: Target, text: "Test against staging that mirrors production — testing against dev gives meaningless numbers." },
    { Icon: TrendingDown, text: "Always compare with a baseline. The same test run yesterday is gold." },
    { Icon: Database,    text: "Tag your stack in the cost panel — DB, cache, queue. The cost projection becomes useful only with components declared." },
    { Icon: AlertOctagon, text: "If error rate jumps mid-test, stop and read the 'Why requests failed' panel. Don't ignore it." },
    { Icon: Info,    text: "Always attribute the run (your name + Jira). The report goes in tickets — anonymous reports get ignored." },
  ];
  return (
    <section>
      <SectionTitle Icon={CheckCircle2} title="Tips & best practices" sub="Small habits that make load testing actually useful." />
      <div className="grid sm:grid-cols-2 gap-3">
        {tips.map((t, i) => (
          <div key={i} className="card p-3 flex items-start gap-3">
            <t.Icon className="w-4 h-4 text-good shrink-0 mt-0.5" />
            <span className="text-sm text-ink-muted leading-relaxed">{t.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA ─────────────────────────────────────────────────────────────────
function CallToAction() {
  return (
    <section className="card p-8 ring-1 ring-brand/30 bg-gradient-to-br from-brand/[.05] via-transparent to-transparent text-center">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Ready to hammer something?</h2>
      <p className="text-ink-muted mt-2">It takes 60 seconds. Curl import → click Start → watch the chart fill in.</p>
      <div className="mt-6 flex justify-center gap-3 flex-wrap">
        <Link to="/builder" className="btn-primary"><Hammer className="w-4 h-4" />Start a new test</Link>
        <Link to="/history" className="btn-secondary">Browse history <ArrowRight className="w-4 h-4" /></Link>
      </div>
      <div className="mt-6 text-xs text-ink-dim">
        Crafted with ❤️ by{" "}
        <a href="https://github.com/gauravpatil97886" target="_blank" rel="noopener" className="text-brand hover:underline">
          Gaurav Patil
        </a>{" "} · Choice Techlab · Internal use only
      </div>
    </section>
  );
}

// ── shared ──────────────────────────────────────────────────────────────
function SectionTitle({ Icon, title, sub }: { Icon: any; title: string; sub: string }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className="mb-4 flex items-end justify-between gap-3 flex-wrap"
    >
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-brand/15 grid place-items-center">
            <Icon className="w-4 h-4 text-brand" />
          </span>
          {title}
        </h2>
        <p className="text-sm text-ink-muted mt-1 ml-11">{sub}</p>
      </div>
    </motion.header>
  );
}
