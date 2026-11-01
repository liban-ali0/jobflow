import { SESSION, sameOrigin } from "@/lib/login";

// "Sign out" in Settings → This computer: this browser only.
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response("Not allowed", { status: 403 });
  return new Response(null, { status: 303, headers: { Location: "/?login=out", "Set-Cookie": `${SESSION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, "Cache-Control": "no-store" } });
}
