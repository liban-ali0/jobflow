import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, getSettings, setSettings } from "./data";

// Pages sent by the Jobflow browser extension are saved here and imported by
// the import-jobs step.
export const CAPTURE_DIR = "jobs/_work/captures";
export const EXTENSION_DIR = path.join(ROOT, "extension");

// The secret the extension sends with each page, so no website can post to
// the app. Made on first use and kept in the settings.
export function captureToken() {
  const current = getSettings().captureToken;
  if (current) return current;
  const token = crypto.randomBytes(18).toString("base64url");
  setSettings({ captureToken: token });
  return token;
}

export function tokenMatches(given: string) {
  const expected = Buffer.from(captureToken());
  const actual = Buffer.from(given);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export type CapturedPage = { url: string; title: string; text: string; links: { text: string; href: string }[] };

// Keeps only what the import step needs, within fixed limits.
export function cleanCapture(input: unknown): CapturedPage | null {
  if (!input || typeof input !== "object") return null;
  const page = input as Record<string, unknown>;
  let url: URL;
  try {
    url = new URL(String(page.url));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const text = typeof page.text === "string" ? page.text.slice(0, 200_000) : "";
  if (!text.trim()) return null;
  const links = (Array.isArray(page.links) ? page.links : [])
    .filter((link): link is { text: unknown; href: unknown } => Boolean(link) && typeof link === "object")
    .map((link) => ({ text: String(link.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200), href: String(link.href ?? "").slice(0, 1000) }))
    .filter((link) => /^https?:\/\//.test(link.href))
    .slice(0, 400);
  return { url: url.toString(), title: String(page.title ?? "").slice(0, 300), text, links };
}

// Saves a page and returns its path relative to the project, for the step.
export function saveCapture(page: CapturedPage) {
  const dir = path.join(ROOT, CAPTURE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const name = `capture-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ ...page, capturedAt: new Date().toISOString() }, null, 1));
  return `${CAPTURE_DIR}/${name}`;
}
