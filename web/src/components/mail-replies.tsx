"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { confirmMail, dismissMail } from "@/app/mail-actions";
import { MAIL_KIND_LABELS } from "@/lib/mail-labels";
import { STATUS_LABELS, type Mail } from "@/lib/types";

export type MailRow = Pick<
  Mail,
  "id" | "job_id" | "job_title" | "job_company" | "job_status" | "from_name" | "from_email" | "subject" | "snippet" | "link" | "received_at" | "kind" | "suggestion"
>;

const TONE: Record<string, string> = {
  interview: "text-teal",
  offer: "text-go",
  rejected: "text-coral",
  action: "text-ink",
  replied: "text-slate",
};

function MailItem({ mail, applications, showJob }: { mail: MailRow; applications: { id: number; label: string }[]; showJob: boolean }) {
  const [jobId, setJobId] = useState<number | null>(mail.job_id);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>) => start(async () => setResult(await action()));
  // Only a step forward is suggested: an interview email for a job already at
  // "Interview" is just noted.
  const suggestion = mail.suggestion && mail.suggestion !== mail.job_status ? mail.suggestion : null;
  const when = mail.received_at ? new Date(mail.received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  return (
    <li className="space-y-2 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={`font-mono text-[11px] font-semibold tracking-wide uppercase ${TONE[mail.kind ?? "replied"] ?? "text-slate"}`}>
          {mail.kind ? MAIL_KIND_LABELS[mail.kind] : "Email"}
        </span>
        {when && (
          <span className="font-mono text-xs text-slate" suppressHydrationWarning>
            {when}
          </span>
        )}
      </div>
      {showJob && mail.job_id && (
        <p className="text-sm">
          <Link href={`/jobs/${mail.job_id}`} className="font-medium hover:text-teal hover:underline" dir="auto">
            {mail.job_title}
          </Link>
          <span className="text-slate" dir="auto">
            {" "}
            · {mail.job_company}
          </span>
        </p>
      )}
      <div className="min-w-0 text-sm">
        <p className="font-medium break-words" dir="auto">
          {mail.subject || "(no subject)"}
        </p>
        <p className="text-xs break-all text-slate" dir="auto">
          {mail.from_name || mail.from_email}
          {mail.from_name && mail.from_email ? ` <${mail.from_email}>` : ""}
        </p>
        {mail.snippet && (
          <p className="mt-1 line-clamp-2 text-slate" dir="auto">
            {mail.snippet}
          </p>
        )}
      </div>
      {!mail.job_id && (
        <label className="block text-sm">
          <span className="font-medium">Which application is it about?</span>
          <select value={jobId ?? ""} onChange={(event) => setJobId(event.target.value ? Number(event.target.value) : null)} className="field mt-1">
            <option value="">Choose…</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {suggestion && (
          <button type="button" disabled={pending || !jobId} onClick={() => run(() => confirmMail(mail.id, jobId!, suggestion))} className="btn btn-primary px-3 py-1.5 text-xs">
            Mark as {STATUS_LABELS[suggestion]}
          </button>
        )}
        <button
          type="button"
          disabled={pending || !jobId}
          onClick={() => run(() => confirmMail(mail.id, jobId!, ""))}
          className={`btn px-3 py-1.5 text-xs ${suggestion ? "btn-quiet" : "btn-primary"}`}
        >
          {suggestion ? "Only note it" : "Note it on the job"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => dismissMail(mail.id))} className="btn btn-quiet px-3 py-1.5 text-xs">
          Not about {mail.job_id ? "this job" : "an application"}
        </button>
        {mail.link && (
          <a href={mail.link} target="_blank" rel="noreferrer" className="btn btn-quiet px-3 py-1.5 text-xs">
            Read in Gmail ↗
          </a>
        )}
      </div>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </p>
      )}
    </li>
  );
}

// Emails found in the user's Gmail about their applications, each waiting
// for the user to say what it means.
export function MailReplies({ mails, applications = [], showJob = true }: { mails: MailRow[]; applications?: { id: number; label: string }[]; showJob?: boolean }) {
  return (
    <ul className="card divide-y divide-line rounded-xl">
      {mails.map((mail) => (
        <MailItem key={mail.id} mail={mail} applications={applications} showJob={showJob} />
      ))}
    </ul>
  );
}
