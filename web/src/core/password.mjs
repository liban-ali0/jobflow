// The optional password for opening Offerbound (Settings → This computer).
// Off until the user sets one. Kept in data/password.json, readable by this
// user only: the password as a scrypt hash, and a secret that signs sign-in
// cookies. A new password, or "sign out everywhere", makes a new secret, which
// ends every sign-in at once. Plain ESM on node:crypto, so the request proxy,
// the app and scripts/password.mjs share it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SESSION_COOKIE = "offerbound_session";
export const MIN_LENGTH = 8;
// A sign-in lasts until the browser closes (at most 12 hours), or 30 days on
// a device the user chose to remember.
export const SHORT_HOURS = 12;
export const REMEMBER_DAYS = 30;

const fileOf = (root) => path.join(root, "data", "password.json");
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// Cached with the file's change time, so a change reaches the proxy and the
// app (which may hold separate copies of this module) at once.
const cache = new Map();

export function readPassword(root) {
  const file = fileOf(root);
  let changed;
  try {
    changed = fs.statSync(file).mtimeMs;
  } catch {
    cache.delete(file);
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.changed === changed) return hit.record;
  let record = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.hash && parsed?.salt && parsed?.secret) record = parsed;
  } catch {
    // A damaged file counts as a password that nobody knows: safer than open.
    record = { hash: "", salt: "", secret: crypto.randomBytes(32).toString("base64url"), damaged: true };
  }
  cache.set(file, { changed, record });
  return record;
}

export const hasPassword = (root) => readPassword(root) !== null;

function write(root, record) {
  const file = fileOf(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  cache.delete(file);
}

const hashOf = (password, salt) => crypto.scryptSync(password.normalize("NFC"), Buffer.from(salt, "base64url"), 64, SCRYPT).toString("base64url");

export function setPassword(root, password) {
  if (typeof password !== "string" || password.length < MIN_LENGTH) throw new Error(`The password needs at least ${MIN_LENGTH} characters.`);
  if (password.length > 200) throw new Error("That password is too long.");
  const salt = crypto.randomBytes(16).toString("base64url");
  write(root, { hash: hashOf(password, salt), salt, secret: crypto.randomBytes(32).toString("base64url"), changed: new Date().toISOString() });
}

export function clearPassword(root) {
  fs.rmSync(fileOf(root), { force: true });
  cache.delete(fileOf(root));
}

// Ends every sign-in, keeping the password.
export function newSecret(root) {
  const record = readPassword(root);
  if (!record || record.damaged) return;
  write(root, { ...record, secret: crypto.randomBytes(32).toString("base64url") });
}

export function checkPassword(root, password) {
  const record = readPassword(root);
  if (!record || record.damaged || typeof password !== "string" || password.length > 200) return false;
  const expected = Buffer.from(record.hash, "base64url");
  const actual = Buffer.from(hashOf(password, record.salt), "base64url");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const sign = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("base64url");

// A sign-in cookie value: when it ends, a random part, and their signature.
export function makeSession(root, remember) {
  const record = readPassword(root);
  if (!record) return null;
  const expires = Date.now() + (remember ? REMEMBER_DAYS * 24 : SHORT_HOURS) * 3600_000;
  const body = `${expires}.${crypto.randomBytes(12).toString("base64url")}`;
  return { value: `${body}.${sign(record.secret, body)}`, maxAge: remember ? REMEMBER_DAYS * 24 * 3600 : undefined };
}

export function sessionValid(root, value) {
  const record = readPassword(root);
  if (!record || record.damaged || typeof value !== "string") return false;
  const [expires, nonce, signature, extra] = value.split(".");
  if (!expires || !nonce || !signature || extra !== undefined || !(Number(expires) > Date.now())) return false;
  const expected = Buffer.from(sign(record.secret, `${expires}.${nonce}`));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
