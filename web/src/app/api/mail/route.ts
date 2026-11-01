import { revalidatePath } from "next/cache";
import { extensionDenied } from "@/lib/capture";
import { getSettings } from "@/lib/data";
import { cleanIncoming, ingestMails, recordMailCheck } from "@/lib/mail";

// What the extension should check: whether replies are watched, and in
// which signed-in Gmail account.
export async function GET(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const { email } = getSettings();
  return Response.json({ ok: true, watch: email.watchReplies, account: email.account ?? 0 });
}

// One check of the user's new Gmail by the extension: the new emails, or why
// Gmail could not be read (not signed in).
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ ok: false, message: "Nothing was sent." }, { status: 400 });
  const address = typeof body.address === "string" && /^[^\s@]+@[^\s@]+$/.test(body.address) ? body.address.slice(0, 200) : null;
  if (body.error) {
    recordMailCheck(false, String(body.error).slice(0, 300), address);
    revalidatePath("/settings");
    return Response.json({ ok: true, message: "Noted." });
  }
  const mails = (Array.isArray(body.mails) ? body.mails : []).slice(0, 50).map(cleanIncoming).filter((mail: unknown) => mail !== null);
  const { kept, received } = ingestMails(mails);
  const message = kept ? `${kept} new ${kept === 1 ? "reply" : "replies"} about your applications.` : received ? "Only confirmations that applications arrived." : "No new replies about your applications.";
  recordMailCheck(true, message, address);
  revalidatePath("/", "layout");
  return Response.json({ ok: true, kept, message });
}
