import Link from "next/link";
import { notFound } from "next/navigation";
import { runStage, saveNotes } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { Freshness } from "@/components/freshness";
import { JobActionBar } from "@/components/job-actions";
import { StatusSelect } from "@/components/status-select";
import { getJob, getSettings, listContacts, listDocuments, listEvents } from "@/lib/data";
import { stageReady, stageRunning } from "@/lib/engine";
import { PRINTABLE, readText } from "@/lib/documents";
import { DocumentReview, type ReviewDoc } from "@/components/document-review";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDateTime, formatPlace } from "@/lib/format";
import { DOCUMENT_LABELS } from "@/lib/types";
import { ASSESSED } from "@/core/score.mjs";

// The most each part of the score can contribute (see core/score.mjs).
const SCORE_MAX: Record<string, number> = {
  Role: 25,
  Country: 15,
  Freshness: 15,
  ...Object.fromEntries(Object.values(ASSESSED).map(({ label, max }) => [label, max])),
  // Jobs ranked before the language criterion was renamed.
  Arabic: 3,
};

// Tabs in this order; the research is read-only reference.
const DOCUMENT_ORDER = ["cv", "cover_letter", "email", "answers", "research", "interview_pack"];

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  const job = getJob(Number(id));
  if (!job) notFound();

  const settings = getSettings();
  const contacts = listContacts(job.id);
  const documents = listDocuments(job.id);
  const events = listEvents(job.id);
  const researching = stageRunning("research-job", job.id);
  const tailoring = stageRunning("tailor-job", job.id);
  const working = researching ? "Researching this job…" : tailoring ? "Writing the documents…" : null;
  const reviewDocs: ReviewDoc[] = documents
    .filter((document) => DOCUMENT_ORDER.includes(document.type))
    .sort((a, b) => DOCUMENT_ORDER.indexOf(a.type) - DOCUMENT_ORDER.indexOf(b.type))
    .map((document) => ({
      id: document.id,
      type: document.type,
      label: DOCUMENT_LABELS[document.type] ?? document.type,
      review: document.review,
      note: document.review_note,
      text: readText(document.path) ?? "(The file is missing.)",
      printable: PRINTABLE.has(document.type),
      inPackage: document.type !== "research" && document.type !== "interview_pack",
      version: document.updated_at,
    }));
  const hasResearch = documents.some((document) => document.type === "research");
  const researchReady = stageReady("research-job");
  const tailorReady = stageReady("tailor-job");

  return (
    <div className="max-w-5xl">
      <AutoRefresh active={Boolean(working)} />
      <Link href="/" className="text-sm text-slate hover:text-ink">
        ← Today
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="page-title" dir="auto">
            {job.title}
          </h1>
          <p className="mt-1 text-slate" dir="auto">
            {job.company}
            {formatPlace(job) && ` · ${formatPlace(job)}`}
          </p>
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-teal underline">
              Open the listing
            </a>
          )}
        </div>
        <Freshness postedAt={job.posted_at} {...settings.freshness} />
      </header>

      <div className="mt-6">
        <JobActionBar job={{ id: job.id, status: job.status, url: job.url, ranked: job.score !== null }} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="card-title">Score</h2>
            {job.score === null ? (
              <p className="mt-2 text-sm text-slate">Not ranked yet.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  <span className="font-display text-2xl font-semibold">{Math.round(job.score)}</span>
                  <span className="text-slate"> / 100</span>
                  {job.score_reason && ` · ${job.score_reason}`}
                </p>
                {job.score_breakdown && (
                  <dl className="mt-4 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
                    {Object.entries(job.score_breakdown).map(([name, value]) => {
                      const max = SCORE_MAX[name] ?? 15;
                      const share = Math.min(1, value / max);
                      return (
                        <div key={name}>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate">{name}</dt>
                            <dd className="font-mono text-xs">
                              {value}
                              <span className="text-slate">/{max}</span>
                            </dd>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mist">
                            <div
                              className={`h-full rounded-full ${share >= 0.7 ? "bg-go" : share >= 0.4 ? "bg-saffron" : "bg-coral"}`}
                              style={{ width: `${Math.max(share * 100, value > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </>
            )}
            {job.legitimacy && (
              <p className="mt-3 text-sm">
                <span className="text-slate">Legitimacy check: </span>
                {job.legitimacy}
              </p>
            )}
            {job.salary_estimate && (
              <p className="mt-1 text-sm">
                <span className="text-slate">Market salary: </span>
                {job.salary_estimate}
              </p>
            )}
          </section>

          <section id="documents" className="card scroll-mt-32 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="card-title">Documents</h2>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  variant={hasResearch ? "quiet" : "primary"}
                  action={runStage.bind(null, "research-job", job.id)}
                  disabled={!researchReady || Boolean(working)}
                  title="Researches the company, the job, people to contact, and the salary; the documents follow automatically"
                >
                  {hasResearch ? "Research again" : "Research"}
                </ActionButton>
                {hasResearch && (
                  <ActionButton
                    action={runStage.bind(null, "tailor-job", job.id)}
                    disabled={!tailorReady || Boolean(working)}
                    title="Writes any missing documents and redoes those with changes requested. Your edits and approved documents are left alone."
                  >
                    Write documents
                  </ActionButton>
                )}
              </div>
            </div>
            {working && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
                {working}
              </p>
            )}
            {reviewDocs.length === 0 ? (
              !working && (
                <p className="mt-3 text-sm text-slate">
                  No documents yet. Research writes the research notes, then the tailored CV, cover letter, outreach email, and form answers follow
                  automatically.
                </p>
              )
            ) : (
              <div className="mt-4">
                <DocumentReview jobId={job.id} docs={reviewDocs} rewriting={tailoring} />
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="card-title">Contacts</h2>
            {contacts.length === 0 ? (
              <p className="mt-3 text-sm text-slate">No contacts found yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {contacts.map((contact) => (
                  <li key={contact.id} className="py-2">
                    <span className="font-medium" dir="auto">{contact.name}</span>
                    {contact.role && <span className="text-slate"> · {contact.role}</span>}
                    <div className="text-slate">
                      {contact.email && (
                        <span>
                          {contact.email} ({contact.email_verified ? "confirmed" : "not confirmed"})
                        </span>
                      )}
                      {contact.linkedin && (
                        <a href={contact.linkedin} target="_blank" rel="noreferrer" className="ml-2 text-teal underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {job.description && (
            <section className="card p-5">
              <h2 className="card-title">Listing</h2>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap" dir="auto">
                {job.description}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="card p-5">
            <StatusSelect jobId={job.id} status={job.status} />
            {job.follow_up_due && job.status === "applied" && (
              <p className="mt-3 text-xs text-slate">Follow up on {formatDateTime(job.follow_up_due)}</p>
            )}
            {job.folder && <p className="mt-3 font-mono text-xs break-all text-slate">{job.folder}</p>}
          </div>

          <form action={saveNotes.bind(null, job.id)} className="card p-5">
            <label className="label" htmlFor="notes">
              Notes
            </label>
            <textarea id="notes" name="notes" rows={5} defaultValue={job.notes ?? ""} className="field" dir="auto" />
            <button type="submit" className="btn btn-quiet mt-3">
              Save notes
            </button>
          </form>

          <div className="card p-5">
            <h2 className="label">History</h2>
            <ol className="space-y-2 text-sm">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="font-mono text-xs text-slate">{formatDateTime(event.at)}</span>
                  <div>
                    {event.type}
                    {event.detail && `: ${event.detail}`}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
