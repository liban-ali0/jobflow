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
  // Applying through the extension: "waiting" while the user finishes the
  // form, with what the extension could not fill.
  apply_state: "waiting" | null;
  apply_missing: string[] | null;
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
  category: "you" | "cv" | "job" | null;
  status: "open" | "answered" | "dismissed";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export type ProgressLine ={ at: string; text: string };

export type EngineChoice ={ engine: "claude" | "codex"; model: string; effort: string };

export type ResearchPoint = "company" | "job" | "people" | "salary" | "sponsorship";

export const RESEARCH_POINTS: { key: ResearchPoint; label: string; hint: string }[] = [
  { key: "company", label: "Company brief", hint: "What they do, size, ownership, stack, recent news, culture" },
  { key: "job", label: "Job analysis", hint: "Real requirements, ATS keywords, fit against your profile" },
  { key: "people", label: "People to contact", hint: "Hiring manager, team lead, or recruiter from public pages" },
  { key: "salary", label: "Salary estimate", hint: "Market range for the role, level, and city" },
  { key: "sponsorship", label: "Visa sponsorship check", hint: "Only for countries where you need sponsorship" },
];

export type Settings = {
  appearance: { mode: "system" | "light" | "dark"; primary: string; secondary: string };
  engines: Record<string, EngineChoice>;
  customRules: string;
  dailyCap: number;
  followUpDays: number;
  // code: ISO country code from the picker; name is what jobs are stored under.
  // sponsorship: false when the user can already work there (missing means true).
  countries: { code?: string; name: string; priority: number; cities: string[]; sponsorship?: boolean }[];
  roles: { key: string; label: string; priority: number; keywords: string[] }[];
  freshness: { maxHours: number; fastTrackMinutes: number };
  // levels: keys of EXPERIENCE_LEVELS in core/db.mjs. maxYears null means no limit.
  experience: { levels: string[]; maxYears: number | null; skipTitles: string[] };
  workModes: string[];
  searchLanguages: string[];
  exclusions: { nationalsOnly: boolean; transferableIqamaRequired: boolean; payToApply: boolean };
  sources: { key: string; name: string; enabled: boolean; method: string }[];
  // activeFrom/activeTo: the hours fast-track checks run (HH:MM, local time).
  schedule: { enabled: boolean; fastTrackEveryMinutes: number; dailyRunAt: string; activeFrom?: string; activeTo?: string };
  email: { sendingEnabled: boolean };
  // What the research step covers, extra points to research, and free-text rules.
  research: { points: Record<ResearchPoint, boolean>; extraPoints: string[]; rules: string };
  // CV and cover letter templates: the default, and choices per role key.
  // The key the Offerbound browser extension sends with each page.
  captureToken?: string;
  cvTemplates?: { default: string; byRole: Record<string, string>; byJob?: Record<string, string> };
  // Base CVs (by role key) the user edited; rebuilding the profile leaves them alone.
  cvLocked?: string[];
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
  follow_up: "Follow-up email",
  interview_pack: "Interview pack",
};
