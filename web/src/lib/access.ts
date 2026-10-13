import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The key that lets other devices (a phone over Tailscale) open Offerbound.
// Kept in data/access.key, made on first use; replacing it signs every device
// out. Plain fs only: the request proxy uses it too.

const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, "data", "access.key");
export const ACCESS_COOKIE = "offerbound_access";

let cached: string | null = null;

export function accessKey() {
  if (cached) return cached;
  try {
    cached = fs.readFileSync(FILE, "utf8").trim() || null;
  } catch {
    cached = null;
  }
  if (!cached) cached = resetAccessKey();
  return cached;
}

export function resetAccessKey() {
  const key = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, key);
  cached = key;
  return key;
}

export function keyMatches(given: string | undefined | null) {
  const expected = Buffer.from(accessKey());
  const actual = Buffer.from(given ?? "");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Requests made on this computer (the app listens on 127.0.0.1 only).
export const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
