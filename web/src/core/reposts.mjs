// Reposted jobs: the same opening listed again by the same company on the same
// site under a new link. Worth knowing before applying: a role reposted
// within weeks may be hard to fill, and a role the user already applied to
// (or set aside) should not be prepared twice.
//
// The rules are career-ops' detect-reposts (MIT), applied to Offerbound's
// jobs table instead of a scan history:
//   - same company (name without its legal suffix) and the same SET of title
//     words, so word order and punctuation may change but a different city,
//     country or seniority word means a different opening;
//   - same site (linkedin.com, whatever the country prefix), different link;
//   - first seen on different days, at least one day and at most 90 apart:
//     two links found on the same day are two openings side by side.

const WINDOW_DAYS = 90;
const MIN_SPAN_DAYS = 1;
const DAY = 24 * 3600000;

const COMPANY_SUFFIX = /\b(?:ltd|limited|llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|group|holding|holdings|plc|gmbh|ag|sa|bv|fze|fzco|fz-llc|wll|w\.l\.l|a\.s|as|ltd\.? sti|ltd\. şti|şti|sti|anonim şirketi|teknoloji)\b\.?/giu;

export function companyKey(company) {
  const raw = String(company ?? "").trim();
  const key = raw
    .split("|")[0]
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(COMPANY_SUFFIX, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return key || raw.toLowerCase();
}

export function titleKey(title) {
  const raw = String(title ?? "").trim();
  const words = raw
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length ? [...new Set(words)].sort().join(" ") : raw.toLowerCase();
}

export function siteOf(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return String(url ?? "");
  }
  const labels = host.split(".");
  if (labels.length > 2 && (labels[0] === "www" || /^[a-z]{2}$/.test(labels[0]))) labels.shift();
  return labels.join(".");
}

const dayOf = (iso) => Math.floor(Date.parse(iso) / DAY);

// For each job, the other listings of the same opening, oldest first:
// Map<jobId, [{ id, title, status, found_at, applied_at, excluded_reason, url }]>.
// Jobs without one are not in the map.
export function findReposts(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    if (!job?.url || !job.found_at || Number.isNaN(Date.parse(job.found_at))) continue;
    const key = `${companyKey(job.company)}\u0000${titleKey(job.title)}\u0000${siteOf(job.url)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  const result = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const job of group) {
      const day = dayOf(job.found_at);
      const others = group
        .filter((other) => other.id !== job.id && other.url !== job.url)
        .filter((other) => {
          const span = Math.abs(dayOf(other.found_at) - day);
          return span >= MIN_SPAN_DAYS && span <= WINDOW_DAYS;
        })
        .sort((a, b) => Date.parse(a.found_at) - Date.parse(b.found_at))
        .map(({ id, title, status, found_at, applied_at, excluded_reason, url }) => ({ id, title, status, found_at, applied_at, excluded_reason, url }));
      if (others.length) result.set(job.id, others);
    }
  }
  return result;
}
