import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { getStats, type Breakdown } from "@/lib/stats";

function Rate({ count, total, interview = false }: { count: number; total: number; interview?: boolean }) {
  const percent = total ? (count / total) * 100 : 0;
  return (
    <div>
      <p className="font-mono text-sm">
        <span className={interview ? "text-go" : "text-teal"}>{total ? `${percent.toFixed(1)}%` : "—"}</span>
        <span className="ml-2 text-xs text-slate">{count} of {total}</span>
      </p>
      <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
        <div className={`h-full rounded-full ${interview ? "bg-go" : "bg-teal"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function BreakdownPanel({ title, rows, hint }: { title: string; rows: Breakdown[]; hint?: string }) {
  return (
    <Panel title={title} hint={hint}>
      {rows.length === 0 ? <p className="text-sm text-slate">Your applications will appear here.</p> : (
        <ul className="divide-y divide-line/70">
          {rows.map((row) => (
            <li key={row.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="break-words text-sm font-medium" dir="auto">{row.label}</h3>
                <span className="font-mono text-xs text-slate">{row.applied} applied</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-5">
                <div><p className="mb-1 text-xs text-slate">Reply rate</p><Rate count={row.replied} total={row.applied} /></div>
                <div><p className="mb-1 text-xs text-slate">Interview rate</p><Rate count={row.interview} total={row.applied} interview /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function StatsPage() {
  const stats = getStats();
  return (
    <div>
      <PageHeader eyebrow={`${stats.applied} ${stats.applied === 1 ? "application" : "applications"} · all time`} title="Statistics" description="See which sources, countries, and roles lead to replies and interviews." />

      {stats.applied < 10 && (
        <div className="mt-8">
          <Panel title={stats.applied === 0 ? "Start with your first application" : "Early days"}>
            <p className="max-w-2xl text-sm text-slate">
              {stats.applied === 0 ? "Mark jobs as applied on the Board to see reply and interview rates by source, country, and role, plus application speed and fast-track results. " : "These are your first results. A single reply can change a small sample a lot. "}
              Numbers become meaningful after about 10 applications. Keep recording replies and interviews as they arrive.
            </p>
          </Panel>
        </div>
      )}

      {stats.applied > 0 && (
      <div className="mt-8">
        <Panel title="Application results" hint="All applications, including rejected and unanswered jobs. Interviews and offers count as replies; a rejection alone does not.">
          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="mb-2 text-sm text-slate">Reply rate</dt><dd><Rate count={stats.replied} total={stats.applied} /></dd></div>
            <div><dt className="mb-2 text-sm text-slate">Interview rate</dt><dd><Rate count={stats.interview} total={stats.applied} interview /></dd></div>
            <div>
              <dt className="text-sm text-slate">Average score</dt>
              <dd className="mt-1 font-display text-3xl font-semibold text-ink">{stats.averageScore === null ? "—" : stats.averageScore.toFixed(1)}</dd>
              <dd className="mt-1 text-xs text-slate">{stats.scoredApplications} scored applications</dd>
            </div>
            <div>
              <dt className="text-sm text-slate">Time to apply</dt>
              <dd className="mt-1 font-display text-3xl font-semibold text-ink">{stats.medianHours === null ? "—" : `${stats.medianHours.toFixed(1)} h`}</dd>
              <dd className="mt-1 text-xs text-slate">Median from found to applied · {stats.timedApplications} with dates</dd>
            </div>
          </dl>
        </Panel>
      </div>
      )}

      <div className="mt-6">
        <Panel title="From found to offer" hint="Jobs that reached each stage, counted once. Last 30 days follows jobs found in that period and their progress so far.">
          <div className="grid gap-8 sm:grid-cols-2">
            {([{ key: "all", label: "All time" }, { key: "recent", label: "Last 30 days" }] as const).map((period) => {
              const largest = Math.max(1, ...stats.funnel.map((row) => row[period.key]));
              return (
                <div key={period.key}>
                  <h3 className="mb-4 font-display text-lg font-semibold">{period.label}</h3>
                  <dl className="space-y-3">
                    {stats.funnel.map((row) => (
                      <div key={row.stage}>
                        <div className="flex justify-between gap-3 text-sm"><dt className="text-slate">{row.label}</dt><dd className="font-mono text-xs">{row[period.key]}</dd></div>
                        <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-mist">
                          <div className={`h-full rounded-full ${["replied", "interview", "offer"].includes(row.stage) ? "bg-go" : "bg-teal"}`} style={{ width: `${row[period.key] / largest * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="mt-5 border-t border-line/70 pt-3 text-xs text-slate">History preserves earlier outcomes after rejection. Preparation stages count when recorded; skipped steps may make this funnel uneven.</p>
        </Panel>
      </div>

      {/* The breakdowns need applications to say anything. */}
      {stats.applied > 0 && (
      <>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <BreakdownPanel title="By source" rows={stats.sources} />
        <BreakdownPanel title="By country" rows={stats.countries} hint="In your settings’ priority order." />
        <BreakdownPanel title="By role" rows={stats.roles} hint="In your settings’ role order." />
      </div>

      <div className="mt-6">
        <Panel title="Fast track or standard" hint="Compare reply rates for fresh listings and standard applications.">
          <dl className="grid gap-6 sm:grid-cols-2">
            {stats.tracks.map((track) => (
              <div key={track.key}><dt className="mb-2 text-sm font-medium">{track.label}</dt><dd><Rate count={track.replied} total={track.applied} /></dd></div>
            ))}
          </dl>
        </Panel>
      </div>
      </>
      )}
    </div>
  );
}
