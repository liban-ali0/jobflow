"use server";

import { SENT_STATUSES } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { sendMessage } from "@/app/actions";
import { archiveJobs as archive, createConversation, getJob, getSettings, listJobs, setListing, setSettings, unapprovedDocuments, updateJob } from "@/lib/data";
import { checkListing } from "@/core/liveness.mjs";
import { exportPdfs } from "@/lib/apply";
import { engineFor, launch, queueResearch, stageRunning } from "@/lib/engine";
import type { Job } from "@/lib/types";

// Actions on one or many jobs, used by the departures board (bulk and row
// menu) and the job page.

const MAX_IDS = 200;

function cleanIds(ids: number[]) {
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_IDS);
}

function loadJobs(ids: number[]) {
  return cleanIds(ids)
    .map((id) => getJob(id))
    .filter((job): job is Job => job !== null);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function done(message: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function selectJobs(ids: number[]): Promise<ActionResult> {
  const { dailyCap } = getSettings();
  const room = dailyCap - listJobs({ status: "selected", archived: false }).length;
  const ranked = loadJobs(ids).filter((job) => job.status === "ranked");
  if (ranked.length === 0) return { ok: false, message: "Only ranked jobs can be selected. Rank the others first." };
  if (room <= 0) return { ok: false, message: `Selected is full (${dailyCap}). Remove a job first or raise the cap in Settings.` };
  const picked = ranked.slice(0, room);
  for (const job of picked) updateJob(job.id, { status: "selected" });
  const skipped = ranked.length - picked.length;
  return done(
    `Selected ${plural(picked.length, "job")}.${skipped ? ` ${skipped} left out: the daily cap is ${dailyCap}.` : ""}`,
  );
}

export async function removeFromSelected(ids: number[]): Promise<ActionResult> {
  const jobs = loadJobs(ids).filter((job) => job.status === "selected");
  for (const job of jobs) updateJob(job.id, { status: "ranked" });
  return jobs.length ? done(`Moved ${plural(jobs.length, "job")} back to Ranked.`) : { ok: false, message: "None of these jobs are selected." };
}

// "Not interested": excludes the jobs with the user's reason, and can keep
// the reason as a ranking rule so similar jobs are skipped next time.
export async function excludeJobs(ids: number[], reason: string, asRule: boolean): Promise<ActionResult> {
  const text = reason.trim().slice(0, 300);
  const jobs = loadJobs(ids).filter((job) => BEFORE_APPLYING.includes(job.status));
  if (jobs.length === 0) return { ok: false, message: "Nothing to exclude here." };
  for (const job of jobs) {
    updateJob(job.id, { status: "excluded", excluded_reason: text ? `Not interested: ${text}` : "Not interested" });
  }
  if (asRule && text) {
    const rules = getSettings().customRules?.trim() ?? "";
    setSettings({ customRules: `${rules}${rules ? "\n" : ""}- Not interested: ${text}` });
  }
  return done(`Excluded ${plural(jobs.length, "job")}${asRule && text ? " and saved the reason as a ranking rule" : ""}.`);
}

// Brings excluded jobs back: ranked ones return to Ranked, the rest to the
// unranked list.
export async function restoreJobs(ids: number[]): Promise<ActionResult> {
  const jobs = loadJobs(ids).filter((job) => job.status === "excluded");
  for (const job of jobs) updateJob(job.id, { status: job.score === null ? "found" : "ranked", excluded_reason: null });
  return jobs.length ? done(`Restored ${plural(jobs.length, "job")}.`) : { ok: false, message: "None of these jobs are excluded." };
}

export async function rankJobs(ids: number[]): Promise<ActionResult> {
  const jobs = loadJobs(ids).filter((job) => ["found", "ranked", "excluded", "selected"].includes(job.status));
  if (jobs.length === 0) return { ok: false, message: "Nothing to rank here." };
  if (stageRunning("rank-jobs")) return { ok: false, message: "Ranking is already running. Try again when it finishes." };
  try {
    launch("rank-jobs", null, "manual", `ids:${jobs.map((job) => job.id).join(",")}`);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  return done(`Ranking ${plural(jobs.length, "job")}. Progress is on the Activity screen.`);
}

export async function markApplied(id: number): Promise<ActionResult> {
  const job = getJob(id);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (SENT_STATUSES.includes(job.status)) {
    return { ok: false, message: `Already applied: this job is at ${job.status.replace("_", " ")}.` };
  }
  // Nothing goes to an employer before the user has approved it.
  const unapproved = unapprovedDocuments(id);
  if (unapproved.length) {
    return {
      ok: false,
      message: `Review the documents first: ${unapproved.length} of them ${unapproved.length === 1 ? "is" : "are"} not approved yet (Documents on the job page).`,
    };
  }
  const { followUpDays } = getSettings();
  updateJob(id, { status: "applied", apply_state: null, apply_missing: null, follow_up_due: new Date(Date.now() + followUpDays * 86400000).toISOString() });
  return done(`Marked as applied. Follow-up reminder in ${followUpDays} days.`);
}

export async function addJobNote(id: number, note: string): Promise<ActionResult> {
  const job = getJob(id);
  const text = note.trim().slice(0, 2000);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (!text) return { ok: false, message: "Write a note first." };
  const stamped = `${new Date().toISOString().slice(0, 10)}: ${text}`;
  updateJob(id, { notes: job.notes ? `${job.notes}\n\n${stamped}` : stamped });
  return done("Note saved.");
}

// Opens an Assistant conversation already focused on one job.
export async function askAboutJob(id: number) {
  const job = getJob(id);
  if (!job) return;
  const engine = engineFor("rank-jobs").engine;
  const conversationId = createConversation({
    title: `About: ${job.title} · ${job.company}`.slice(0, 60),
    engine,
    effort: engine === "codex" ? "medium" : "",
  });
  const data = new FormData();
  data.set(
    "message",
    `Let's talk about job #${job.id}: ${job.title} at ${job.company}. Read it with \`node scripts/jobs.mjs get ${job.id}\` and my profile, then give me a short take: how well it fits me, any red flags, and whether I should apply.`,
  );
  await sendMessage(conversationId, null, data);
  redirect(`/assistant/${conversationId}`);
}

// Queues research (and the tailoring that follows) for selected jobs that
// have none yet; they run one after another.
export async function researchSelected(): Promise<ActionResult> {
  const waiting = listJobs({ status: "selected", archived: false }).map((job) => job.id);
  if (waiting.length === 0) return { ok: false, message: "No selected jobs are waiting for research." };
  const added = queueResearch(waiting);
  revalidatePath("/", "layout");
  return added
    ? { ok: true, message: `Researching ${added} ${added === 1 ? "job" : "jobs"}, one at a time. Each takes a few minutes; documents follow automatically.` }
    : { ok: true, message: "These jobs are already being researched." };
}

// "Fill it in Chrome": the apply-job step fills the application form in the
// user's Chrome and stops before submitting. The PDFs it attaches are written
// to the job's folder first.
export async function fillInChrome(id: number): Promise<ActionResult> {
  const job = getJob(id);
  if (!job) return { ok: false, message: "This job no longer exists." };
  if (unapprovedDocuments(id).length) return { ok: false, message: "Approve all of this job's documents first." };
  if (stageRunning("apply-job", id)) return { ok: false, message: "Already filling this application." };
  try {
    await exportPdfs(id);
    launch("apply-job", id);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  return done("Filling the form in Chrome. It stops before Submit: check it there and submit it yourself.");
}

// ---------- is the listing still open ----------

const BEFORE_APPLYING = ["found", "ranked", "selected", "researched", "ready"];

// Checks one job's listing now (the daily run checks the rest).
export async function checkListingNow(id: number): Promise<ActionResult> {
  const job = getJob(Number(id));
  if (!job?.url) return { ok: false, message: "This job has no link to check." };
  const check = await checkListing(job.url);
  if (!check) return { ok: false, message: "This site cannot be checked automatically. Open the listing to see." };
  if (check.blocked) return { ok: false, message: check.reason };
  setListing(job.id, check);
  return done(check.state === "open" ? "Still open." : check.state === "closed" ? "The listing has closed." : check.reason);
}

// The user says the listing is still open: later checks leave it alone.
export async function keepListing(id: number): Promise<ActionResult> {
  const job = getJob(Number(id));
  if (!job) return { ok: false, message: "No such job." };
  setListing(job.id, { state: "kept", reason: "You said it is still open." });
  return done("Noted. It is not checked again.");
}

// Moves jobs whose listing closed, not applied to yet, to Excluded.
export async function setAsideClosed(ids: number[]): Promise<ActionResult> {
  const jobs = loadJobs(ids).filter((job) => job.listing_state === "closed" && BEFORE_APPLYING.includes(job.status));
  if (jobs.length === 0) return { ok: false, message: "None of these listings are closed." };
  for (const job of jobs) updateJob(job.id, { status: "excluded", excluded_reason: "The listing closed", apply_state: null, apply_missing: null });
  return done(`Moved ${plural(jobs.length, "job")} to Excluded.`);
}

// A pattern from Statistics ("you skipped 4 jobs because …") kept as a
// ranking rule, so jobs like these are excluded before the user sees them.
export async function addRankingRule(rule: string): Promise<ActionResult> {
  const text = rule.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!text) return { ok: false, message: "Nothing to add." };
  const rules = getSettings().customRules?.trim() ?? "";
  if (rules.toLowerCase().includes(text.toLowerCase())) return { ok: true, message: "Already a ranking rule." };
  setSettings({ customRules: `${rules}${rules ? "\n" : ""}- ${text}` });
  return done("Added to your ranking rules (Profile → Extra ranking rules).");
}

// ---------- the archive ----------

// Out of the lists, not deleted: only jobs not yet applied to.
export async function archiveJobs(ids: number[]): Promise<ActionResult> {
  const changed = archive(cleanIds(ids));
  return changed ? done(`Archived ${plural(changed, "job")}. They are under Jobs → Archived.`) : { ok: false, message: "Nothing to archive: applications stay on the Board." };
}

export async function unarchiveJobs(ids: number[]): Promise<ActionResult> {
  const changed = archive(cleanIds(ids), false);
  return changed ? done(`Brought back ${plural(changed, "job")}.`) : { ok: false, message: "None of these are archived." };
}

// "Select and research": picks the ranked jobs (within the daily cap) and
// starts their research straight away, one at a time.
export async function selectAndResearch(ids: number[]): Promise<ActionResult> {
  const selected = await selectJobs(ids);
  if (!selected.ok) return selected;
  const picked = loadJobs(ids).filter((job) => job.status === "selected").map((job) => job.id);
  const added = queueResearch(picked);
  return done(`${selected.message} Researching ${added} ${added === 1 ? "job" : "jobs"}, one at a time; documents follow automatically.`);
}
