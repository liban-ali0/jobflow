import { parseCv } from "@/lib/cv-format";
import { renderCv } from "@/lib/cv-render";
import { previewCvMarkdown } from "@/lib/documents";
import { getTemplate } from "@/lib/templates";

// A template shown with the user's own CV (or a sample), for previews.
export async function GET(_request: Request, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  const template = getTemplate(id);
  if (!template) return new Response("Template not found", { status: 404 });
  return new Response(renderCv(parseCv(previewCvMarkdown()), template), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
