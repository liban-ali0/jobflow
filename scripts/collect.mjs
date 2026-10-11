#!/usr/bin/env node
// Collects fresh listings from LinkedIn's public job feed, stores new ones in
// the database, and fetches their full descriptions. Bayt, GulfTalent, Indeed,
// and Naukrigulf block automated access, so they are read from job alert
// emails instead of being fetched here.
// No Claude involved: judging and ranking happen in the rank-jobs skill.
//
//   node scripts/collect.mjs            search every enabled source
//   node scripts/collect.mjs --dry-run  search, print, store nothing
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type !== "ExperimentalWarning") emitWarning.call(process, warning, ...rest);
};
const core = await import("../web/src/core/db.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const DELAY_MS = 1500;
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

let requests = 0;
const blocked = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(source, url) {
  if (blocked.has(source)) return null;
  if (requests >= MAX_REQUESTS) throw new Error("request budget reached");
  if (requests > 0) await sleep(DELAY_MS);
  requests++;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en", Accept: "text/html,application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 403 || response.status === 429) {
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

const SOURCES = { linkedin };

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
  const stats = { listings: 0, tooOld: 0, skipped: 0, duplicate: 0, added: [] };
  let stopped = null;

  try {
    for (const role of roles) {
      const keywords = role.keywords.filter(isLatin).slice(0, KEYWORDS_PER_ROLE);
      for (const country of countries) {
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
                role: role.key,
                source: source.key,
                url: job.url,
                language: "en",
                posted_at: job.posted_at,
                track: ageMinutes <= fastTrackMinutes ? "fast" : "standard",
              };
              if (DRY_RUN) {
                stats.added.push(record);
                continue;
              }
              const { id, created } = core.addJob(db, record);
              if (!created) {
                stats.duplicate++;
                continue;
              }
              const description = await SOURCES[source.key].details(job);
              const level = description?.match(LISTED_LEVEL)?.[1]?.trim();
              if (level && outsideLevels(level)) {
                core.updateJob(db, id, { description, status: "excluded", excluded_reason: `Listed as ${level}` });
                stats.skipped++;
                continue;
              }
              if (description) core.updateJob(db, id, { description });
              stats.added.push({ id, ...record });
            }
          }
        }
      }
    }
  } catch (error) {
    stopped = error.message;
  }

  const fast = stats.added.filter((job) => job.track === "fast");
  const lines = [
    `${stats.added.length} new jobs${fast.length ? `, ${fast.length} posted within ${fastTrackMinutes} minutes` : ""}.`,
    `Checked ${stats.listings} listings in ${requests} requests: ${stats.duplicate} already stored, ${stats.skipped} outside your levels or skipped titles, ${stats.tooOld} older than ${maxHours} hours.`,
  ];
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
