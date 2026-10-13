import Link from "next/link";
import { ApplicationsFilters } from "@/components/applications-filters";
import { ApplyAllButton } from "@/components/apply-all";
import { Flap } from "@/components/flap";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { TABLE_STATUSES, applicationsTable, currentTime, dateOf, parseQuery, queryHref, type AppQuery } from "@/lib/applications";
import { getSettings, listJobs } from "@/lib/data";
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
const PREPARING: Status[] = ["selected", "researched", "ready"];
// Cards shown per preparing stage before "Show all".
const CARDS = 6;
// A gate for a waiting stage opens the table on that stage.
const GATE_STAGE: Partial<Record<Status, AppQuery["stage"]>> = { applied: "waiting", replied: "replied", interview: "interview", offer: "offer" };

function followUpDue(job: Job, now: number) {
  return job.status === "applied" && job.follow_up_due !== null && Date.parse(job.follow_up_due) <= now;
}

function Card({ job, all }: { job: Job; all: boolean }) {
  return (
    // Phones show three per stage, wider screens six (CARDS), until "Show all".
    <li className={all ? "" : "max-sm:nth-[n+4]:hidden"}>
      <Link href={`/jobs/${job.id}`} className="card group flex h-full flex-col rounded-lg p-3.5 text-sm shadow-sm transition-colors hover:border-ink">
        <span className="flex items-start justify-between gap-3">
          <span className="font-medium group-hover:underline" dir="auto">
            {job.title}
          </span>
          <Flap code={placeCode(job)} className="shrink-0 text-[11px]" />
        </span>
        <span className="mt-0.5 truncate text-slate" dir="auto">
          {[job.company, job.city ?? job.country].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 font-mono text-[11px] text-slate">
          {job.score !== null && <span>Match {Math.round(job.score)}</span>}
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

// The stage of a sent application, as a small label.
const STAGE_STYLE: Partial<Record<Status, string>> = {
  applied: "bg-mist text-ink",
  replied: "bg-teal-soft text-teal",
  interview: "bg-go-soft text-go",
  offer: "bg-go text-surface",
  rejected: "bg-coral-soft text-coral",
  no_response: "bg-mist text-slate",
  excluded: "bg-mist text-slate",
};
const STAGE_TEXT: Partial<Record<Status, string>> = { applied: "Sent" };

function Row({ job, now }: { job: Job; now: number }) {
  const due = followUpDue(job, now);
  const date = dateOf(job);
  const days = Math.max(0, Math.floor((now - Date.parse(date)) / 86400000));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 text-sm md:grid-cols-[7.5rem_minmax(0,1fr)_4rem_9rem_minmax(0,11rem)] md:items-center">
      <div className="order-3 col-span-2 font-mono text-xs text-slate md:order-none md:col-span-1">
        <span className="text-ink">{formatDateTime(date).split(",")[0]}</span>
        <span className="ml-2 md:ml-0 md:block">{days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} ago`}</span>
      </div>
      <div className="min-w-0">
        <Link href={`/jobs/${job.id}`} className="font-medium hover:text-teal hover:underline" dir="auto">
          {job.title}
        </Link>
        <div className="truncate text-slate" dir="auto">
          {[job.company, job.city, job.country].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="hidden md:block">
        <Flap code={placeCode(job)} className="text-[11px]" />
      </div>
      <div className="flex flex-wrap items-start justify-end gap-1.5 md:justify-start">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STAGE_STYLE[job.status] ?? "bg-mist"}`}>{STAGE_TEXT[job.status] ?? STATUS_LABELS[job.status]}</span>
        {due && <span className="rounded bg-saffron px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-on-saffron">Follow-up due</span>}
      </div>
      <div className="order-4 col-span-2 truncate text-xs text-slate md:order-none md:col-span-1" title={job.excluded_reason ?? undefined}>
        {job.excluded_reason ?? (job.source ? `via ${job.source}` : "")}
      </div>
    </li>
  );
}

export default async function BoardPage(props: PageProps<"/board">) {
  const params = await props.searchParams;
  const query = parseQuery(params);
  const now = currentTime();
  const showAllCards = params.prep === "all";
  const settings = getSettings();
  const roleLabel = new Map(settings.roles.map((role) => [role.key, role.label]));

  const jobs = listJobs({ status: [...PREPARING, ...TABLE_STATUSES] });
  const preparing = jobs.filter((job) => PREPARING.includes(job.status));
  const count = (status: Status) => jobs.filter((job) => job.status === status).length;
  const dueCount = jobs.filter((job) => followUpDue(job, now)).length;
  const sentCount = jobs.filter((job) => job.status !== "excluded" && TABLE_STATUSES.includes(job.status)).length;
  const countryOrder = [...settings.countries].sort((a, b) => a.priority - b.priority).map((country) => country.name);
  const table = applicationsTable(jobs, query, now, countryOrder);
  const filtered = query.q || query.country || query.role || query.period !== "all";

  return (
    <div>
      <PageHeader
        eyebrow={`${preparing.length} preparing · ${sentCount} sent${dueCount ? ` · ${dueCount} follow-up${dueCount === 1 ? "" : "s"} due` : ""}`}
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
            const stage = GATE_STAGE[gate.status];
            return (
              <li key={gate.status} className="flex items-center">
                {index === 3 && <span aria-hidden className="h-10 border-l-2 border-dashed border-chrome-line" />}
                <a href={stage ? queryHref(query, { stage }) : `#${gate.status}`} className={`block px-5 py-3.5 hover:bg-white/5 ${n ? "text-chrome-text" : "text-chrome-dim"}`}>
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

      {/* Preparing: the few jobs still on their way to being sent. */}
      <div className="mt-6 space-y-2">
        {GATES.filter((gate) => gate.phase === "prepare").map((gate) => {
          const column = preparing.filter((job) => job.status === gate.status);
          const shown = showAllCards ? column : column.slice(0, CARDS);
          return (
            <section key={gate.status} id={gate.status} className="anchor scroll-mt-32">
              {column.length === 0 ? (
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
                    {shown.map((job) => (
                      <Card key={job.id} job={job} all={showAllCards} />
                    ))}
                  </ul>
                  {(column.length > shown.length || (!showAllCards && column.length > 3)) && (
                    <Link
                      href={`/board?prep=all#${gate.status}`}
                      className={`mt-2 inline-block px-1 text-sm font-medium text-teal hover:underline ${column.length > shown.length ? "" : "sm:hidden"}`}
                    >
                      Show all {column.length}
                    </Link>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Applications: everything sent, closed, or excluded, in one table. */}
      <section id="applications" className="anchor mt-12 scroll-mt-32">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title">Applications</h2>
            <p className="mt-1 text-sm text-slate" aria-live="polite">
              {table.summary.total === 0 ? (
                "None match these choices."
              ) : query.stage === "excluded" ? (
                `${table.summary.total} excluded ${table.summary.total === 1 ? "job" : "jobs"}, with the reason.`
              ) : (
                <>
                  <b className="font-mono text-ink">{table.summary.sent}</b> sent
                  {table.summary.sent > 0 && (
                    <>
                      {" · "}
                      <b className="font-mono text-ink">{table.summary.heardBack}</b> heard back ({Math.round((table.summary.heardBack / table.summary.sent) * 100)}%)
                      {" · "}
                      <b className="font-mono text-ink">{table.summary.interviews}</b> {table.summary.interviews === 1 ? "interview" : "interviews"}
                      {table.summary.offers > 0 && (
                        <>
                          {" · "}
                          <b className="font-mono text-ink">{table.summary.offers}</b> {table.summary.offers === 1 ? "offer" : "offers"}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          {filtered && (
            <Link href={queryHref(query, { q: "", country: "", role: "", period: "all" })} className="text-sm font-medium text-teal hover:underline">
              Clear filters
            </Link>
          )}
        </div>

        <div className="card mt-3 rounded-xl p-3 shadow-sm">
          <ApplicationsFilters
            query={query}
            countries={table.facets.countries}
            roles={table.facets.roles.map((role) => ({ ...role, label: roleLabel.get(role.value) ?? role.value }))}
            years={table.facets.years}
          />
        </div>

        {table.groups.length > 0 && (
          <div className="mt-4 space-y-4">
            {table.groups.map((group) => (
              <div key={group.key || "all"} className="card overflow-hidden rounded-xl shadow-sm">
                {group.label && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-board-line bg-board px-4 py-2.5 text-board-text">
                    <h3 className="font-display text-base font-semibold tracking-wide uppercase">{group.label}</h3>
                    <p className="font-mono text-xs text-board-dim">
                      {group.total} {group.total === 1 ? "job" : "jobs"}
                      {query.stage !== "excluded" && (
                        <>
                          {" · "}
                          {group.replies} heard back
                          {group.interviews > 0 && ` · ${group.interviews} ${group.interviews === 1 ? "interview" : "interviews"}`}
                        </>
                      )}
                      {group.jobs.length < group.total && ` · ${group.jobs.length} on this page`}
                    </p>
                  </div>
                )}
                <div className="hidden gap-x-4 border-b border-line bg-mist px-4 py-1.5 font-mono text-[10px] tracking-[0.14em] text-slate uppercase md:grid md:grid-cols-[7.5rem_minmax(0,1fr)_4rem_9rem_minmax(0,11rem)]">
                  <span>{query.stage === "excluded" ? "Excluded" : "Sent"}</span>
                  <span>Job</span>
                  <span>Place</span>
                  <span>Stage</span>
                  <span>{query.stage === "excluded" ? "Reason" : "Source"}</span>
                </div>
                <ul className="divide-y divide-line/70">
                  {group.jobs.map((job) => (
                    <Row key={job.id} job={job} now={now} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <Pagination page={table.page} pages={table.pages} start={table.start} shown={table.shown} total={table.rows} href={(page) => queryHref(query, { page })} />
      </section>
    </div>
  );
}
