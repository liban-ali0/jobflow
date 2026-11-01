import Link from "next/link";
import { Suspense } from "react";
import { BulkSelection, type BulkMode } from "@/components/bulk-selection";
import { DeparturesBoard } from "@/components/departures-board";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { getSettings, listJobs } from "@/lib/data";
import { DEFAULT_LIMIT, applyFilters, paginate, readFilters, readLimit } from "@/lib/filters";
import { DEFAULT_SORT, FIRST_DIR, SORT_KEYS, sortJobs, tableSort } from "@/lib/sort";
import type { Job, Status } from "@/lib/types";

// Every saved job not yet applied to, one table per stage, so each list
// stays short and easy to pick from. Applications are on the Board.
const TABS: { value: string; label: string; title: string; mode: BulkMode; statuses?: Status[]; archived?: boolean; empty: string; hint: string }[] = [
  { value: "unranked", label: "Not ranked", title: "Not ranked", mode: "unranked", statuses: ["found"], empty: "Everything is ranked.", hint: "Found and waiting for Check and rank." },
  { value: "ranked", label: "Ranked", title: "Ranked, waiting for your pick", mode: "ranked", statuses: ["ranked"], empty: "No ranked jobs waiting.", hint: "Tick the ones worth full research and press Select for research." },
  { value: "selected", label: "Selected", title: "Selected for research", mode: "selected", statuses: ["selected"], empty: "Nothing selected.", hint: "Picked for research; Research all selected is on Today." },
  { value: "preparing", label: "Preparing", title: "Researched and ready", mode: "preparing", statuses: ["researched", "ready"], empty: "Nothing in preparation.", hint: "Documents written or approved, not sent yet." },
  { value: "excluded", label: "Excluded", title: "Excluded", mode: "excluded", statuses: ["excluded"], empty: "Nothing excluded.", hint: "Set aside by you or by the ranking." },
  { value: "archived", label: "Archived", title: "Archived", mode: "archived", archived: true, empty: "The archive is empty.", hint: "Out of the lists, never deleted. Bring any of them back." },
];

export default async function JobsPage(props: PageProps<"/jobs">) {
  const query = await props.searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const tab = TABS.find((item) => item.value === pick("tab")) ?? TABS[1];
  const settings = getSettings();

  const listOf = (item: (typeof TABS)[number]): Job[] => (item.archived ? listJobs({ archived: true }) : listJobs({ status: item.statuses, archived: false }));
  const counts = Object.fromEntries(TABS.map((item) => [item.value, listOf(item).length]));

  const extra = readFilters(pick);
  const limit = readLimit(pick("limit"));
  const params = { tab: tab.value === TABS[1].value ? undefined : tab.value, ...extra, limit: limit === DEFAULT_LIMIT ? undefined : String(limit), sort: pick("sort"), dir: pick("dir") };
  const sorting = tableSort({ query: params, keys: SORT_KEYS, firstDir: FIRST_DIR, defaultSort: DEFAULT_SORT, param: { key: "sort", dir: "dir" }, path: "/jobs", anchor: "departures" });
  const filtered = applyFilters(listOf(tab), extra);
  const sorted = sortJobs(filtered, sorting.key, sorting.dir, settings);
  const paged = paginate(sorted, Number(pick("page")) || 1, limit);
  const href = (next: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries({ ...params, ...next }).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
    return `/jobs${search ? `?${search}` : ""}#departures`;
  };
  const archiveDays = settings.freshness.archiveAfterDays ?? 7;

  return (
    <div>
      <PageHeader
        eyebrow="Saved jobs"
        title="Jobs"
        description={`Every job you have not applied to, one list per stage. Jobs you never picked go to Archived once the posting is ${archiveDays ? `${archiveDays} days old` : "old (off in Settings)"}. Applications are on the Board.`}
      />

      <nav aria-label="Stages" className="mt-6 flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={`/jobs${item.value === TABS[1].value ? "" : `?tab=${item.value}`}#departures`}
            aria-current={item.value === tab.value ? "page" : undefined}
            className={`chip ${item.value === tab.value ? "chip-on" : ""}`}
          >
            {item.label}
            <span className="font-mono opacity-75">{counts[item.value]}</span>
          </Link>
        ))}
        <Link href="/board" className="chip">
          Applications →
        </Link>
      </nav>
      <p className="mt-2 text-sm text-slate">{tab.hint}</p>

      <div className="mt-3">
        <Suspense fallback={null}>
          <FilterBar />
        </Suspense>
      </div>

      <div id="departures" className="anchor mt-4">
        <BulkSelection key={tab.value} mode={tab.mode}>
          <DeparturesBoard selectable title={`${tab.title} · ${filtered.length}`} jobs={paged.rows} total={paged.total} settings={settings} sorting={sorting} empty={filtered.length === listOf(tab).length ? tab.empty : "No jobs match these filters."} />
          <Pagination page={paged.page} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={paged.total} href={(page) => href({ page: page > 1 ? String(page) : undefined })} />
        </BulkSelection>
      </div>
    </div>
  );
}
