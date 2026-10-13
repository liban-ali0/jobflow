import { cleanCapture, extensionDenied, saveCapture } from "@/lib/capture";
import { launch, stageRunning } from "@/lib/engine";

const reply = (ok: boolean, message: string, status = 200) => Response.json({ ok, message }, { status });

// A page sent by the Jobflow browser extension: saved, then the import-jobs
// step picks out the jobs with the engine chosen in Settings.
export async function POST(request: Request) {
  // Only the extension may send pages (no website, and the user's key).
  const denied = extensionDenied(request);
  if (denied) return denied;
  const raw = await request.text();
  if (raw.length > 600_000) return reply(false, "This page is too large to send.", 413);
  let page;
  try {
    page = cleanCapture(JSON.parse(raw));
  } catch {
    page = null;
  }
  if (!page) return reply(false, "Nothing readable on this page.", 400);
  if (stageRunning("import-jobs")) return reply(false, "Still reading the last page you sent. Try again in a minute.", 409);
  const file = saveCapture(page);
  try {
    launch("import-jobs", null, "manual", file);
  } catch (error) {
    return reply(false, (error as Error).message, 500);
  }
  return reply(true, "Sent. Jobflow is picking out the jobs; they appear on Today in a minute or two.");
}
