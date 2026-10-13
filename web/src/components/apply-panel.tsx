"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { fillInChrome, markApplied } from "@/app/job-actions";
import type { ApplyAnswer, ApplyProfile } from "@/lib/apply";
import { useJobflowExtension } from "./use-extension";

// Answers that still wait for a fact from the user.
const UNANSWERED = /not known yet|open question|fill this in|\bTBD\b|to be confirmed/i;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md border border-field px-2 py-1 text-xs hover:border-ink"
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export type ApplyPanelProps = {
  jobId: number;
  url: string | null;
  profile: ApplyProfile;
  answers: ApplyAnswer[];
  coverLetterText: string;
  files: { type: "cv" | "cover_letter"; documentId: number; fileName: string }[];
  emailTo: string | null;
  // Claude Code steps can run, and the listing is not on a site where
  // automated filling risks the account.
  chrome: { available: boolean; reason?: string };
  filling: boolean;
  // What the extension could not fill, while the job waits for the user.
  waiting: string[] | null;
};

// The extension's status, said plainly.
const EXTENSION_HINT = {
  checking: "Checking for the Offerbound extension…",
  missing: "Install the Offerbound extension first: Settings → Sources shows how.",
  "no-key": "Connect the extension first: Settings → Sources → Connect.",
  ready: "",
} as const;

// How to send the application: the form filled for you (in Chrome, or with
// the extension), an email draft, or everything ready to paste. The user
// always presses Submit.
export function ApplyPanel({ jobId, url, profile, answers, coverLetterText, files, emailTo, chrome, filling, waiting }: ApplyPanelProps) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const extension = useJobflowExtension();
  const openForm = () =>
    start(async () => {
      const reply = await extension.apply([jobId]);
      setResult({ ok: reply.ok, message: reply.ok ? `${reply.message} Fill in what is yellow, then submit it there yourself.` : (reply.message ?? "") });
    });
  const open = answers.filter((answer) => UNANSWERED.test(answer.answer));
  const details = [
    { label: "Name", value: profile.name },
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone },
    { label: "Location", value: profile.location },
    { label: "LinkedIn", value: profile.linkedin },
    { label: "Website", value: profile.website },
  ].filter((item) => item.value);

  return (
    <div className="space-y-5">
      {waiting && waiting.length > 0 && (
        <div className="rounded-lg border border-saffron bg-saffron-soft p-3">
          <p className="text-sm font-semibold">Waiting for you</p>
          <p className="mt-0.5 text-sm">The form is filled as far as Offerbound could. Finish these on the form, then submit it:</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
            {waiting.map((reason) => (
              <li key={reason} dir="auto">
                {reason}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={extension.state !== "ready" || pending} onClick={openForm} className="btn btn-quiet px-3 py-1.5 text-sm" title={EXTENSION_HINT[extension.state]}>
              Open the form again
            </button>
            <button type="button" disabled={pending} onClick={() => start(async () => setResult(await markApplied(jobId)))} className="btn btn-quiet px-3 py-1.5 text-sm">
              I submitted it
            </button>
          </div>
        </div>
      )}

      {open.length > 0 && (
        <p className="rounded-md bg-coral-soft px-3 py-2 text-sm">
          <span className="font-medium text-coral">Still open: </span>
          {open.map((answer) => answer.question).join(", ")}. Answer it in Questions or edit the form answers before you submit.
        </p>
      )}

      <ol className="grid gap-3 md:grid-cols-3">
        <li className="rounded-lg border border-line p-3">
          <p className="font-mono text-[10px] tracking-[0.18em] text-slate uppercase">Way 1 · Offerbound extension</p>
          <p className="mt-1 text-sm font-medium">Fill the form in your browser</p>
          <p className="mt-0.5 text-xs text-slate">Opens the form, fills every step, and marks what it could not fill in yellow. You submit; Offerbound records it.</p>
          <button type="button" disabled={extension.state !== "ready" || pending} onClick={openForm} className="btn btn-primary mt-2.5 w-full">
            Open and fill the form
          </button>
          {EXTENSION_HINT[extension.state] && <p className="mt-1 text-xs text-slate">{EXTENSION_HINT[extension.state]}</p>}
        </li>
        <li className="rounded-lg border border-line p-3">
          <p className="font-mono text-[10px] tracking-[0.18em] text-slate uppercase">Way 2 · Claude Code</p>
          <p className="mt-1 text-sm font-medium">Fill it with Claude in Chrome</p>
          <p className="mt-0.5 text-xs text-slate">For unusual forms: Claude opens it in your Chrome, fills it, attaches the PDFs, and stops before Submit.</p>
          <button
            type="button"
            disabled={!chrome.available || pending || filling}
            title={chrome.reason}
            onClick={() => start(async () => setResult(await fillInChrome(jobId)))}
            className="btn btn-quiet mt-2.5 w-full"
          >
            {filling ? "Filling…" : "Fill with Claude"}
          </button>
          {chrome.reason && <p className="mt-1 text-xs text-slate">{chrome.reason}</p>}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs text-teal underline">
              Open the listing ↗
            </a>
          )}
        </li>
        <li className="rounded-lg border border-line p-3">
          <p className="font-mono text-[10px] tracking-[0.18em] text-slate uppercase">Way 3 · by email</p>
          <p className="mt-1 text-sm font-medium">Email draft</p>
          <p className="mt-0.5 text-xs text-slate">
            {emailTo ? `To ${emailTo}, with the CV and cover letter attached. Opens in your mail app as a draft.` : "Needs a confirmed email address; research did not find one for this job."}
          </p>
          {emailTo ? (
            <a href={`/api/jobs/${jobId}/email-draft`} className="btn btn-quiet mt-2.5 w-full">
              Download email draft
            </a>
          ) : (
            <button type="button" disabled className="btn btn-quiet mt-2.5 w-full">
              No confirmed address
            </button>
          )}
        </li>
      </ol>

      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </p>
      )}

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Or fill it yourself: everything to copy</summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="label">Files</p>
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <a key={file.documentId} href={`/api/documents/${file.documentId}?format=pdf`} className="btn btn-quiet px-3 py-1.5 text-xs">
                  ↓ {file.fileName}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Your details</p>
            <ul className="divide-y divide-line/70 rounded-lg border border-line">
              {details.map((item) => (
                <li key={item.label} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-slate">{item.label}</span>
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {item.value}
                  </span>
                  <CopyButton text={item.value} label={item.label} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label">Answers</p>
            <ul className="space-y-2">
              {answers.map((answer) => (
                <li key={answer.question} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium" dir="auto">
                      {answer.question}
                    </p>
                    <CopyButton text={answer.answer} label={answer.question} />
                  </div>
                  <p className={`mt-1 text-sm whitespace-pre-line ${UNANSWERED.test(answer.answer) ? "text-coral" : ""}`} dir="auto">
                    {answer.answer}
                  </p>
                  {answer.note && <p className="mt-1.5 text-xs text-slate">For you, not the form: {answer.note}</p>}
                </li>
              ))}
              {coverLetterText && (
                <li className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">Cover letter (for a text box)</p>
                    <CopyButton text={coverLetterText} label="cover letter" />
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-slate whitespace-pre-line" dir="auto">
                    {coverLetterText}
                  </p>
                </li>
              )}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
