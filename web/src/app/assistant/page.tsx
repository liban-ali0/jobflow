import { startConversation } from "@/app/actions";
import { PendingSubmit } from "@/components/form-buttons";
import { ENGINES } from "@/lib/engine";

const EXAMPLES = [
  "Rank the next 10 jobs that are waiting.",
  "Which of today's jobs fit my experience best, and why?",
  "Explain the score of the highest ranked job.",
  "Add a ranking rule: skip jobs that need a driving licence.",
];

export default function AssistantHome() {
  return (
    <form action={startConversation} className="card p-6">
      <h2 className="card-title">Start a conversation</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        The engine works on this project with the same permissions as the workflow steps, and you see each command it runs
        while it works. Pick one to start, or press New on the left for an empty conversation.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="example-engine" className="label mb-0">
          Engine
        </label>
        <select id="example-engine" name="engine" className="field w-44">
          {Object.entries(ENGINES).map(([key, engine]) => (
            <option key={key} value={key}>
              {engine.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <PendingSubmit
            key={example}
            name="message"
            value={example}
            className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-mist px-4 py-3 text-left text-sm transition-colors hover:border-ink hover:bg-surface disabled:opacity-60"
          >
            {example}
            <span className="text-slate transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden>
              →
            </span>
          </PendingSubmit>
        ))}
      </div>
    </form>
  );
}
