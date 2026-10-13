import { collectPlan } from "@/lib/browser-sites";
import { extensionDenied } from "@/lib/capture";
import { addProgress, getSettings, startRun } from "@/lib/data";

// What the extension reads in this run: the enabled browser sites and their
// search pages. The run shows on Activity as "Collect in your browser".
export async function GET(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const sites = collectPlan(getSettings());
  if (!sites.length) {
    return Response.json({ ok: false, message: "Switch on a site in Offerbound → Settings → Sources (Kariyer.net, Eleman.net, Techcareer.net, or Indeed)." }, { status: 409 });
  }
  const trigger = new URL(request.url).searchParams.get("trigger") === "timer" ? "schedule" : "manual";
  const runId = startRun({ stage: "browser-collect", trigger, engine: "extension" });
  addProgress(runId, `Reading ${sites.map((site) => `${site.name} (${site.pages.length} ${site.pages.length === 1 ? "page" : "pages"})`).join(", ")}`);
  return Response.json({ ok: true, runId, sites });
}
