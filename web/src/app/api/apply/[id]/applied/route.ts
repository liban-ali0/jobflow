import { revalidatePath } from "next/cache";
import { markApplied } from "@/app/job-actions";
import { cleanFields, writeApplicationRecord } from "@/lib/apply-record";
import { extensionDenied } from "@/lib/capture";

// The application was sent: confirmed by the site's page, or by the user
// ("I submitted it"). The job is marked as applied and a copy of the sent
// form is kept in its folder.
export async function POST(request: Request, ctx: RouteContext<"/api/apply/[id]/applied">) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const result = await markApplied(Number(id));
  if (result.ok) {
    writeApplicationRecord(Number(id), {
      confirmedBy: body?.confirmedBy === "page" ? "page" : "user",
      url: String(body?.url ?? "").slice(0, 1000),
      fields: cleanFields(body?.fields),
    });
  }
  revalidatePath("/", "layout");
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
