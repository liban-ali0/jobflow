import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The key that lets other devices (a phone over Tailscale) open Offerbound.
// Kept in data/access.key, made on first use; replacing it signs every device
// out. Plain fs only: the request proxy uses it too.

const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, "data", "access.key");
export const ACCESS_COOKIE = "offerbound_access";

// Cached with the file's change time: the request proxy and the app may hold
// separate copies, and a new key (sign out) must reach both at once.
let cached: { key: string; changed: number } | null = null;

export function accessKey() {
  let changed = -1;
  try {
    changed = fs.statSync(FILE).mtimeMs;
  } catch {
    return resetAccessKey();
  }
  if (cached && cached.changed === changed) return cached.key;
  const key = fs.readFileSync(FILE, "utf8").trim();
  if (!key) return resetAccessKey();
  cached = { key, changed };
  return key;
}

export function resetAccessKey() {
  const key = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Readable by this user only.
  fs.writeFileSync(FILE, key, { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
  cached = { key, changed: fs.statSync(FILE).mtimeMs };
  return key;
}

export function keyMatches(given: string | undefined | null) {
  const expected = Buffer.from(accessKey());
  const actual = Buffer.from(given ?? "");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Requests made on this computer (the app listens on 127.0.0.1 only). A
// device in the user's own Tailscale network arrives the same way and could
// claim this name; the tailnet sign-in is the boundary there. The access
// cookie is what stops web pages that point their own name at this computer.
export const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
