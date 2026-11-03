"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { removeStory, updateStory } from "@/core/stories.mjs";
import { ROOT, addMessage, createConversation, getConversation, getJob, updateJob } from "@/lib/data";
import { engineFor, launch, sendToAssistant, stageRunning } from "@/lib/engine";

// After the interview: the debrief and thank-you note, practice in the
// Assistant, and the story bank on Profile.

const NOTES_LIMIT = 8000;

// The job's folder, made if missing (the engine fills it).
function folderOf(jobId: number) {
  const job = getJob(jobId);
  if (!job) return null;
  const folder = job.folder ?? `jobs/${job.found_at.slice(0, 10)}_${job.id}`;
  fs.mkdirSync(path.join(ROOT, folder), { recursive: true });
  if (!job.folder) updateJob(jobId, { folder });
  return folder;
}

// An earlier round's files keep their own names, so the next debrief can
// read them: debrief.md → debrief-round-1.md, and the notes alongside.
function keepEarlierRound(folder: string) {
  const dir = path.join(ROOT, folder);
  const done = fs.readdirSync(dir).filter((name) => /^debrief-round-\d+\.md$/.test(name)).length;
  const round = done + 1;
  for (const [from, to] of [
    ["debrief.md", `debrief-round-${round}.md`],
    ["debrief-notes.md", `debrief-notes-round-${round}.md`],
  ]) {
    if (fs.existsSync(path.join(dir, from))) fs.renameSync(path.join(dir, from), path.join(dir, to));
  }
}

// The user's notes on how it went → debrief, new stories, thank-you note.
// Without notes, only the thank-you note is written.
export async function debriefInterview(jobId: number, notes: string): Promise<ActionResult> {
  const folder = folderOf(jobId);
  if (!folder) return { ok: false, message: "This job no longer exists." };
  if (stageRunning("interview-debrief", jobId)) return { ok: false, message: "The debrief is already being written." };
  const text = String(notes ?? "").replace(/\r\n/g, "\n").trim().slice(0, NOTES_LIMIT);
  const dir = path.join(ROOT, folder);
  if (text) {
    keepEarlierRound(folder);
    fs.writeFileSync(path.join(dir, "debrief-notes.md"), `# My notes after the interview (${new Date().toISOString().slice(0, 10)})\n\n${text}\n`);
  }
  try {
    launch("interview-debrief", jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: text ? "Writing the debrief and the thank-you note. They appear under Documents in a few minutes." : "Writing the thank-you note. It appears under Documents in a few minutes." };
}

// A mock interview in the Assistant, on the engine chosen for interview steps.
export async function practiceInterview(jobId: number) {
  const job = getJob(jobId);
  if (!job) return;
  const choice = engineFor("interview-pack");
  const id = createConversation({ title: `Practice: ${job.title} at ${job.company}`.slice(0, 60), engine: choice.engine, model: choice.model, effort: choice.effort || (choice.engine === "codex" ? "medium" : "") });
  const conversation = getConversation(id);
  if (!conversation) return;
  const message = `Run a practice interview for job ${job.id} (${job.title} at ${job.company}): follow .claude/skills/interview-practice/SKILL.md with argument ${job.id}, and ask the first question.`;
  addMessage(id, { role: "user", text: message });
  try {
    sendToAssistant(conversation, message, true);
  } catch {
    // The conversation opens with the message; the user can send it again.
  }
  redirect(`/assistant/${id}`);
}

export async function confirmStory(id: number): Promise<ActionResult> {
  if (!updateStory(ROOT, id, { confirmed: true, unbacked: [] })) return { ok: false, message: "That story is gone." };
  revalidatePath("/profile");
  return { ok: true, message: "Confirmed: it is used as true from now on." };
}

export async function deleteStory(id: number): Promise<ActionResult> {
  if (!removeStory(ROOT, id)) return { ok: false, message: "That story is gone." };
  revalidatePath("/profile");
  return { ok: true, message: "Removed from the story bank." };
}
