import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, isLocalHost, keyMatches } from "./lib/access";

// Offerbound is private. It listens on this computer only (127.0.0.1), so a
// request with another host name came through Tailscale, or from a web page
// that pointed its own name at this computer. Those need the access cookie,
// which a device gets once from the pairing link in Settings → Other devices.

const page = (title: string, text: string, status: number) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 20px;color:#12203a;background:#eef1f5">` +
      `<h1 style="font-size:22px">${title}</h1><p>${text}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export function proxy(request: NextRequest) {
  if (isLocalHost(request.headers.get("host") ?? "")) return NextResponse.next();

  // The pairing link: /pair?key=… sets the cookie for this device.
  if (request.nextUrl.pathname === "/pair") {
    if (!keyMatches(request.nextUrl.searchParams.get("key"))) {
      return page("This link no longer works", "Open Offerbound on your computer, go to Settings → Other devices, and use the link shown there.", 403);
    }
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(ACCESS_COOKIE, request.nextUrl.searchParams.get("key")!, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  if (keyMatches(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  return page("Offerbound is private", "To open it on this device, use the link in Settings → Other devices on your computer.", 401);
}
