import "server-only";
import { getSettings, listFoundWithin, listJobs } from "./data";
import { DEFAULT_LIMIT, applyFilters, readFilters, readLimit } from "./filters";
import { boarding } from "./places";
import { DEFAULT_SORT, FIRST_DIR, SORT_KEYS, sortJobs, tableSort } from "./sort";
import type { Job, Settings } from "./types";

// The departures board's list, built from the address. The Today page and
// the export use the same function, so an export always matches the screen.

export const SHOW_VIEWS = [
  { value: "unranked", label: "Not ranked", title: "Not ranked", status: "found" },
  { value: "ranked", label: "Ranked", title: "Ranked, waiting for your pick", status: "ranked" },
  { value: "all", label: "Everything found", title: "Everything found", status: null },
] as const;

// Live postings first, then by score, then newest. Postings past the age
// limit sink to the bottom.
function byScore(settings: Settings) {
  const departed = (job: Job) => (boarding(job, settings).tone === "departed" ? 1 : 0);
  return (a: Job, b: Job) =>
    departed(a) - departed(b) ||
    (b.score ?? -1) - (a.score ?? -1) ||
    Date.parse(b.posted_at ?? "0") - Date.parse(a.posted_at ?? "0");
}

export function buildDepartures(pick: (key: string) => string | undefined) {
  const show = SHOW_VIEWS.find((view) => view.value === pick("show"))?.value;
  const extra = readFilters(pick);
  const limit = readLimit(pick("limit"));
  // Everything in the address that shapes the screen, except the page number:
  // any change of view, filter, or sort starts again from page 1.
  const params = {
    show,
    country: pick("country"),
    role: pick("role"),
    ...extra,
    limit: limit === DEFAULT_LIMIT ? undefined : String(limit),
    sort: pick("sort"),
    dir: pick("dir"),
    ssort: pick("ssort"),
    sdir: pick("sdir"),
  };
  const boardSort = { keys: SORT_KEYS, firstDir: FIRST_DIR, defaultSort: DEFAULT_SORT, path: "/", query: params };
  const departuresSort = tableSort({ ...boardSort, param: { key: "sort", dir: "dir" }, anchor: "departures" });
  const selectedSort = tableSort({ ...boardSort, param: { key: "ssort", dir: "sdir" }, anchor: "selected" });

  const settings = getSettings();
  const waiting = listJobs({ status: ["ranked", "found"] });
  const recent = listFoundWithin(settings.freshness.maxHours);

  // The "show" view decides which jobs the board lists; the filters then
  // narrow that list.
  const pool =
    show === "all"
      ? recent
      : show === "unranked"
        ? waiting.filter((job) => job.status === "found")
        : show === "ranked"
          ? waiting.filter((job) => job.status === "ranked")
          : waiting;
  const filtered = applyFilters(
    pool
      .filter((job) => !params.country || job.country === params.country)
      .filter((job) => !params.role || job.role === params.role),
    extra,
  );
  // Without a chosen column, the default order also sinks expired postings.
  const shown = departuresSort.chosen
    ? sortJobs(filtered, departuresSort.key, departuresSort.dir, settings)
    : filtered.sort(byScore(settings));

  return { show, extra, limit, params, departuresSort, selectedSort, settings, waiting, recent, pool, shown };
}
