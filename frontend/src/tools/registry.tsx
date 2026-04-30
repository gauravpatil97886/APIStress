// Tool registry — single source of truth for the tools that live inside
// the Choice Techlab dashboard. Adding a new tool = adding one entry here
// (plus the page component itself + a string in the backend slug list).
//
// What reads from this:
//   - App.tsx              → mounts standalone tool routes
//   - AppShell.tsx         → quick-jump buttons + tools_access gating
//   - ModePicker.tsx       → tool cards
//   - Login.tsx            → default landing route after sign-in
//   - Admin.tsx            → tool toggles when creating / editing teams
//   - PostWomen.tsx, etc.  → cross-tool nav buttons (e.g. "Switch to APIStress")
//
// APIStress is a "shell" tool — it owns the AppShell sidebar plus many sub-
// routes (Dashboard, Runs, Reports, …) — so its routePath is "/" but the
// individual pages still mount inside <AppShell> in App.tsx. Standalone
// tools (PostWomen, Crosswalk) get their own full-screen layouts.

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Hammer, Send, FileSpreadsheet, Shield } from "lucide-react";

import PostWomen from "../pages/postwomen/PostWomen";
import Crosswalk from "../pages/crosswalk/Crosswalk";
import Kavach from "../pages/kavach/Kavach";

export type ToolAccent = "brand" | "sky" | "green" | "violet" | "cyan";

export type ToolDef = {
  slug: string;             // canonical id, also persisted in tools_access
  label: string;            // marketing name
  tagline: string;          // 1-line product blurb (always visible)
  chip: string;             // 2-letter chip shown in team cards (AS / PW / CW)
  accent: ToolAccent;       // theme key — components map to tailwind classes
  routePath: string;        // primary route entry-point
  shell: "appshell" | "standalone";
  Icon: LucideIcon;
  Page?: ComponentType<any>; // standalone tools only
  // Optional richer marketing copy used by the ModePicker grid. Adding a
  // new tool fills these in once and the picker page auto-renders its card.
  description?: string;     // 2-3 sentence longer blurb (shown on hover/expand)
  highlights?: string[];    // short bullet labels, max 4 (e.g. "PDF reports")
  cta?: string;             // CTA label; defaults to "Open <label>"
};

export const TOOLS: ToolDef[] = [
  {
    slug: "apistress",
    label: "APIStress",
    tagline: "Hit your APIs hard",
    chip: "AS",
    accent: "brand",
    routePath: "/",
    shell: "appshell",
    Icon: Hammer,
    description: "Real load tests with virtual users, live charts, plain-English insights, PDF reports, and run comparison.",
    highlights: ["Live charts", "Comparison", "PDF reports"],
    cta: "Start a load test",
  },
  {
    slug: "postwomen",
    label: "PostWomen",
    tagline: "Try your APIs nicely",
    chip: "PW",
    accent: "sky",
    routePath: "/postwomen",
    shell: "standalone",
    Icon: Send,
    Page: PostWomen,
    description: "A clean, fast API client — collections, environments, curl import/export, Postman-compatible.",
    highlights: ["Send & inspect", "Collections", "Postman import"],
    cta: "Open the client",
  },
  {
    slug: "crosswalk",
    label: "Crosswalk",
    tagline: "VLOOKUP without the formula",
    chip: "CW",
    accent: "green",
    routePath: "/crosswalk",
    shell: "standalone",
    Icon: FileSpreadsheet,
    Page: Crosswalk,
    description: "Upload two sheets, pick a join column, splice columns from one into the other. Streams CSV at gigabyte scale.",
    highlights: ["VLOOKUP joins", "10 GB CSVs", "Excel-ready"],
    cta: "Open Crosswalk",
  },
  {
    slug: "kavach",
    label: "Kavach",
    tagline: "Find the bugs attackers look for",
    chip: "KV",
    accent: "cyan",
    routePath: "/kavach",
    shell: "standalone",
    Icon: Shield,
    Page: Kavach,
    description: "Paste any API request and Kavach runs the same probes a hostile attacker would, then explains in plain English what to fix.",
    highlights: ["API VAPT", "Plain-English fixes", "Pro PDF report"],
    cta: "Open Kavach",
  },
];

export const ALL_SLUGS = TOOLS.map(t => t.slug);
export const TOOL_BY_SLUG: Record<string, ToolDef> = Object.fromEntries(TOOLS.map(t => [t.slug, t]));

// Tailwind-friendly theme atoms per accent. Components import `themeFor(accent)`
// rather than hard-coding orange / sky / green.
export function themeFor(accent: ToolAccent) {
  switch (accent) {
    case "brand":
      return {
        text: "text-brand",
        ring: "ring-brand/30",
        ringHover: "hover:ring-brand/60",
        bg: "bg-brand/10",
        bgSoft: "bg-brand/[.06]",
        chipText: "text-brand",
        chipRing: "ring-brand/30",
        chipBg: "bg-brand/15",
        gradient: "from-brand-light via-brand to-brand-dark",
      };
    case "sky":
      return {
        text: "text-sky-400",
        ring: "ring-sky-500/30",
        ringHover: "hover:ring-sky-500/60",
        bg: "bg-sky-500/10",
        bgSoft: "bg-sky-500/[.06]",
        chipText: "text-sky-400",
        chipRing: "ring-sky-500/30",
        chipBg: "bg-sky-500/15",
        gradient: "from-sky-300 via-sky-500 to-sky-700",
      };
    case "green":
      // Microsoft Excel ribbon green — calibrated to feel like a real spreadsheet.
      return {
        text: "text-emerald-400",
        ring: "ring-emerald-500/30",
        ringHover: "hover:ring-emerald-500/60",
        bg: "bg-emerald-500/10",
        bgSoft: "bg-emerald-500/[.06]",
        chipText: "text-emerald-400",
        chipRing: "ring-emerald-500/30",
        chipBg: "bg-emerald-500/15",
        gradient: "from-emerald-300 via-emerald-500 to-emerald-700",
      };
    case "violet":
      // Reserved accent — kept registered in case a future tool wants it.
      return {
        text: "text-violet-300",
        ring: "ring-violet-500/30",
        ringHover: "hover:ring-violet-500/60",
        bg: "bg-violet-500/10",
        bgSoft: "bg-violet-500/[.06]",
        chipText: "text-violet-300",
        chipRing: "ring-violet-500/30",
        chipBg: "bg-violet-500/15",
        gradient: "from-violet-400 via-violet-600 to-fuchsia-700",
      };
    case "cyan":
      // Kavach — cyan-to-teal scanner palette. Reads as technical /
      // pentest-tool, distinct from APIStress orange / PostWomen sky /
      // Crosswalk emerald, doesn't fight severity colours.
      return {
        text: "text-cyan-300",
        ring: "ring-cyan-500/30",
        ringHover: "hover:ring-cyan-500/60",
        bg: "bg-cyan-500/10",
        bgSoft: "bg-cyan-500/[.06]",
        chipText: "text-cyan-300",
        chipRing: "ring-cyan-500/30",
        chipBg: "bg-cyan-500/15",
        gradient: "from-cyan-300 via-teal-500 to-cyan-700",
      };
  }
}

export function enabledTools(toolsAccess: string[] | undefined): ToolDef[] {
  const allowed = toolsAccess || ALL_SLUGS;
  return TOOLS.filter(t => allowed.includes(t.slug));
}

// Pick a sensible landing route for a team based on its tools_access. Used by
// Login (with an optional sticky last-used hint) and by AppShell when a team
// loses access to APIStress mid-session.
export function defaultLandingFor(
  toolsAccess: string[] | undefined,
  lastUsedSlug?: string | null,
): string {
  const enabled = enabledTools(toolsAccess);
  if (enabled.length === 0) return "/login";
  if (lastUsedSlug) {
    const sticky = enabled.find(t => t.slug === lastUsedSlug);
    if (sticky) return sticky.routePath;
  }
  if (enabled.length === 1) return enabled[0].routePath;
  return "/mode";
}
