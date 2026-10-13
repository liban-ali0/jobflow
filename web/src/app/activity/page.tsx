import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ProgressList, parseProgress } from "@/components/progress-list";
import { Pagination } from "@/components/pagination";
import { countRuns, getRun, listConversations, listRuns } from "@/lib/data";
import { ENGINES, STAGES, closeAbandonedRuns, isStage, type EngineKey } from "@/lib/engine";
import { dayLabel, firstLine, timeOf } from "@/lib/format";
import type { Run } from "@/lib/types";

// Each run's state, as departure-board statuses.
const STATUS = {
  running: { label: "Running", flap: "bg-saffron text-on-saffron" },
  done: { label: "Done", flap: "border border-line text-go" },
  failed: { label: "Failed", flap: "bg-coral-soft text-coral" },
} as const;

const TRIGGERS: Record<string, string> = { schedule: "fast track", daily: "daily run" };
const PAGE = 40;
const SUMMARY_PREVIEW = 1200;

function duration(run: Run) {
  if (!run.finished_at) return null;
  const seconds = Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function engineLabel(run: Run) {
  if (!run.engine) return null;
  if (run.engine === "script") return "Script";
  return ENGINES[run.engine as EngineKey]?.label ?? run.engine;
}

function RunRow({ run, conversationExists }: { run: Run; conversationExists: boolean }) {
  const steps = parseProgress(run.progress);
  const took = duration(run);
  const status = STATUS[run.status];
  const meta = [engineLabel(run), took, TRIGGERS[run.trigger]].filter(Boolean).join(" · ");
  const preview = run.summary ? firstLine(run.summary) : run.status === "running" ? (steps.at(-1)?.text ?? "Starting…") : "";
  return (
    // Running and failed runs are open: they are the ones that need a look.
    <details open={run.status !== "done"} className="group border-b border-line/70 last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-3 hover:bg-mist/60 sm:grid-cols-[3.25rem_5.5rem_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-xs text-slate">{timeOf(run.started_at)}</span>
        <span className={`hidden w-fit rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase sm:inline-block ${status.flap}`}>
          {run.status === "running" && <span className="fresh-dot mr-1 inline-block size-1.5 rounded-full bg-on-saffron align-middle" aria-hidden />}
          {status.label}
        </span>
        <span className="min-w-0">
          <span aria-hidden className={`mr-1.5 inline-block size-2 rounded-full align-middle sm:hidden ${run.status === "failed" ? "bg-coral" : run.status === "running" ? "bg-saffron" : "bg-go"}`} />
          <span className="sr-only sm:hidden">{status.label}: </span>
          <span className="font-medium">{isStage(run.stage) ? STAGES[run.stage].label : run.stage}</span>
          {run.job_id !== null && <span className="ml-2 font-mono text-xs text-slate">JF-{String(run.job_id).padStart(3, "0")}</span>}
          {preview && (
            <span className="block truncate text-sm text-slate group-open:hidden" dir="auto">
              {preview}
            </span>
          )}
        </span>
        <span className="col-start-2 font-mono text-[11px] text-slate sm:col-start-auto sm:text-right">{meta}</span>
      </summary>
      <div className="space-y-3 pr-4 pb-4 pl-4 sm:pl-[calc(3.25rem+5.5rem+2.5rem)]">
        <p className="flex flex-wrap gap-3 text-sm">
          {run.job_id !== null && (
            <Link href={`/jobs/${run.job_id}`} className="text-teal underline">
              Open the job
            </Link>
          )}
          {run.conversation_id !== null && conversationExists && (
            <Link href={`/assistant/${run.conversation_id}`} className="text-teal underline">
              Open the conversation
            </Link>
          )}
        </p>
        {run.status === "running" && <ProgressList lines={steps} live />}
        {run.summary && (
          <div className="max-h-96 overflow-y-auto rounded-lg bg-mist/50 px-4 py-3">
            {/* The start of the report; the run's own page has all of it. */}
            <Markdown text={run.summary.length > SUMMARY_PREVIEW ? `${run.summary.slice(0, SUMMARY_PREVIEW).replace(/\s+\S*$/, "")} …` : run.summary} />
          </div>
        )}
        {run.status !== "running" && (
          <Link href={`/activity/${run.id}`} className="inline-block text-xs text-teal underline">
            {run.status === "failed" ? "Full report, every step, and the error" : "Full report and every step"} →
          </Link>
        )}
      </div>
    </details>
  );
}

export default async function ActivityPage(props: PageProps<"/activity">) {
  const { show, page: pageParam } = await props.searchParams;
  closeAbandonedRuns();
  const failedOnly = show === "failed";
  // A page of runs without their long progress; running ones get it back
  // for the live view.
  const total = countRuns(failedOnly ? { status: "failed" } : {});
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(pageParam) || 1)));
  const runs = listRuns(PAGE, { offset: (page - 1) * PAGE, ...(failedOnly ? { status: "failed" as const } : {}) }).map((run) =>
    run.status === "running" ? (getRun(run.id) ?? run) : run,
  );
  // A deleted conversation keeps its runs, but there is nothing to open.
  const conversations = new Set(listConversations().map((conversation) => conversation.id));
  const active = countRuns({ status: "running" });
  const failed = countRuns({ status: "failed" });
  // Grouped by day, newest first.
  const days = new Map<string, Run[]>();
  for (const run of runs) {
    const day = dayLabel(run.started_at);
    days.set(day, [...(days.get(day) ?? []), run]);
  }

  return (
    <div className="max-w-4xl">
      <AutoRefresh active={active > 0} />
      <PageHeader
        eyebrow={active ? `${active} running now` : `${total} ${total === 1 ? "run" : "runs"}`}
        title="Activity"
        description="Every step and assistant message, newest first. Open a row for the full report."
        actions={
          failed > 0 && (
            <Link href={failedOnly ? "/activity" : "/activity?show=failed"} className={`btn ${failedOnly ? "btn-primary" : "btn-quiet"}`}>
              {failedOnly ? "Show all" : `Failed only (${failed})`}
            </Link>
          )
        }
      />

      {runs.length === 0 ? (
        <p className="card mt-8 px-5 py-6 text-sm text-slate">
          {failedOnly ? "No failed runs." : "Nothing has run yet. Steps started from Today, Profile, a job, or the Assistant appear here, with what the engine did."}
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {[...days].map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 flex items-baseline gap-3 font-display text-lg font-semibold tracking-wide uppercase">
                {day}
                <span className="font-mono text-xs font-normal tracking-normal text-slate normal-case">
                  {list.length} {list.length === 1 ? "run" : "runs"}
                </span>
              </h2>
              <div className="card overflow-hidden rounded-xl shadow-sm">
                {list.map((run) => (
                  <RunRow key={run.id} run={run} conversationExists={run.conversation_id !== null && conversations.has(run.conversation_id)} />
                ))}
              </div>
            </section>
          ))}
          <Pagination
            page={page}
            pages={pages}
            start={(page - 1) * PAGE}
            shown={runs.length}
            total={total}
            href={(number) => `/activity?${new URLSearchParams({ ...(failedOnly ? { show: "failed" } : {}), page: String(number) })}`}
          />
        </div>
      )}
    </div>
  );
}
