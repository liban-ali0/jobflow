import { applyPack } from "@/lib/apply";
import { extensionDenied } from "@/lib/capture";

// One job's application pack for the extension to fill a form with.
export async function GET(request: Request, ctx: RouteContext<"/api/apply/[id]">) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const pack = applyPack(Number(id));
  if (!pack) return Response.json({ ok: false, message: "This job no longer exists." }, { status: 404 });
  if (!pack.approved) return Response.json({ ok: false, message: "Approve all of this job's documents in Offerbound first." }, { status: 409 });
  const origin = new URL(request.url).origin;
  return Response.json({
    ok: true,
    pack: { ...pack, files: pack.files.map((file) => ({ ...file, url: `${origin}/api/documents/${file.documentId}?format=pdf` })) },
  });
}
