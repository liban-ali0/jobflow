import { PageHeader } from "@/components/page-header";
import { QuestionCard } from "@/components/question-card";
import { getJob, listQuestions } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export default function QuestionsPage() {
  const open = listQuestions("open");
  const closed = listQuestions().filter((question) => question.status !== "open").slice(0, 30);

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={open.length ? `${open.length} waiting for you` : "All answered"}
        title="Questions"
        description="What the engines need to know from you. Answers about you go into your facts, answers about a job into its notes, and every later step reads them."
      />

      <section className="mt-8 space-y-3">
        {open.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-slate">
            No open questions. The profile and ranking steps ask here when they are missing a fact.
          </p>
        ) : (
          open.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              jobTitle={question.job_id ? getJob(question.job_id)?.title : undefined}
            />
          ))
        )}
      </section>

      {closed.length > 0 && (
        <section className="mt-12">
          <h2 className="section-title">Answered</h2>
          <ul className="card mt-3 divide-y divide-line">
            {closed.map((question) => (
              <li key={question.id} className="px-4 py-3 text-sm">
                <p dir="auto">{question.text}</p>
                <p className="mt-1">
                  {question.status === "answered" ? (
                    <span className="font-medium" dir="auto">
                      {question.answer}
                    </span>
                  ) : (
                    <span className="text-slate">Dismissed</span>
                  )}
                  <span className="text-xs text-slate"> · {formatDateTime(question.answered_at)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
