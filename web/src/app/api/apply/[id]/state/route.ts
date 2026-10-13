import { revalidatePath } from "next/cache";
import { cleanReasons, setWaiting } from "@/lib/apply-record";
import { extensionDenied } from "@/lib/capture";

// The extension reports what it could not fill: the job waits for the user
// with those reasons. An empty list means everything was filled.
export async function POST(request: Request, ctx: RouteContext<"/api/apply/[id]/state">) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const job = setWaiting(Number(id), cleanReasons(body?.missing));
  if (!job) return Response.json({ ok: false, message: "This job is not ready to apply." }, { status: 409 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true, message: job.apply_state ? "Waiting for you." : "Everything filled." });
}
