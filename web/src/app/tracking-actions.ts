"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { addEvent, getJob, listDocuments, updateJob } from "@/lib/data";
import { launch, stageRunning } from "@/lib/engine";
import { FOLLOW_UP_SENT, nextFollowUpDate } from "@/lib/followups";
import { STATUS_LABELS, type Status } from "@/lib/types";

const OUTCOMES: Status[] = ["replied", "interview", "offer", "rejected", "no_response"];

function refresh(jobId: number) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/", "layout");
}

// What happened after applying. The date is kept in the job's history, and a
// note, if given, is added to the job's notes.
export async function recordOutcome(jobId: number, status: string, note: string): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (!OUTCOMES.includes(status as Status)) return { ok: false, message: `Unknown outcome "${status}".` };
  const label = STATUS_LABELS[status as Status];
  const text = note.trim().slice(0, 2000);
  const day = new Date().toISOString().slice(0, 10);
  updateJob(jobId, {
    status: status as Status,
    // Any answer, or closing the job, ends the follow-up reminders.
    follow_up_due: null,
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

export async function writeFollowUp(jobId: number): Promise<ActionResult> {
  try {
    launch("follow-up", jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  refresh(jobId);
  return { ok: true, message: "Writing it now. It appears under Documents in a minute." };
}

// One follow-up per job. After it is sent, the job waits once more before
// Jobflow suggests closing it as "No response".
export async function markFollowUpSent(jobId: number): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  addEvent(jobId, FOLLOW_UP_SENT);
  updateJob(jobId, { follow_up_due: nextFollowUpDate() });
  refresh(jobId);
  return { ok: true, message: "Noted. Jobflow checks back if there is still no reply." };
}

export async function waitLonger(jobId: number): Promise<ActionResult> {
  updateJob(jobId, { follow_up_due: nextFollowUpDate() });
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
