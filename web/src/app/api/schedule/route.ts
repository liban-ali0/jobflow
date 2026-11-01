import { revalidatePath } from "next/cache";
import { archiveStale, getSettings } from "@/lib/data";
import { scheduleTick } from "@/lib/scheduler";

const holder = globalThis as unknown as { jobflowArchivedAt?: number };

// Called once a minute by the clock in src/instrumentation.ts.
export async function POST(request: Request) {
  const key = process.env.JOBFLOW_TICK_KEY;
  if (!key || request.headers.get("x-jobflow-tick") !== key) return new Response("Not allowed", { status: 403 });
  // Every half hour: unpicked jobs whose posting is too old go to the archive.
  if (Date.now() - (holder.jobflowArchivedAt ?? 0) > 30 * 60000) {
    holder.jobflowArchivedAt = Date.now();
    if (archiveStale(getSettings().freshness.archiveAfterDays ?? 7) > 0) revalidatePath("/", "layout");
  }
  const outcome = scheduleTick();
  if (outcome !== "off" && outcome !== "idle" && outcome !== "busy") revalidatePath("/", "layout");
  return Response.json({ outcome });
}
