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
import { Hammer, Send, FileSpreadsheet } from "lucide-react";

import PostWomen from "../pages/postwomen/PostWomen";
import Crosswalk from "../pages/crosswalk/Crosswalk";

export type ToolAccent = "brand" | "sky" | "green";

export type ToolDef = {
  slug: string;             // canonical id, also persisted in tools_access
  label: string;            // marketing name
  tagline: string;          // 1-line product blurb
  chip: string;             // 2-letter chip shown in team cards (AS / PW / CW)
  accent: ToolAccent;       // theme key — components map to tailwind classes
  routePath: string;        // primary route entry-point
  shell: "appshell" | "standalone";
  Icon: LucideIcon;
  Page?: ComponentType<any>; // standalone tools only
};

export const TOOLS: ToolDef[] = [
  {
    slug: "apistress",
    label: "APIStress",
    tagline: "Load testing",
    chip: "AS",
    accent: "brand",
    routePath: "/",
    shell: "appshell",
    Icon: Hammer,
  },
  {
    slug: "postwomen",
    label: "PostWomen",
    tagline: "API client",
    chip: "PW",
    accent: "sky",
    routePath: "/postwomen",
    shell: "standalone",
    Icon: Send,
    Page: PostWomen,
  },
  {
    slug: "crosswalk",
    label: "Crosswalk",
    tagline: "Excel data joiner",
    chip: "CW",
    accent: "green",
    routePath: "/crosswalk",
    shell: "standalone",
    Icon: FileSpreadsheet,
    Page: Crosswalk,
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
