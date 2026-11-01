import { checkPassword, makeSession } from "@/core/password.mjs";
import { ROOT, SESSION, recordTry, safeNext, waitSeconds } from "@/lib/login";

// The sign-in form (lib/login.ts) posts here. Answers with a redirect: back to
// the page asked for, or to the form with a notice.
const back = (location: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });

const withNotice = (next: string, notice: string, extra = "") => `${next}${next.includes("?") ? "&" : "?"}login=${notice}${extra}`;

export async function POST(request: Request) {
  // Only this app's own form: a page elsewhere cannot sign a browser in.
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && new URL(origin).host !== request.headers.get("host")) return new Response("Not allowed", { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const now = Date.now();
  const wait = waitSeconds(now);
  if (wait > 0) return back(withNotice(next, "wait", `&wait=${wait}`));
  const ok = checkPassword(ROOT, form?.get("password"));
  recordTry(ok, now);
  if (!ok) return back(withNotice(next, "wrong"));
  const session = makeSession(ROOT, form?.get("remember") === "on");
  if (!session) return back(next);
  const cookie = `${SESSION}=${session.value}; Path=/; HttpOnly; SameSite=Lax${session.maxAge ? `; Max-Age=${session.maxAge}` : ""}`;
  return back(next, cookie);
}
