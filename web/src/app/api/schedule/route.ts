import { revalidatePath } from "next/cache";
import { scheduleTick } from "@/lib/scheduler";

// Called once a minute by the clock in src/instrumentation.ts.
export async function POST(request: Request) {
  const key = process.env.JOBFLOW_TICK_KEY;
  if (!key || request.headers.get("x-jobflow-tick") !== key) return new Response("Not allowed", { status: 403 });
  const outcome = scheduleTick();
  if (outcome !== "off" && outcome !== "idle" && outcome !== "busy") revalidatePath("/", "layout");
  return Response.json({ outcome });
}
