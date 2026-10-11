"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { getDocument, getJob, listDocuments, reviewDocument, updateJob } from "@/lib/data";
import { writeText } from "@/lib/documents";
import { launch, stageRunning } from "@/lib/engine";

// The documents a job needs before it is ready to apply.
const PACKAGE = ["cv", "cover_letter", "email", "answers"];
const TEXT_LIMIT = 30000;

function refresh(jobId: number) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/cvs");
  revalidatePath("/", "layout");
}

// When every document of the package is approved, the job is ready to apply.
function updateReadiness(jobId: number) {
  const job = getJob(jobId);
  if (!job) return;
  const docs = listDocuments(jobId);
  const complete = PACKAGE.every((type) => docs.some((doc) => doc.type === type && doc.review === "approved"));
  if (complete && (job.status === "researched" || job.status === "selected")) updateJob(jobId, { status: "ready" });
  if (!complete && job.status === "ready") updateJob(jobId, { status: "researched" });
}

export async function approveDocument(id: number): Promise<ActionResult> {
  const doc = getDocument(id);
  if (!doc) return { ok: false, message: "This document no longer exists." };
  reviewDocument(id, "approved");
  updateReadiness(doc.job_id);
  refresh(doc.job_id);
  return { ok: true, message: "Approved." };
}

export async function requestChanges(id: number, note: string): Promise<ActionResult> {
  const doc = getDocument(id);
  if (!doc) return { ok: false, message: "This document no longer exists." };
  const text = note.trim();
  if (!text) return { ok: false, message: "Say what should change." };
  reviewDocument(id, "changes_requested", text.slice(0, 2000));
  updateReadiness(doc.job_id);
  refresh(doc.job_id);
  return { ok: true, message: "Noted. Use Rewrite to have it redone." };
}

// The user's own edit. It goes back to waiting for review.
export async function saveDocumentText(id: number, text: string): Promise<ActionResult> {
  const doc = getDocument(id);
  if (!doc) return { ok: false, message: "This document no longer exists." };
  if (text.length > TEXT_LIMIT) return { ok: false, message: "This document is too long." };
  try {
    writeText(doc.path, text.replace(/\r\n/g, "\n"));
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  reviewDocument(id, "draft");
  updateReadiness(doc.job_id);
  refresh(doc.job_id);
  return { ok: true, message: "Saved." };
}

// Rewrites the documents marked "changes requested" (or writes missing ones).
export async function rewriteDocuments(jobId: number): Promise<ActionResult> {
  if (stageRunning("tailor-job", jobId)) return { ok: false, message: "The documents are already being written." };
  try {
    launch("tailor-job", jobId);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  refresh(jobId);
  return { ok: true, message: "Rewriting. Progress is on Activity." };
}
