"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { addEvent, getJob, listDocuments, listEvents, updateJob } from "@/lib/data";
import { launch, stageRunning } from "@/lib/engine";
import { FOLLOW_UP_SENT, THANK_YOU_SENT, nextFollowUpDate, thankYouDate } from "@/lib/followups";
import { SENT_STATUSES, STATUS_LABELS, type Status } from "@/lib/types";

const OUTCOMES: Status[] = ["replied", "interview", "offer", "accepted", "declined", "rejected", "withdrawn", "no_response"];

function refresh(jobId: number) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/", "layout");
}

// What happened after applying. The date is kept in the job's history, and a
// note, if given, is added to the job's notes.
// An interview time from the form (ISO), or null for "not known".
function cleanTime(value: string | null | undefined) {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

export async function recordOutcome(jobId: number, status: string, note: string, interviewAt: string | null = null): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (!OUTCOMES.includes(status as Status)) return { ok: false, message: `Unknown outcome "${status}".` };
  const label = STATUS_LABELS[status as Status];
  const text = note.trim().slice(0, 2000);
  const day = new Date().toISOString().slice(0, 10);
  const interview = status === "interview" ? cleanTime(interviewAt) : null;
  updateJob(jobId, {
    status: status as Status,
    // A reply gets a check-in reminder, an interview a thank-you after it;
    // closing the job ends the reminders.
    follow_up_due: status === "replied" ? nextFollowUpDate("replied") : status === "interview" ? thankYouDate(interview) : null,
    ...(status === "interview" ? { interview_at: interview } : {}),
    ...(text ? { notes: `${job.notes ? `${job.notes}\n\n` : ""}${day} ${label}: ${text}` } : {}),
  });
  // An interview: the pack is written straight away.
  let extra = "";
  if (status === "interview" && !listDocuments(jobId).some((document) => document.type === "interview_pack") && !stageRunning("interview-pack", jobId)) {
    try {
      launch("interview-pack", jobId);
      extra = " Writing your interview pack now; it appears under Documents.";
    } catch {
      // It can be started from the job page.
    }
  }
  refresh(jobId);
  return { ok: true, message: `Marked as ${label}.${extra}` };
}

// Moves the follow-up reminder to a day the user picks ("2026-10-20"), or
// turns it off.
export async function setReminder(jobId: number, day: string | null): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (!["applied", "replied", "interview"].includes(job.status)) return { ok: false, message: "Reminders are for applications still open." };
  const at = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T09:00:00`).toISOString() : null;
  updateJob(jobId, { follow_up_due: at });
  refresh(jobId);
  return { ok: true, message: at ? `Reminder set for ${day}.` : "Reminder turned off." };
}

// Sets or clears the interview's date and time.
export async function setInterviewTime(jobId: number, interviewAt: string | null): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  const at = cleanTime(interviewAt);
  const thanked = listEvents(jobId).some((event) => event.type === THANK_YOU_SENT);
  updateJob(jobId, { interview_at: at, ...(job.status === "interview" && !thanked ? { follow_up_due: thankYouDate(at) } : {}) });
  addEvent(jobId, "interview", at ? `Interview on ${at}` : "Interview time cleared");
  refresh(jobId);
  return { ok: true, message: at ? "Interview time saved." : "Interview time cleared." };
}

export async function writeFollowUp(jobId: number): Promise<ActionResult> {
  if (stageRunning("follow-up", jobId)) return { ok: false, message: "Already writing this follow-up." };
  try {
    launch("follow-up", jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  refresh(jobId);
  return { ok: true, message: "Writing it now. It appears under Documents in a minute." };
}

// Up to two follow-ups per job (lib/followups.ts CADENCE). After the last
// one, the job waits once more before Offerbound suggests closing it.
export async function markFollowUpSent(jobId: number): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  addEvent(jobId, FOLLOW_UP_SENT);
  updateJob(jobId, { follow_up_due: nextFollowUpDate("applied") });
  refresh(jobId);
  return { ok: true, message: "Noted. Offerbound checks back if there is still no reply." };
}

// The interview's thank-you note went out (or the user skips it): next, a
// check-in if nothing is heard.
export async function markThankYouSent(jobId: number, skipped = false): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  addEvent(jobId, THANK_YOU_SENT, skipped ? "skipped" : null);
  updateJob(jobId, { follow_up_due: nextFollowUpDate("interview") });
  refresh(jobId);
  return { ok: true, message: skipped ? "Skipped. Offerbound checks back if you hear nothing." : "Noted. Offerbound checks back if you hear nothing." };
}

export async function waitLonger(jobId: number): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  updateJob(jobId, { follow_up_due: nextFollowUpDate(job.status) });
  refresh(jobId);
  return { ok: true, message: "Snoozed." };
}

// The interview pack, written again or for the first time.
export async function writeInterviewPack(jobId: number): Promise<ActionResult> {
  try {
    launch("interview-pack", jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  refresh(jobId);
  return { ok: true, message: "Writing it now. It appears under Documents in a few minutes." };
}

// One outcome for many applications at once, from the Board: a reply, a
// rejection, or closing the ones that never answered. Only jobs already
// sent can change; the rest are left as they are.
export async function bulkOutcome(jobIds: number[], status: string): Promise<ActionResult> {
  if (!["replied", "rejected", "withdrawn", "no_response"].includes(status)) return { ok: false, message: `Unknown outcome "${status}".` };
  const sent = SENT_STATUSES;
  let changed = 0;
  for (const id of [...new Set(jobIds.map(Number))].slice(0, 500)) {
    const job = getJob(id);
    if (!job || !sent.includes(job.status) || job.status === status) continue;
    updateJob(id, { status: status as Status, follow_up_due: status === "replied" ? nextFollowUpDate("replied") : null });
    changed += 1;
  }
  revalidatePath("/", "layout");
  const label = STATUS_LABELS[status as Status];
  return changed ? { ok: true, message: `Marked ${changed} ${changed === 1 ? "application" : "applications"} as ${label}.` } : { ok: false, message: "Nothing to change: pick sent applications." };
}
