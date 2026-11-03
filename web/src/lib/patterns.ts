import "server-only";
import { getSettings, listEventsByJob, listJobs } from "./data";
import { SENT_STATUSES, type Job, type JobEvent, type Settings } from "./types";

// What the user's applications say so far: which kinds of jobs get answers
// and which never do, the score below which nothing worked, how long answers
// take, interviews that went silent, and reasons they keep giving for
// skipping jobs. After career-ops' analyze-patterns and rejection-latency
// (MIT). A finding needs enough decided applications behind it; until then
// the page says what is still missing instead of guessing.

const MIN_DECIDED = 3; // per group, before it can be called good or bad
const MIN_TOTAL = 5; // decided applications before any finding is shown
const SILENT_DAYS = 30; // after an interview
const DAY = 86400000;

type Outcome = "positive" | "negative" | "silent" | "waiting";

export type Finding = {
  tone: "good" | "bad" | "info";
  title: string;
  detail: string;
  // An action the page can offer: add a ranking rule, or open a job.
  rule?: string;
  jobs?: { id: number; title: string; company: string; days: number }[];
};

// The path from found to offer: how many jobs ever reached each stage.
export type FunnelStep = { key: string; label: string; count: number; rate: number | null };
// Reply rate per score band; rate is null below the sample floor.
export type ScoreBand = { label: string; decided: number; positive: number; rate: number | null; waiting: number };
export type Calibration = { bands: ScoreBand[]; verdict: "predicts" | "does-not" | "too-early"; text: string };
// Days between stages: the median of the ones that moved, and how many are
// still waiting (left out of the median, so it is not flattered).
export type Step = { label: string; median: number | null; moved: number; waiting: number };
export type Reason = { reason: string; count: number };

export type Patterns = {
  decided: number;
  positive: number;
  findings: Finding[];
  needed: number;
  funnel: FunnelStep[];
  calibration: Calibration | null;
  steps: Step[];
  setAside: { total: number; reasons: Reason[] };
};

const BAND_FLOOR = 5; // decided applications in a band before its rate is shown

function outcomeOf(job: Job, events: JobEvent[]): Outcome {
  const reached = new Set<string>([job.status]);
  for (const event of events) if (event.type === "status") for (const status of (event.detail ?? "").split("→")) reached.add(status.trim());
  if (["replied", "interview", "offer", "accepted", "declined"].some((status) => reached.has(status))) return "positive";
  if (job.status === "rejected") return "negative";
  if (job.status === "no_response") return "silent";
  return "waiting";
}

type Row = { job: Job; outcome: Outcome; events: JobEvent[] };

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function groups(rows: Row[], keyOf: (row: Row) => string | null) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map].map(([key, entries]) => {
    const decided = entries.filter((row) => row.outcome !== "waiting");
    const positive = decided.filter((row) => row.outcome === "positive").length;
    return { key, decided: decided.length, positive, rate: percent(positive, decided.length) };
  });
}

const statusAt = (events: JobEvent[], status: string) =>
  events.find((event) => event.type === "status" && (event.detail ?? "").split("→")[1]?.trim() === status)?.at ?? null;

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function findPatterns(jobs: Job[], eventsByJob: ReadonlyMap<number, JobEvent[]>, settings: Settings, now: number): Patterns {
  const rows: Row[] = jobs
    .filter((job) => (SENT_STATUSES.includes(job.status) || job.applied_at) && job.status !== "withdrawn")
    .map((job) => ({ job, events: eventsByJob.get(job.id) ?? [], outcome: outcomeOf(job, eventsByJob.get(job.id) ?? []) }));
  const decidedRows = rows.filter((row) => row.outcome !== "waiting");
  const positive = decidedRows.filter((row) => row.outcome === "positive").length;
  const findings: Finding[] = [];

  // Interviews that went silent (rejection-latency): no news a month on.
  const silent = jobs
    .filter((job) => job.status === "interview")
    .map((job) => {
      const events = eventsByJob.get(job.id) ?? [];
      const since = job.interview_at ?? statusAt(events, "interview") ?? job.updated_at;
      return { id: job.id, title: job.title, company: job.company, days: Math.floor((now - Date.parse(since)) / DAY) };
    })
    .filter((item) => item.days >= SILENT_DAYS);
  if (silent.length) {
    findings.push({
      tone: "bad",
      title: `${silent.length === 1 ? "An interview has" : `${silent.length} interviews have`} gone silent`,
      detail: `No news ${SILENT_DAYS} days or more after the interview. One last check-in is fair; after that, close it and put the time into new applications.`,
      jobs: silent,
    });
  }

  // Reasons the user keeps giving for skipping jobs, not yet a ranking rule.
  const rules = (settings.customRules ?? "").toLowerCase();
  const reasons = new Map<string, number>();
  for (const job of jobs) {
    const reason = /^Not interested: (.+)$/.exec(job.excluded_reason ?? "")?.[1]?.trim();
    if (reason && !rules.includes(reason.toLowerCase())) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  for (const [reason, count] of [...reasons].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    findings.push({
      tone: "info",
      title: `You skipped ${count} jobs for the same reason`,
      detail: `"${reason}". As a ranking rule, jobs like these are excluded before you see them.`,
      rule: `Not interested: ${reason}`,
    });
  }

  const extra = { funnel: funnelOf(jobs, eventsByJob), setAside: setAsideOf(jobs), steps: stepsOf(rows, now), calibration: calibrate(rows) };

  // Effort spent on jobs never sent: researched or ready for a week or more.
  const idle = jobs
    .filter((job) => ["researched", "ready"].includes(job.status) && !job.archived_at)
    .map((job) => ({ id: job.id, title: job.title, company: job.company, days: Math.floor((now - Date.parse(job.updated_at)) / DAY) }))
    .filter((item) => item.days >= 7)
    .sort((a, b) => b.days - a.days);
  if (idle.length >= 2) {
    findings.push({
      tone: "info",
      title: `${idle.length} prepared jobs were never sent`,
      detail: "Researched or with documents ready, untouched for a week or more. Apply while they are open, or set them aside so the daily list has room.",
      jobs: idle.slice(0, 5),
    });
  }

  if (decidedRows.length < MIN_TOTAL) return { decided: decidedRows.length, positive, findings, needed: MIN_TOTAL - decidedRows.length, ...extra };

  // Best and worst groups (analyze-patterns' best/worst decided segment).
  const roleLabel = new Map(settings.roles.map((role) => [role.key, role.label]));
  const band = (score: number | null) => (score === null ? null : score >= 75 ? "scored 75 or more" : score >= 60 ? "scored 60 to 74" : "scored below 60");
  const speed = (job: Job) => {
    if (!job.applied_at || !job.found_at) return null;
    return Date.parse(job.applied_at) - Date.parse(job.found_at) <= DAY ? "applied within a day of finding" : "applied later than a day";
  };
  const dimensions: { name: string; keyOf: (row: Row) => string | null; label: (key: string) => string }[] = [
    { name: "role", keyOf: (row) => row.job.role, label: (key) => `${roleLabel.get(key) ?? key} roles` },
    { name: "country", keyOf: (row) => row.job.country, label: (key) => `jobs in ${key}` },
    { name: "source", keyOf: (row) => row.job.source, label: (key) => `jobs from ${settings.sources.find((source) => source.key === key)?.name ?? key}` },
    { name: "work mode", keyOf: (row) => row.job.work_mode, label: (key) => `${key} jobs` },
    { name: "score", keyOf: (row) => band(row.job.score), label: (key) => `jobs that ${key}` },
    { name: "speed", keyOf: (row) => speed(row.job), label: (key) => `jobs you ${key}` },
    {
      name: "channel",
      keyOf: (row) => (row.events.some((event) => event.type === "email sent") ? "by email" : "through the form"),
      label: (key) => `applications sent ${key}`,
    },
  ];
  const overall = percent(positive, decidedRows.length);
  let best: { label: string; decided: number; positive: number; rate: number } | null = null;
  let worst: { label: string; decided: number; positive: number; rate: number } | null = null;
  for (const dimension of dimensions) {
    const rowsOf = groups(rows, dimension.keyOf);
    if (rowsOf.length < 2) continue; // nothing to compare against
    for (const group of rowsOf) {
      if (group.decided < MIN_DECIDED) continue;
      const item = { label: dimension.label(group.key), decided: group.decided, positive: group.positive, rate: group.rate };
      if (group.positive > 0 && group.rate >= overall + 10 && (!best || group.rate > best.rate || (group.rate === best.rate && group.decided > best.decided))) best = item;
      if (group.positive === 0 && (!worst || group.decided > worst.decided)) worst = item;
    }
  }
  if (best) {
    findings.push({
      tone: "good",
      title: `What works: ${best.label}`,
      detail: `${best.positive} of ${best.decided} decided applications got a reply (${best.rate}%, against ${overall}% overall). Worth more of your time.`,
    });
  }
  if (worst) {
    findings.push({
      tone: "bad",
      title: `Not working yet: ${worst.label}`,
      detail: `None of ${worst.decided} decided applications got a reply. Rethink these before preparing more, or change the approach (contact a person, a sharper CV).`,
    });
  }

  // Score floor (analyze-patterns' scoreThresholdFrom, on Offerbound's 0-100 score).
  const scores = (outcome: Outcome) => decidedRows.filter((row) => row.outcome === outcome && row.job.score !== null).map((row) => row.job.score!);
  const good = scores("positive");
  const rejectedScores = [...scores("negative"), ...scores("silent")];
  if (good.length >= 3) {
    const floor = Math.min(...good);
    const below = rejectedScores.filter((score) => score < floor).length;
    if (below > 0) {
      findings.push({
        tone: "info",
        title: `Nothing scoring below ${Math.floor(floor)} got a reply`,
        detail: `All ${good.length} replies came from jobs scoring ${Math.floor(floor)} or more, and ${below} below that went nowhere. Consider selecting only jobs at ${Math.floor(floor)} or above.`,
      });
    }
  }

  // How long answers take, which sets the follow-up wait.
  const daysUntil = (outcome: Outcome, statuses: string[]) =>
    decidedRows
      .filter((row) => row.outcome === outcome && row.job.applied_at)
      .map((row) => {
        const at = statuses.map((status) => statusAt(row.events, status)).find(Boolean);
        return at ? (Date.parse(at) - Date.parse(row.job.applied_at!)) / DAY : NaN;
      })
      .filter((days) => Number.isFinite(days) && days >= 0);
  const replyDays = daysUntil("positive", ["replied", "interview", "offer"]);
  const rejectionDays = daysUntil("negative", ["rejected"]);
  const replyMedian = replyDays.length >= 3 ? median(replyDays) : null;
  const rejectionMedian = rejectionDays.length >= 3 ? median(rejectionDays) : null;
  if (replyMedian !== null || rejectionMedian !== null) {
    const parts = [
      replyMedian !== null ? `replies after ${Math.round(replyMedian)} days` : null,
      rejectionMedian !== null ? `rejections after ${Math.round(rejectionMedian)} days` : null,
    ].filter(Boolean);
    const wait = replyMedian !== null ? Math.max(3, Math.round(replyMedian)) : null;
    findings.push({
      tone: "info",
      title: "How long answers take",
      detail: `Usually ${parts.join(", and ")}.${wait !== null && Math.abs(wait - settings.followUpDays) >= 3 ? ` Your follow-up comes after ${settings.followUpDays} days; around ${wait} would match how employers answer you.` : ""}`,
    });
  }

  return { decided: decidedRows.length, positive, findings, needed: 0, ...extra };
}

// Every stage a job ever reached (its status history, not only where it is now).
function reachedOf(job: Job, events: JobEvent[]) {
  const reached = new Set<string>([job.status]);
  for (const event of events) if (event.type === "status") for (const status of (event.detail ?? "").split("→")) reached.add(status.trim());
  if (job.applied_at) reached.add("applied");
  if (job.score !== null) reached.add("ranked");
  return reached;
}

const SENT = SENT_STATUSES.filter((status) => status !== "withdrawn");
const FUNNEL: { key: string; label: string; from: string[] }[] = [
  { key: "found", label: "Found", from: [] },
  { key: "ranked", label: "Ranked", from: ["ranked", "selected", "researched", "ready", ...SENT] },
  { key: "selected", label: "Selected", from: ["selected", "researched", "ready", ...SENT] },
  { key: "ready", label: "Documents ready", from: ["ready", ...SENT] },
  { key: "applied", label: "Applied", from: SENT },
  { key: "replied", label: "Replied", from: ["replied", "interview", "offer", "accepted", "declined"] },
  { key: "interview", label: "Interview", from: ["interview", "offer", "accepted", "declined"] },
  { key: "offer", label: "Offer", from: ["offer", "accepted", "declined"] },
];

function funnelOf(jobs: Job[], eventsByJob: ReadonlyMap<number, JobEvent[]>): FunnelStep[] {
  const reached = jobs.map((job) => reachedOf(job, eventsByJob.get(job.id) ?? []));
  const counts = FUNNEL.map((step) => (step.from.length ? reached.filter((set) => step.from.some((status) => set.has(status))).length : jobs.length));
  // Each step as a share of the one before it.
  return FUNNEL.map((step, index) => ({ key: step.key, label: step.label, count: counts[index], rate: index === 0 || !counts[index - 1] ? null : percent(counts[index], counts[index - 1]) }));
}

function setAsideOf(jobs: Job[]) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const job of jobs) {
    if (job.status !== "excluded" || !job.excluded_reason) continue;
    total++;
    // "Listed as Mid-Senior level" and "Listed as Director" are the same kind of reason.
    const reason = job.excluded_reason
      .replace(/^Not interested: .*/, "You said not interested")
      .replace(/^Listed as .*/, "Outside your experience levels")
      .replace(/^(Likely not a genuine listing):.*/, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return { total, reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 6) };
}

// How long each step takes, from the status history.
function stepsOf(rows: Row[], now: number): Step[] {
  const at = (row: Row, statuses: string[]) => statuses.map((status) => statusAt(row.events, status)).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  const measure = (label: string, start: (row: Row) => string | null, end: (row: Row) => string | null, open: (row: Row) => boolean): Step => {
    const days: number[] = [];
    let waiting = 0;
    for (const row of rows) {
      const from = start(row);
      if (!from) continue;
      const to = end(row);
      if (to) {
        const value = (Date.parse(to) - Date.parse(from)) / DAY;
        if (Number.isFinite(value) && value >= 0) days.push(value);
      } else if (open(row) && now > Date.parse(from)) waiting++;
    }
    return { label, median: days.length >= 3 ? Math.round((median(days) ?? 0) * 10) / 10 : null, moved: days.length, waiting };
  };
  return [
    measure("Applied → first answer", (row) => row.job.applied_at, (row) => at(row, ["replied", "interview", "offer", "rejected"]), (row) => row.job.status === "applied"),
    measure("Reply → interview", (row) => at(row, ["replied"]), (row) => at(row, ["interview"]), (row) => row.job.status === "replied"),
    measure("Interview → offer or no", (row) => at(row, ["interview"]), (row) => at(row, ["offer", "rejected"]), (row) => row.job.status === "interview"),
  ];
}

// Do higher-scored jobs get more replies for this user? (After career-ops'
// calibrate, MIT: applications still waiting are not data points, and no
// rate is shown for a band smaller than the floor.)
function calibrate(rows: Row[]): Calibration | null {
  const scored = rows.filter((row) => row.job.score !== null);
  if (!scored.length) return null;
  const bands = [
    { label: "75 and up", test: (score: number) => score >= 75 },
    { label: "60 to 74", test: (score: number) => score >= 60 && score < 75 },
    { label: "Below 60", test: (score: number) => score < 60 },
  ].map(({ label, test }) => {
    const inBand = scored.filter((row) => test(row.job.score!));
    const decided = inBand.filter((row) => row.outcome !== "waiting");
    const positive = decided.filter((row) => row.outcome === "positive").length;
    return { label, decided: decided.length, positive, rate: decided.length >= BAND_FLOOR ? percent(positive, decided.length) : null, waiting: inBand.length - decided.length };
  });
  const rated = bands.filter((band) => band.rate !== null);
  if (rated.length < 2) {
    return { bands, verdict: "too-early", text: `Too early to tell: at least two score bands need ${BAND_FLOOR} answered applications each.` };
  }
  // Bands run high to low: the rate should not rise as the score falls.
  const ordered = rated.every((band, index) => index === 0 || band.rate! <= rated[index - 1].rate! + 5);
  const spread = rated[0].rate! - rated[rated.length - 1].rate!;
  return ordered && spread >= 10
    ? { bands, verdict: "predicts", text: "Higher-scored jobs get more replies for you: the ranking points the right way. Keep favouring the top of the list." }
    : {
        bands,
        verdict: "does-not",
        text: "Your scores do not predict replies yet: lower-scored jobs answer about as often, or more. The ranking may weigh the wrong things for you; add ranking rules on Profile for what actually gets answers.",
      };
}

export function getPatterns() {
  const jobs = listJobs();
  return findPatterns(jobs, listEventsByJob(jobs.map((job) => job.id)), getSettings(), Date.now());
}
