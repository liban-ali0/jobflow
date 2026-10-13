import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ROOT, addEvent, getJob, updateJob } from "./data";

// What the Offerbound extension reports while it applies: the job waits for the
// user while fields are left, and a copy of the sent form is kept.

export type SentField = { label: string; value: string };

const clean = (text: unknown, max: number) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The reasons a form could not be completed, deduplicated and bounded.
export function cleanReasons(input: unknown) {
  return [...new Set((Array.isArray(input) ? input : []).map((reason) => clean(reason, 200)).filter(Boolean))].slice(0, 30);
}

export function cleanFields(input: unknown): SentField[] {
  return (Array.isArray(input) ? input : [])
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === "object")
    .map((field) => ({ label: clean(field.label, 200), value: String(field.value ?? "").trim().slice(0, 5000) }))
    .filter((field) => field.label && field.value)
    .slice(0, 150);
}

// The job waits for the user, with what is left; an empty list clears it.
export function setWaiting(jobId: number, reasons: string[]) {
  const job = getJob(jobId);
  if (!job || job.status !== "ready") return null;
  if (!reasons.length) {
    if (job.apply_state) updateJob(jobId, { apply_state: null, apply_missing: null });
    return getJob(jobId);
  }
  const changed = job.apply_state !== "waiting" || JSON.stringify(job.apply_missing) !== JSON.stringify(reasons);
  if (changed) {
    updateJob(jobId, { apply_state: "waiting", apply_missing: reasons });
    if (job.apply_state !== "waiting") addEvent(jobId, "apply", `Waiting for you: ${reasons.join("; ").slice(0, 400)}`);
  }
  return getJob(jobId);
}

// A copy of what was sent, in the job's folder: application.md.
export function writeApplicationRecord(jobId: number, { confirmedBy, url, fields }: { confirmedBy: "page" | "user"; url: string; fields: SentField[] }) {
  const job = getJob(jobId);
  if (!job?.folder) return null;
  const lines = [
    `# Application: ${job.title} at ${job.company}`,
    "",
    `Sent: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    `Form: ${url || "unknown"}`,
    `Confirmed by: ${confirmedBy === "page" ? "the site's confirmation" : "you (I submitted it)"}`,
    "",
    "## What was sent",
    "",
    ...(fields.length ? fields.map((field) => `- **${field.label}**: ${field.value.replace(/\n+/g, " ")}`) : ["Not captured."]),
    "",
  ];
  const relative = `${job.folder}/application.md`;
  fs.writeFileSync(path.join(ROOT, relative), lines.join("\n"));
  return relative;
}
