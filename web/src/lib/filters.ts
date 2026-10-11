import type { Job } from "./types";

// Extra filters for the departures board, read from the address. Shared by
// the Today page (which filters) and the filter bar (which edits them).

export const AGE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last hour" },
  { value: "6", label: "Last 6 hours" },
  { value: "12", label: "Last 12 hours" },
];

export const SCORE_OPTIONS = [
  { value: "", label: "Any score" },
  { value: "50", label: "50 and up" },
  { value: "65", label: "65 and up" },
  { value: "75", label: "75 and up" },
];

export const MODE_OPTIONS = [
  { value: "", label: "Any work mode" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export const LIMIT_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_LIMIT = 10;

// Address parameters that narrow the list. Changing any of them goes back to
// the first page.
export const FILTER_KEYS = ["q", "age", "min", "mode"] as const;

export type ExtraFilters = { q?: string; age?: string; min?: string; mode?: string };

const allowed = (value: string | undefined, options: { value: string }[]) =>
  value && options.some((option) => option.value === value) ? value : undefined;

export function readFilters(pick: (key: string) => string | undefined): ExtraFilters {
  return {
    q: pick("q")?.trim().slice(0, 80) || undefined,
    age: allowed(pick("age"), AGE_OPTIONS),
    min: allowed(pick("min"), SCORE_OPTIONS),
    mode: allowed(pick("mode"), MODE_OPTIONS),
  };
}

export function readLimit(value: string | undefined) {
  const limit = Number(value);
  return LIMIT_OPTIONS.includes(limit) ? limit : DEFAULT_LIMIT;
}

export function applyFilters(jobs: Job[], filters: ExtraFilters) {
  const text = filters.q?.toLowerCase();
  const oldest = filters.age ? Date.now() - Number(filters.age) * 3600000 : null;
  const min = filters.min ? Number(filters.min) : null;
  return jobs.filter(
    (job) =>
      (!text || job.title.toLowerCase().includes(text) || job.company.toLowerCase().includes(text)) &&
      (oldest === null || (job.posted_at !== null && Date.parse(job.posted_at) >= oldest)) &&
      (min === null || (job.score !== null && job.score >= min)) &&
      (!filters.mode || job.work_mode === filters.mode),
  );
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * limit;
  return { rows: items.slice(start, start + limit), page: current, pages, start, total: items.length };
}
