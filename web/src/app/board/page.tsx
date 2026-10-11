import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SortLink } from "@/components/sort-link";
import { tableSort, type SortDir } from "@/lib/sort";
import { listJobs } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { placeCode } from "@/lib/places";
import { STATUS_LABELS, type Job, type Status } from "@/lib/types";

const COLUMNS: { status: Status; hint: string }[] = [
  { status: "selected", hint: "Picked for research" },
  { status: "researched", hint: "Company and team checked" },
  { status: "ready", hint: "Documents approved" },
  { status: "applied", hint: "Waiting for a reply" },
  { status: "replied", hint: "They answered" },
  { status: "interview", hint: "Interviews scheduled" },
  { status: "offer", hint: "Offers received" },
];
const CLOSED: Status[] = ["rejected", "no_response", "excluded"];

function followUpDue(job: Job) {
  return job.status === "applied" && job.follow_up_due !== null && Date.parse(job.follow_up_due) <= Date.now();
}

function Card({ job }: { job: Job }) {
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="card block p-3 text-sm transition-colors hover:border-ink">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium" dir="auto">
            {job.title}
          </span>
          <span className="shrink-0 rounded bg-board px-1.5 py-0.5 font-mono text-[10px] text-signal">{placeCode(job)}</span>
        </div>
        <div className="mt-0.5 truncate text-slate" dir="auto">
          {job.company}
        </div>
        {job.score !== null && <div className="mt-2 font-mono text-xs text-slate">score {Math.round(job.score)}</div>}
        {followUpDue(job) && (
          <div className="mt-2 rounded bg-saffron-soft px-2 py-1 text-xs font-medium">Follow-up due</div>
        )}
      </Link>
    </li>
  );
}

const CLOSED_KEYS = ["job", "company", "status", "updated"] as const;
type ClosedKey = (typeof CLOSED_KEYS)[number];
const CLOSED_LABELS: Record<ClosedKey, string> = { job: "Job", company: "Company", status: "Status", updated: "Updated" };
const CLOSED_FIRST_DIR: Record<ClosedKey, SortDir> = { job: "asc", company: "asc", status: "asc", updated: "desc" };
const CLOSED_LIMIT = 60;

function sortClosed(jobs: Job[], key: ClosedKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  const compare = (a: Job, b: Job) => {
    switch (key) {
      case "job":
        return text(a.title, b.title);
      case "company":
        return text(a.company, b.company);
      case "status":
        return text(STATUS_LABELS[a.status], STATUS_LABELS[b.status]);
      case "updated":
        return Date.parse(a.updated_at) - Date.parse(b.updated_at);
    }
  };
  return [...jobs].sort((a, b) => sign * compare(a, b) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export default async function BoardPage(props: PageProps<"/board">) {
  const query = await props.searchParams;
  const sort = tableSort({
    query: { csort: typeof query.csort === "string" ? query.csort : undefined, cdir: typeof query.cdir === "string" ? query.cdir : undefined },
    keys: CLOSED_KEYS,
    firstDir: CLOSED_FIRST_DIR,
    defaultSort: { key: "updated", dir: "desc" },
    param: { key: "csort", dir: "cdir" },
    path: "/board",
    anchor: "closed",
  });

  const jobs = listJobs({ status: [...COLUMNS.map((column) => column.status), ...CLOSED] });
  const open = jobs.filter((job) => !CLOSED.includes(job.status));
  const allClosed = jobs.filter((job) => CLOSED.includes(job.status));
  // Sort everything first, then show the first rows, so sorting looks across
  // all closed jobs and not only the most recent ones.
  const closed = sortClosed(allClosed, sort.key, sort.dir).slice(0, CLOSED_LIMIT);

  return (
    <div>
      <PageHeader
        eyebrow={`${open.length} in progress`}
        title="Board"
        description="Every job you picked, from research to outcome."
      />

      <div className="mt-8 overflow-x-auto pb-2">
        <div className="grid min-w-[60rem] grid-cols-7 gap-3">
          {COLUMNS.map(({ status, hint }) => {
            const column = open.filter((job) => job.status === status);
            return (
              <section key={status} id={status} className="anchor min-w-0 p-1">
                <h2 className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
                  <span className="font-display text-base font-semibold tracking-wide uppercase">{STATUS_LABELS[status]}</span>
                  <span className="font-mono text-xs text-slate">{column.length}</span>
                </h2>
                <p className="mt-1 text-[11px] text-slate">{hint}</p>
                <ul className="mt-3 space-y-2">
                  {column.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs text-slate">Empty</li>
                  ) : (
                    column.map((job) => <Card key={job.id} job={job} />)
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {open.length === 0 && (
        <p className="mt-4 text-sm text-slate">
          Nothing in progress yet. Pick jobs on the{" "}
          <Link href="/" className="text-teal underline">
            Today
          </Link>{" "}
          screen and they start here.
        </p>
      )}

      {closed.length > 0 && (
        <section id="closed" className="anchor mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">Closed</h2>
            <span className="font-mono text-xs text-slate">
              {allClosed.length > CLOSED_LIMIT ? `${CLOSED_LIMIT} of ${allClosed.length}` : `${allClosed.length} jobs`}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">Rejected, unanswered, and excluded jobs, with the reason.</p>
          <div className="card mt-3 overflow-hidden">
          <div className="hidden gap-x-6 border-b border-line bg-mist px-4 py-2 font-mono text-[11px] tracking-[0.12em] text-slate uppercase md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
            <span className="flex gap-2">
              <SortLink label="Job" active={sort.key === "job"} dir={sort.dir} href={sort.href("job")} />
              <span aria-hidden>·</span>
              <SortLink label="Company" active={sort.key === "company"} dir={sort.dir} href={sort.href("company")} />
            </span>
            <SortLink label="Status" active={sort.key === "status"} dir={sort.dir} href={sort.href("status")} />
            <SortLink label="Updated" active={sort.key === "updated"} dir={sort.dir} href={sort.href("updated")} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5 md:hidden">
            <span className="label mb-0 mr-1">Sort</span>
            {CLOSED_KEYS.map((key) => (
              <Link key={key} href={sort.href(key)} className={`chip ${sort.key === key ? "chip-on" : ""}`}>
                {CLOSED_LABELS[key]}
                {sort.key === key && (sort.dir === "asc" ? " ↑" : " ↓")}
              </Link>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {closed.map((job) => (
              <li key={job.id} className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
                <div className="min-w-0">
                  <Link href={`/jobs/${job.id}`} className="font-medium hover:text-teal hover:underline" dir="auto">
                    {job.title}
                  </Link>
                  <div className="truncate text-slate" dir="auto">
                    {job.company} · {job.city ?? job.country}
                  </div>
                </div>
                <div className="text-slate">
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      job.status === "excluded" ? "bg-mist text-ink" : "bg-coral-soft text-coral"
                    }`}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                  {job.excluded_reason}
                </div>
                <div className="font-mono text-xs whitespace-nowrap text-slate">{formatDateTime(job.updated_at)}</div>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}
    </div>
  );
}
