import { extensionDenied } from "@/lib/capture";
import { listJobs } from "@/lib/data";

// The jobs the extension can fill an application for: ready to apply (every
// document approved), newest first.
export async function GET(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const jobs = listJobs({ status: "ready" }).map((job) => ({ id: job.id, title: job.title, company: job.company, url: job.url }));
  return Response.json({ ok: true, jobs });
}
