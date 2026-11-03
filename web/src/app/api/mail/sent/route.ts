import { revalidatePath } from "next/cache";
import { markApplied } from "@/app/job-actions";
import { extensionDenied } from "@/lib/capture";
import { addEvent, getJob, updateJob } from "@/lib/data";
import { FOLLOW_UP_SENT, THANK_YOU_SENT, nextFollowUpDate } from "@/lib/followups";
import { SENT_STATUSES } from "@/lib/types";

// The user pressed Send in the Gmail window Offerbound opened. A follow-up
// moves the reminder on, a thank-you note counts as sent, and an application
// by email marks the job as applied.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const jobId = Number(body?.jobId);
  const job = getJob(jobId);
  if (!job) return Response.json({ ok: false, message: "This job no longer exists." }, { status: 404 });
  const to = String(body?.to ?? "").replace(/\s+/g, " ").slice(0, 200);
  if (body?.kind === "application") {
    addEvent(jobId, "email sent", `Application email${to ? ` to ${to}` : ""}, sent from Gmail`);
    if (!SENT_STATUSES.includes(job.status)) {
      const result = await markApplied(jobId);
      if (!result.ok) updateJob(jobId, { status: "applied", follow_up_due: nextFollowUpDate() });
    }
  } else if (body?.kind === "thank_you") {
    addEvent(jobId, THANK_YOU_SENT, `Sent from Gmail${to ? ` to ${to}` : ""}`);
    if (job.status === "interview") updateJob(jobId, { follow_up_due: nextFollowUpDate("interview") });
  } else {
    addEvent(jobId, FOLLOW_UP_SENT, `Sent from Gmail${to ? ` to ${to}` : ""}`);
    if (job.status === "applied") updateJob(jobId, { follow_up_due: nextFollowUpDate() });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true, message: "Recorded as sent." });
}
