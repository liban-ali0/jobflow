import { SESSION } from "@/lib/login";

// "Sign out" in Settings → This computer: this browser only.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && new URL(origin).host !== request.headers.get("host")) return new Response("Not allowed", { status: 403 });
  return new Response(null, { status: 303, headers: { Location: "/?login=out", "Set-Cookie": `${SESSION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, "Cache-Control": "no-store" } });
}
