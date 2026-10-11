import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ProgressList, parseProgress } from "@/components/progress-list";
import { listRuns } from "@/lib/data";
import { ENGINES, STAGES, closeAbandonedRuns, isStage, type EngineKey } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";
import type { Run } from "@/lib/types";

const STATUS_STYLE = {
  running: "bg-saffron text-on-saffron",
  done: "bg-go-soft text-go",
  failed: "bg-coral-soft text-coral",
};

const STATUS_LABEL = { running: "Running", done: "Done", failed: "Failed" };

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

export default function ActivityPage() {
  closeAbandonedRuns();
  const runs = listRuns();
  const active = runs.filter((run) => run.status === "running").length;
  const failed = runs.filter((run) => run.status === "failed").length;

  return (
    <div className="max-w-4xl">
      <AutoRefresh active={active > 0} />
      <PageHeader
        eyebrow={active ? `${active} running now` : `${runs.length} runs${failed ? ` · ${failed} failed` : ""}`}
        title="Activity"
        description="Every step and assistant message, with what the engine did and how it ended."
      />

      {runs.length === 0 ? (
        <p className="card mt-8 px-4 py-6 text-sm text-slate">
          Nothing has run yet. Steps started from Today, Profile, or the Assistant appear here.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {runs.map((run) => {
            const steps = parseProgress(run.progress);
            const took = duration(run);
            return (
              <li key={run.id} className={`card p-4 ${run.status === "running" ? "border-saffron" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[run.status]}`}>
                    {STATUS_LABEL[run.status]}
                  </span>
                  <span className="font-medium">{isStage(run.stage) ? STAGES[run.stage].label : run.stage}</span>
                  {run.job_id !== null && (
                    <Link href={`/jobs/${run.job_id}`} className="text-sm text-teal underline">
                      job {run.job_id}
                    </Link>
                  )}
                  {run.conversation_id !== null && (
                    <Link href={`/assistant/${run.conversation_id}`} className="text-sm text-teal underline">
                      conversation
                    </Link>
                  )}
                  <span className="ml-auto font-mono text-xs text-slate">
                    {[
                      formatDateTime(run.started_at),
                      took && `took ${took}`,
                      engineLabel(run),
                      run.trigger === "schedule" ? "scheduled" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>

                {run.status === "running" && (
                  <div className="mt-3">
                    <ProgressList lines={steps} live />
                  </div>
                )}
                {run.summary && (
                  <div className="mt-3 max-h-72 overflow-y-auto">
                    <Markdown text={run.summary} />
                  </div>
                )}
                {run.status !== "running" && steps.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-slate hover:text-ink">
                      What the engine did · {steps.length} {steps.length === 1 ? "step" : "steps"}
                    </summary>
                    <div className="mt-2">
                      <ProgressList lines={steps} />
                    </div>
                  </details>
                )}
                {run.status === "failed" && run.log && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-slate hover:text-ink">Error details</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-mist p-3 font-mono whitespace-pre-wrap">{run.log}</pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
