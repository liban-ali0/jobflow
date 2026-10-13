import Link from "next/link";
import { Flap } from "@/components/flap";
import { PageHeader } from "@/components/page-header";
import { listJobs } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { placeCode } from "@/lib/places";
import { STATUS_LABELS, type Job } from "@/lib/types";

// Every job, whatever its stage: title, company, city, country, and notes.
const LIMIT = 100;
const fold = (text: string) => text.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 120) : "";
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches: Job[] = words.length
    ? listJobs()
        .filter((job) => {
          const text = fold([job.title, job.company, job.city, job.country, job.notes, job.source].filter(Boolean).join(" "));
          return words.every((word) => text.includes(word));
        })
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    : [];
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={query ? `${matches.length} ${matches.length === 1 ? "job" : "jobs"}` : "All jobs"} title="Search" description="Every job Offerbound has, at any stage: found, applied, closed, or excluded." />
      <form action="/search" role="search" className="mt-6 flex gap-2">
        <label className="sr-only" htmlFor="search-q">
          Search
        </label>
        <input id="search-q" name="q" type="search" defaultValue={query} autoFocus placeholder="Company, title, city, or a word from your notes" className="field" />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      {query && matches.length === 0 && <p className="card mt-6 px-5 py-6 text-sm text-slate">No job matches &ldquo;{query}&rdquo;.</p>}
      {matches.length > 0 && (
        <ul className="card mt-6 divide-y divide-line/70 overflow-hidden rounded-xl shadow-sm">
          {matches.slice(0, LIMIT).map((job) => (
            <li key={job.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_4rem_9rem_8rem]">
              <div className="min-w-0">
                <Link href={`/jobs/${job.id}`} className="font-medium hover:text-teal hover:underline" dir="auto">
                  {job.title}
                </Link>
                <div className="truncate text-slate" dir="auto">
                  {[job.company, job.city, job.country].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="hidden sm:block">
                <Flap code={placeCode(job)} className="text-[11px]" />
              </div>
              <span className="justify-self-end rounded bg-mist px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap sm:justify-self-start">{STATUS_LABELS[job.status]}</span>
              <span className="col-span-2 font-mono text-xs text-slate sm:col-span-1">{formatDateTime(job.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {matches.length > LIMIT && <p className="mt-3 text-sm text-slate">Showing the {LIMIT} most recently updated. Add a word to narrow it down.</p>}
    </div>
  );
}
