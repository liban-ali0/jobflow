import Link from "next/link";
import { runStage } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { QuestionCard } from "@/components/question-card";
import { getJob, hasCv, listQuestions, listRuns, profileUpdatedAt } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import type { Question } from "@/lib/types";

const categoryOf = (question: Question) => question.category ?? (question.job_id ? "job" : "you");

const GROUPS = [
  { key: "cv", title: "CV gaps", hint: "What your CV is missing or gets wrong. Answers are added to the CVs Jobflow writes." },
  { key: "you", title: "About you", hint: "Facts every application needs, like your start date or work permits." },
  { key: "job", title: "This job", hint: "Questions about one job. The answer is saved with that job and used for its documents." },
] as const;

export default function QuestionsPage() {
  const open = listQuestions("open");
  const closed = listQuestions().filter((question) => question.status !== "open").slice(0, 30);
  const profileBuilt = profileUpdatedAt();
  const building = listRuns(20).some((run) => run.stage === "build-profile" && run.status === "running");
  // Answers about you or your CV that the profile has not taken in yet.
  const notInProfile = listQuestions("answered").filter(
    (question) => categoryOf(question) !== "job" && question.answered_at && (!profileBuilt || question.answered_at > profileBuilt),
  ).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={open.length ? `${open.length} waiting for you` : "All answered"}
        title="Questions"
        description="Everything Jobflow needs from you, in one place: gaps in your CV, facts about you, and questions about single jobs."
      />

      {notInProfile > 0 && (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-teal bg-teal-soft p-4">
          <p className="text-sm">
            <span className="font-semibold">
              {notInProfile} {notInProfile === 1 ? "answer is" : "answers are"}
            </span>{" "}
            not in your profile and CVs yet.
          </p>
          <ActionButton variant="primary" action={runStage.bind(null, "build-profile", null)} disabled={building || !hasCv()}>
            {building ? "Rebuilding…" : "Rebuild profile and CVs"}
          </ActionButton>
        </div>
      )}

      {open.length === 0 ? (
        <p className="card mt-8 px-4 py-6 text-sm text-slate">
          No open questions. Building your profile, ranking, research, and tailoring all ask here when they are missing something.
        </p>
      ) : (
        GROUPS.map((group) => {
          const questions = open.filter((question) => categoryOf(question) === group.key);
          if (questions.length === 0) return null;
          return (
            <section key={group.key} className="mt-8">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="section-title">{group.title}</h2>
                <span className="font-mono text-xs text-slate">{questions.length} open</span>
              </div>
              <p className="mt-0.5 mb-3 text-sm text-slate">{group.hint}</p>
              <div className="space-y-3">
                {questions.map((question) => (
                  <QuestionCard key={question.id} question={question} jobTitle={question.job_id ? getJob(question.job_id)?.title : undefined} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {closed.length > 0 && (
        <section className="mt-12">
          <h2 className="section-title">Answered</h2>
          <ul className="card mt-3 divide-y divide-line">
            {closed.map((question) => (
              <li key={question.id} className="px-4 py-3 text-sm">
                <p dir="auto">
                  {question.text}
                  {question.job_id && (
                    <Link href={`/jobs/${question.job_id}`} className="ml-2 text-xs text-teal underline">
                      job
                    </Link>
                  )}
                </p>
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
