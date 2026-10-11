import { emailDraft } from "@/lib/apply";

// The email application as an .eml draft with the CV and cover letter attached.
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/email-draft">) {
  const { id } = await ctx.params;
  try {
    const draft = await emailDraft(Number(id));
    if (!draft) return new Response("No email application for this job: it needs a confirmed email address.", { status: 404 });
    return new Response(draft.eml, {
      headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(draft.fileName)}` },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }
}
