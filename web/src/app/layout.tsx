import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigationTracker } from "@/components/back-link";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Nav } from "@/components/nav";
import { WorkflowStrip, type WorkflowStep } from "@/components/workflow-strip";
import { countByStatus, countFoundWithin, getSettings, listQuestions, listRunningRuns } from "@/lib/data";
import { STAGES, isStage } from "@/lib/engine";
import { DEFAULT_APPEARANCE, themeCss } from "@/lib/theme";
import "./globals.css";

const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-plex-arabic", subsets: ["arabic"], weight: ["400", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Offerbound",
  description: "Find, rank, research, and track job applications",
};

// Every screen reads the local database, so nothing is prerendered.
export const dynamic = "force-dynamic";

const RUNNING_LABELS: Record<string, string> = {
  "find-jobs": "Searching…",
  "browse-jobs": "Searching in Chrome…",
  "import-jobs": "Importing jobs…",
  "apply-job": "Filling an application…",
  "interview-pack": "Writing the interview pack…",
  "rank-jobs": "Ranking…",
  "build-profile": "Rebuilding profile…",
  "research-job": "Researching…",
  "tailor-job": "Tailoring…",
  assistant: "Assistant working…",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const counts = countByStatus();
  const settings = getSettings();
  const questions = listQuestions("open").length;
  const foundToday = countFoundWithin(settings.freshness.maxHours);
  const runningRuns = listRunningRuns();
  const running = runningRuns.length
    ? `${RUNNING_LABELS[runningRuns[0].stage] ?? (isStage(runningRuns[0].stage) ? STAGES[runningRuns[0].stage].label : "Working…")}${
        runningRuns.length > 1 ? ` +${runningRuns.length - 1}` : ""
      }`
    : null;

  const inResearch = counts.researched + counts.ready;
  const applied = counts.applied + counts.replied + counts.interview + counts.offer;
  const steps: WorkflowStep[] = [
    {
      key: "find",
      label: "Found",
      value: String(foundToday),
      hint: `Everything found in the last ${settings.freshness.maxHours} hours, including excluded jobs`,
      path: "/",
      show: "all",
      section: "departures",
      pending: foundToday === 0,
    },
    {
      key: "rank",
      label: "To rank",
      value: String(counts.found),
      hint: "Found but not checked yet",
      path: "/",
      show: "unranked",
      section: "departures",
      pending: counts.found > 0,
    },
    {
      key: "pick",
      label: "Ranked",
      value: String(counts.ranked),
      hint: "Ranked and waiting for your pick",
      path: "/",
      show: "ranked",
      section: "departures",
      pending: false,
    },
    {
      key: "select",
      label: "Selected",
      value: `${counts.selected}/${settings.dailyCap}`,
      hint: "Picked for full research",
      path: "/",
      section: "selected",
      pending: counts.selected < settings.dailyCap && counts.ranked > 0,
    },
    {
      key: "research",
      label: "Researched",
      value: String(inResearch),
      hint: "Research done, documents in progress",
      path: "/board",
      section: "researched",
      pending: counts.selected > 0,
    },
    {
      key: "apply",
      label: "Applied",
      value: String(applied),
      hint: "Applications sent and their replies",
      path: "/board",
      section: "applications",
      pending: counts.ready > 0,
    },
  ];

  const appearance = { ...DEFAULT_APPEARANCE, ...settings.appearance };

  return (
    <html
      lang="en"
      data-theme={appearance.mode}
      className={`${barlow.variable} ${plex.variable} ${plexArabic.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Brand colours from Settings, with readable text colours worked out
            for light and dark mode. */}
        <style>{themeCss(appearance)}</style>
      </head>
      <body className="min-h-full">
        <div className="sticky top-0 z-30">
          <Nav
            counts={{ "/": counts.found + counts.ranked, "/questions": questions, "/board": counts.selected + inResearch }}
            running={running}
          />
          {/* The strip reads the "show" filter from the address. */}
          <Suspense fallback={null}>
            <NavigationTracker />
          </Suspense>
          <Suspense fallback={<div className="h-[42px] border-b border-chrome-line bg-chrome" />}>
            <WorkflowStrip steps={steps} />
          </Suspense>
        </div>
        <main className="px-4 py-8 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
