import "server-only";
import { getSettings, listDocuments, listEvents, listJobs } from "./data";
import type { Job } from "./types";

export const FOLLOW_UP_SENT = "follow-up sent";

export type FollowUp = { job: Job; sent: boolean; draftId: number | null; daysSinceApplied: number | null };

const days = (from: string | null) => (from ? Math.floor((Date.now() - Date.parse(from)) / 86400000) : null);

// Applied jobs whose follow-up date has passed: before the follow-up is sent
// (write and send it), or after it (still no reply: close or wait longer).
export function followUpsDue(): FollowUp[] {
  const now = Date.now();
  return listJobs({ status: "applied" })
    .filter((job) => job.follow_up_due !== null && Date.parse(job.follow_up_due) <= now)
    .map((job) => ({
      job,
      sent: listEvents(job.id).some((event) => event.type === FOLLOW_UP_SENT),
      draftId: listDocuments(job.id).find((doc) => doc.type === "follow_up")?.id ?? null,
      daysSinceApplied: days(job.applied_at),
    }));
}

export const nextFollowUpDate = () => new Date(Date.now() + getSettings().followUpDays * 86400000).toISOString();

// The follow-up state shown on a job page, for applied jobs.
export function followUpState(job: Job) {
  if (job.status !== "applied") return null;
  return {
    due: job.follow_up_due !== null && Date.parse(job.follow_up_due) <= Date.now(),
    sent: listEvents(job.id).some((event) => event.type === FOLLOW_UP_SENT),
    draft: listDocuments(job.id).some((doc) => doc.type === "follow_up"),
  };
}
