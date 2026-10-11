import { boarding, placeCode } from "./places";
import type { Job, Settings } from "./types";

export const SORT_KEYS = ["posted", "to", "role", "company", "score", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, string> = {
  posted: "Posted",
  to: "To",
  role: "Role",
  company: "Company",
  score: "Score",
  status: "Status",
};

// The direction a column sorts in on its first click: newest, highest, and
// most urgent first; text columns A to Z.
export const FIRST_DIR: Record<SortKey, SortDir> = {
  posted: "desc",
  to: "asc",
  role: "asc",
  company: "asc",
  score: "desc",
  status: "asc",
};

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "score", dir: "desc" };

type Query = Record<string, string | undefined>;

// Reads one table's sort from the address and builds its header links.
// Each table uses its own parameter names (for example "sort"/"dir" for
// departures, "ssort"/"sdir" for selected) so sorting one leaves the others
// alone. Every link keeps the rest of the address and returns to `anchor`.
export function tableSort<K extends string>({
  query,
  keys,
  firstDir,
  defaultSort,
  param,
  path,
  anchor,
}: {
  query: Query;
  keys: readonly K[];
  firstDir: Record<K, SortDir>;
  defaultSort: { key: K; dir: SortDir };
  param: { key: string; dir: string };
  path: string;
  anchor: string;
}) {
  const chosen = keys.find((key) => key === query[param.key]);
  const rawDir = query[param.dir];
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : chosen ? firstDir[chosen] : defaultSort.dir;
  const active = { key: chosen ?? defaultSort.key, dir };

  const href = (key: K) => {
    const nextDir = key === active.key ? (active.dir === "asc" ? "desc" : "asc") : firstDir[key];
    const isDefault = key === defaultSort.key && nextDir === defaultSort.dir;
    const next = new URLSearchParams(
      Object.entries({ ...query, [param.key]: isDefault ? undefined : key, [param.dir]: isDefault ? undefined : nextDir }).filter(
        (entry): entry is [string, string] => Boolean(entry[1]),
      ),
    ).toString();
    return `${path}${next ? `?${next}` : ""}#${anchor}`;
  };

  return { chosen: chosen ?? null, key: active.key, dir: active.dir, href };
}

// Status order from most to least urgent.
function statusRank(job: Job, settings: Settings) {
  if (job.status === "excluded") return 6;
  if (job.status !== "found" && job.status !== "ranked") return 7;
  const tone = boarding(job, settings).tone;
  if (tone === "departed") return 5;
  if (job.score === null) return 4;
  return { boarding: 1, ontime: 2, lastcall: 3, unknown: 4 }[tone];
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);
const text = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

export function sortJobs(jobs: Job[], key: SortKey, dir: SortDir, settings: Settings) {
  const sign = dir === "asc" ? 1 : -1;
  const compare = (a: Job, b: Job): number => {
    switch (key) {
      case "posted":
        return sign * (time(a.posted_at) - time(b.posted_at));
      case "to":
        return sign * text(placeCode(a), placeCode(b)) || text(a.city ?? "", b.city ?? "");
      case "role":
        return sign * text(a.title, b.title);
      case "company":
        return sign * text(a.company, b.company);
      case "status":
        return sign * (statusRank(a, settings) - statusRank(b, settings));
      case "score":
        // Unranked jobs stay at the bottom in both directions.
        if (a.score === null || b.score === null) return (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0);
        return sign * (a.score - b.score);
    }
  };
  // Ties fall back to the strongest, then the newest posting.
  return [...jobs].sort(
    (a, b) => compare(a, b) || (b.score ?? -1) - (a.score ?? -1) || time(b.posted_at) - time(a.posted_at),
  );
}
