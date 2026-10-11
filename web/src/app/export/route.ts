import { getJob } from "@/lib/data";
import { buildDepartures } from "@/lib/departures";
import { csvResponse } from "@/lib/csv";
import { STATUS_LABELS, type Job } from "@/lib/types";

// Downloads jobs as a CSV file that Excel opens directly. With "ids" it
// exports those jobs; otherwise everything the departures board currently
// shows for the same filters (all pages).

const COLUMNS: [string, (job: Job) => string | number | null][] = [
  ["Id", (job) => job.id],
  ["Title", (job) => job.title],
  ["Company", (job) => job.company],
  ["City", (job) => job.city],
  ["Country", (job) => job.country],
  ["Work mode", (job) => job.work_mode],
  ["Role", (job) => job.role],
  ["Score", (job) => (job.score === null ? null : Math.round(job.score))],
  ["Status", (job) => STATUS_LABELS[job.status]],
  ["Reason", (job) => (job.status === "excluded" ? job.excluded_reason : job.score_reason)],
  ["Posted", (job) => job.posted_at],
  ["Source", (job) => job.source],
  ["Listing", (job) => job.url],
  ["Notes", (job) => job.notes],
];

export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const ids = (query.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 1000);

  const jobs = ids.length
    ? ids.map((id) => getJob(id)).filter((job): job is Job => job !== null)
    : buildDepartures((key) => query.get(key) ?? undefined).shown;

  const rows = [COLUMNS.map(([name]) => name), ...jobs.map((job) => COLUMNS.map(([, read]) => read(job)))];
  const day = new Date().toISOString().slice(0, 10);
  return csvResponse(rows, `jobflow-${day}${ids.length ? "-selected" : ""}.csv`);
}
