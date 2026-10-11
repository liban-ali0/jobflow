"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { markFollowUpSent, recordOutcome, waitLonger, writeFollowUp } from "@/app/tracking-actions";
import { STATUS_LABELS, type Status } from "@/lib/types";

const OUTCOMES: { status: Status; label: string; tone: string }[] = [
  { status: "replied", label: "They replied", tone: "btn-quiet" },
  { status: "interview", label: "Interview", tone: "btn-quiet" },
  { status: "offer", label: "Offer", tone: "btn-quiet" },
  { status: "rejected", label: "Rejected", tone: "btn-quiet text-coral" },
  { status: "no_response", label: "No response", tone: "btn-quiet" },
];

// What comes after each stage of an application.
const NEXT: Partial<Record<Status, Status[]>> = {
  applied: ["replied", "interview", "rejected", "no_response"],
  replied: ["interview", "offer", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["rejected"],
};

function useRun() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) after?.();
    });
  return { pending, result, run };
}

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
      {result.message}
    </p>
  );
}

// On the job page once applied: record what happened, and the follow-up.
export function OutcomeBar({
  jobId,
  status,
  applied,
  followUp,
}: {
  jobId: number;
  status: Status;
  // For example "Applied 11 Oct", formatted on the server.
  applied: string | null;
  followUp: { due: boolean; sent: boolean; draft: boolean } | null;
}) {
  const [choice, setChoice] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  const { pending, result, run } = useRun();
  const next = NEXT[status] ?? [];
  if (next.length === 0 && !followUp) return null;

  return (
    <section className="card space-y-3 rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">What happened?</h2>
        {applied && <span className="text-xs text-slate">{applied}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.filter((outcome) => next.includes(outcome.status)).map((outcome) => (
          <button
            key={outcome.status}
            type="button"
            aria-pressed={choice === outcome.status}
            onClick={() => setChoice(choice === outcome.status ? null : outcome.status)}
            className={`btn ${outcome.tone} aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/20`}
          >
            {outcome.label}
          </button>
        ))}
      </div>
      {choice && (
        <form
          className="space-y-2 rounded-lg border border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => recordOutcome(jobId, choice, note), () => {
              setChoice(null);
              setNote("");
            });
          }}
        >
          <label className="block text-sm font-medium" htmlFor="outcome-note">
            Note for {STATUS_LABELS[choice]} (optional)
          </label>
          <input
            id="outcome-note"
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={choice === "interview" ? "e.g. Video call with the team lead on Tuesday 10:00" : "e.g. What they said"}
            className="field"
            dir="auto"
          />
          <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1.5 text-xs">
            Save
          </button>
        </form>
      )}
      {followUp && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <span className="mr-auto text-slate">
            {followUp.sent ? "Follow-up sent." : followUp.due ? "No reply yet: time for a follow-up." : "A follow-up is suggested if there is no reply."}
          </span>
          {!followUp.sent && (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => writeFollowUp(jobId))} className="btn btn-quiet px-3 py-1.5 text-xs">
                {followUp.draft ? "Write it again" : "Write follow-up"}
              </button>
              {followUp.draft && (
                <button type="button" disabled={pending} onClick={() => run(() => markFollowUpSent(jobId))} className="btn btn-primary px-3 py-1.5 text-xs">
                  Mark follow-up sent
                </button>
              )}
            </>
          )}
        </div>
      )}
      <Status result={result} />
    </section>
  );
}

// One row of "Follow-ups due" on Today.
export function FollowUpRow({
  jobId,
  title,
  company,
  days,
  sent,
  draftId,
}: {
  jobId: number;
  title: string;
  company: string;
  days: number | null;
  sent: boolean;
  draftId: number | null;
}) {
  const { pending, result, run } = useRun();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="mr-auto min-w-0">
        <Link href={`/jobs/${jobId}`} className="font-medium hover:text-teal" dir="auto">
          {title}
        </Link>
        <span className="text-sm text-slate" dir="auto">
          {" "}
          · {company}
        </span>
        <p className="text-xs text-slate">
          {days !== null ? `Applied ${days} ${days === 1 ? "day" : "days"} ago, ` : ""}
          {sent ? "followed up, still no reply." : "no reply yet."}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sent ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => recordOutcome(jobId, "no_response", ""))} className="btn btn-quiet px-3 py-1.5 text-xs">
              Close as no response
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => waitLonger(jobId))} className="btn btn-quiet px-3 py-1.5 text-xs">
              Wait longer
            </button>
          </>
        ) : draftId ? (
          <>
            <Link href={`/jobs/${jobId}#documents`} className="btn btn-quiet px-3 py-1.5 text-xs">
              Review email
            </Link>
            <button type="button" disabled={pending} onClick={() => run(() => markFollowUpSent(jobId))} className="btn btn-primary px-3 py-1.5 text-xs">
              Mark as sent
            </button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => run(() => writeFollowUp(jobId))} className="btn btn-primary px-3 py-1.5 text-xs">
            Write follow-up
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => recordOutcome(jobId, "replied", ""))} className="btn btn-quiet px-3 py-1.5 text-xs">
          They replied
        </button>
      </div>
      {result && (
        <div className="basis-full">
          <Status result={result} />
        </div>
      )}
    </li>
  );
}
