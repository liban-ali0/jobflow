import { notFound } from "next/navigation";
import { runStage } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ApplyPanel } from "@/components/apply-panel";
import { NotesForm } from "@/components/notes-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { BackLink } from "@/components/back-link";
import { BoardingPass } from "@/components/boarding-pass";
import { DocumentReview, type ReviewDoc } from "@/components/document-review";
import { ExpandableText } from "@/components/expandable-text";
import { JobActionBar } from "@/components/job-actions";
import { Panel } from "@/components/panel";
import { RewriteDocuments } from "@/components/rewrite-documents";
import { StatusSelect } from "@/components/status-select";
import { OutcomeBar } from "@/components/tracking";
import { MailReplies } from "@/components/mail-replies";
import { applyPack } from "@/lib/apply";
import { checkCv } from "@/lib/ats";
import { targetForJob } from "@/lib/ats-keywords";
import { getJob, getSettings, listContacts, listDocuments, listEvents, listMails } from "@/lib/data";
import { composeFor } from "@/lib/mail";
import { PRINTABLE, readText } from "@/lib/documents";
import { stageReady, stageRunning } from "@/lib/engine";
import { followUpState } from "@/lib/followups";
import { formatDateTime } from "@/lib/format";
import { describeEvent } from "@/lib/history";
import { DOCUMENT_LABELS, SENT_STATUSES } from "@/lib/types";
import { ASSESSED } from "@/core/score.mjs";

// The most each part of the score can contribute (see core/score.mjs).
const SCORE_MAX: Record<string, number> = {
  Role: 25,
  Country: 15,
  Freshness: 15,
  ...Object.fromEntries(Object.values(ASSESSED).map(({ label, max }) => [label, max])),
};
// Names used by jobs ranked before the score parts were renamed.
const OLD_NAMES: Record<string, string> = { Arabic: "Language", "Entry-level fit": "Experience fit" };

// Tabs in this order; the research is read-only reference.
const DOCUMENT_ORDER = ["cv", "cover_letter", "email", "answers", "follow_up", "research", "interview_pack"];

// Whether "Fill it in Chrome" can be used for this job, and why not.
function applyInChrome(url: string | null, approved: boolean) {
  if (!approved) return { available: false, reason: "Approve all documents first." };
  if (!url) return { available: false, reason: "This job has no link to its application." };
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { available: false, reason: "The link to this job is not a valid web address." };
  }
  if (/(^|\.)linkedin\.com$/i.test(host)) {
    return { available: false, reason: "LinkedIn: apply there yourself with the answers below; automated filling can get the account restricted." };
  }
  if (!stageReady("apply-job")) return { available: false, reason: "The apply step is missing." };
  return { available: true };
}

// A label and value in the sidebar's details list.
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="mt-0.5 text-sm" dir="auto">
        {children}
      </dd>
    </div>
  );
}

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
  const improving = stageRunning("improve-cv", job.id);
  const packing = stageRunning("interview-pack", job.id);
  const working = researching ? "Researching this job…" : tailoring ? "Writing the documents…" : improving ? "Improving the CV for ATS…" : packing ? "Writing the interview pack…" : null;
  const atsTarget = targetForJob(job.id);
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
      inPackage: !["research", "follow_up", "interview_pack"].includes(document.type),
      version: document.updated_at,
    }))
    .map((doc) => (doc.type === "cv" ? { ...doc, ats: checkCv(doc.text, atsTarget) } : doc));
  const hasResearch = documents.some((document) => document.type === "research");
  // The application documents, for "Rewrite documents".
  const packageDocs = documents
    .filter((document) => ["cv", "cover_letter", "email", "answers"].includes(document.type))
    .map((document) => ({ type: document.type, approved: document.review === "approved" }));
  // Applied, or closed: no Apply section any more.
  const afterApplying = [...SENT_STATUSES, "excluded"].includes(job.status);
  // The Apply section: once the package is written, until the job is applied to.
  // Shown once every document is approved; before that, Documents is the next step.
  const fullPack = !afterApplying && documents.some((document) => document.type === "answers") ? applyPack(job.id) : null;
  const pack = fullPack?.approved ? fullPack : null;
  // Emails in Gmail: replies waiting for the user, and the written ones to send.
  const jobMails = listMails({ state: "new", jobId: job.id });
  const asGmail = (kind: "follow_up" | "application") => {
    const email = composeFor(job.id, kind);
    return email ? { jobId: job.id, kind, url: email.url, to: email.to, attach: email.attach } : null;
  };
  const followUpEmail = job.status === "applied" ? asGmail("follow_up") : null;
  const applicationEmail = pack?.email ? asGmail("application") : null;
  const filling = stageRunning("apply-job", job.id);
  const chrome = applyInChrome(job.url, pack?.approved ?? false);
  const breakdown = Object.entries(job.score_breakdown ?? {}).map(([name, value]) => {
    const shown = OLD_NAMES[name] ?? name;
    return { name: shown, value, max: SCORE_MAX[shown] ?? SCORE_MAX[name] ?? 15 };
  });

  return (
    <div className="max-w-6xl">
      <AutoRefresh active={Boolean(working)} />
      <BackLink fallbackHref="/" fallbackLabel="Today" />

      <div className="mt-3">
        <BoardingPass job={job} settings={settings} />
      </div>

      <div className="mt-5">
        <JobActionBar job={{ id: job.id, status: job.status, url: job.url, ranked: job.score !== null }} hasResearch={hasResearch} working={Boolean(working)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          {jobMails.length > 0 && (
            <section aria-labelledby="job-mail" className="space-y-2">
              <h2 id="job-mail" className="section-title">
                From your email
              </h2>
              <MailReplies mails={jobMails} showJob={false} />
            </section>
          )}

          {afterApplying && (
            <OutcomeBar
              gmail={followUpEmail}
              jobId={job.id}
              status={job.status}
              applied={job.applied_at ? `Applied ${formatDateTime(job.applied_at)}` : null}
              followUp={followUpState(job)}
              interviewPack={
                job.status === "interview"
                  ? { exists: documents.some((document) => document.type === "interview_pack"), running: stageRunning("interview-pack", job.id), at: job.interview_at }
                  : null
              }
            />
          )}

          {pack && (
            <Panel
              id="apply"
              title="Apply"
              hint="Everything is approved. Offerbound fills the form or prepares the email; you check it and press Submit."
            >
              <ApplyPanel
                jobId={job.id}
                url={job.url}
                profile={pack.profile}
                answers={pack.answers}
                coverLetterText={pack.coverLetterText}
                files={pack.files}
                emailTo={pack.email?.to ?? null}
                gmail={applicationEmail}
                chrome={chrome}
                filling={filling}
                waiting={job.status === "ready" ? job.apply_missing : null}
              />
            </Panel>
          )}

          <Panel
            id="documents"
            title="Documents"
            hint={
              reviewDocs.length === 0
                ? "Research writes the notes, then the tailored CV, cover letter, outreach email, and form answers follow."
                : "Read, edit, and approve each one before you apply."
            }
            actions={
              <>
                <ActionButton
                  variant={hasResearch ? "quiet" : "primary"}
                  action={runStage.bind(null, "research-job", job.id)}
                  disabled={!stageReady("research-job") || Boolean(working)}
                  title="Researches the company, the job, people to contact, and the salary; the documents follow automatically"
                >
                  {hasResearch ? "Research again" : "Research"}
                </ActionButton>
                {hasResearch &&
                  (packageDocs.length > 0 ? (
                    <RewriteDocuments jobId={job.id} docs={packageDocs} disabled={!stageReady("tailor-job") || Boolean(working)} />
                  ) : (
                    <ActionButton
                      action={runStage.bind(null, "tailor-job", job.id)}
                      disabled={!stageReady("tailor-job") || Boolean(working)}
                      title="Writes the tailored CV, cover letter, outreach email, and form answers"
                    >
                      Write documents
                    </ActionButton>
                  ))}
              </>
            }
          >
            {working && (
              <p className="mb-4 flex items-center gap-2 rounded-md bg-saffron-soft px-3 py-2 text-sm">
                <span className="fresh-dot size-2 rounded-full bg-signal" aria-hidden />
                {working}
              </p>
            )}
            {reviewDocs.length === 0 ? (
              !working && <p className="text-sm text-slate">No documents yet.</p>
            ) : (
              <DocumentReview jobId={job.id} docs={reviewDocs} rewriting={tailoring} improving={improving} />
            )}
          </Panel>

          <Panel id="score" title="Why this score" hint={job.score === null ? undefined : job.score_reason}>
            {job.score === null ? (
              <p className="text-sm text-slate">Not ranked yet. Rank it to see how well it fits your profile and settings.</p>
            ) : (
              <>
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  {breakdown.map(({ name, value, max }) => {
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
                            className={`h-full rounded-full ${share >= 0.7 ? "bg-go" : share >= 0.4 ? "bg-teal" : "bg-coral"}`}
                            style={{ width: `${Math.max(share * 100, value > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </dl>
                {job.legitimacy && (
                  <p className="mt-4 border-t border-line/70 pt-3 text-sm">
                    <span className="font-medium">Is it genuine? </span>
                    <span className="text-slate">{job.legitimacy}</span>
                  </p>
                )}
              </>
            )}
          </Panel>

          {job.description && (
            <Panel id="listing" title="The listing">
              <ExpandableText text={job.description} />
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          <Panel title="Details">
            <StatusSelect jobId={job.id} status={job.status} />
            <dl className="mt-4 space-y-3">
              {job.salary_estimate && <Detail label="Market salary">{job.salary_estimate}</Detail>}
              {job.applied_at && <Detail label="Applied">{formatDateTime(job.applied_at)}</Detail>}
              {job.follow_up_due && job.status === "applied" && <Detail label="Follow up">{formatDateTime(job.follow_up_due)}</Detail>}
              {job.excluded_reason && job.status === "excluded" && <Detail label="Not interested because">{job.excluded_reason}</Detail>}
              <Detail label="Found">
                {formatDateTime(job.found_at)}
                {job.source && ` on ${job.source === "linkedin" ? "LinkedIn" : job.source}`}
              </Detail>
            </dl>
          </Panel>

          <Panel title="People" hint={contacts.length ? undefined : "Research looks for the hiring manager or recruiter."}>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate">No one found yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <p className="font-medium" dir="auto">
                      {contact.name}
                    </p>
                    {contact.role && (
                      <p className="text-xs text-slate" dir="auto">
                        {contact.role}
                      </p>
                    )}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {contact.email && (
                        <span>
                          {contact.email}
                          <span className={contact.email_verified ? "text-go" : "text-slate"}>{contact.email_verified ? " · confirmed" : " · not confirmed"}</span>
                        </span>
                      )}
                      {contact.linkedin && (
                        <a href={contact.linkedin} target="_blank" rel="noreferrer" className="text-teal underline">
                          LinkedIn
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Notes">
            <NotesForm key={job.notes ?? ""} jobId={job.id} notes={job.notes ?? ""} />
          </Panel>

          <Panel title="History">
            <ol className="relative space-y-3 border-l border-line pl-4">
              {events.map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-surface bg-field" />
                  <p>{describeEvent(event)}</p>
                  <p className="font-mono text-[11px] text-slate">{formatDateTime(event.at)}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
