import { cardToJob, roleWords, titleFits, type CapturedCard } from "@/lib/browser-sites";
import { extensionDenied } from "@/lib/capture";
import { addJob, addProgress, getRun, getSettings } from "@/lib/data";

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// One search page read by the extension: its job cards become found jobs
// (no AI needed); a blocked page (captcha, login) is recorded.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const runId = Number(body?.runId);
  if (!body || getRun(runId)?.status !== "running") return Response.json({ ok: false, message: "This collect run has ended." }, { status: 409 });
  const site = text(body.site, 40);
  const name = text(body.siteName, 60) || site;
  const page = body.page ?? {};
  if (body.blocked) {
    addProgress(runId, `${name}: stopped, ${text(body.blocked, 160)}`);
    return Response.json({ ok: true, created: [] });
  }
  const cards: CapturedCard[] = (Array.isArray(body.cards) ? body.cards : []).slice(0, 80).map((card: Record<string, unknown>) => ({
    url: text(card.url, 1000),
    title: text(card.title, 200),
    lines: (Array.isArray(card.lines) ? card.lines : []).slice(0, 12).map((line: unknown) => text(line, 200)),
  }));
  const created: { id: number; url: string }[] = [];
  let known = 0;
  let unrelated = 0;
  const words = roleWords(getSettings());
  for (const card of cards) {
    if (!/^https?:\/\//.test(card.url) || !card.title) continue;
    const job = cardToJob(card);
    if (!job.title) continue;
    // A site's general listings after an unknown search: not for these roles.
    if (words.size && !titleFits(job.title, words)) {
      unrelated += 1;
      continue;
    }
    const { id, created: isNew } = addJob({
      title: job.title,
      company: job.company ?? "Unknown company",
      country: text(page.country, 60) || null,
      city: job.city,
      role: page.role ? text(page.role, 40) : null,
      source: site,
      url: card.url.split("#")[0],
    });
    if (isNew) created.push({ id, url: card.url });
    else known += 1;
  }
  addProgress(runId, `${name}${page.keyword ? ` "${text(page.keyword, 60)}"` : ""}: ${cards.length} listings, ${created.length} new${known ? `, ${known} already stored` : ""}${unrelated ? `, ${unrelated} not for your roles` : ""}`);
  return Response.json({ ok: true, created });
}
