#!/usr/bin/env node
// Checks whether saved jobs' listings are still open (web/src/core/liveness.mjs)
// and stores the answer on each job. Nothing else changes: a closed listing is
// shown to the user, who decides. Requests are spaced out per site, and a site
// that asks to slow down is left for the next run.
// No Claude involved.
//
//   node scripts/check-open.mjs            the jobs due a check (up to 60)
//   node scripts/check-open.mjs ids:4,9    these jobs, now
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type !== "ExperimentalWarning") emitWarning.call(process, warning, ...rest);
};
const core = await import("../web/src/core/db.mjs");
const { checkListing, listingSite } = await import("../web/src/core/liveness.mjs");

const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DELAY_MS = 2500;
const PER_RUN = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const argument = process.argv.slice(2).find((arg) => arg.startsWith("ids:"));
const ids = argument ? argument.slice(4).split(",").map(Number) : null;

const db = core.openDb(ROOT);
// Listings on sites that cannot be checked (Indeed) never take a place.
const targets = core.listingTargets(db, { ids, limit: 1000 }).filter((job) => listingSite(job.url)).slice(0, ids ? undefined : PER_RUN);
const lastAsked = new Map();
const blocked = new Set();
const counts = { open: 0, closed: 0, unsure: 0 };
const closed = [];
let skipped = 0;

for (const job of targets) {
  const site = listingSite(job.url);
  if (blocked.has(site)) {
    skipped++;
    continue;
  }
  const wait = (lastAsked.get(site) ?? 0) + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAsked.set(site, Date.now());
  const check = await checkListing(job.url);
  if (check.blocked) {
    // Not stored: the listing was not read, and asking again now would not help.
    blocked.add(site);
    skipped++;
    console.log(`${site} asked to slow down; its other listings wait for the next check.`);
    continue;
  }
  core.setListing(db, job.id, check);
  counts[check.state]++;
  if (check.state === "closed") closed.push(`- ${job.title} · ${job.company} (#${job.id}): ${check.reason}`);
}

const checked = counts.open + counts.closed + counts.unsure;
const lines = [
  targets.length === 0
    ? "No listings were due a check."
    : `Checked ${checked} listing${checked === 1 ? "" : "s"}: ${counts.open} open, ${counts.closed} closed, ${counts.unsure} unclear.`,
];
if (skipped) lines.push(`${skipped} wait for the next check: ${[...blocked].join(", ")} asked to slow down.`);
if (closed.length) lines.push("Closed:", ...closed);
console.log(lines.join("\n"));
