import { notFound } from "next/navigation";
import { removeConversation, sendMessage } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { BackLink } from "@/components/back-link";
import { Composer } from "@/components/composer";
import { Markdown } from "@/components/markdown";
import { ProgressList, parseProgress } from "@/components/progress-list";
import { getConversation, getRun, listMessages, listRunningRuns } from "@/lib/data";
import { ENGINES, closeAbandonedRuns } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";
import type { Message } from "@/lib/types";

function Bubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-lg bg-primary px-4 py-3 text-sm whitespace-pre-wrap text-on-primary" dir="auto">
        {message.text}
      </div>
    );
  }
  const run = message.run_id ? getRun(message.run_id) : undefined;
  const steps = parseProgress(run?.progress ?? null);
  return (
    <div
      className={`max-w-[95%] rounded-lg border px-4 py-3 ${
        message.role === "error" ? "border-coral bg-coral-soft" : "border-line bg-surface"
      }`}
    >
      {message.role === "error" ? <p className="text-sm whitespace-pre-wrap">{message.text}</p> : <Markdown text={message.text} />}
      {steps.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate">
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </summary>
          <div className="mt-2">
            <ProgressList lines={steps} />
          </div>
        </details>
      )}
    </div>
  );
}

export default async function ConversationPage(props: PageProps<"/assistant/[id]">) {
  const { id } = await props.params;
  const conversation = getConversation(Number(id));
  if (!conversation) notFound();

  closeAbandonedRuns();
  const messages = listMessages(conversation.id);
  const running = listRunningRuns().find((run) => run.conversation_id === conversation.id);
  // The live progress lines come with the full run.
  const active = running ? getRun(running.id) : undefined;
  const engine = ENGINES[conversation.engine]?.label ?? conversation.engine;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallbackHref="/assistant" fallbackLabel="Assistant" />
      <AutoRefresh active={Boolean(active)} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-semibold" dir="auto">
            {conversation.title}
          </h2>
          <p className="text-xs text-slate">
            {engine}
            {conversation.effort && ` · ${conversation.effort} effort`} · started {formatDateTime(conversation.created_at)}
          </p>
        </div>
        <form action={removeConversation.bind(null, conversation.id)}>
          <button type="submit" className="btn btn-quiet text-xs">
            Delete conversation
          </button>
        </form>
      </header>

      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="card px-4 py-6 text-sm text-slate">
            No messages yet. {engine} will see this project&apos;s files and data when you write.
          </p>
        )}
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {active && (
          <div className="max-w-[95%] rounded-lg border border-saffron bg-saffron-soft px-4 py-3">
            <p className="mb-2 text-sm font-medium">{engine} is working</p>
            <ProgressList lines={parseProgress(active.progress)} live />
          </div>
        )}
      </div>

      <Composer action={sendMessage.bind(null, conversation.id)} busy={Boolean(active)} />
    </div>
  );
}
