import { revalidatePath } from "next/cache";
import { extensionDenied } from "@/lib/capture";
import { addProgress, finishRun, getJob, getRun, listRuns, listingTargets, setListing, startRun } from "@/lib/data";
import { browserListing, classifyBrowserPage } from "@/core/liveness.mjs";

// Listings only a real browser can read (Indeed), checked by the extension in
// the user's own browser. GET: the ones due a check, starting a run that shows
// on Activity. POST: one page as the extension read it.
const PER_RUN = 20;

export async function GET(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  // An earlier check the browser never finished (closed, crashed).
  for (const run of listRuns(50)) {
    if (run.stage === "browser-listings" && run.status === "running") finishRun(run.id, { status: "failed", summary: "The browser stopped before this check finished." });
  }
  const jobs = listingTargets({ limit: 1000 })
    .filter((job) => browserListing(job.url))
    .slice(0, PER_RUN)
    .map(({ id, url }) => ({ id, url }));
  if (!jobs.length) return Response.json({ ok: true, runId: null, jobs });
  const trigger = new URL(request.url).searchParams.get("trigger") === "timer" ? "schedule" : "manual";
  const runId = startRun({ stage: "browser-listings", trigger, engine: "extension" });
  addProgress(runId, `Checking ${jobs.length} ${jobs.length === 1 ? "listing" : "listings"} in your browser`);
  return Response.json({ ok: true, runId, jobs });
}

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.slice(0, limit) : "");

export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const runId = Number(body?.runId);
  const job = getJob(Number(body?.id));
  if (getRun(runId)?.status !== "running" || !job?.url || !browserListing(job.url)) return Response.json({ ok: false, message: "Not part of this check." }, { status: 400 });
  const controls = Array.isArray(body?.controls) ? body.controls.map((control: unknown) => text(control, 80)).filter(Boolean).slice(0, 300) : [];
  const check = classifyBrowserPage({ url: job.url, finalUrl: text(body?.finalUrl, 2000), text: text(body?.text, 40000), controls });
  setListing(job.id, check);
  addProgress(runId, `${job.title} · ${job.company}: ${check.state === "open" ? "open" : check.state === "closed" ? `closed. ${check.reason}` : `unclear. ${check.reason}`}`);
  revalidatePath("/", "layout");
  return Response.json({ ok: true, state: check.state });
}
