import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { BackLink } from "@/components/back-link";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ProgressList, parseProgress } from "@/components/progress-list";
import { StopButton } from "@/components/stop-button";
import { getConversation, getRun } from "@/lib/data";
import { ENGINES, runLabel, type EngineKey } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";

const STATUS = { running: "Running", done: "Done", failed: "Failed" } as const;

// One run in full: its report, every step the engine took, and the error.
export default async function RunPage(props: PageProps<"/activity/[id]">) {
  const { id } = await props.params;
  const run = getRun(Number(id));
  if (!run) notFound();
  const steps = parseProgress(run.progress);
  const stage = runLabel(run.stage);
  const engine = run.engine === "script" ? "Script" : run.engine ? (ENGINES[run.engine as EngineKey]?.label ?? run.engine) : null;
  const conversation = run.conversation_id !== null ? getConversation(run.conversation_id) : null;
  return (
    <div className="max-w-4xl space-y-6">
      <AutoRefresh active={run.status === "running"} />
      <BackLink fallbackHref="/activity" fallbackLabel="Activity" />
      <PageHeader
        eyebrow={[STATUS[run.status], engine, formatDateTime(run.started_at)].filter(Boolean).join(" · ")}
        title={stage}
        description={
          <span className="flex flex-wrap gap-3">
            {run.job_id !== null && (
              <Link href={`/jobs/${run.job_id}`} className="text-teal underline">
                Open the job
              </Link>
            )}
            {conversation && (
              <Link href={`/assistant/${conversation.id}`} className="text-teal underline">
                Open the conversation
              </Link>
            )}
            {run.finished_at && <span>Finished {formatDateTime(run.finished_at)}</span>}
            {run.status === "running" && <StopButton runId={run.id} />}
          </span>
        }
      />
      {run.summary && (
        <Panel title="Report">
          <Markdown text={run.summary} />
        </Panel>
      )}
      {steps.length > 0 && (
        <Panel title={`What the engine did · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`}>
          <ProgressList lines={steps} live={run.status === "running"} />
        </Panel>
      )}
      {run.status === "failed" && run.log && (
        <Panel title="Error details">
          <pre className="max-h-[32rem] overflow-auto rounded bg-mist p-3 font-mono text-xs whitespace-pre-wrap">{run.log}</pre>
        </Panel>
      )}
    </div>
  );
}
