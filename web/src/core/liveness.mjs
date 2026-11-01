// Is a saved job's listing still open? Reads the listing the way the collector
// does (public pages and APIs, no sign-in, no tricks) and answers "open",
// "closed" or "unsure" with a reason the user can read. Nothing here changes a
// job; the caller stores the answer and the user decides.
//
// After career-ops (github.com/career-ops-hq/career-ops, MIT): the page
// classifier is vendored in vendor/career-ops/liveness-core.mjs, and the
// LinkedIn and Workable checks follow its liveness-api.mjs. Its rule is kept:
// a wrong "closed" costs the user a real job, a wrong "unsure" costs one look,
// so anything unclear is "unsure".
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";
import { classifyLiveness } from "../vendor/career-ops/liveness-core.mjs";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT_MS = 20000;

// Sites that refuse every automatic visit (Indeed answers with a sign-in wall):
// a check there could only ever say "unsure".
const UNCHECKABLE = /(^|\.)indeed\.com$/i;

const decode = (text) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");

// The page's text with one line per block, and the labels of its links and
// buttons (where an Apply control would be).
function readHtml(html) {
  const body = html.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const controls = [];
  for (const [, , inner] of body.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const label = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (label && label.length <= 80) controls.push(label);
  }
  for (const [tag] of body.matchAll(/<input\b[^>]*type=["']?submit[^>]*>/gi)) {
    const value = /value=["']([^"']+)/i.exec(tag)?.[1];
    if (value) controls.push(decode(value).trim());
  }
  const text = decode(
    body
      .replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article|header|footer|figure|figcaption)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n")
    .trim();
  return { text, controls };
}

// Closure notices in Turkish and Arabic (Kariyer.net, Bayt and Gulf boards),
// which career-ops' English and European list does not cover. Matched on
// folded text: no accents or Arabic vowel marks, dotless i as i, one alef,
// taa marbuta as haa.
const fold = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
const LOCAL_CLOSED = [
  /\bbu ilan (artik )?yayin(da degil|dan kaldiril)/,
  /\bilan(in)? (yayin )?suresi dol(du|mus)/,
  /\bbu ilan(a)? basvuru(lara|ya) kapa(li|nmis|ndi)/,
  /\bbasvuru suresi (sona erdi|dolmustur|doldu)/,
  /هذه الوظيفه? لم تعد متاحه?/,
  /الوظيفه? لم تعد متاحه?/,
  /انتهت صلاحيه? (هذه )?الوظيفه?/,
  /(تم )?اغلاق (باب )?التقديم/,
  /لم يعد التقديم متاحا/,
];

function quoteOf(pattern, text) {
  const match = new RegExp(pattern.source, "i").exec(text)?.[0];
  return match && match.length <= 120 ? match.trim() : null;
}

// career-ops' verdict in Offerbound's words.
function fromPage(verdict, text) {
  const { result, code, reason } = verdict;
  if (result === "active") return { state: "open", reason: "The page still has an Apply button." };
  if (result === "expired") {
    if (code === "http_gone") return { state: "closed", reason: `The listing's page is gone (${reason}).` };
    if (code === "deadline_passed") return { state: "closed", reason: "Its application deadline has passed." };
    if (code === "expired_url" || code === "listing_page") return { state: "closed", reason: "The link now leads to a list of other jobs." };
    const source = /pattern matched: (.*)$/.exec(reason)?.[1];
    const quote = source ? quoteOf(new RegExp(source), text) : null;
    return { state: "closed", reason: quote ? `The page says "${quote}".` : "The page says the job is closed." };
  }
  if (code === "bot_challenge" || code === "access_blocked") return { state: "unsure", reason: "The site did not let an automatic check in. Open the listing to see.", blocked: true };
  if (code === "server_error") return { state: "unsure", reason: "The site had an error. It is checked again later." };
  if (code === "redirected_off_posting") return { state: "unsure", reason: "The link now leads somewhere else. Open it to see." };
  return { state: "unsure", reason: "Could not tell from the page. Open the listing to see." };
}

// A listing's link comes from a captured page or an engine, so it could name
// this computer or the local network (the app itself, a router). Only public
// addresses are read. The address is checked where the connection is made
// (the lookup below), so a name cannot answer "public" to a check and
// "private" to the request; every redirect goes through the same door.
const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

const BLOCKED_V4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
]) BLOCKED_V4.addSubnet(network, prefix, "ipv4");
// IPv6: only ordinary global unicast (2000::/3), and not the ranges that carry
// an IPv4 address or are reserved (6to4, Teredo, documentation, ORCHID).
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]]) BLOCKED_V6.addSubnet(network, prefix, "ipv6");
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet("2000::", 3, "ipv6");

export function publicAddress(ip) {
  const family = isIP(ip);
  if (family === 4) return !BLOCKED_V4.check(ip, "ipv4");
  if (family === 6) return GLOBAL_V6.check(ip, "ipv6") && !BLOCKED_V6.check(ip, "ipv6");
  return false;
}

class RefusedAddress extends Error {}

// dns.lookup that only ever hands the connection a public address.
function guardedLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    if (!list.length || !list.every((entry) => publicAddress(entry.address))) return callback(new RefusedAddress());
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

function checkedUrl(url) {
  let address;
  try {
    address = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(address.protocol) || address.username || address.password) return null;
  if (address.port && !["80", "443"].includes(address.port)) return null;
  const host = address.hostname.replace(/^\[|\]$/g, "");
  // Node skips the lookup for a written-out address, so that is checked here.
  if (isIP(host) && !publicAddress(host)) return null;
  return address;
}

// One request with a hard deadline (a server dripping bytes cannot hold it
// open) and a cap on the decompressed body; whatever comes first ends it.
function request(address, accept, deadline) {
  return new Promise((resolve, reject) => {
    const client = address.protocol === "https:" ? https : http;
    let settled = false;
    let req;
    let stream = null;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream?.destroy();
      req?.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => settle(Object.assign(new Error("timeout"), { name: "TimeoutError" })), Math.max(0, deadline - Date.now()));
    req = client.request(
      address,
      {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en", Accept: accept, "Accept-Encoding": "gzip, deflate, br" },
        lookup: guardedLookup,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = status >= 300 && status < 400 ? response.headers.location : null;
        if (location) return settle(null, { status, location, text: "" });
        const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
        const decoder = encoding === "gzip" ? zlib.createGunzip() : encoding === "deflate" ? zlib.createInflate() : encoding === "br" ? zlib.createBrotliDecompress() : null;
        stream = decoder ? response.pipe(decoder) : response;
        if (decoder) response.on("error", (error) => settle(error));
        const chunks = [];
        let size = 0;
        const finish = () => settle(null, { status, location: null, text: Buffer.concat(chunks).toString("utf8") });
        stream.on("data", (chunk) => {
          if (settled) return;
          const room = MAX_BYTES - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          if (size >= MAX_BYTES) {
            response.destroy();
            finish();
          }
        });
        stream.on("end", finish);
        stream.on("error", (error) => settle(error));
      },
    );
    req.on("error", (error) => settle(error));
    req.end();
  });
}

async function load(url, accept = "text/html,application/json") {
  // One deadline for the whole check, redirects included.
  const deadline = Date.now() + TIMEOUT_MS;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const address = checkedUrl(current);
    if (!address) throw new RefusedAddress();
    const { status, location, text } = await request(address, accept, deadline);
    if (!location) return { status, finalUrl: current, text };
    current = new URL(location, current).href;
  }
  return { status: 0, finalUrl: current, text: "" };
}

const LINKEDIN_CLOSED = /No longer accepting applications/i;
const LINKEDIN_APPLY = /public_jobs_apply-link-onsite|job-details-topcard-apply-modal/;
// LinkedIn's "sign in to apply" control. It stays on closed listings too, so
// it only counts as open when there is no closed notice.
const LINKEDIN_SIGN_IN_APPLY = /guest-to-member-job-apply/;

export function linkedInId(url) {
  try {
    const address = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(address.hostname)) return null;
    const fromPath = /\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/.exec(address.pathname)?.[1];
    const fromQuery = address.searchParams.get("currentJobId");
    return fromPath ?? (fromQuery && /^\d{6,}$/.test(fromQuery) ? fromQuery : null);
  } catch {
    return null;
  }
}

// LinkedIn's public job page (the collector reads the same one).
async function checkLinkedIn(id) {
  const { status, text } = await load(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, "text/html");
  if (status === 404 || status === 410) return { state: "closed", reason: "LinkedIn no longer has this listing." };
  if (status === 429 || status === 403 || status === 999) return { state: "unsure", reason: "LinkedIn asked to slow down. It is checked again later.", blocked: true };
  if (status !== 200 || text.length < 500) return { state: "unsure", reason: `LinkedIn answered ${status}. It is checked again later.` };
  const closed = LINKEDIN_CLOSED.test(text);
  const apply = LINKEDIN_APPLY.test(text);
  if (closed && !apply) return { state: "closed", reason: 'LinkedIn says "No longer accepting applications".' };
  if (!closed && (apply || LINKEDIN_SIGN_IN_APPLY.test(text))) return { state: "open", reason: "LinkedIn still takes applications." };
  return { state: "unsure", reason: "LinkedIn's page did not say either way. Open it to see." };
}

// Workable's public job APIs: a listing that is gone answers 404.
async function checkWorkable(apiUrl) {
  const { status, text } = await load(apiUrl, "application/json");
  if (status === 404 || status === 410) return { state: "closed", reason: "Workable no longer has this listing." };
  if (status === 429 || status === 403) return { state: "unsure", reason: "Workable asked to slow down. It is checked again later.", blocked: true };
  let posting = null;
  try {
    posting = JSON.parse(text);
  } catch {
    // Read as unsure below.
  }
  if (status === 200 && posting?.state === "published") return { state: "open", reason: "Workable shows it as published." };
  if (status === 200 && typeof posting?.state === "string") return { state: "unsure", reason: `Workable shows it as "${posting.state}".` };
  return { state: "unsure", reason: `Workable answered ${status}. It is checked again later.` };
}

function workableApi(address) {
  if (address.hostname === "jobs.workable.com") {
    const code = /^\/view\/([A-Za-z0-9]+)/.exec(address.pathname)?.[1];
    return code ? `https://jobs.workable.com/api/v1/jobs/${code}` : null;
  }
  if (address.hostname === "apply.workable.com") {
    const match = /^\/([A-Za-z0-9_-]+)\/j\/([A-Za-z0-9]+)/.exec(address.pathname);
    return match ? `https://apply.workable.com/api/v2/accounts/${match[1]}/jobs/${match[2]}` : null;
  }
  return null;
}

// Which site answers for a listing, so a caller can space out its requests
// per site and stop asking one that asked to slow down. null: not checkable.
export function listingSite(url) {
  let address;
  try {
    address = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(address.protocol) || UNCHECKABLE.test(address.hostname)) return null;
  if (linkedInId(url)) return "linkedin";
  if (workableApi(address)) return "workable";
  if (/(^|\.)linkedin\.com$/i.test(address.hostname)) return null;
  return address.hostname.replace(/^www\./, "");
}

// { state: "open" | "closed" | "unsure", reason, blocked? }, or null when the
// listing cannot be checked from here.
export async function checkListing(url) {
  const site = listingSite(url);
  if (!site) return null;
  try {
    if (site === "linkedin") return await checkLinkedIn(linkedInId(url));
    if (site === "workable") return await checkWorkable(workableApi(new URL(url)));
    const { status, finalUrl, text: html } = await load(url);
    const { text, controls } = readHtml(html);
    const local = LOCAL_CLOSED.find((pattern) => pattern.test(fold(text)));
    if (local && status < 400) return { state: "closed", reason: "The page says the listing is closed." };
    return fromPage(classifyLiveness({ status, requestedUrl: url, finalUrl, bodyText: text, applyControls: controls }), text);
  } catch (error) {
    if (error instanceof RefusedAddress) return { state: "unsure", reason: "The link does not lead to a public website, so it was not opened." };
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return { state: "unsure", reason: timeout ? "The site took too long to answer. It is checked again later." : "Could not reach the site. It is checked again later." };
  }
}
