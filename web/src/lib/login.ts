import path from "node:path";
import { SESSION_COOKIE, hasPassword, sessionValid } from "@/core/password.mjs";

// The password gate (core/password.mjs), used by the request proxy. With no
// password set, nothing changes. With one, every request needs a signed-in
// browser, on this computer too, except:
// - the app's icons, styles and scripts (nothing private in them);
// - signing in and out;
// - the schedule's clock, which carries its own per-process key;
// - the extension's routes when they carry the extension key, which those
//   routes check themselves (extensionDenied).
// The login page is served by the proxy itself, outside the app's layout, so
// nothing from the app (counts, job titles) shows before signing in.

export const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(process.cwd(), "..");

// Only files with nothing private: built scripts and styles (not the image
// optimiser or anything else under /_next/), the development reload channel,
// and the app's icons.
const PUBLIC = /^\/(_next\/static\/|_next\/webpack-hmr$|app\/[\w.-]+\.png$|brand\/[\w.-]+\.svg$|icon\.svg$|apple-icon(\.png)?$|favicon\.ico$|manifest\.webmanifest$)/;
const EXTENSION = /^\/api\/(apply|capture|collect|facts|listings\/browser|mail)(\/|$)/;

export const passwordOn = () => hasPassword(ROOT);

type Gate = { open: true } | { open: false; page: boolean };

export function signInGate(request: { method: string; pathname: string; headers: Headers; cookie: string | undefined }): Gate {
  if (!passwordOn()) return { open: true };
  const { method, pathname, headers } = request;
  // A server action can be called from any page's address, so a call is
  // always checked, whatever the path.
  const action = headers.has("next-action");
  if (!action) {
    if (PUBLIC.test(pathname)) return { open: true };
    if ((pathname === "/api/login" || pathname === "/api/logout") && method === "POST") return { open: true };
    if (pathname === "/api/schedule") return { open: true };
    if (EXTENSION.test(pathname) && headers.has("x-jobflow-token")) return { open: true };
  }
  if (sessionValid(ROOT, request.cookie)) return { open: true };
  const page = (method === "GET" || method === "HEAD") && !pathname.startsWith("/api/") && !action && (headers.get("accept") ?? "").includes("text/html");
  return { open: false, page };
}

export const SESSION = SESSION_COOKIE;

// Wrong passwords in a row (any device): after five, each try waits longer,
// up to a minute. Kept in memory; a restart clears it.
const holder = globalThis as unknown as { offerboundTries?: { failures: number; until: number } };
const tries = () => (holder.offerboundTries ??= { failures: 0, until: 0 });

export function waitSeconds(now: number) {
  return Math.max(0, Math.ceil((tries().until - now) / 1000));
}

export function recordTry(ok: boolean, now: number) {
  const state = tries();
  if (ok) {
    state.failures = 0;
    state.until = 0;
    return;
  }
  state.failures += 1;
  if (state.failures >= 5) state.until = now + Math.min(60, 2 ** (state.failures - 4)) * 1000;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Where to go after signing in: a path on this app only. Parsed the way a
// browser would (which drops tabs and newlines and reads "\" as "/"), and
// kept only if it stays on the same origin.
export function safeNext(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 2000 || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  const base = "http://offerbound.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

// Whether a sign-in or sign-out request comes from this app's own page. A
// browser always names the page's origin on a form POST; "null" (a sandboxed
// frame elsewhere) and other sites are refused, so no website can sign a
// browser in or use up the wrong tries. No Origin header at all is a
// program on this computer or paired device, not a web page.
export function sameOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (origin === null) return headers.get("sec-fetch-site") === null || headers.get("sec-fetch-site") === "same-origin" || headers.get("sec-fetch-site") === "none";
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}

// The sign-in page, plain HTML with its own light and dark colours.
export function loginPage(next: string, notice: "wrong" | "wait" | "out" | null, wait = 0) {
  const message =
    notice === "wrong"
      ? '<p class="note bad" role="alert">That password is not right.</p>'
      : notice === "wait"
        ? `<p class="note bad" role="alert">Too many wrong tries. Wait ${wait} seconds, then try again.</p>`
        : notice === "out"
          ? '<p class="note" role="status">Signed out.</p>'
          : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Offerbound</title><link rel="icon" href="/icon.svg"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#12203a">
<style>
:root{--bg:#eef1f5;--card:#fff;--ink:#12203a;--muted:#5a6578;--line:#cfd6e0;--focus:#1d5fa8;--bad:#b42318;--accent:#ffc20e;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0d1626;--card:#16223a;--ink:#e8edf5;--muted:#a3afc2;--line:#33425e;--focus:#7fb2ee;--bad:#ff8a7a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:24rem;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;box-shadow:0 10px 30px rgb(0 0 0/.08)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.brand img{width:40px;height:40px}.brand b{font-size:20px;letter-spacing:.02em}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:var(--muted);font-size:14px}
label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}
input[type=password]{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink)}
input:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.remember{display:flex;align-items:center;gap:8px;margin:14px 0 20px;font-weight:400;color:var(--muted)}
button{width:100%;font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:var(--accent);color:#12203a;cursor:pointer}
.note{padding:10px 12px;border-radius:8px;border:1px solid var(--line);color:var(--ink)}.bad{border-color:var(--bad);color:var(--bad)}
small{display:block;margin-top:18px;color:var(--muted);font-size:12px}code{font-size:12px}
</style>
<main>
<div class="brand"><img src="/icon.svg" alt=""><b>Offerbound</b></div>
<h1>Sign in</h1><p>This Offerbound is protected with a password.</p>
${message}
<form method="post" action="/api/login">
<input type="hidden" name="next" value="${escape(next)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<label class="remember"><input type="checkbox" name="remember" checked> Keep me signed in on this device for 30 days</label>
<button type="submit">Sign in</button>
</form>
<small>Forgot it? On the computer Offerbound runs on, run <code>node scripts/password.mjs off</code> in the Offerbound folder, then set a new one in Settings.</small>
</main></html>`;
}
