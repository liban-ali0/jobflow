import type { Job, Status } from "./types";

// The Board's applications table: every job sent (and the ones closed or
// excluded), filtered, sorted, grouped by a period or a field, and paged.
// The state lives in the URL, like Today's.

export const STAGES = [
  { value: "all", label: "All applications", statuses: ["applied", "replied", "interview", "offer", "accepted", "declined", "rejected", "withdrawn", "no_response"] },
  { value: "waiting", label: "Waiting for a reply", statuses: ["applied"] },
  { value: "stale", label: "No reply for 30+ days", statuses: ["applied"] },
  { value: "replied", label: "Replied", statuses: ["replied"] },
  { value: "interview", label: "Interview", statuses: ["interview"] },
  { value: "offer", label: "Offers (open, accepted, declined)", statuses: ["offer", "accepted", "declined"] },
  { value: "closed", label: "Closed (rejected, withdrawn, no response)", statuses: ["rejected", "withdrawn", "no_response"] },
  { value: "excluded", label: "Excluded (never applied)", statuses: ["excluded"] },
] as const satisfies readonly { value: string; label: string; statuses: readonly Status[] }[];

export const PERIODS = [
  { value: "all", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 3 months" },
  { value: "365d", label: "Last 12 months" },
] as const;

export const GROUPS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "year", label: "Year" },
  { value: "country", label: "Country" },
  { value: "stage", label: "Stage" },
  { value: "none", label: "No grouping" },
] as const;

export const SORTS = [
  { value: "date", label: "Date" },
  { value: "company", label: "Company" },
  { value: "country", label: "Country" },
  { value: "stage", label: "Stage" },
] as const;

// The sort menu: each order with its direction, as "key:dir".
export const ORDERS = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "company:asc", label: "Company A–Z" },
  { value: "company:desc", label: "Company Z–A" },
  { value: "country:asc", label: "Country A–Z" },
  { value: "stage:asc", label: "Furthest stage first" },
] as const;

export const PAGE_SIZE = 50;
// Every job that ever reached the applications table.
export const TABLE_STATUSES: Status[] = ["applied", "replied", "interview", "offer", "accepted", "declined", "rejected", "withdrawn", "no_response", "excluded"];

export type AppQuery = {
  stage: (typeof STAGES)[number]["value"];
  period: string; // a PERIODS value or a year, "2026"
  group: (typeof GROUPS)[number]["value"];
  sort: (typeof SORTS)[number]["value"];
  dir: "asc" | "desc";
  country: string;
  role: string;
  q: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

export function parseQuery(params: Params): AppQuery {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const within = <T extends string>(value: string, options: readonly { value: T }[], fallback: T) => options.find((option) => option.value === value)?.value ?? fallback;
  const period = /^\d{4}$/.test(one("period")) ? one("period") : within(one("period"), PERIODS, "all");
  return {
    stage: within(one("stage"), STAGES, "all"),
    period,
    group: within(one("group"), GROUPS, "month"),
    // "sort=date:asc" from the menu, or sort and dir apart in links.
    sort: within(one("sort").split(":")[0], SORTS, "date"),
    dir: (one("sort").split(":")[1] ?? one("dir")) === "asc" ? "asc" : "desc",
    country: one("country").slice(0, 80),
    role: one("role").slice(0, 80),
    q: one("q").trim().slice(0, 120),
    page: Math.max(1, Math.floor(Number(one("page")) || 1)),
  };
}

const DEFAULTS: AppQuery = { stage: "all", period: "all", group: "month", sort: "date", dir: "desc", country: "", role: "", q: "", page: 1 };

// A link to the table with some choices changed; any change but the page goes
// back to page 1. Defaults are left out of the URL.
export function queryHref(query: AppQuery, change: Partial<AppQuery>) {
  const next = { ...query, ...change, page: change.page ?? 1 };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value !== "" && value !== DEFAULTS[key as keyof AppQuery]) params.set(key, String(value));
  }
  return `/board${params.size ? `?${params}` : ""}#applications`;
}

// The date an application is filed under: when it was sent, else when it
// last changed (excluded jobs were never sent).
export const dateOf = (job: Job) => job.applied_at ?? job.updated_at;

const DAY = 86400000;

function inPeriod(job: Job, period: string, now: number) {
  if (period === "all") return true;
  const at = Date.parse(dateOf(job));
  if (/^\d{4}$/.test(period)) return new Date(at).getFullYear() === Number(period);
  const days = Number(period.replace("d", ""));
  return now - at <= days * DAY;
}

const fold = (text: string) => text.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Monday of the date's week, as a local date.
function weekStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const STAGE_ORDER: Status[] = ["accepted", "offer", "declined", "interview", "replied", "applied", "withdrawn", "no_response", "rejected", "excluded"];
const STAGE_LABEL: Partial<Record<Status, string>> = {
  applied: "Waiting for a reply",
  replied: "Replied",
  interview: "Interview",
  offer: "Offer",
  accepted: "Offer accepted",
  declined: "Offer declined",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  no_response: "No response",
  excluded: "Excluded",
};

// The group a job belongs to: a sortable key and a label.
function groupOf(job: Job, group: AppQuery["group"], now: number, countryOrder: string[]): { key: string; label: string } {
  const date = new Date(dateOf(job));
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  switch (group) {
    case "day":
      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }),
      };
    case "week": {
      const start = weekStart(date);
      const end = new Date(start.getTime() + 6 * DAY);
      const format = (day: Date) => day.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return { key: start.toISOString().slice(0, 10), label: `Week of ${format(start)} – ${format(end)}${start.getFullYear() === new Date(now).getFullYear() ? "" : ` ${start.getFullYear()}`}` };
    }
    case "month":
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
    case "year":
      return { key: String(date.getFullYear()), label: String(date.getFullYear()) };
    case "country":
    {
      // Your countries in priority order, then any others A–Z, unknown last.
      const rank = job.country ? countryOrder.indexOf(job.country) : -1;
      return { key: job.country ? `${String(rank < 0 ? 999 : rank).padStart(3, "0")}${job.country}` : "~", label: job.country ?? "Country unknown" };
    }
    case "stage": {
      const index = STAGE_ORDER.indexOf(job.status);
      return { key: String(index).padStart(2, "0"), label: STAGE_LABEL[job.status] ?? job.status };
    }
    default:
      return { key: "", label: "" };
  }
}

export type AppGroup = { key: string; label: string; jobs: Job[]; total: number; replies: number; interviews: number };

// Heard back: any answer from the employer, including a rejection.
const HEARD_BACK: Status[] = ["replied", "interview", "offer", "accepted", "declined", "rejected"];
const INTERVIEWED: Status[] = ["interview", "offer", "accepted", "declined"];

export function applicationsTable(all: Job[], query: AppQuery, now: number, countryOrder: string[] = []) {
  const stage = STAGES.find((item) => item.value === query.stage)!;
  const statuses = stage.statuses as readonly Status[];
  // "No reply for 30+ days": sent a month ago or more, still waiting.
  const stale = (job: Job) => query.stage !== "stale" || now - Date.parse(dateOf(job)) >= 30 * DAY;
  const inStage = all.filter((job) => statuses.includes(job.status) && stale(job));
  // Choices for the filters, from the jobs of this stage.
  const tally = (pick: (job: Job) => string | null) => {
    const counts = new Map<string, number>();
    for (const job of inStage) {
      const value = pick(job);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  };
  const facets = {
    countries: tally((job) => job.country),
    roles: tally((job) => job.role),
    years: [...new Set(inStage.map((job) => new Date(dateOf(job)).getFullYear()))].sort((a, b) => b - a),
  };

  const words = fold(query.q).split(/\s+/).filter(Boolean);
  const rows = inStage.filter(
    (job) =>
      inPeriod(job, query.period, now) &&
      (!query.country || job.country === query.country) &&
      (!query.role || job.role === query.role) &&
      (!words.length || words.every((word) => fold(`${job.title} ${job.company} ${job.city ?? ""} ${job.country ?? ""}`).includes(word))),
  );

  const sign = query.dir === "asc" ? 1 : -1;
  const text = (a: string | null, b: string | null) => (a ?? "~").localeCompare(b ?? "~", "en", { sensitivity: "base" });
  const byDate = (a: Job, b: Job) => Date.parse(dateOf(a)) - Date.parse(dateOf(b));
  const compare: Record<AppQuery["sort"], (a: Job, b: Job) => number> = {
    date: byDate,
    company: (a, b) => text(a.company, b.company),
    country: (a, b) => text(a.country, b.country),
    stage: (a, b) => STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status),
  };
  // Groups first (periods newest first, or oldest first when sorting by date
  // that way; countries and stages in their own order), then the order inside.
  const groupSign = ["country", "stage"].includes(query.group) ? 1 : query.sort === "date" && query.dir === "asc" ? 1 : -1;
  const keyed = rows.map((job) => ({ job, group: groupOf(job, query.group, now, countryOrder) }));
  keyed.sort((a, b) => groupSign * a.group.key.localeCompare(b.group.key) || sign * compare[query.sort](a.job, b.job) || -byDate(a.job, b.job));

  // Totals per group across all pages, so a group cut by paging still shows its size.
  const totals = new Map<string, { total: number; replies: number; interviews: number }>();
  for (const { job, group } of keyed) {
    const entry = totals.get(group.key) ?? { total: 0, replies: 0, interviews: 0 };
    entry.total += 1;
    if (HEARD_BACK.includes(job.status)) entry.replies += 1;
    if (INTERVIEWED.includes(job.status)) entry.interviews += 1;
    totals.set(group.key, entry);
  }

  const pages = Math.max(1, Math.ceil(keyed.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const start = (page - 1) * PAGE_SIZE;
  const slice = keyed.slice(start, start + PAGE_SIZE);
  const groups: AppGroup[] = [];
  for (const { job, group } of slice) {
    const last = groups.at(-1);
    if (last && last.key === group.key) last.jobs.push(job);
    else groups.push({ ...group, jobs: [job], ...totals.get(group.key)! });
  }

  const sent = rows.filter((job) => job.status !== "excluded");
  const summary = {
    total: rows.length,
    sent: sent.length,
    heardBack: sent.filter((job) => HEARD_BACK.includes(job.status)).length,
    interviews: sent.filter((job) => INTERVIEWED.includes(job.status)).length,
    offers: sent.filter((job) => ["offer", "accepted", "declined"].includes(job.status)).length,
  };
  return { rows: keyed.length, page, pages, start, shown: slice.length, groups, summary, facets };
}

// The time the Board is drawn at (kept here: components may not read the clock).
export const currentTime = () => Date.now();
