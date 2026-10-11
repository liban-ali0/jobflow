import Link from "next/link";
import { Suspense } from "react";
import { runStage } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { BulkSelection } from "@/components/bulk-selection";
import { DeparturesBoard } from "@/components/departures-board";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { QuestionCard } from "@/components/question-card";
import { researchSelected } from "@/app/job-actions";
import { FollowUpRow } from "@/components/tracking";
import { followUpsDue } from "@/lib/followups";
import { countByStatus, getJob, hasCv, listDocuments, listJobs, listQuestions, listRuns, readProfile } from "@/lib/data";
import { SHOW_VIEWS, buildDepartures } from "@/lib/departures";
import { scheduleStatus } from "@/lib/scheduler";
import { ENGINES, STAGES, closeAbandonedRuns, engineFor, queuedResearch, stageReady, type EngineKey } from "@/lib/engine";
import { paginate } from "@/lib/filters";
import { formatDateTime } from "@/lib/format";
import { sortJobs } from "@/lib/sort";
import type { Run } from "@/lib/types";

function Stat({ label, value, note, tone = "plain" }: { label: string; value: string | number; note?: string; tone?: "plain" | "signal" }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone === "signal" ? "border-saffron bg-saffron-soft" : "border-line bg-surface"}`}>
      <div className="text-xs tracking-wide text-slate uppercase">{label}</div>
      <div className="mt-1 font-display text-3xl leading-none font-bold">{value}</div>
      {note && <div className="mt-1 text-xs text-slate">{note}</div>}
    </div>
  );
}

function LastRun({ run }: { run: Run }) {
  const label = STAGES[run.stage as keyof typeof STAGES]?.label ?? run.stage;
  const firstLine = run.summary?.split("\n").find((line) => line.trim())?.replace(/[*#|]/g, "").trim();
  const engine = run.engine && run.engine !== "script" ? ENGINES[run.engine as EngineKey]?.label : null;
  return (
    <p className="text-sm">
      <span className="font-medium">{label}</span>
      {engine && <span className="text-slate"> ({engine})</span>}
      <span className="text-slate"> · </span>
      {run.status === "running" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
          running since {formatDateTime(run.started_at)}
        </span>
      ) : (
        <>
          <span className={run.status === "failed" ? "text-coral" : ""}>{firstLine?.slice(0, 140) ?? run.status}</span>
          <span className="text-slate"> · {formatDateTime(run.finished_at ?? run.started_at)} · </span>
          <Link href="/activity" className="text-teal underline">
            details
          </Link>
        </>
      )}
    </p>
  );
}

function FilterChips({
  name,
  options,
  current,
  params,
  allLabel = "All",
}: {
  name: string;
  options: { value: string; label: string; count: number }[];
  current: string | undefined;
  params: Record<string, string | undefined>;
  allLabel?: string;
}) {
  // Filter links keep the other filters and stay on the departures board.
  const href = (value: string | undefined) => {
    const next = new URLSearchParams(
      Object.entries({ ...params, [name]: value }).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const query = next.toString();
    return `${query ? `/?${query}` : "/"}#departures`;
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={href(undefined)} className={`chip ${!current ? "chip-on" : ""}`}>
        {allLabel}
      </Link>
      {options.map((option) => (
        <Link key={option.value} href={href(option.value)} className={`chip ${current === option.value ? "chip-on" : ""}`}>
          {option.label}
          <span className="font-mono opacity-75">{option.count}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function TodayPage(props: PageProps<"/">) {
  const query = await props.searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const { show, limit, params, departuresSort, selectedSort, settings, waiting, recent, pool, shown } = buildDepartures(pick);
  const counts = countByStatus();
  const selected = sortJobs(listJobs({ status: "selected" }), selectedSort.key, selectedSort.dir, settings);
  const unranked = waiting.filter((job) => job.status === "found").length;
  const paged = paginate(shown, Number(pick("page")) || 1, limit);
  const pageHref = (page: number) => {
    const next = new URLSearchParams(
      Object.entries({ ...params, page: page > 1 ? String(page) : undefined }).filter(
        (entry): entry is [string, string] => Boolean(entry[1]),
      ),
    ).toString();
    return `${next ? `/?${next}` : "/"}#departures`;
  };
  const showOptions = SHOW_VIEWS.map((view) => ({
    value: view.value,
    label: view.label,
    count: view.value === "all" ? recent.length : waiting.filter((job) => job.status === view.status).length,
  }));
  const boardTitle = show ? `Departures · ${SHOW_VIEWS.find((view) => view.value === show)!.title}` : "Departures";
  const questions = listQuestions("open");
  const findReady = stageReady("find-jobs");
  const rankReady = stageReady("rank-jobs");
  const rankEngine = ENGINES[engineFor("rank-jobs").engine].label;

  closeAbandonedRuns();
  const runs = listRuns(50);
  const lastRuns = (["find-jobs", "browse-jobs", "rank-jobs"] as const)
    .map((stage) => runs.find((run) => run.stage === stage))
    .filter((run): run is Run => Boolean(run));
  const active = lastRuns.some((run) => run.status === "running");

  const countryOptions = [...settings.countries]
    .sort((a, b) => a.priority - b.priority)
    .map((country) => ({ value: country.name, label: country.name, count: pool.filter((job) => job.country === country.name).length }));
  const roleOptions = [...settings.roles]
    .sort((a, b) => a.priority - b.priority)
    .map((role) => ({ value: role.key, label: role.label, count: pool.filter((job) => job.role === role.key).length }));

  const setupLeft = [
    !hasCv() && "add your CV",
    (settings.countries.length === 0 || settings.roles.length === 0) && "choose countries and roles",
    !readProfile() && "build your profile",
  ].filter((item): item is string => Boolean(item));

  // Research in progress or queued, for the bar above Selected.
  const activeResearch = runs.find((run) => run.status === "running" && (run.stage === "research-job" || run.stage === "tailor-job"));
  const queued = queuedResearch();
  const activeJob = activeResearch?.job_id ? getJob(activeResearch.job_id) : null;
  const pipeline = activeResearch
    ? `${activeResearch.stage === "research-job" ? "Researching" : "Writing documents for"} ${activeJob?.title ?? "a job"}${queued.length ? `, ${queued.length} more in the queue` : ""}.`
    : null;
  // Researched jobs whose documents still need the user.
  const toReview = listJobs({ status: "researched" })
    .map((job) => {
      const docs = listDocuments(job.id).filter((doc) => doc.type !== "research");
      return {
        job,
        waiting: docs.filter((doc) => doc.review === "draft").length,
        changes: docs.filter((doc) => doc.review === "changes_requested").length,
      };
    })
    .filter((row) => row.waiting + row.changes > 0);

  const followUps = followUpsDue();
  const schedule = scheduleStatus();
  const time = (date: Date | null) => (date ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const scheduleLine = schedule.enabled ? ` Next check for fresh postings at ${time(schedule.nextFast)}; full run at ${time(schedule.nextDaily)}.` : "";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <AutoRefresh active={active || Boolean(pipeline)} />

      <PageHeader
        eyebrow={today}
        title="Today"
        description={`Fresh postings from the last ${settings.freshness.maxHours} hours, best matches first.${scheduleLine}`}
        actions={
          <>
            <ActionButton
              variant="primary"
              action={runStage.bind(null, "find-jobs", null)}
              disabled={!findReady}
              title={`Search ${settings.sources.filter((source) => source.enabled && source.key !== "careers").map((source) => source.name).join(", ") || "the enabled sources"} for jobs posted in the last ${settings.freshness.maxHours} hours`}
            >
              Find new jobs
            </ActionButton>
            <ActionButton
              action={runStage.bind(null, "rank-jobs", null)}
              disabled={!rankReady || unranked === 0}
              title={unranked === 0 ? "No new jobs to rank" : `Ranks up to 20 jobs with ${rankEngine}`}
            >
              Check and rank
            </ActionButton>
          </>
        }
      />

      {setupLeft.length > 0 && (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-saffron bg-saffron-soft p-5">
          <div>
            <h2 className="card-title">Finish setting up</h2>
            <p className="mt-1 text-sm">Still to do: {setupLeft.join(", ")}.</p>
          </div>
          <Link href="/setup" className="btn btn-primary">
            Open Setup
          </Link>
        </div>
      )}

      {lastRuns.length > 0 && (
        <div className="mt-4 space-y-1">
          {lastRuns.map((run) => (
            <LastRun key={run.id} run={run} />
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Not ranked" value={unranked} note={unranked ? `Next: Check and rank` : "All checked"} />
        <Stat label="Ranked" value={counts.ranked} note="Waiting for your pick" />
        <Stat label="Selected" value={`${selected.length}/${settings.dailyCap}`} note="For full research" />
        <Stat label="Applied" value={counts.applied + counts.replied + counts.interview} note={`${counts.interview} in interview`} />
        <Stat
          label="Questions"
          value={questions.length}
          note={questions.length ? "The engines need answers" : "Nothing to answer"}
          tone={questions.length ? "signal" : "plain"}
        />
      </div>

      {questions.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">Questions for you</h2>
            {questions.length > 2 && (
              <Link href="/questions" className="text-sm text-teal underline">
                All {questions.length}
              </Link>
            )}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {questions.slice(0, 2).map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                jobTitle={question.job_id ? getJob(question.job_id)?.title : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {(selected.length > 0 || pipeline) && (
        <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
          <p className="flex items-center gap-2 text-sm">
            {pipeline ? (
              <>
                <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
                {pipeline}
              </>
            ) : (
              <>
                <span className="font-semibold">{selected.length} selected</span> and waiting for research. Research writes the CV, cover letter, email, and form
                answers too.
              </>
            )}
          </p>
          {selected.length > 0 && (
            <ActionButton variant="primary" action={researchSelected} disabled={!stageReady("research-job")}>
              Research all selected
            </ActionButton>
          )}
        </div>
      )}

      {toReview.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">Waiting for your review</h2>
            <span className="font-mono text-xs text-slate">{toReview.length}</span>
          </div>
          <ul className="card mt-3 divide-y divide-line rounded-xl">
            {toReview.map(({ job, waiting, changes }) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}#documents`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-mist/60">
                  <span className="min-w-0">
                    <span className="font-medium" dir="auto">
                      {job.title}
                    </span>
                    <span className="text-sm text-slate" dir="auto">
                      {" "}
                      · {job.company}
                    </span>
                  </span>
                  <span className="flex gap-2 text-xs">
                    {waiting > 0 && <span className="rounded-full bg-teal-soft px-2 py-0.5 font-medium text-teal">{waiting} to review</span>}
                    {changes > 0 && <span className="rounded-full bg-coral-soft px-2 py-0.5 font-medium text-coral">{changes} to rewrite</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followUps.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">Follow-ups due</h2>
            <span className="font-mono text-xs text-slate">{followUps.length}</span>
          </div>
          <p className="mt-0.5 text-sm text-slate">Applications without a reply after {settings.followUpDays} days. One short follow-up each.</p>
          <ul className="card mt-3 divide-y divide-line rounded-xl">
            {followUps.map(({ job, sent, draftId, daysSinceApplied }) => (
              <FollowUpRow key={job.id} jobId={job.id} title={job.title} company={job.company} days={daysSinceApplied} sent={sent} draftId={draftId} />
            ))}
          </ul>
        </section>
      )}

      <div id="selected" className="anchor mt-8">
        <BulkSelection>
        <DeparturesBoard
          selectable
          title={`Selected for research · ${selected.length}/${settings.dailyCap}`}
          jobs={selected}
          settings={settings}
          selected
          sorting={selectedSort}
          empty={`Nothing selected yet. Pick up to ${settings.dailyCap} ranked jobs from Departures below; they go to full research.`}
        />
        </BulkSelection>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="label mb-0">Show</span>
          <FilterChips name="show" options={showOptions} current={params.show} params={params} allLabel={`Waiting ${waiting.length}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="label mb-0">Country</span>
          <FilterChips name="country" options={countryOptions} current={params.country} params={params} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="label mb-0">Role</span>
          <FilterChips name="role" options={roleOptions} current={params.role} params={params} />
        </div>
      </div>
      <div className="mt-3">
        {/* The filter bar reads and edits the address. */}
        <Suspense fallback={null}>
          <FilterBar />
        </Suspense>
      </div>

      <div id="departures" className="anchor mt-4">
        <BulkSelection>
        <DeparturesBoard
          selectable
          title={boardTitle}
          jobs={paged.rows}
          total={paged.total}
          settings={settings}
          sorting={departuresSort}
          empty={
            pool.length === 0
              ? show === "unranked"
                ? "Everything is ranked."
                : "No jobs here yet. Use Find new jobs to search for postings from the last day."
              : "No jobs match these filters."
          }
        />
        <Pagination
          page={paged.page}
          pages={paged.pages}
          start={paged.start}
          shown={paged.rows.length}
          total={paged.total}
          href={pageHref}
        />
        </BulkSelection>
      </div>
      <p className="mt-3 text-xs text-slate">
        Status follows each posting&apos;s age: Boarding means posted within {settings.freshness.fastTrackMinutes} minutes,
        Last call means it is close to the {settings.freshness.maxHours}-hour limit. Highest scores come first.
      </p>
    </div>
  );
}
