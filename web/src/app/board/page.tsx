import Link from "next/link";
import { ApplyAllButton } from "@/components/apply-all";
import { Flap } from "@/components/flap";
import { PageHeader } from "@/components/page-header";
import { SortLink } from "@/components/sort-link";
import { tableSort, type SortDir } from "@/lib/sort";
import { listJobs } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { placeCode } from "@/lib/places";
import { STATUS_LABELS, type Job, type Status } from "@/lib/types";

// The stages of a picked job, as gates: preparing the package, then waiting
// for the employer.
const GATES: { status: Status; hint: string; empty: string; phase: "prepare" | "wait" }[] = [
  { status: "selected", hint: "Picked for research", empty: "Pick jobs on Today to research them.", phase: "prepare" },
  { status: "researched", hint: "Documents to review", empty: "Researched jobs wait here for your review.", phase: "prepare" },
  { status: "ready", hint: "Approved, ready to send", empty: "Jobs with every document approved.", phase: "prepare" },
  { status: "applied", hint: "Waiting for a reply", empty: "Applications you sent.", phase: "wait" },
  { status: "replied", hint: "They answered", empty: "Replies from employers.", phase: "wait" },
  { status: "interview", hint: "Interview scheduled", empty: "Interviews, with a pack to prepare.", phase: "wait" },
  { status: "offer", hint: "Offer received", empty: "Offers.", phase: "wait" },
];
const CLOSED: Status[] = ["rejected", "no_response", "excluded"];

function followUpDue(job: Job) {
  return job.status === "applied" && job.follow_up_due !== null && Date.parse(job.follow_up_due) <= Date.now();
}

function Card({ job }: { job: Job }) {
  const due = followUpDue(job);
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="card group flex h-full flex-col rounded-lg p-3.5 text-sm shadow-sm transition-colors hover:border-ink">
        <span className="flex items-start justify-between gap-3">
          <span className="font-medium group-hover:underline" dir="auto">
            {job.title}
          </span>
          <Flap code={placeCode(job)} className="shrink-0 text-[11px]" />
        </span>
        <span className="mt-0.5 truncate text-slate" dir="auto">
          {job.company}
          {job.city ? ` · ${job.city}` : ""}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 font-mono text-[11px] text-slate">
          {job.score !== null && <span>Match {Math.round(job.score)}</span>}
          {job.applied_at && <span>Applied {formatDateTime(job.applied_at)}</span>}
          {due && <span className="rounded bg-saffron px-1.5 py-0.5 font-semibold text-on-saffron">Follow-up due</span>}
          {job.status === "ready" && job.apply_state === "waiting" && (
            <span className="rounded bg-saffron px-1.5 py-0.5 font-semibold text-on-saffron" title={job.apply_missing?.join("\n")}>
              Waiting for you{job.apply_missing?.length ? ` · ${job.apply_missing.length}` : ""}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

const CLOSED_KEYS = ["job", "company", "status", "updated"] as const;
type ClosedKey = (typeof CLOSED_KEYS)[number];
const CLOSED_LABELS: Record<ClosedKey, string> = { job: "Job", company: "Company", status: "Status", updated: "Updated" };
const CLOSED_FIRST_DIR: Record<ClosedKey, SortDir> = { job: "asc", company: "asc", status: "asc", updated: "desc" };
const CLOSED_PAGE = 20;

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
  const closedFilter = CLOSED.includes(query.closed as Status) ? (query.closed as Status) : null;
  const showAll = query.all === "1";
  // Links in the closed list keep the other choices.
  const closedHref = (change: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = { csort: typeof query.csort === "string" ? query.csort : null, cdir: typeof query.cdir === "string" ? query.cdir : null, closed: closedFilter, all: showAll ? "1" : null, ...change };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    return `/board${params.size ? `?${params}` : ""}#closed`;
  };

  const jobs = listJobs({ status: [...GATES.map((gate) => gate.status), ...CLOSED] });
  const open = jobs.filter((job) => !CLOSED.includes(job.status));
  const allClosed = jobs.filter((job) => CLOSED.includes(job.status));
  const filtered = closedFilter ? allClosed.filter((job) => job.status === closedFilter) : allClosed;
  // Sort everything first, then show the first rows, so sorting looks across
  // all closed jobs and not only the most recent ones.
  const sorted = sortClosed(filtered, sort.key, sort.dir);
  const closed = showAll ? sorted : sorted.slice(0, CLOSED_PAGE);
  const count = (status: Status) => open.filter((job) => job.status === status).length;
  const dueCount = open.filter(followUpDue).length;

  return (
    <div>
      <PageHeader
        eyebrow={`${open.length} in progress${dueCount ? ` · ${dueCount} follow-up${dueCount === 1 ? "" : "s"} due` : ""}`}
        title="Board"
        description="Every job you picked, from research to outcome."
        actions={
          <a href="/board/export" download className="btn btn-quiet" title="All applications with dates, follow-ups, contacts, and salary, as a spreadsheet">
            Export for Excel
          </a>
        }
      />

      {/* The gates: every stage with its count, like a departures sign. */}
      <nav aria-label="Stages" className="mt-8 overflow-x-auto rounded-xl border border-chrome-line bg-chrome shadow-md">
        <ol className="flex min-w-max">
          {GATES.map((gate, index) => {
            const n = count(gate.status);
            return (
              <li key={gate.status} className="flex items-center">
                {index === 3 && <span aria-hidden className="h-10 border-l-2 border-dashed border-chrome-line" />}
                <a href={`#${gate.status}`} className={`block px-5 py-3.5 hover:bg-white/5 ${n ? "text-chrome-text" : "text-chrome-dim"}`}>
                  <span className="block font-mono text-[10px] tracking-[0.18em] uppercase opacity-80">Gate {index + 1}</span>
                  <span className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-display text-lg font-semibold tracking-wide uppercase">{STATUS_LABELS[gate.status]}</span>
                    <span className={`font-mono text-sm font-semibold ${n ? "text-chrome-signal" : ""}`}>{n}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {open.length === 0 ? (
        <p className="card mt-6 rounded-xl px-5 py-6 text-sm text-slate">
          Nothing in progress yet. Pick jobs on{" "}
          <Link href="/" className="text-teal underline">
            Today
          </Link>{" "}
          and they move through these gates as you research, apply, and hear back.
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {GATES.map((gate, index) => {
            const column = open.filter((job) => job.status === gate.status);
            return (
              <section key={gate.status} id={gate.status} className={`anchor scroll-mt-32 ${index === 3 ? "pt-4" : ""}`}>
                {column.length === 0 ? (
                  // An empty stage is one quiet line.
                  <p className="flex items-baseline gap-3 border-b border-line/70 px-1 py-2 text-sm text-slate">
                    <span className="font-display font-semibold tracking-wide text-ink/50 uppercase">{STATUS_LABELS[gate.status]}</span>
                    <span>{gate.empty}</span>
                  </p>
                ) : (
                  <div className="py-2">
                    <div className="flex flex-wrap items-baseline gap-3 px-1">
                      <h2 className="flex items-baseline gap-3">
                        <span className="section-title">{STATUS_LABELS[gate.status]}</span>
                        <span className="font-mono text-sm text-slate">{column.length}</span>
                        <span className="text-sm text-slate">{gate.hint}</span>
                      </h2>
                      {gate.status === "ready" && <ApplyAllButton jobIds={column.filter((job) => job.apply_state !== "waiting").map((job) => job.id)} />}
                    </div>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {column.map((job) => (
                        <Card key={job.id} job={job} />
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {allClosed.length > 0 && (
        <section id="closed" className="anchor mt-12 scroll-mt-32">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="section-title">Closed</h2>
              <p className="mt-1 text-sm text-slate">Rejected, unanswered, and excluded jobs, with the reason.</p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              <Link href={closedHref({ closed: null, all: null })} className={`chip ${closedFilter === null ? "chip-on" : ""}`}>
                All {allClosed.length}
              </Link>
              {CLOSED.map((status) => {
                const n = allClosed.filter((job) => job.status === status).length;
                return n ? (
                  <Link key={status} href={closedHref({ closed: status, all: null })} className={`chip ${closedFilter === status ? "chip-on" : ""}`}>
                    {STATUS_LABELS[status]} {n}
                  </Link>
                ) : null;
              })}
            </div>
          </div>
          <div className="card mt-3 overflow-hidden rounded-xl shadow-sm">
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
              <span className="label mr-1 mb-0">Sort</span>
              {CLOSED_KEYS.map((key) => (
                <Link key={key} href={sort.href(key)} className={`chip ${sort.key === key ? "chip-on" : ""}`}>
                  {CLOSED_LABELS[key]}
                  {sort.key === key && (sort.dir === "asc" ? " ↑" : " ↓")}
                </Link>
              ))}
            </div>
            <ul className="divide-y divide-line/70">
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
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${job.status === "excluded" ? "bg-mist text-ink" : "bg-coral-soft text-coral"}`}>
                      {STATUS_LABELS[job.status]}
                    </span>
                    {job.excluded_reason}
                  </div>
                  <div className="font-mono text-xs whitespace-nowrap text-slate">{formatDateTime(job.updated_at)}</div>
                </li>
              ))}
            </ul>
            {sorted.length > closed.length && (
              <Link href={closedHref({ all: "1" })} className="block border-t border-line px-4 py-3 text-center text-sm font-medium text-teal hover:bg-mist">
                Show all {sorted.length}
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
