import { jobDocumentPage } from "@/lib/documents";
import { pageResponse } from "@/lib/pdf";

// A job's CV or cover letter: ?format=pdf downloads it, otherwise the page is
// shown (used for previews). ?template= tries another template.
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const page = jobDocumentPage(Number(id), url.searchParams.get("template"));
  if (!page) return new Response("Document not found", { status: 404 });
  return pageResponse(page, url.searchParams.get("format") === "pdf", url.searchParams.get("view") === "1");
}
