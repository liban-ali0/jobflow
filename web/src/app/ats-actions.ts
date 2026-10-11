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
// Anything else is refused, since the target names a file and reaches the engine.
const TARGET = /^(doc):(\d{1,9})$|^(base):([a-z0-9-]{1,40})$/;

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
