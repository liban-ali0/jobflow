import { baseCvPage } from "@/lib/documents";
import { pageResponse } from "@/lib/pdf";

// The base CV for a role: ?format=pdf downloads it, otherwise the page is
// shown (used for previews). ?template= tries another template.
export async function GET(request: Request, ctx: RouteContext<"/api/cvs/[role]">) {
  const { role } = await ctx.params;
  const url = new URL(request.url);
  // Making a PDF opens a browser page: not for other websites to trigger.
  if (url.searchParams.get("format") === "pdf" && request.headers.get("sec-fetch-site") === "cross-site") return new Response("Not allowed", { status: 403 });
  const page = baseCvPage(role, url.searchParams.get("template"));
  if (!page) return new Response("No base CV for this role yet", { status: 404 });
  return pageResponse(page, url.searchParams.get("format") === "pdf", url.searchParams.get("view") === "1");
}
