#!/usr/bin/env node
// Collects fresh listings from LinkedIn's public job feed and Workable's public
// job search, stores new ones in the database, and fetches their full
// descriptions. Countries are searched in the user's priority order, and
// descriptions are fetched only after every country has been searched, so the
// request budget never runs out before a lower-priority country is reached.
// Bayt, GulfTalent, Naukrigulf, Indeed, and Kariyer.net block automated
// access; they are read through the user's own Chrome instead (see Settings).
// No Claude involved: judging and ranking happen in the rank-jobs skill.
//
//   node scripts/collect.mjs            search every enabled source
//   node scripts/collect.mjs --dry-run  search, print, store nothing
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type !== "ExperimentalWarning") emitWarning.call(process, warning, ...rest);
};
const core = await import("../web/src/core/db.mjs");
const boards = await import("../web/src/core/boards.mjs");

const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const DELAY_MS = 1500;
// Per source, list pages and descriptions together.
const MAX_REQUESTS = 120;
const KEYWORDS_PER_ROLE = 3;
const DESCRIPTION_LIMIT = 20000;

// LinkedIn's location search takes most country names as written; these are
// the short or older names it does not recognise.
const LINKEDIN_NAMES = {
  UAE: "United Arab Emirates",
  KSA: "Saudi Arabia",
  Turkey: "Türkiye",
  USA: "United States",
  US: "United States",
  UK: "United Kingdom",
};
const linkedinLocation = (country) => LINKEDIN_NAMES[country] ?? country;

const requests = {};
const failures = {};
const blocked = new Set();
const exhausted = new Set();
const totalRequests = () => Object.values(requests).reduce((sum, count) => sum + count, 0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(source, url) {
  if (blocked.has(source)) return null;
  if ((requests[source] ?? 0) >= MAX_REQUESTS) {
    exhausted.add(source);
    return null;
  }
  if (totalRequests() > 0) await sleep(DELAY_MS);
  requests[source] = (requests[source] ?? 0) + 1;
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en", Accept: "text/html,application/json" },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    // A dropped or slow connection: this page is skipped, and a site that
    // keeps failing is left alone for the rest of the run.
    failures[source] = (failures[source] ?? 0) + 1;
    if (failures[source] >= 3) blocked.add(source);
    return null;
  }
  // 999 is LinkedIn's own "slow down".
  if (response.status === 403 || response.status === 429 || response.status === 999) {
    blocked.add(source);
    return null;
  }
  return response.ok ? response.text() : null;
}

const decode = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

function htmlToText(html) {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim()
    .slice(0, DESCRIPTION_LIMIT);
}

const clean = (text) => decode(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isLatin = (text) => /^[\x20-\x7e]+$/.test(text);

// Keywords in a country's own language are searched in that country only,
// next to the English ones: Turkish titles ("yazılım mühendisi") in Türkiye.
const LOCAL_KEYWORDS = { TR: /[çğıöşüÇĞİÖŞÜ]|mühendis|geliştirici|uzman|bilimci|yönetici|sorumlu|destek/i };
const LOCAL_PER_ROLE = 2;
function keywordsFor(role, country) {
  const local = LOCAL_KEYWORDS[country.code];
  const english = role.keywords.filter((keyword) => isLatin(keyword) && !Object.values(LOCAL_KEYWORDS).some((pattern) => pattern.test(keyword)));
  const own = local ? role.keywords.filter((keyword) => local.test(keyword) && !/[؀-ۿ]/.test(keyword)) : [];
  return [...english.slice(0, KEYWORDS_PER_ROLE), ...own.slice(0, LOCAL_PER_ROLE)];
}

// "3 hours ago", "55 minutes ago", "1 day ago" → ISO time
function fromAgo(text, now) {
  const match = /(\d+)\s*(second|minute|hour|day|week|month)/i.exec(text ?? "");
  if (!match) return null;
  const unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000 }[match[2].toLowerCase()];
  return new Date(now - Number(match[1]) * unit * 1000).toISOString();
}

function splitLocation(location, country) {
  const first = (location ?? "").split(/[,·]/)[0].trim();
  if (!first || first === country || linkedinLocation(country) === first) return null;
  return first;
}

// ---------- LinkedIn public job feed (no login) ----------

const linkedin = {
  key: "linkedin",
  async search({ keyword, country, maxHours, levels }) {
    const params = new URLSearchParams({
      keywords: keyword,
      location: linkedinLocation(country),
      f_TPR: `r${maxHours * 3600}`,
      f_E: levels,
      sortBy: "DD",
      start: "0",
    });
    const html = await get("linkedin", `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`);
    if (!html) return [];
    const now = Date.now();
    return html
      .split(/<li>/)
      .slice(1)
      .map((card) => {
        const id = /jobPosting:(\d+)/.exec(card)?.[1];
        const title = /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1];
        const company = /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/.exec(card)?.[1];
        const location = /job-search-card__location[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1];
        const ago = /<time[^>]*>([\s\S]*?)<\/time>/.exec(card)?.[1];
        if (!id || !title || !company) return null;
        return {
          title: clean(title),
          company: clean(company),
          city: splitLocation(clean(location ?? ""), country),
          url: `https://www.linkedin.com/jobs/view/${id}`,
          posted_at: fromAgo(ago, now),
          detail: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`,
        };
      })
      .filter(Boolean);
  },
  async details(job) {
    const html = await get("linkedin", job.detail);
    if (!html) return null;
    const body = /show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    const criteria = [
      ...html.matchAll(/job-criteria-subheader">\s*([^<]*?)\s*<\/h3>\s*<span[^>]*>\s*([^<]*?)\s*<\/span>/g),
    ].map((m) => `${clean(m[1])}: ${clean(m[2])}`);
    return [...criteria, "", htmlToText(body)].join("\n").trim();
  },
};

// ---------- Workable's public job search (no login) ----------

// The country names Workable uses for the short ones people type.
const WORKABLE_NAMES = { UAE: "United Arab Emirates", KSA: "Saudi Arabia", Türkiye: "Turkey", USA: "United States", US: "United States", UK: "United Kingdom" };
const workableLocation = (country) => WORKABLE_NAMES[country] ?? country;

const workable = {
  key: "workable",
  async search({ keyword, country, maxHours }) {
    const params = new URLSearchParams({ query: keyword, location: workableLocation(country), day_range: String(Math.max(1, Math.ceil(maxHours / 24))) });
    const text = await get("workable", `https://jobs.workable.com/api/v1/jobs?${params}`);
    if (!text) return [];
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    return (data.jobs ?? [])
      // Its location search also returns jobs elsewhere (remote, nearby).
      .filter((job) => job.location?.countryName === workableLocation(country))
      .map((job) => ({
        title: clean(job.title ?? ""),
        company: clean(job.company?.title ?? ""),
        city: job.location?.city || null,
        url: job.url,
        posted_at: job.created ?? null,
        work_mode: { remote: "remote", hybrid: "hybrid", on_site: "onsite" }[job.workplace] ?? null,
        // The search already carries the full listing.
        description: [job.employmentType ? `Employment type: ${job.employmentType}` : "", "", htmlToText([job.description, job.requirementsSection, job.benefitsSection].filter(Boolean).join("<br>"))]
          .join("\n")
          .trim(),
      }))
      .filter((job) => job.title && job.company && job.url);
  },
  async details(job) {
    return job.description;
  },
};

const SOURCES = { linkedin, workable };

// ---------- Job boards of the companies the user follows ----------

// Board requests go to many different hosts, so they are paced and counted
// on their own, and a host that refuses is left alone for the rest of the run.
const BOARD_DELAY_MS = 700;
const BOARD_REQUESTS = 200;
const boardHosts = new Set();
let boardRequests = 0;
let lastBoardRequest = 0;
const boardContext = {
  async fetch(url, options) {
    const host = new URL(url).hostname;
    if (boardHosts.has(host) || boardRequests >= BOARD_REQUESTS) return { status: 0, text: "" };
    const wait = lastBoardRequest + BOARD_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastBoardRequest = Date.now();
    boardRequests++;
    requests.careers = (requests.careers ?? 0) + 1;
    try {
      const reply = await boards.defaultContext.fetch(url, options);
      if (reply.status === 403 || reply.status === 429) boardHosts.add(host);
      return reply;
    } catch {
      return { status: 0, text: "" };
    }
  },
};

// Cities per country code, to place a board's "Riyadh" in Saudi Arabia.
function placesIndex() {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/src/data/places.json");
    const map = new Map(JSON.parse(fs.readFileSync(file, "utf8")).map((place) => [place.code, place.cities]));
    return (code) => map.get(code) ?? null;
  } catch {
    return () => null;
  }
}

// Every followed company's board, once per run: the jobs that fit the user's
// roles and countries, posted within the board window.
async function companyJobs(settings) {
  const list = (settings.companies?.list ?? []).filter((company) => company.state === "found" && company.board?.vendor);
  const maxAge = (settings.companies?.maxDays ?? 14) * 86400000;
  const matches = boards.jobMatcher(settings, placesIndex());
  const keywords = boards.searchWords(settings);
  const found = [];
  const unread = [];
  for (const company of list) {
    const read = await boards.readBoard(company.board, boardContext, keywords);
    if (!read.jobs) {
      unread.push(company.name);
      continue;
    }
    for (const job of read.jobs) {
      if (job.posted_at && Date.now() - Date.parse(job.posted_at) > maxAge) continue;
      const fit = matches(job);
      if (fit) found.push({ ...job, company: company.name, board: company.board, fit });
    }
  }
  return { found, unread, read: list.length - unread.length };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Title words the user wants skipped, as whole words: "lead" skips
// "Team Lead" but not "Leadership Academy".
function titleFilter(words) {
  const clean = words.map((word) => word.trim()).filter(Boolean);
  if (!clean.length) return () => false;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${clean.map(escape).join("|")})\\.?($|[^\\p{L}\\p{N}])`, "iu");
  return (title) => pattern.test(title);
}

// LinkedIn's level filter lets other levels through; their detail page still
// states the level, which is checked against the chosen ones.
const LISTED_LEVEL = /^Seniority level: (.+)$/m;

async function main() {
  const db = core.openDb(ROOT);
  const settings = core.getSettings(db);
  if (!settings.countries.length || !settings.roles.length) {
    throw new Error("Add at least one country and one role in Settings first.");
  }
  const { maxHours, fastTrackMinutes } = settings.freshness;
  const countries = [...settings.countries].sort((a, b) => a.priority - b.priority);
  const roles = [...settings.roles].sort((a, b) => a.priority - b.priority);
  const sources = settings.sources.filter((source) => source.enabled && SOURCES[source.key]);
  const chosen = core.EXPERIENCE_LEVELS.filter((level) => settings.experience.levels.includes(level.key));
  if (!chosen.length) throw new Error("Choose at least one experience level in Settings first.");
  const levels = chosen.map((level) => level.linkedin).join(",");
  const outsideLevels = (listed) =>
    core.EXPERIENCE_LEVELS.some((level) => level.listed === listed) && !chosen.some((level) => level.listed === listed);
  const skipTitle = titleFilter(settings.experience.skipTitles);

  const seen = new Set();
  const stats = { listings: 0, tooOld: 0, skipped: 0, duplicate: 0, relisted: [], added: [], withoutDescription: 0 };
  const perCountry = new Map(countries.map((country) => [country.name, 0]));
  // New jobs waiting for their description, in the order found: by country
  // priority first, then role priority.
  const pending = [];
  let stopped = null;

  try {
    // 1. Every country's search pages, highest priority first.
    for (const country of countries) {
      for (const role of roles) {
        const keywords = keywordsFor(role, country);
        for (const keyword of keywords) {
          for (const source of sources) {
            const found = await SOURCES[source.key].search({ keyword, country: country.name, maxHours, levels });
            for (const job of found) {
              stats.listings++;
              if (seen.has(job.url)) continue;
              seen.add(job.url);
              if (job.posted_at && Date.now() - Date.parse(job.posted_at) > maxHours * 3600000) {
                stats.tooOld++;
                continue;
              }
              if (skipTitle(job.title)) {
                stats.skipped++;
                continue;
              }
              const ageMinutes = job.posted_at ? (Date.now() - Date.parse(job.posted_at)) / 60000 : Infinity;
              const record = {
                title: job.title,
                company: job.company,
                country: country.name,
                city: job.city,
                work_mode: job.work_mode ?? undefined,
                role: role.key,
                source: source.key,
                url: job.url,
                language: "en",
                posted_at: job.posted_at,
                track: ageMinutes <= fastTrackMinutes ? "fast" : "standard",
              };
              if (DRY_RUN) {
                stats.added.push(record);
                perCountry.set(country.name, perCountry.get(country.name) + 1);
                continue;
              }
              const { id, created, relisted } = core.addJob(db, record);
              if (!created) {
                stats.duplicate++;
                if (relisted) stats.relisted.push(id);
                continue;
              }
              pending.push({ id, job, source: source.key, record });
            }
          }
        }
      }
    }

    // 1b. The followed companies' own boards.
    if (settings.sources.some((source) => source.key === "careers" && source.enabled)) {
      const { found, unread, read } = await companyJobs(settings);
      stats.boards = { read, unread };
      for (const job of found) {
        stats.listings++;
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        if (skipTitle(job.title)) {
          stats.skipped++;
          continue;
        }
        const ageMinutes = job.posted_at ? (Date.now() - Date.parse(job.posted_at)) / 60000 : Infinity;
        const record = {
          title: job.title,
          company: job.company,
          country: job.fit.country,
          city: job.fit.city,
          work_mode: job.work_mode ?? undefined,
          role: job.fit.role,
          source: "careers",
          url: job.url,
          language: "en",
          posted_at: job.posted_at,
          track: ageMinutes <= fastTrackMinutes ? "fast" : "standard",
        };
        if (DRY_RUN) {
          stats.added.push(record);
          perCountry.set(record.country, (perCountry.get(record.country) ?? 0) + 1);
          continue;
        }
        // Already saved from LinkedIn or another site.
        if (core.openingExists(db, record)) {
          stats.duplicate++;
          continue;
        }
        const { id, created, relisted } = core.addJob(db, record);
        if (!created) {
          stats.duplicate++;
          if (relisted) stats.relisted.push(id);
          continue;
        }
        pending.push({ id, job, source: "careers", record });
      }
    }

    // 2. Descriptions, in the same priority order, while each source's
    // budget lasts. A job left without one is still kept.
    for (const { id, job, source, record } of pending) {
      const description = source === "careers" ? await boards.readDescription(job.board, job, boardContext) : await SOURCES[source].details(job);
      const level = description?.match(LISTED_LEVEL)?.[1]?.trim();
      if (level && outsideLevels(level)) {
        core.updateJob(db, id, { description, status: "excluded", excluded_reason: `Listed as ${level}` });
        stats.skipped++;
        continue;
      }
      if (description) core.updateJob(db, id, { description });
      else stats.withoutDescription++;
      stats.added.push({ id, ...record });
      perCountry.set(record.country, perCountry.get(record.country) + 1);
    }
  } catch (error) {
    stopped = error.message;
  }

  const fast = stats.added.filter((job) => job.track === "fast");
  const lines = [
    `${stats.added.length} new jobs${fast.length ? `, ${fast.length} posted within ${fastTrackMinutes} minutes` : ""}.`,
    `By country, in your priority order: ${[...perCountry].map(([name, count]) => `${name} ${count}`).join(", ")}.`,
    `Checked ${stats.listings} listings in ${totalRequests()} requests (${Object.entries(requests).map(([source, count]) => `${source} ${count}`).join(", ") || "none"}): ${stats.duplicate} already stored${stats.relisted.length ? ` (${stats.relisted.length} of them listed again under a new link)` : ""}, ${stats.skipped} outside your levels or skipped titles, ${stats.tooOld} older than ${maxHours} hours.`,
  ];
  if (stats.withoutDescription) lines.push(`${stats.withoutDescription} saved without a description (request budget used up${exhausted.size ? ` for ${[...exhausted].join(", ")}` : ""}); research reads the listing.`);
  if (stats.boards) lines.push(`Company boards: read ${stats.boards.read}${stats.boards.unread.length ? `, could not read ${stats.boards.unread.join(", ")}` : ""}.`);
  if (blocked.size) lines.push(`Blocked by: ${[...blocked].join(", ")}. Try again later.`);
  if (stopped) lines.push(`Stopped early: ${stopped}.`);
  for (const job of stats.added.slice(0, 15)) {
    lines.push(`• ${job.title} · ${job.company} · ${job.city ?? job.country} · ${job.source}${job.track === "fast" ? " · FAST" : ""}`);
  }
  if (stats.added.length > 15) lines.push(`… and ${stats.added.length - 15} more.`);
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
