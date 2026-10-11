"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { checkCv } from "@/lib/ats";
import { targetForJob, targetForRole } from "@/lib/ats-keywords";
import { ROOT, getDocument, getSettings } from "@/lib/data";
import { baseCvPath, readText } from "@/lib/documents";
import { launch, stageRunning } from "@/lib/engine";

// "doc:<id>" for a job's tailored CV, "base:<role key>" for a base CV.
function resolve(target: string) {
  const [kind, value] = target.split(":");
  if (kind === "doc") {
    const doc = getDocument(Number(value));
    if (!doc || doc.type !== "cv") return null;
    return { file: doc.path, jobId: doc.job_id, ats: targetForJob(doc.job_id) };
  }
  if (kind === "base" && getSettings().roles.some((role) => role.key === value)) {
    return { file: baseCvPath(value), jobId: null, ats: targetForRole(value) };
  }
  return null;
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
  };
  const work = path.join(ROOT, "jobs", "_work");
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, `ats-${target.replace(":", "-")}.json`), `${JSON.stringify(brief, null, 2)}\n`);

  try {
    launch("improve-cv", found.jobId, "manual", target);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Improving it now, with only facts from your profile. This takes a minute or two." };
}
