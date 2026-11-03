import "server-only";
import { boardFromUrl, findBoard, jobMatcher, searchWords, type FoundBoard } from "@/core/boards.mjs";
import { loadPage } from "@/core/liveness.mjs";
import { citiesOf } from "./countries";
import { companiesInJobs, getSettings, setSettings } from "./data";
import type { FollowedCompany, Settings } from "./types";

// The companies the user follows (Settings → Sources). Finding their boards
// runs here, in the app, with no AI: public board feeds and the company's
// own website only.

export const MAX_COMPANIES = 100;

export function followed(settings: Settings = getSettings()) {
  return { maxDays: settings.companies?.maxDays ?? 14, list: settings.companies?.list ?? [] };
}

function save(list: FollowedCompany[], maxDays?: number) {
  const current = followed();
  setSettings({ companies: { maxDays: maxDays ?? current.maxDays, list: list.slice(0, MAX_COMPANIES) } });
}

const key = (name: string) => name.trim().toLowerCase();

// "Acme, Globex" or one per line; a line can carry a website or a board
// link: "Acme acme.com", "Acme https://jobs.lever.co/acme".
export function parseCompanies(text: string) {
  const entries: { name: string; website?: string; link?: string }[] = [];
  for (const raw of text.split(/[\n,;]/)) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    const address = words.find((word) => /^https?:\/\//i.test(word) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(word));
    const name = words.filter((word) => word !== address).join(" ").replace(/^[-–—|:]+|[-–—|:]+$/g, "").trim();
    const board = address ? boardFromUrl(/^https?:/i.test(address) ? address : `https://${address}`) : null;
    const entry = { name: name || (board?.slug.split("/").pop() ?? address?.replace(/^https?:\/\/(www\.)?/i, "").split(/[./]/)[0] ?? "") };
    entries.push({ ...entry, ...(board ? { link: board.url } : address ? { website: address } : {}) });
  }
  return entries.filter((entry) => entry.name.length >= 2 && entry.name.length <= 120);
}

// Looks for one company's board and counts the jobs on it that fit the
// user's roles and countries.
export async function lookUp(company: FollowedCompany, settings: Settings = getSettings()): Promise<FollowedCompany> {
  let result: FoundBoard;
  try {
    result = await findBoard(company, { loadPage, keywords: searchWords(settings) });
  } catch {
    result = { state: "none", message: "Could not reach the board. Try again later." };
  }
  const matches = jobMatcher(settings, citiesOf);
  const maxAge = followed(settings).maxDays * 86400000;
  const fit = (result.jobs ?? []).filter((job) => matches(job) && (!job.posted_at || Date.now() - Date.parse(job.posted_at) <= maxAge));
  return {
    ...company,
    board: result.board ?? (result.state === "none" ? null : company.board),
    state: result.state,
    message: result.message,
    jobs: result.jobs?.length,
    matching: result.jobs ? fit.length : undefined,
    checkedAt: new Date().toISOString(),
  };
}

// Runs lookUp on several companies, a few at a time.
export async function lookUpMany(companies: FollowedCompany[], settings: Settings = getSettings()) {
  const done: FollowedCompany[] = [];
  const queue = [...companies];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        done.push(await lookUp(next, settings));
      }
    }),
  );
  return done;
}

// Saves looked-up companies over the stored ones (matched by name).
export function store(updated: FollowedCompany[]) {
  const byName = new Map(updated.map((company) => [key(company.name), company]));
  const list = followed().list.map((company) => byName.get(key(company.name)) ?? company);
  save(list);
}

export function add(entries: { name: string; website?: string; link?: string }[]) {
  const list = followed().list;
  const known = new Set(list.map((company) => key(company.name)));
  const added: FollowedCompany[] = [];
  for (const entry of entries) {
    if (known.has(key(entry.name)) || list.length + added.length >= MAX_COMPANIES) continue;
    known.add(key(entry.name));
    added.push({ name: entry.name, website: entry.website, board: entry.link ? boardFromUrl(entry.link) : null, state: "new" });
  }
  save([...list, ...added]);
  return added;
}

export function update(name: string, patch: Partial<FollowedCompany>) {
  save(followed().list.map((company) => (key(company.name) === key(name) ? { ...company, ...patch } : company)));
}

export function remove(name: string) {
  save(followed().list.filter((company) => key(company.name) !== key(name)));
}

export const setMaxDays = (days: number) => save(followed().list, days);

// Companies from the saved jobs that are not followed yet.
export function suggestions(limit = 10) {
  const known = new Set(followed().list.map((company) => key(company.name)));
  return companiesInJobs(limit + known.size + 20)
    .filter((company) => !known.has(key(company.name)) && !/confidential|stealth|undisclosed|recruit|staffing|talent/i.test(company.name))
    .slice(0, limit);
}
