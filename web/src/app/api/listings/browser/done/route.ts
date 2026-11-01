import { revalidatePath } from "next/cache";
import { extensionDenied } from "@/lib/capture";
import { finishRun, getRun } from "@/lib/data";

// The end of a browser listing check, with what it found.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const runId = Number(body?.runId);
  if (getRun(runId)?.status !== "running") return Response.json({ ok: true });
  const count = (key: string) => Math.max(0, Math.min(1000, Number(body?.[key]) || 0));
  const [open, closed, unsure] = [count("open"), count("closed"), count("unsure")];
  const stopped = typeof body?.stopped === "string" ? body.stopped.slice(0, 200) : "";
  const summary = [
    `Checked ${open + closed + unsure} in your browser: ${open} open, ${closed} closed, ${unsure} unclear.`,
    ...(stopped ? [`Stopped: ${stopped}`] : []),
  ].join("\n\n");
  finishRun(runId, { status: "done", summary });
  revalidatePath("/", "layout");
  return Response.json({ ok: true, message: summary });
}
