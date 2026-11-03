// Company job boards: find where a company lists its jobs, and read them.
// Many employers post on a hosted job board (Greenhouse, Lever, Ashby,
// Workable, SmartRecruiters, Recruitee, Workday, Oracle) with a public JSON
// feed, so their jobs can be read without a login, a browser or any AI.
//
// How a board is found, most certain first:
//   1. a board link the user pastes;
//   2. the company's own website, read for links to a known board;
//   3. names guessed from the company name, tried on each hosted board. A
//      guess counts only when the board's own company name matches; boards
//      that do not say their name are kept as "check" for the user to confirm.
// The idea of probing hosted boards by name comes from career-ops'
// discover-ats (github.com/career-ops-hq/career-ops, MIT); the code is ours.
//
// Every address is built here from a fixed host pattern, and redirects are
// refused, so a board can never send a request somewhere else. Pages from a
// company's website go through liveness.mjs' guarded loader (public addresses
// only). `ctx.fetch(url, { method, body, headers })` resolves to
// { status, text } and is passed in, so the collector can pace and count it.

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const DESCRIPTION_LIMIT = 20000;
const SLUG = /^[A-Za-z0-9._-]{1,80}$/;

export const VENDOR_NAMES = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  workday: "Workday",
  oracle: "Oracle",
};

// ---------- text ----------

const ENTITIES = { nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
const decode = (text) =>
  String(text ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(nbsp|lt|gt|quot|apos|amp);/g, (_, name) => ENTITIES[name]);

export function htmlToText(html) {
  let text = String(html ?? "");
  // Some boards send the markup entity-escaped (&lt;p&gt;): unescape it first.
  if (!/<[a-z]/i.test(text) && /&lt;[a-z]/i.test(text)) text = decode(text);
  return decode(
    text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/tr)\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DESCRIPTION_LIMIT);
}

// Lower case, accents dropped, punctuation as spaces: "Herāt" → "herat".
export const fold = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// ---------- company names ----------

const LEGAL = new Set(
  "llc l l c inc incorporated ltd limited plc gmbh ag sa sas bv nv co company corp corporation group holding holdings fz fze fzco fzllc dmcc pjsc psc jsc wll spc as aş a s sti ltd şti".split(" "),
);

// The words of a company name that identify it: "Acme Tech FZ-LLC" → ["acme", "tech"].
export function nameWords(name) {
  const words = fold(name).split(" ").filter(Boolean);
  const kept = words.filter((word) => !LEGAL.has(word));
  return kept.length ? kept : words;
}

// Board names to try for a company, most likely first ("Acme Tech" →
// acmetech, acme-tech, acme). Names in other scripts give none.
export function slugCandidates(name) {
  const words = nameWords(name).filter((word) => /^[a-z0-9]+$/.test(word));
  if (!words.length) return [];
  const list = [words.join(""), words.join("-")];
  if (words.length > 1 && words[0].length >= 4) list.push(words[0]);
  return [...new Set(list)].filter((slug) => SLUG.test(slug));
}

// Does a board's own name belong to this company? "Acme" matches "Acme Inc."
// and "ACME Technologies"; "Acme" does not match "Acmeville".
export function sameCompany(a, b) {
  const left = nameWords(a).join(" ");
  const right = nameWords(b).join(" ");
  if (!left || !right) return false;
  return left === right || ` ${right} `.includes(` ${left} `) || ` ${left} `.includes(` ${right} `);
}

// ---------- board links ----------

const LINKS = [
  { vendor: "greenhouse", pattern: /\b(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?(?:[^"'\s]*&)?for=)?([A-Za-z0-9_-]+)/i },
  { vendor: "lever", pattern: /\bjobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i },
  { vendor: "ashby", pattern: /\bjobs\.ashbyhq\.com\/([A-Za-z0-9_.-]+)/i },
  { vendor: "workable", pattern: /\bapply\.workable\.com\/([A-Za-z0-9_-]+)/i },
  { vendor: "smartrecruiters", pattern: /\b(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i },
  { vendor: "recruitee", pattern: /\b([a-z0-9-]+)\.recruitee\.com\b/i },
];
const NOT_SLUGS = new Set(["embed", "api", "j", "v1", "js", "static", "assets", "www", "app", "jobs", "careers", "privacy", "terms"]);
const WORKDAY = /https:\/\/([a-z0-9-]+)\.(wd\d{1,3})\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/;
const ORACLE = /https:\/\/([a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?(?:ocs\.)?oraclecloud(?:[1-9][0-9]?)?\.com)\/hcmUI\/CandidateExperience\/([a-z]{2}(?:-[A-Z]{2})?)\/sites\/([A-Za-z0-9_]+)/;

function makeBoard(vendor, slug) {
  if (!SLUG.test(slug) || NOT_SLUGS.has(slug.toLowerCase())) return null;
  const url = {
    greenhouse: `https://job-boards.greenhouse.io/${slug}`,
    lever: `https://jobs.lever.co/${slug}`,
    ashby: `https://jobs.ashbyhq.com/${slug}`,
    workable: `https://apply.workable.com/${slug}/`,
    smartrecruiters: `https://careers.smartrecruiters.com/${slug}`,
    recruitee: `https://${slug.toLowerCase()}.recruitee.com/`,
  }[vendor];
  return { vendor, slug: vendor === "recruitee" ? slug.toLowerCase() : slug, url };
}

// Every board link in a piece of text or HTML, first one first.
export function boardsIn(text) {
  const found = [];
  const source = String(text ?? "");
  const workday = source.match(new RegExp(WORKDAY.source, "g")) ?? [];
  for (const link of workday) {
    const [, tenant, instance, site] = WORKDAY.exec(link);
    if (!NOT_SLUGS.has(site.toLowerCase())) found.push({ vendor: "workday", slug: `${tenant}/${site}`, host: `${tenant}.${instance}.myworkdayjobs.com`, tenant, site, url: `https://${tenant}.${instance}.myworkdayjobs.com/${site}` });
  }
  for (const link of source.match(new RegExp(ORACLE.source, "g")) ?? []) {
    const [, host, lang, site] = ORACLE.exec(link);
    found.push({ vendor: "oracle", slug: `${host}/${site}`, host, lang, site, url: `https://${host}/hcmUI/CandidateExperience/${lang}/sites/${site}/jobs` });
  }
  for (const { vendor, pattern } of LINKS) {
    for (const match of source.matchAll(new RegExp(pattern.source, "gi"))) {
      const board = makeBoard(vendor, match[1]);
      if (board) found.push(board);
    }
  }
  const seen = new Set();
  return found.filter((board) => !seen.has(`${board.vendor}:${board.slug}`) && seen.add(`${board.vendor}:${board.slug}`));
}

export const boardFromUrl = (url) => boardsIn(url)[0] ?? null;

// ---------- reading boards ----------

export const defaultContext = {
  async fetch(url, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(url, {
      method,
      body,
      redirect: "error",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en", ...headers },
      signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, text: response.ok ? await response.text() : "" };
  },
};

async function json(ctx, url, options) {
  const reply = await ctx.fetch(url, options);
  if (!reply || reply.status === 404 || reply.status === 410) return { missing: true };
  if (reply.status === 403 || reply.status === 429) return { blocked: true };
  if (reply.status < 200 || reply.status >= 300) return { failed: true };
  try {
    return { data: JSON.parse(reply.text) };
  } catch {
    return { failed: true };
  }
}

const when = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
};

// Workday says "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago".
export function workdayPosted(text, now = Date.now()) {
  const label = String(text ?? "").toLowerCase();
  if (/today/.test(label)) return new Date(now).toISOString();
  if (/yesterday/.test(label)) return new Date(now - 86400000).toISOString();
  const days = /(\d+)(\+?)\s*days?/.exec(label);
  // "30+ Days Ago" is at least that old.
  if (days) return new Date(now - (Number(days[1]) + (days[2] ? 1 : 0)) * 86400000).toISOString();
  return null;
}

const workMode = (text) => (/\bremote\b/i.test(text) ? "remote" : /\bhybrid\b/i.test(text) ? "hybrid" : null);

// Each reader returns { jobs, name? } or { missing | blocked | failed }.
// A job: { title, url, location, countryCode?, posted_at, work_mode, description?, ref? }.
const READERS = {
  async greenhouse(board, ctx) {
    const list = await json(ctx, `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`);
    if (!list.data) return list;
    const info = await json(ctx, `https://boards-api.greenhouse.io/v1/boards/${board.slug}`);
    return {
      name: info.data?.name ?? null,
      jobs: (list.data.jobs ?? []).filter((job) => job.absolute_url).map((job) => ({
        title: job.title ?? "",
        url: job.absolute_url,
        location: job.location?.name ?? "",
        posted_at: when(job.first_published ?? job.updated_at),
        description: htmlToText(job.content),
      })),
    };
  },
  async lever(board, ctx) {
    const list = await json(ctx, `https://api.lever.co/v0/postings/${board.slug}?mode=json`);
    if (!list.data) return list;
    if (!Array.isArray(list.data)) return { failed: true };
    return {
      name: null,
      jobs: list.data.filter((job) => job.hostedUrl).map((job) => {
        const places = [job.categories?.location, ...(job.categories?.allLocations ?? [])].filter(Boolean);
        return {
          title: job.text ?? "",
          url: job.hostedUrl,
          location: [...new Set(places)].join("; "),
          posted_at: when(job.createdAt),
          work_mode: job.workplaceType === "remote" ? "remote" : job.workplaceType === "hybrid" ? "hybrid" : job.workplaceType === "onsite" ? "onsite" : null,
          description: htmlToText(
            [job.description || job.descriptionPlain, ...(job.lists ?? []).map((part) => `<h3>${part.text ?? ""}</h3>${part.content ?? ""}`), job.additional || job.additionalPlain].filter(Boolean).join("<br>"),
          ),
        };
      }),
    };
  },
  async ashby(board, ctx) {
    const list = await json(ctx, `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`);
    if (!list.data) return list;
    return {
      name: null,
      jobs: (list.data.jobs ?? []).filter((job) => job.jobUrl && job.isListed !== false).map((job) => {
        const places = [job.location, job.address?.postalAddress?.addressLocality, job.address?.postalAddress?.addressCountry];
        for (const other of job.secondaryLocations ?? []) places.push(other.location, other.address?.postalAddress?.addressCountry);
        return {
          title: job.title ?? "",
          url: job.jobUrl,
          location: [...new Set(places.filter(Boolean))].join("; "),
          posted_at: when(job.publishedAt),
          work_mode: job.isRemote ? "remote" : String(job.workplaceType ?? "").toLowerCase() === "hybrid" ? "hybrid" : null,
          description: htmlToText(job.descriptionHtml || job.descriptionPlain),
        };
      }),
    };
  },
  async workable(board, ctx) {
    const list = await json(ctx, `https://apply.workable.com/api/v1/widget/accounts/${board.slug}?details=true`);
    if (!list.data) return list;
    // A job open in several cities comes once per city.
    const byUrl = new Map();
    for (const job of list.data.jobs ?? []) {
      const url = job.shortlink || job.url;
      if (!url) continue;
      const place = [job.city, job.state, job.country].filter(Boolean).join(", ");
      const known = byUrl.get(url);
      if (known) {
        if (place && !known.location.includes(place)) known.location += `; ${place}`;
        continue;
      }
      byUrl.set(url, {
        title: job.title ?? "",
        url,
        location: place,
        posted_at: when(job.published_on ?? job.created_at),
        work_mode: job.telecommuting ? "remote" : null,
        description: htmlToText(job.description),
      });
    }
    return { name: list.data.name ?? null, jobs: [...byUrl.values()] };
  },
  async smartrecruiters(board, ctx) {
    const list = await json(ctx, `https://api.smartrecruiters.com/v1/companies/${board.slug}/postings?limit=100&offset=0`);
    if (!list.data) return list;
    const content = list.data.content ?? [];
    return {
      name: content[0]?.company?.name ?? null,
      jobs: content.filter((job) => job.id).map((job) => ({
        title: job.name ?? "",
        url: `https://jobs.smartrecruiters.com/${board.slug}/${encodeURIComponent(job.id)}`,
        location: [job.location?.fullLocation || [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", "), job.location?.remote ? "Remote" : ""].filter(Boolean).join(", "),
        countryCode: job.location?.country ? String(job.location.country).toUpperCase() : null,
        posted_at: when(job.releasedDate),
        work_mode: job.location?.remote ? "remote" : null,
        ref: job.id,
      })),
    };
  },
  async recruitee(board, ctx) {
    const list = await json(ctx, `https://${board.slug}.recruitee.com/api/offers/`);
    if (!list.data) return list;
    const offers = list.data.offers ?? [];
    return {
      name: offers[0]?.company_name ?? null,
      jobs: offers.filter((job) => job.careers_url).map((job) => ({
        title: job.title ?? "",
        url: job.careers_url,
        location: [job.location, job.city, job.country].filter(Boolean).join(", "),
        countryCode: job.country_code ? String(job.country_code).toUpperCase() : null,
        posted_at: when(job.published_at ?? job.created_at),
        work_mode: job.remote ? "remote" : job.hybrid ? "hybrid" : null,
        description: htmlToText([job.description, job.requirements].filter(Boolean).join("<br>")),
      })),
    };
  },
  // Large boards: searched by the user's role keywords instead of read whole.
  async workday(board, ctx, keywords = []) {
    const api = `https://${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`;
    const jobs = new Map();
    let reached = false;
    for (const searchText of keywords.length ? keywords : [""]) {
      const page = await json(ctx, api, {
        method: "POST",
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText }),
        headers: { "Content-Type": "application/json" },
      });
      if (!page.data) {
        if (!reached) return page;
        continue;
      }
      reached = true;
      for (const job of page.data.jobPostings ?? []) {
        if (!job.externalPath || !job.title) continue;
        const url = `https://${board.host}/${board.site}${job.externalPath}`;
        jobs.set(url, { title: job.title, url, location: job.locationsText ?? "", posted_at: workdayPosted(job.postedOn), work_mode: workMode(job.remoteType ?? ""), ref: job.externalPath });
      }
    }
    return { name: null, jobs: [...jobs.values()] };
  },
  async oracle(board, ctx, keywords = []) {
    const jobs = new Map();
    let reached = false;
    for (const keyword of keywords.length ? keywords : [""]) {
      const finder = [`siteNumber=${board.site}`, ...(keyword ? [`keyword="${keyword.replace(/["\\,;]/g, " ")}"`] : []), "limit=25", "sortBy=POSTING_DATES_DESC", "offset=0"].join(",");
      const url = `https://${board.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=${encodeURIComponent("requisitionList.secondaryLocations")}&finder=${encodeURIComponent(`findReqs;${finder}`)}`;
      const page = await json(ctx, url);
      if (!page.data) {
        if (!reached) return page;
        continue;
      }
      reached = true;
      for (const job of page.data.items?.[0]?.requisitionList ?? []) {
        if (job.Id === undefined || !job.Title) continue;
        const link = `https://${board.host}/hcmUI/CandidateExperience/${board.lang}/sites/${board.site}/job/${encodeURIComponent(job.Id)}`;
        const places = [job.PrimaryLocation, ...(job.secondaryLocations ?? []).map((place) => place.Name)].filter(Boolean);
        jobs.set(link, {
          title: job.Title,
          url: link,
          location: [...new Set(places)].join("; "),
          posted_at: when(job.PostedDate),
          work_mode: job.WorkplaceTypeCode === "ORA_REMOTE" ? "remote" : job.WorkplaceTypeCode === "ORA_HYBRID" ? "hybrid" : null,
          description: htmlToText(job.ShortDescriptionStr),
          ref: String(job.Id),
        });
      }
    }
    return { name: null, jobs: [...jobs.values()] };
  },
};

export const SEARCHED = new Set(["workday", "oracle"]);

export async function readBoard(board, ctx = defaultContext, keywords = []) {
  const reader = READERS[board?.vendor];
  if (!reader) return { failed: true };
  try {
    const read = await reader(board, ctx, keywords);
    if (read.jobs) read.jobs = read.jobs.map((job) => ({ ...job, title: String(job.title).replace(/\s+/g, " ").trim() })).filter((job) => job.title);
    return read;
  } catch {
    return { failed: true };
  }
}

// The full listing, for boards whose list leaves it out.
export async function readDescription(board, job, ctx = defaultContext) {
  try {
    if (board.vendor === "smartrecruiters" && job.ref) {
      const detail = await json(ctx, `https://api.smartrecruiters.com/v1/companies/${board.slug}/postings/${encodeURIComponent(job.ref)}`);
      const sections = detail.data?.jobAd?.sections ?? {};
      return htmlToText(["companyDescription", "jobDescription", "qualifications", "additionalInformation"].map((key) => (sections[key]?.text ? `<h3>${sections[key].title ?? ""}</h3>${sections[key].text}` : "")).join(""));
    }
    if (board.vendor === "workday" && job.ref) {
      const detail = await json(ctx, `https://${board.host}/wday/cxs/${board.tenant}/${board.site}${job.ref}`);
      const info = detail.data?.jobPostingInfo;
      if (!info) return null;
      return htmlToText([info.timeType ? `Employment type: ${info.timeType}` : "", info.jobDescription].filter(Boolean).join("<br><br>"));
    }
    if (board.vendor === "oracle" && job.ref) {
      const finder = encodeURIComponent(`ById;Id="${job.ref}",siteNumber=${board.site}`);
      const detail = await json(ctx, `https://${board.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=${finder}`);
      const item = detail.data?.items?.[0];
      if (!item) return null;
      return htmlToText([item.ExternalDescriptionStr, item.ExternalResponsibilitiesStr, item.ExternalQualificationsStr].filter(Boolean).join("<br><br>"));
    }
  } catch {
    return null;
  }
  return job.description || null;
}

// ---------- finding a board ----------

const GUESSED = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "recruitee"];
const CAREER_LINK = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
const CAREER_WORDS = /career|jobs|vacanc|join[- ]?us|work[- ]with[- ]us|hiring|kariyer|is[- ]ilanlari|وظائف|التوظيف/i;

// The website the user typed, as an address ("acme.com" → https://acme.com/).
export function websiteUrl(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

// Reads the company's website (and its careers page) for a board link.
async function fromWebsite(website, loadPage) {
  const start = websiteUrl(website);
  if (!start || !loadPage) return null;
  const visited = new Set();
  const queue = [start];
  while (queue.length && visited.size < 3) {
    const address = queue.shift();
    if (visited.has(address)) continue;
    visited.add(address);
    let page;
    try {
      page = await loadPage(address);
    } catch {
      continue;
    }
    if (!page?.text) continue;
    const board = boardsIn(page.text)[0] ?? boardsIn(page.finalUrl ?? "")[0];
    if (board) return { board, via: page.finalUrl || address };
    // Follow the page's careers links on the same site.
    const base = new URL(page.finalUrl || address);
    for (const [, href, label] of page.text.matchAll(CAREER_LINK)) {
      if (!CAREER_WORDS.test(href) && !CAREER_WORDS.test(label.replace(/<[^>]+>/g, " "))) continue;
      let next;
      try {
        next = new URL(decode(href), base);
      } catch {
        continue;
      }
      const offSite = next.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "");
      // A link off the site counts only when it is a board itself.
      const linked = boardFromUrl(next.href);
      if (linked) return { board: linked, via: base.href };
      if (!offSite && /^https?:$/.test(next.protocol)) queue.push(next.href);
    }
  }
  return null;
}

// Finds a company's board. Resolves to
//   { state: "found" | "check" | "none", board?, jobs?, via?, message }
// "found": the website links to it, or the board's own name matches;
// "check": a board with that name lists jobs but does not say whose it is.
export async function findBoard(company, { ctx = defaultContext, loadPage = null, keywords = [] } = {}) {
  const linked = company.board?.url ? boardFromUrl(company.board.url) : null;
  if (linked) {
    const read = await readBoard(linked, ctx, keywords);
    if (read.jobs) return { state: "found", board: linked, jobs: read.jobs, message: `${VENDOR_NAMES[linked.vendor]} board, ${read.jobs.length} open ${read.jobs.length === 1 ? "job" : "jobs"}.` };
    return { state: "none", message: read.blocked ? "That board refused the request. Try again later." : "That board link does not answer." };
  }
  const site = await fromWebsite(company.website, loadPage);
  if (site) {
    const read = await readBoard(site.board, ctx, keywords);
    if (read.jobs) return { state: "found", board: site.board, jobs: read.jobs, via: site.via, message: `Linked from ${new URL(site.via).hostname}: ${VENDOR_NAMES[site.board.vendor]}, ${read.jobs.length} open ${read.jobs.length === 1 ? "job" : "jobs"}.` };
  }
  let unsure = null;
  let empty = null;
  for (const slug of slugCandidates(company.name)) {
    for (const vendor of GUESSED) {
      const board = makeBoard(vendor, slug);
      if (!board) continue;
      const read = await readBoard(board, ctx);
      if (!read.jobs) continue;
      if (read.name && sameCompany(company.name, read.name)) {
        // An empty board may be an old one: keep looking for one with jobs.
        if (!read.jobs.length) {
          empty ??= { board, name: read.name };
          continue;
        }
        return { state: "found", board, jobs: read.jobs, message: `${VENDOR_NAMES[vendor]} board "${read.name}", ${read.jobs.length} open ${read.jobs.length === 1 ? "job" : "jobs"}.` };
      }
      // A board that names another company is not this one; one that names
      // no one, with jobs, is worth a look.
      if (!read.name && read.jobs.length && !unsure) unsure = { board, jobs: read.jobs };
    }
  }
  if (empty) return { state: "found", board: empty.board, jobs: [], message: `${VENDOR_NAMES[empty.board.vendor]} board "${empty.name}", no open jobs right now.` };
  if (unsure) {
    return { state: "check", board: unsure.board, jobs: unsure.jobs, message: `A ${VENDOR_NAMES[unsure.board.vendor]} board with this name lists ${unsure.jobs.length} ${unsure.jobs.length === 1 ? "job" : "jobs"}. Open it to check it is this company.` };
  }
  return {
    state: "none",
    message: company.website
      ? "No hosted job board found on the website or by name. Paste the careers page link if you know it."
      : "No hosted job board found by name. Add the website, or paste the careers page link.",
  };
}

// ---------- which jobs are for you ----------

const COUNTRY_ALIASES = {
  AE: ["uae", "u a e", "emirates", "united arab emirates"],
  SA: ["ksa", "saudi", "saudi arabia", "kingdom of saudi arabia"],
  TR: ["turkey", "turkiye", "türkiye"],
  GB: ["uk", "united kingdom", "great britain", "england"],
  US: ["usa", "united states", "united states of america"],
  QA: ["qatar"],
  KW: ["kuwait"],
  BH: ["bahrain"],
  OM: ["oman", "sultanate of oman"],
};

const wordsIn = (text) => ` ${fold(text)} `;

// Builds the test for a board job against the user's roles and countries:
// (job) → { role, country, city } or null.
// citiesOf(code) gives a country's cities (largest first) when known.
export function jobMatcher(settings, citiesOf = () => null) {
  const countries = [...(settings.countries ?? [])]
    .sort((a, b) => a.priority - b.priority)
    .map((country) => {
      const code = country.code?.toUpperCase() ?? null;
      const cities = [...new Set([...(country.cities ?? []), ...((code && citiesOf(code)) ?? []).slice(0, 60)])].map(fold).filter((city) => city.length >= 3);
      const names = [country.name, ...(COUNTRY_ALIASES[code] ?? [])].map(fold).filter(Boolean);
      return { country, code, names, cities };
    });
  const roles = [...(settings.roles ?? [])]
    .sort((a, b) => a.priority - b.priority)
    .map((role) => ({ role, phrases: [role.label, ...(role.keywords ?? [])].map((text) => fold(text).split(" ").filter(Boolean)).filter((words) => words.length) }));
  return (job) => {
    const title = wordsIn(job.title);
    const match = roles.find(({ phrases }) => phrases.some((words) => words.every((word) => title.includes(` ${word} `))));
    if (!match) return null;
    const place = wordsIn(job.location);
    for (const { country, code, names, cities } of countries) {
      if (code && job.countryCode === code) return { role: match.role.key, country: country.name, city: cities.find((city) => place.includes(` ${city} `)) ? cityName(job.location, cities) : null };
      const city = cities.find((name) => place.includes(` ${name} `));
      if (city || names.some((name) => place.includes(` ${name} `))) return { role: match.role.key, country: country.name, city: city ? cityName(job.location, cities) : null };
    }
    return null;
  };
}

// The city as the board wrote it ("Dubai - Internet City" → "Dubai").
function cityName(location, cities) {
  for (const part of String(location).split(/[;,·|/()-]+/)) {
    const folded = fold(part);
    if (cities.includes(folded)) return part.trim();
  }
  const words = wordsIn(location);
  const city = cities.find((name) => words.includes(` ${name} `));
  return city ? city.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : null;
}

// Role keywords to search large boards with (Workday, Oracle), a few per role.
export function searchWords(settings, perRole = 2, limit = 6) {
  const words = [];
  for (const role of [...(settings.roles ?? [])].sort((a, b) => a.priority - b.priority)) {
    for (const keyword of (role.keywords ?? []).filter((word) => /^[\x20-\x7e]+$/.test(word)).slice(0, perRole)) words.push(keyword);
  }
  return [...new Set(words)].slice(0, limit);
}
