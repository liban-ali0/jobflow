import { revalidatePath } from "next/cache";
import { markApplied } from "@/app/job-actions";
import { extensionDenied } from "@/lib/capture";

// "I submitted it" in the extension: the job is marked as applied.
export async function POST(request: Request, ctx: RouteContext<"/api/apply/[id]/applied">) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const result = await markApplied(Number(id));
  revalidatePath("/", "layout");
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
