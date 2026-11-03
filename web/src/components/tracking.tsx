"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { OpenInGmail, type GmailEmail } from "@/components/gmail";
import { markFollowUpSent, markThankYouSent, recordOutcome, setInterviewTime, setReminder, waitLonger, writeFollowUp, writeInterviewPack } from "@/app/tracking-actions";
import { STATUS_LABELS, type Status } from "@/lib/types";

const OUTCOMES: { status: Status; label: string; tone: string }[] = [
  { status: "replied", label: "They replied", tone: "btn-quiet" },
  { status: "interview", label: "Interview", tone: "btn-quiet" },
  { status: "offer", label: "Offer", tone: "btn-quiet" },
  { status: "accepted", label: "I accepted", tone: "btn-quiet text-go" },
  { status: "declined", label: "I declined", tone: "btn-quiet" },
  { status: "rejected", label: "Rejected", tone: "btn-quiet text-coral" },
  { status: "withdrawn", label: "I withdrew", tone: "btn-quiet" },
  { status: "no_response", label: "No response", tone: "btn-quiet" },
];

// What comes after each stage of an application.
const NEXT: Partial<Record<Status, Status[]>> = {
  applied: ["replied", "interview", "rejected", "withdrawn", "no_response"],
  replied: ["interview", "offer", "rejected", "withdrawn", "no_response"],
  interview: ["offer", "rejected", "withdrawn", "no_response"],
  // An offer: yours to accept or decline, or taken back by the employer.
  offer: ["accepted", "declined", "rejected"],
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
  interviewPack = null,
  gmail = null,
}: {
  jobId: number;
  status: Status;
  // For example "Applied 11 Oct", formatted on the server.
  applied: string | null;
  followUp: { due: boolean; sent: number; max: number; draft: boolean; at: string | null } | null;
  // At the interview stage: whether the pack exists or is being written,
  // and when the interview is.
  interviewPack?: { exists: boolean; running: boolean; at: string | null } | null;
  // The written follow-up, ready to open in Gmail.
  gmail?: GmailEmail | null;
}) {
  const [choice, setChoice] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  // A datetime-local value ("2026-10-16T10:00"), in this device's time.
  const [when, setWhen] = useState("");
  const [editingTime, setEditingTime] = useState(false);
  const [editingReminder, setEditingReminder] = useState(false);
  const [reminderDay, setReminderDay] = useState(followUp?.at ? followUp.at.slice(0, 10) : "");
  const toIso = (local: string) => (local ? new Date(local).toISOString() : null);
  const { pending, result, run } = useRun();
  const next = NEXT[status] ?? [];
  if (next.length === 0 && !followUp) return null;

  return (
    <section className="card space-y-3 rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">What happened?</h2>
        {applied && <span className="text-xs text-slate">{applied}</span>}
      </div>
      {interviewPack && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
          {editingTime ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => setInterviewTime(jobId, toIso(when)), () => setEditingTime(false));
              }}
            >
              <label className="font-medium" htmlFor="interview-when">
                Interview on
              </label>
              <input id="interview-when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="field w-auto" />
              <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1.5 text-xs">
                Save
              </button>
              <button type="button" onClick={() => setEditingTime(false)} className="text-xs text-slate underline">
                Cancel
              </button>
            </form>
          ) : (
            <>
              <span className="mr-auto">
                <span className="font-medium">Interview: </span>
                {interviewPack.at ? (
                  <span suppressHydrationWarning>
                    {new Date(interviewPack.at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : (
                  <span className="text-slate">date and time not set</span>
                )}
              </span>
              {interviewPack.at && (
                <a href={`/api/jobs/${jobId}/interview.ics`} className="btn btn-quiet px-3 py-1.5 text-xs">
                  Add to calendar
                </a>
              )}
              <button type="button" onClick={() => setEditingTime(true)} className="btn btn-quiet px-3 py-1.5 text-xs">
                {interviewPack.at ? "Change" : "Set date and time"}
              </button>
            </>
          )}
        </div>
      )}
      {interviewPack && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-saffron-soft px-3 py-2.5">
          <p className="text-sm">
            <span className="font-medium">Interview coming up. </span>
            {interviewPack.running
              ? "Writing your interview pack…"
              : interviewPack.exists
                ? "Your interview pack is under Documents: likely questions with answers from your experience, gaps, and questions to ask."
                : "Get a pack with the likely questions, answers from your real experience, and questions to ask them."}
          </p>
          <span className="flex flex-wrap gap-2">
            {interviewPack.exists && (
              <a href="#documents" className="btn btn-quiet px-3 py-1.5 text-xs">
                Open the pack
              </a>
            )}
            <button type="button" disabled={pending || interviewPack.running} onClick={() => run(() => writeInterviewPack(jobId))} className="btn btn-primary px-3 py-1.5 text-xs">
              {interviewPack.exists ? "Write it again" : "Write the interview pack"}
            </button>
          </span>
        </div>
      )}
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
            run(() => recordOutcome(jobId, choice, note, choice === "interview" ? toIso(when) : null), () => {
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
            placeholder={choice === "interview" ? "e.g. Video call with the team lead" : "e.g. What they said"}
            className="field"
            dir="auto"
          />
          {choice === "interview" && (
            <label className="block text-sm">
              <span className="font-medium">When (optional)</span>
              <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="field mt-1 w-auto" />
            </label>
          )}
          <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1.5 text-xs">
            Save
          </button>
        </form>
      )}
      {followUp && followUp.sent < followUp.max && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          {editingReminder ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => setReminder(jobId, reminderDay || null), () => setEditingReminder(false));
              }}
            >
              <label htmlFor="reminder-day" className="font-medium">
                Remind me on
              </label>
              <input id="reminder-day" type="date" value={reminderDay} onChange={(event) => setReminderDay(event.target.value)} className="field w-auto" />
              <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1.5 text-xs">
                Save
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => setReminder(jobId, null), () => setEditingReminder(false))} className="text-xs text-slate underline">
                No reminder
              </button>
            </form>
          ) : (
            <>
              <span className="mr-auto text-slate">
                Reminder:{" "}
                {followUp.at ? (
                  <span className="text-ink" suppressHydrationWarning>
                    {new Date(followUp.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}
                  </span>
                ) : (
                  "off"
                )}
              </span>
              <button type="button" onClick={() => setEditingReminder(true)} className="btn btn-quiet px-3 py-1.5 text-xs">
                Change
              </button>
            </>
          )}
        </div>
      )}
      {followUp && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <span className="mr-auto text-slate">
            {followUp.draft
              ? "A follow-up is written and waiting to be sent."
              : followUp.sent >= followUp.max
                ? `Followed up ${followUp.sent} times. If there is still no reply, close it as no response.`
                : followUp.sent > 0
                  ? followUp.due
                    ? "Followed up once, still no reply: one more short follow-up is fine."
                    : "Follow-up sent."
                  : followUp.due
                    ? "No reply yet: time for a follow-up."
                    : "A follow-up is suggested if there is no reply."}
          </span>
          {(followUp.draft || (followUp.sent < followUp.max && (followUp.sent === 0 || followUp.due))) && (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => writeFollowUp(jobId))} className="btn btn-quiet px-3 py-1.5 text-xs">
                {followUp.draft ? "Write it again" : followUp.sent > 0 ? "Write a second follow-up" : "Write follow-up"}
              </button>
              {followUp.draft && gmail && <OpenInGmail email={gmail} className="btn btn-primary px-3 py-1.5 text-xs" />}
              {followUp.draft && (
                <button type="button" disabled={pending} onClick={() => run(() => markFollowUpSent(jobId))} className={`btn px-3 py-1.5 text-xs ${gmail ? "btn-quiet" : "btn-primary"}`}>
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

// One row of "Follow-ups due" on Today: what to do now for one application,
// from its stage (lib/followups.ts).
export function FollowUpRow({
  jobId,
  title,
  company,
  kind,
  days,
  sent,
  draftId,
  draftFresh,
  gmail = null,
}: {
  jobId: number;
  title: string;
  company: string;
  kind: "follow-up" | "quiet" | "replied" | "thank-you" | "after-interview";
  days: number | null;
  sent: number;
  draftId: number | null;
  draftFresh: boolean;
  gmail?: GmailEmail | null;
}) {
  const { pending, result, run } = useRun();
  const ago = days === null ? "" : days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} ago`;
  const line = {
    "follow-up": sent === 0 ? `Applied ${ago}, no reply yet.` : `Followed up ${ago}, still no reply. One more short follow-up is fine.`,
    quiet: `Followed up ${sent} times, the last ${ago}, and no reply. It has gone quiet.`,
    replied: `They replied ${ago} and nothing has moved since. Check in, or note what happened.`,
    "thank-you": "The interview is over: a short thank-you note today keeps you in mind.",
    "after-interview": `No news since the interview ${ago}. A short check-in is fine, or note what happened.`,
  }[kind];
  const button = (label: string, action: () => Promise<ActionResult>, primary = false) => (
    <button type="button" disabled={pending} onClick={() => run(action)} className={`btn px-3 py-1.5 text-xs ${primary ? "btn-primary" : "btn-quiet"}`}>
      {label}
    </button>
  );
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
        <p className="text-xs text-slate">{line}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {kind === "follow-up" &&
          (draftFresh && draftId ? (
            <>
              <Link href={`/jobs/${jobId}#documents`} className="btn btn-quiet px-3 py-1.5 text-xs">
                Review email
              </Link>
              {gmail && <OpenInGmail email={gmail} className="btn btn-primary px-3 py-1.5 text-xs" />}
              {button("Mark as sent", () => markFollowUpSent(jobId), !gmail)}
            </>
          ) : (
            <>
              {button(sent > 0 ? "Write a second follow-up" : "Write follow-up", () => writeFollowUp(jobId), true)}
              {sent > 0 && button("Close as no response", () => recordOutcome(jobId, "no_response", ""))}
            </>
          ))}
        {kind === "quiet" && (
          <>
            {button("Close as no response", () => recordOutcome(jobId, "no_response", ""), true)}
            {button("Wait longer", () => waitLonger(jobId))}
          </>
        )}
        {(kind === "follow-up" || kind === "quiet") && button("They replied", () => recordOutcome(jobId, "replied", ""))}
        {kind === "replied" && (
          <>
            {button("Interview", () => recordOutcome(jobId, "interview", ""), true)}
            {button("Rejected", () => recordOutcome(jobId, "rejected", ""))}
            {button("Check again later", () => waitLonger(jobId))}
          </>
        )}
        {kind === "thank-you" && (
          <>
            {gmail ? (
              <OpenInGmail email={gmail} className="btn btn-primary px-3 py-1.5 text-xs" />
            ) : (
              <Link href={`/jobs/${jobId}#interview`} className="btn btn-primary px-3 py-1.5 text-xs">
                Write it
              </Link>
            )}
            {button("Thank-you sent", () => markThankYouSent(jobId))}
            {button("Skip", () => markThankYouSent(jobId, true))}
          </>
        )}
        {kind === "after-interview" && (
          <>
            {button("Offer", () => recordOutcome(jobId, "offer", ""), true)}
            {button("Rejected", () => recordOutcome(jobId, "rejected", ""))}
            {button("Wait longer", () => waitLonger(jobId))}
          </>
        )}
      </div>
      {result && (
        <div className="basis-full">
          <Status result={result} />
        </div>
      )}
    </li>
  );
}
