import "server-only";
import { getSettings, listDocuments, listEvents, listJobs } from "./data";
import type { Job } from "./types";

export const FOLLOW_UP_SENT = "follow-up sent";
export const THANK_YOU_SENT = "thank-you sent";

// When to act after applying, after career-ops' follow-up cadence (MIT):
// a first follow-up after the days set in Settings, a second one as long
// after that, then the application has gone quiet and can be closed. A reply
// gets a check-in after a few days; an interview a thank-you the same day,
// then a check-in if nothing is heard.
export const CADENCE = { maxFollowUps: 2, repliedDays: 3, thankYouHours: 3, afterInterviewDays: 5 };

// follow-up: write or send one; quiet: followed up enough, no reply;
// replied: they answered and nothing has moved; thank-you: the interview is
// over; after-interview: no news since.
export type FollowUpKind = "follow-up" | "quiet" | "replied" | "thank-you" | "after-interview";

export type FollowUp = {
  job: Job;
  kind: FollowUpKind;
  // Follow-ups sent so far, and whether a written one waits to be sent.
  sent: number;
  draftId: number | null;
  draftFresh: boolean;
  daysSinceApplied: number | null;
  daysSince: number | null;
};

const days = (from: string | null) => (from ? Math.floor((Date.now() - Date.parse(from)) / 86400000) : null);
const DAY = 86400000;

function followUpHistory(job: Job) {
  const events = listEvents(job.id);
  const sentAt = events.filter((event) => event.type === FOLLOW_UP_SENT).map((event) => event.at).sort();
  const draft = listDocuments(job.id).find((doc) => doc.type === "follow_up") ?? null;
  const last = sentAt.at(-1) ?? null;
  return {
    sent: sentAt.length,
    lastSent: last,
    draftId: draft?.id ?? null,
    // Written after the last one went out: waiting to be sent.
    draftFresh: Boolean(draft && (!last || Date.parse(draft.updated_at) > Date.parse(last))),
    thankYou: events.some((event) => event.type === THANK_YOU_SENT),
    // When the job reached its current status.
    since: events.filter((event) => event.type === "status").map((event) => event.at).sort().at(-1) ?? job.updated_at,
  };
}

function kindOf(job: Job, history: ReturnType<typeof followUpHistory>): FollowUpKind {
  if (job.status === "replied") return "replied";
  if (job.status === "interview") return history.thankYou ? "after-interview" : "thank-you";
  return history.sent >= CADENCE.maxFollowUps && !history.draftFresh ? "quiet" : "follow-up";
}

// What to do first: a thank-you is time-sensitive, a reply deserves an
// answer, a quiet application can wait.
const KIND_ORDER: FollowUpKind[] = ["thank-you", "replied", "after-interview", "follow-up", "quiet"];

// Applications whose reminder date has passed, with what to do now, the most
// pressing first and the longest-waiting first within a kind.
export function followUpsDue(): FollowUp[] {
  const now = Date.now();
  return listJobs({ status: ["applied", "replied", "interview"] })
    .filter((job) => job.follow_up_due !== null && Date.parse(job.follow_up_due) <= now)
    .map((job) => {
      const history = followUpHistory(job);
      const kind = kindOf(job, history);
      return {
        job,
        kind,
        sent: history.sent,
        draftId: history.draftId,
        draftFresh: history.draftFresh,
        daysSinceApplied: days(job.applied_at),
        daysSince: days(kind === "follow-up" || kind === "quiet" ? (history.lastSent ?? job.applied_at) : kind === "after-interview" || kind === "thank-you" ? (job.interview_at ?? history.since) : history.since),
      };
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || Date.parse(a.job.follow_up_due!) - Date.parse(b.job.follow_up_due!));
}

// The next reminder for a job in this status, from now.
export function nextFollowUpDate(status: string = "applied") {
  const wait = status === "replied" ? CADENCE.repliedDays * DAY : status === "interview" ? CADENCE.afterInterviewDays * DAY : getSettings().followUpDays * DAY;
  return new Date(Date.now() + wait).toISOString();
}

// The thank-you reminder for an interview at this time (ISO).
export const thankYouDate = (interviewAt: string | null) => (interviewAt ? new Date(Date.parse(interviewAt) + CADENCE.thankYouHours * 3600000).toISOString() : null);

// The follow-up state shown on a job page, for applied jobs.
export function followUpState(job: Job) {
  if (job.status !== "applied") return null;
  const history = followUpHistory(job);
  return {
    due: job.follow_up_due !== null && Date.parse(job.follow_up_due) <= Date.now(),
    // The reminder's date (ISO), which the user can move.
    at: job.follow_up_due,
    sent: history.sent,
    max: CADENCE.maxFollowUps,
    // A written follow-up waiting to be sent.
    draft: history.draftFresh,
  };
}

// Interviews still ahead (or within the last two hours), soonest first, then
// the ones without a time.
export function upcomingInterviews() {
  const now = Date.now();
  const jobs = listJobs({ status: "interview" });
  const timed = jobs
    .filter((job) => job.interview_at && Date.parse(job.interview_at) >= now - 2 * 3600000)
    .sort((a, b) => Date.parse(a.interview_at!) - Date.parse(b.interview_at!));
  return [...timed, ...jobs.filter((job) => !job.interview_at)].map((job) => ({
    job,
    inHours: job.interview_at ? (Date.parse(job.interview_at) - now) / 3600000 : null,
  }));
}
