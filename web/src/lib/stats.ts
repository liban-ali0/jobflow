import "server-only";
import { getSettings, listEvents, listJobs } from "./data";
import { STATUS_LABELS, type Job, type JobEvent, type Settings, type Status } from "./types";

const STAGES = ["found", "ranked", "selected", "researched", "ready", "applied", "replied", "interview", "offer"] as const;
type Stage = (typeof STAGES)[number];
const APPLICATION_STATUSES: Status[] = ["applied", "replied", "interview", "offer", "rejected", "no_response"];

export type OutcomeCounts = { applied: number; replied: number; interview: number };
export type Breakdown = OutcomeCounts & { key: string; label: string };
type History = { job: Job; reached: Set<Stage> };

function timestamp(value: string | null) {
  return value ? Date.parse(value) : NaN;
}

// Record both ends of a transition: a later rejection must not erase a reply.
function reachedStages(job: Job, events: JobEvent[]) {
  const reached = new Set<Stage>(["found"]);
  const add = (status: string) => {
    if (STAGES.includes(status as Stage)) reached.add(status as Stage);
    if (APPLICATION_STATUSES.includes(status as Status)) reached.add("applied");
  };
  add(job.status);
  for (const event of events) {
    if (event.type === "status") {
      for (const status of (event.detail ?? "").split("→")) add(status.trim());
    } else {
      add(event.type);
    }
  }
  if (job.applied_at) reached.add("applied");
  if (job.score !== null && Number.isFinite(job.score)) reached.add("ranked");
  // Outcomes imply these earlier outcomes; preparation stages are counted
  // only when recorded, because users can skip steps or apply elsewhere.
  if (reached.has("offer")) reached.add("interview");
  if (reached.has("interview")) reached.add("replied");
  if (reached.has("replied")) reached.add("applied");
  return reached;
}

function counts(rows: History[]): OutcomeCounts {
  return {
    applied: rows.length,
    replied: rows.filter(({ reached }) => reached.has("replied")).length,
    interview: rows.filter(({ reached }) => reached.has("interview")).length,
  };
}

function group(rows: History[], field: "source" | "country" | "role", preferred: { key: string; label: string }[]): Breakdown[] {
  const groups = new Map<string, History[]>();
  for (const row of rows) {
    const key = row.job[field]?.trim() || "";
    const entries = groups.get(key) ?? [];
    entries.push(row);
    groups.set(key, entries);
  }
  const order = new Map(preferred.map((item, index) => [item.key, index]));
  const labels = new Map(preferred.map((item) => [item.key, item.label]));
  return [...groups].map(([key, entries]) => ({ key, label: labels.get(key) ?? (key || "Unknown"), ...counts(entries) }))
    .sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity) || a.label.localeCompare(b.label));
}

// Pure aggregation also allows checking edge cases without opening the database.
export function calculateStats(jobs: Job[], events: ReadonlyMap<number, JobEvent[]>, settings: Settings, now: number) {
  const histories = jobs.map((job) => ({ job, reached: reachedStages(job, events.get(job.id) ?? []) }));
  const applications = histories.filter(({ reached }) => reached.has("applied"));
  const cutoff = now - 30 * 86400000;
  const recent = histories.filter(({ job }) => {
    const found = timestamp(job.found_at);
    return found >= cutoff && found <= now;
  });
  const scores = applications.map(({ job }) => job.score).filter((score): score is number => score !== null && Number.isFinite(score));
  const hours = applications.map(({ job }) => (timestamp(job.applied_at) - timestamp(job.found_at)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0).sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  return {
    ...counts(applications),
    averageScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    scoredApplications: scores.length,
    medianHours: hours.length ? (hours[middle] + hours[Math.floor((hours.length - 1) / 2)]) / 2 : null,
    timedApplications: hours.length,
    funnel: STAGES.map((stage) => ({
      stage, label: stage === "ready" ? "Ready" : STATUS_LABELS[stage],
      all: histories.filter(({ reached }) => reached.has(stage)).length,
      recent: recent.filter(({ reached }) => reached.has(stage)).length,
    })),
    sources: group(applications, "source", settings.sources.map((source) => ({ key: source.key, label: source.name }))),
    countries: group(applications, "country", [...settings.countries].sort((a, b) => a.priority - b.priority).map((country) => ({ key: country.name, label: country.name }))),
    roles: group(applications, "role", [...settings.roles].sort((a, b) => a.priority - b.priority).map((role) => ({ key: role.key, label: role.label }))),
    tracks: [
      { key: "fast", label: "Fast track", ...counts(applications.filter(({ job }) => job.track === "fast")) },
      { key: "standard", label: "Standard", ...counts(applications.filter(({ job }) => job.track === "standard")) },
    ],
  };
}

export function getStats() {
  // The wrapper forwards this option to core.listJobs, whose default is 500.
  const filter: Parameters<typeof listJobs>[0] & { limit: number } = { limit: -1 };
  const jobs = listJobs(filter);
  const events = new Map(jobs.map((job) => [job.id, listEvents(job.id)]));
  return calculateStats(jobs, events, getSettings(), Date.now());
}
