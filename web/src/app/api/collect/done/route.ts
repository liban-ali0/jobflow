import { revalidatePath } from "next/cache";
import { extensionDenied } from "@/lib/capture";
import { finishRun, getRun } from "@/lib/data";

// The end of a collect run, with what was found.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const runId = Number(body?.runId);
  if (getRun(runId)?.status !== "running") return Response.json({ ok: true });
  const found = Math.max(0, Number(body?.created) || 0);
  const stopped: string[] = Array.isArray(body?.stopped) ? body.stopped.map((item: unknown) => String(item).slice(0, 160)).slice(0, 10) : [];
  const summary = [
    found ? `${found} new ${found === 1 ? "job" : "jobs"} from your browser. Rank them on Today.` : "No new jobs this time.",
    ...stopped.map((item) => `Stopped: ${item}`),
  ].join("\n\n");
  finishRun(runId, { status: "done", summary });
  revalidatePath("/", "layout");
  return Response.json({ ok: true, message: summary });
}
