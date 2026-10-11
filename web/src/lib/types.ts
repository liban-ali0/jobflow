export type Status =
  | "found"
  | "ranked"
  | "selected"
  | "researched"
  | "ready"
  | "applied"
  | "replied"
  | "interview"
  | "offer"
  | "rejected"
  | "no_response"
  | "excluded";

export type Job = {
  id: number;
  title: string;
  company: string;
  country: string | null;
  city: string | null;
  work_mode: string | null;
  role: string | null;
  source: string | null;
  url: string | null;
  language: string | null;
  description: string | null;
  posted_at: string | null;
  found_at: string;
  track: string;
  score: number | null;
  score_reason: string | null;
  score_breakdown: Record<string, number> | null;
  legitimacy: string | null;
  salary_estimate: string | null;
  status: Status;
  excluded_reason: string | null;
  folder: string | null;
  notes: string | null;
  applied_at: string | null;
  follow_up_due: string | null;
  updated_at: string;
};

export type Contact = {
  id: number;
  job_id: number;
  name: string;
  role: string | null;
  email: string | null;
  email_verified: number;
  linkedin: string | null;
  notes: string | null;
};

export type JobDocument = {
  id: number;
  job_id: number;
  type: string;
  path: string;
  review: "draft" | "approved" | "changes_requested";
  review_note: string | null;
  updated_at: string;
};

export type JobEvent = { id: number; job_id: number; at: string; type: string; detail: string | null };

export type Run = {
  id: number;
  stage: string;
  job_id: number | null;
  trigger: string;
  engine: string | null;
  progress: string | null;
  conversation_id: number | null;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  log: string | null;
};

export type Conversation = {
  id: number;
  title: string;
  engine: "claude" | "codex";
  model: string | null;
  effort: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "error";
  text: string;
  run_id: number | null;
  at: string;
};

export type Question = {
  id: number;
  text: string;
  why: string | null;
  options: string[] | null;
  job_id: number | null;
  source: string | null;
  status: "open" | "answered" | "dismissed";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export type ProgressLine ={ at: string; text: string };

export type EngineChoice ={ engine: "claude" | "codex"; model: string; effort: string };

export type Settings = {
  appearance: { mode: "system" | "light" | "dark"; primary: string; secondary: string };
  engines: Record<string, EngineChoice>;
  customRules: string;
  dailyCap: number;
  followUpDays: number;
  countries: { name: string; priority: number; cities: string[] }[];
  roles: { key: string; label: string; priority: number; keywords: string[] }[];
  freshness: { maxHours: number; fastTrackMinutes: number };
  experience: { maxYears: number; titles: string[] };
  workModes: string[];
  searchLanguages: string[];
  exclusions: { nationalsOnly: boolean; transferableIqamaRequired: boolean; payToApply: boolean };
  sources: { key: string; name: string; enabled: boolean; method: string }[];
  schedule: { enabled: boolean; fastTrackEveryMinutes: number; dailyRunAt: string };
  email: { sendingEnabled: boolean };
  // The last engine check from the Setup screen.
  setupCheck?: { engine: string; ok: boolean; message: string; at: string };
};

export const STATUS_LABELS: Record<Status, string> = {
  found: "Found",
  ranked: "Ranked",
  selected: "Selected",
  researched: "Researched",
  ready: "Ready to apply",
  applied: "Applied",
  replied: "Replied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  no_response: "No response",
  excluded: "Excluded",
};

export const DOCUMENT_LABELS: Record<string, string> = {
  cv: "CV",
  cover_letter: "Cover letter",
  email: "Outreach email",
  answers: "Form answers",
  research: "Research",
  interview_pack: "Interview pack",
};
