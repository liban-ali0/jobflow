"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { checkCv } from "@/lib/ats";
import { targetForJob, targetForRole } from "@/lib/ats-keywords";
import { ROOT, confirmSkill, getDocument, getSettings } from "@/lib/data";
import { baseCvPath, readText } from "@/lib/documents";
import { launch, stageRunning } from "@/lib/engine";

// "doc:<id>" for a job's tailored CV, "base:<role key>" for a base CV.
// Anything else is refused, since the target names a file and reaches the engine.
const TARGET = /^(doc):(\d{1,9})$|^(base):([a-z0-9-]{1,64})$/;

function resolve(target: string) {
  const match = TARGET.exec(target);
  if (!match) return null;
  if (match[1] === "doc") {
    const doc = getDocument(Number(match[2]));
    if (!doc || doc.type !== "cv") return null;
    return { name: `doc-${doc.id}`, argument: `doc:${doc.id}`, file: doc.path, jobId: doc.job_id, ats: targetForJob(doc.job_id) };
  }
  const role = getSettings().roles.find((item) => item.key === match[4]);
  if (!role) return null;
  return { name: `base-${role.key}`, argument: `base:${role.key}`, file: baseCvPath(role.key), jobId: null, ats: targetForRole(role.key) };
}

// Asks the engine to apply the ATS fix list to a CV, using only facts from the
// profile. The fix list goes to jobs/_work/ for the engine to read.
export async function improveCv(target: string): Promise<ActionResult> {
  const found = resolve(target);
  if (!found) return { ok: false, message: "That CV no longer exists." };
  const markdown = readText(found.file);
  if (markdown === null) return { ok: false, message: "The CV file is missing." };
  if (stageRunning("improve-cv", found.jobId)) return { ok: false, message: "This CV is already being improved." };

  const result = checkCv(markdown, found.ats);
  const missing = new Set(result.keywords.missing);
  const brief = {
    file: found.file,
    ...(found.jobId !== null ? { jobId: found.jobId } : {}),
    score: result.score,
    missingKeywords: found.ats.keywords.filter((keyword) => missing.has(keyword.term)),
    fixes: result.fixes.filter((fix) => fix.kind === "fix").map(({ label, detail }) => ({ label, detail })),
    // The listing's requirements the CV does not show yet (the CV review).
    requirements: result.review.requirements.filter((item) => item.status === "missing" || item.status === "partial").map(({ text, status, required, detail }) => ({ text, status, required, detail })),
  };
  // The file name comes from the checked parts only, never the raw target.
  const work = path.join(ROOT, "jobs", "_work");
  const file = path.join(work, `ats-${found.name}.json`);
  if (!path.resolve(file).startsWith(path.resolve(work) + path.sep)) return { ok: false, message: "That CV cannot be improved here." };
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(brief, null, 2)}\n`);

  try {
    launch("improve-cv", found.jobId, "manual", found.argument);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Improving it now, with only facts from your profile. This takes a minute or two." };
}

export type WeaveResult =
  | { status: "added"; before: string; after: string; where: string; reason: string }
  | { status: "not-supported"; reason: string }
  | { status: "working" }
  | { status: "failed"; reason: string };

const REQUEST_ID = /^[a-f0-9]{12}$/;
const KEYWORD_LIMIT = 80;
const CV_LIMIT = 30000;
const workFile = (name: string) => path.join(ROOT, "jobs", "_work", name);

// Asks the engine where one missing keyword can honestly go in the CV the
// user is editing. It returns a proposal; the CV is not changed.
// With "confirmed", the candidate has said they have the skill (and maybe
// where they used it): it is saved to their facts and must be added.
export async function weaveKeyword(target: string, markdown: string, keyword: string, confirmed?: { evidence: string }): Promise<ActionResult & { id?: string }> {
  const found = resolve(target);
  if (!found) return { ok: false, message: "That CV no longer exists." };
  const term = keyword.replace(/\s+/g, " ").trim().slice(0, KEYWORD_LIMIT);
  if (!term) return { ok: false, message: "No keyword given." };
  if (markdown.length > CV_LIMIT) return { ok: false, message: "This CV is too long." };
  if (stageRunning("weave-keyword", found.jobId)) return { ok: false, message: "Another keyword is being worked in. Try again in a moment." };

  const evidence = confirmed ? confirmed.evidence.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (confirmed) confirmSkill(term, evidence);

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const must = found.ats.keywords.some((item) => item.must && item.term.toLowerCase() === term.toLowerCase());
  const request = {
    cv: markdown,
    keyword: term,
    must,
    ...(confirmed ? { confirmed: true, confirmation: evidence } : {}),
    ...(found.jobId !== null ? { jobId: found.jobId } : {}),
  };
  fs.mkdirSync(workFile(""), { recursive: true });
  fs.writeFileSync(workFile(`weave-${id}.json`), `${JSON.stringify(request, null, 2)}\n`);
  try {
    launch("weave-keyword", found.jobId, "manual", id);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  return { ok: true, message: "Working it in…", id };
}

// The proposal, once the engine has written it.
export async function weaveResult(target: string, id: string): Promise<WeaveResult> {
  const found = resolve(target);
  if (!found || !REQUEST_ID.test(id)) return { status: "failed", reason: "Unknown request." };
  const file = workFile(`weave-${id}-result.json`);
  const running = stageRunning("weave-keyword", found.jobId);
  // The answer counts once the run has ended, so the next keyword can start.
  if (fs.existsSync(file) && !running) {
    try {
      const result = JSON.parse(fs.readFileSync(file, "utf8"));
      if (result.status === "added" && typeof result.before === "string" && typeof result.after === "string") {
        return { status: "added", before: result.before, after: result.after, where: String(result.where ?? ""), reason: String(result.reason ?? "") };
      }
      return { status: "not-supported", reason: String(result.reason ?? "The profile does not show this.") };
    } catch {
      return { status: "failed", reason: "The engine's answer could not be read." };
    }
  }
  // No answer and nothing running any more: the run failed.
  return running ? { status: "working" } : { status: "failed", reason: "The engine stopped without an answer. See Activity." };
}
