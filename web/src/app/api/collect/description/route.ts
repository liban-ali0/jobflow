import { extensionDenied } from "@/lib/capture";
import { getJob, updateJob } from "@/lib/data";

// A new job's full listing text, read by the extension from its page.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const job = getJob(Number(body?.id));
  const description = String(body?.text ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000);
  if (!job) return Response.json({ ok: false, message: "No such job." }, { status: 404 });
  if (description.length > 200 && !job.description) updateJob(job.id, { description, ...(body?.postedAt ? { posted_at: String(body.postedAt).slice(0, 40) } : {}) });
  return Response.json({ ok: true });
}
