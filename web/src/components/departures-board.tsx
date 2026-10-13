import Link from "next/link";
import { setStatus } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { RowMenu } from "@/components/job-actions";
import { ageMinutes, formatAgeShort } from "@/lib/format";
import { boarding, placeCode, type Boarding } from "@/lib/places";
import { SORT_KEYS, SORT_LABELS, type SortDir, type SortKey } from "@/lib/sort";
import { STATUS_LABELS, type Job, type Settings } from "@/lib/types";
import { Flap } from "@/components/flap";

const TONES: Record<Boarding["tone"], string> = {
  boarding: "bg-saffron text-on-saffron ring-1 ring-signal",
  ontime: "bg-go-soft text-go",
  lastcall: "bg-coral-soft text-coral",
  departed: "bg-board-row text-board-dim line-through",
  unknown: "bg-board-row text-board-dim",
};


function clock(iso: string | null) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export type Sorting = { key: SortKey; dir: SortDir; href: (key: SortKey) => string };

// A column header that sorts the board when clicked, with an arrow on the
// active column.
function SortHeader({ column, sorting }: { column: SortKey; sorting?: Sorting }) {
  const label = SORT_LABELS[column];
  if (!sorting) return <span>{label}</span>;
  const active = sorting.key === column;
  return (
    <Link
      href={sorting.href(column)}
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 transition-colors hover:text-signal ${active ? "text-signal" : ""}`}
    >
      {label}
      <span aria-hidden className={active ? "" : "opacity-0"}>
        {active && sorting.dir === "asc" ? "↑" : "↓"}
      </span>
    </Link>
  );
}

export function DeparturesBoard({
  title,
  jobs,
  settings,
  selected = false,
  empty,
  sorting,
  total,
  selectable = false,
}: {
  title: string;
  jobs: Job[];
  // How many jobs match in all, when only one page of them is shown.
  total?: number;
  settings: Settings;
  selected?: boolean;
  empty: React.ReactNode;
  sorting?: Sorting;
  // Rows get checkboxes for bulk actions (see BulkSelection).
  selectable?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-board text-board-text shadow-[0_12px_32px_-20px_rgb(12_20_36/0.35)] ring-1 ring-board-line">
      <header className="flex items-center justify-between gap-3 border-b border-board-line px-5 py-3">
        <h2 className="font-display text-xl font-semibold tracking-[0.12em] text-signal uppercase">{title}</h2>
        <span className="font-mono text-xs text-board-dim">{total ?? jobs.length} listed</span>
      </header>

      <div className="hidden grid-cols-[6.5rem_6.5rem_1fr_5.5rem_6.5rem_9rem] gap-4 px-5 py-2 font-mono text-[11px] tracking-[0.14em] text-board-dim uppercase lg:grid">
        <span className="flex items-center gap-3">
          {selectable && (
            <input type="checkbox" data-select-all aria-label="Select all jobs on this page" className="size-4 accent-teal" />
          )}
          <SortHeader column="posted" sorting={sorting} />
        </span>
        <SortHeader column="to" sorting={sorting} />
        <span className="flex gap-2">
          <SortHeader column="role" sorting={sorting} />
          <span aria-hidden>·</span>
          <SortHeader column="company" sorting={sorting} />
        </span>
        <SortHeader column="score" sorting={sorting} />
        <SortHeader column="status" sorting={sorting} />
        <span />
      </div>

      {sorting && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-board-line px-5 py-2.5 lg:hidden">
          {selectable && (
            <label className="mr-2 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-board-dim uppercase">
              <input type="checkbox" data-select-all aria-label="Select all jobs on this page" className="size-4 accent-teal" />
              All
            </label>
          )}
          <span className="mr-1 font-mono text-[11px] tracking-[0.14em] text-board-dim uppercase">Sort</span>
          {SORT_KEYS.map((key) => (
            <Link
              key={key}
              href={sorting.href(key)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                sorting.key === key ? "border-signal text-signal" : "border-board-line text-board-text"
              }`}
            >
              {SORT_LABELS[key]}
              {sorting.key === key && (sorting.dir === "asc" ? " ↑" : " ↓")}
            </Link>
          ))}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="px-5 py-8 text-sm text-board-dim">{empty}</div>
      ) : (
        <ul>
          {jobs.map((job, index) => {
            const status = boarding(job, settings);
            const strong = job.score !== null && job.score >= 75;
            // Jobs past the waiting stage (shown in the "everything found" view)
            // carry their own status instead of a boarding status.
            const waiting = job.status === "found" || job.status === "ranked";
            const excluded = job.status === "excluded";
            const reason = excluded ? job.excluded_reason : job.score_reason;
            return (
              <li
                key={job.id}
                className={`board-row grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-board-line px-5 py-3.5 hover:bg-board-row lg:grid-cols-[6.5rem_6.5rem_1fr_5.5rem_6.5rem_9rem] lg:items-center`}
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
              >
                <div className="flex items-start gap-3 font-mono text-sm">
                  {selectable && (
                    <input
                      type="checkbox"
                      name="job"
                      value={job.id}
                      aria-label={`Select ${job.title}`}
                      className="mt-0.5 size-4 shrink-0 accent-teal"
                    />
                  )}
                  <div>
                    <div>{clock(job.posted_at)}</div>
                    <div className="text-[11px] whitespace-nowrap text-board-dim">{job.posted_at ? `${formatAgeShort(ageMinutes(job.posted_at))} ago` : "post time"}</div>
                  </div>
                </div>

                <div>
                  <Flap code={placeCode(job)} />
                  <div className="mt-1 truncate text-[11px] text-board-dim">{job.city ?? job.country}</div>
                </div>

                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <Link
                    href={`/jobs/${job.id}`}
                    className={`font-medium hover:text-signal hover:underline ${excluded ? "text-board-dim" : "text-board-text"}`}
                    dir="auto"
                  >
                    {job.title}
                  </Link>
                  <div className="truncate text-sm text-board-dim" dir="auto">
                    {job.company}
                    {job.work_mode && ` · ${job.work_mode}`}
                    {job.source && ` · ${job.source}`}
                  </div>
                  {reason && <p className="mt-1 line-clamp-2 text-xs text-board-dim">{reason}</p>}
                </div>

                <div className="flex items-center gap-3 lg:block">
                  <div className={`font-display text-3xl leading-none font-bold ${strong ? "text-signal" : "text-board-text"}`}>
                    {job.score === null ? "—" : Math.round(job.score)}
                  </div>
                  <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-board-line">
                    <div
                      className={`h-full rounded-full ${strong ? "bg-signal" : "bg-board-dim"}`}
                      style={{ width: `${job.score ?? 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  {waiting || selected ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] tracking-wider uppercase ${
                        job.score === null && status.tone !== "departed" ? "bg-board-row text-board-dim" : TONES[status.tone]
                      }`}
                    >
                      {status.tone === "boarding" && <span className="fresh-dot size-1.5 rounded-full bg-on-saffron" aria-hidden />}
                      {job.score === null && status.tone !== "departed" ? "Not ranked" : status.label}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex rounded px-2 py-1 font-mono text-[11px] tracking-wider uppercase ${
                        excluded ? "bg-board-row text-board-dim" : "bg-teal-soft text-teal"
                      }`}
                    >
                      {STATUS_LABELS[job.status]}
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex items-center gap-2 lg:col-span-1 lg:justify-end">
                  {selected ? (
                    <ActionButton variant="board" action={setStatus.bind(null, job.id, "ranked")}>
                      Remove
                    </ActionButton>
                  ) : job.status === "ranked" ? (
                    <ActionButton variant="board" action={setStatus.bind(null, job.id, "selected")}>
                      Select
                    </ActionButton>
                  ) : job.status === "found" ? (
                    <span className="font-mono text-[11px] text-board-dim">rank first</span>
                  ) : null}
                  <RowMenu job={{ id: job.id, status: job.status, url: job.url, ranked: job.score !== null }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
