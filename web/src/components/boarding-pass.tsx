import { Flap } from "@/components/flap";
import { ageMinutes, formatAge, formatDateTime } from "@/lib/format";
import { boarding, placeCode, type Boarding } from "@/lib/places";
import { STATUS_LABELS, type Job, type Settings } from "@/lib/types";

// On the dark pass: how fresh the posting is, in departure-board terms.
const TONES: Record<Boarding["tone"], string> = {
  boarding: "bg-saffron text-on-saffron",
  ontime: "border border-chrome-line text-chrome-text",
  lastcall: "bg-coral-soft text-coral",
  departed: "border border-chrome-line text-chrome-dim line-through",
  unknown: "border border-chrome-line text-chrome-dim",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words text-chrome-text" dir="auto">
        {children}
      </dd>
    </div>
  );
}

// The job's header, drawn as a boarding pass: where it goes and how fresh it
// is on the pass, the match score and the stage on the tear-off stub.
export function BoardingPass({ job, settings }: { job: Job; settings: Settings }) {
  const status = boarding(job, settings);
  const minutes = ageMinutes(job.posted_at);
  const place = [job.city, job.country].filter(Boolean).join(", ");
  const score = job.score === null ? null : Math.round(job.score);

  return (
    <section aria-label="Job summary" className="relative grid overflow-hidden rounded-xl border border-chrome-line bg-chrome text-chrome-text shadow-md md:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 px-6 pt-5 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] tracking-[0.2em] text-chrome-dim uppercase">Flight JF-{String(job.id).padStart(3, "0")}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider uppercase ${TONES[status.tone]}`}>
            {status.tone === "boarding" && <span className="fresh-dot size-1.5 rounded-full bg-on-saffron" aria-hidden />}
            {status.label}
          </span>
        </div>

        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-tight uppercase md:text-4xl" dir="auto">
          {job.title}
        </h1>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Field label="Carrier">{job.company}</Field>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">To</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-chrome-text">
              <Flap code={placeCode(job)} className="text-sm" />
              <span className="min-w-0 break-words" dir="auto">
                {place || "Not stated"}
              </span>
            </dd>
          </div>
          <Field label="Posted">{minutes === null ? "Unknown" : `${formatAge(minutes)} ago · ${formatDateTime(job.posted_at)}`}</Field>
          <Field label="Mode">{job.work_mode ? job.work_mode.replace(/^\w/, (letter) => letter.toUpperCase()) : "Not stated"}</Field>
        </dl>
      </div>

      {/* The stub, behind a perforated edge with punched notches. */}
      <div className="relative flex flex-row items-center justify-between gap-4 border-t-2 border-dashed border-chrome-line px-6 py-5 md:flex-col md:items-start md:justify-center md:border-t-0 md:border-l-2">
        <span aria-hidden className="absolute -top-2.5 -left-2.5 hidden size-5 rounded-full border border-chrome-line bg-mist md:block" />
        <span aria-hidden className="absolute -bottom-2.5 -left-2.5 hidden size-5 rounded-full border border-chrome-line bg-mist md:block" />
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">Match</p>
          <p className="font-display leading-none font-bold">
            <span className="text-5xl text-chrome-text">{score ?? "—"}</span>
            {score !== null && <span className="ml-1 text-base text-chrome-dim">/100</span>}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">Stage</p>
          <p className="mt-1 font-display text-xl font-semibold tracking-wide uppercase">{STATUS_LABELS[job.status]}</p>
        </div>
      </div>
    </section>
  );
}
