export type Importance = "critical" | "high" | "meaningful" | "preferred";
export type Requirement = { requirement: string; importance: Importance; basis: "stated" | "structural" | "inferred"; match: "strong" | "partial" | "missing" | "na"; quote: string | null; evidence: string | null };
export type JobReport = {
  verdict: { call: "apply" | "consider" | "research_first" | "skip"; reason: string };
  summary: string;
  role: { level: string; function: string; work_mode: string; team: string };
  requirements: Requirement[];
  gaps: { requirement: string; blocker: boolean; risk: string; mitigation: string }[];
  level: { asked: string; yours: string; pitch: string; if_lower: string };
  pay: { range: string; ask: string; basis: string; reliability: "high" | "medium" | "low" };
  legitimacy: { tier: "high" | "caution" | "suspicious"; signals: { signal: string; finding: string; weight: "positive" | "neutral" | "concerning" }[] };
  cv_changes: { section: string; change: string; why: string }[];
  questions: string[];
  saved_at?: string;
};
export const IMPORTANCE: Importance[];
export function normalizeReport(raw: unknown): { report: JobReport | null; problems: string[]; fixed: string[] };
export function matchFigure(report: JobReport | null): { percent: number; decisive: { met: number; partial: number; missing: number; total: number }; rows: number } | null;
export function orderedRequirements(report: JobReport | null): Requirement[];
