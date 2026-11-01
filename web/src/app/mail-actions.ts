"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { recordOutcome } from "@/app/tracking-actions";
import { addEvent, getJob, getMail, updateMail } from "@/lib/data";
import { MAIL_KIND_LABELS } from "@/lib/mail-labels";
import { SENT_STATUSES, STATUS_LABELS, type MailKind, type Status } from "@/lib/types";

// The user's answer to an email Offerbound found: which application it is
// about, and what it means for it. Nothing changes before this.
export async function confirmMail(mailId: number, jobId: number, status: string): Promise<ActionResult> {
  const mail = getMail(mailId);
  if (!mail || mail.state !== "new") return { ok: false, message: "This email was already handled." };
  const job = getJob(jobId);
  if (!job || !SENT_STATUSES.includes(job.status)) return { ok: false, message: "Pick one of your applications." };
  const what = mail.kind ? MAIL_KIND_LABELS[mail.kind as MailKind] : "Email";
  const from = mail.from_name || mail.from_email || "";
  addEvent(jobId, "email", `${what} from ${from}: ${mail.subject ?? ""}`.slice(0, 500));
  updateMail(mailId, { job_id: jobId, state: "done" });
  // Same stage as now: the email is only noted on the job.
  if (!status || status === job.status) {
    revalidatePath("/", "layout");
    return { ok: true, message: `Noted on ${job.company}.` };
  }
  const result = await recordOutcome(jobId, status, `Email from ${from}: "${mail.subject ?? ""}"`);
  if (!result.ok) updateMail(mailId, { state: "new" });
  return result.ok ? { ok: true, message: `${job.company}: marked as ${STATUS_LABELS[status as Status]}.${result.message.includes("interview pack") ? " Writing your interview pack now." : ""}` } : result;
}

export async function dismissMail(mailId: number): Promise<ActionResult> {
  const mail = getMail(mailId);
  if (!mail) return { ok: false, message: "This email no longer exists." };
  updateMail(mailId, { state: "dismissed" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Hidden. Nothing changed." };
}
