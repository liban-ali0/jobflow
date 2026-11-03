import Link from "next/link";
import { addRankingRule } from "@/app/job-actions";
import { ActionButton } from "@/components/action-button";
import { Panel } from "@/components/panel";
import type { Patterns } from "@/lib/patterns";

const TONE = { good: "border-go/50", bad: "border-coral/50", info: "border-line" } as const;
const MARK = { good: "text-go", bad: "text-coral", info: "text-teal" } as const;
const VERDICT = { predicts: "text-go", "does-not": "text-coral", "too-early": "text-slate" } as const;

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] tracking-widest text-slate uppercase">{children}</h3>;
}

// "What your applications say" on Statistics (lib/patterns.ts).
export function PatternsPanel({ patterns }: { patterns: Patterns }) {
  const { findings, decided, positive, needed, funnel, calibration, steps, setAside } = patterns;
  const top = funnel[0]?.count || 1;
  const timed = steps.filter((step) => step.median !== null || step.waiting > 0);
  return (
    <Panel
      title="What your applications say"
      hint={`${decided} ${decided === 1 ? "application has" : "applications have"} an answer so far (${positive} positive). Findings appear once there is enough to go on.`}
    >
      <div className="space-y-7">
        <div className="space-y-3">
          {findings.length === 0 && (
            <p className="text-sm text-slate">
              {needed > 0
                ? `Nothing to say yet: ${needed} more ${needed === 1 ? "application needs" : "applications need"} an answer (a reply, a rejection, or closed as no response) before patterns mean anything.`
                : "No clear pattern yet: no kind of job stands out either way."}
            </p>
          )}
          <ul className="space-y-3">
            {findings.map((finding) => (
              <li key={finding.title} className={`rounded-lg border p-3 ${TONE[finding.tone]}`}>
                <p className="text-sm font-medium">
                  <span className={MARK[finding.tone]} aria-hidden>
                    ●{" "}
                  </span>
                  {finding.title}
                </p>
                <p className="mt-0.5 text-sm text-slate" dir="auto">
                  {finding.detail}
                </p>
                {finding.jobs && (
                  <ul className="mt-1.5 space-y-0.5 text-sm">
                    {finding.jobs.map((job) => (
                      <li key={job.id}>
                        <Link href={`/jobs/${job.id}`} className="text-teal hover:underline" dir="auto">
                          {job.title} · {job.company}
                        </Link>
                        <span className="text-xs text-slate"> · {job.days} days</span>
                      </li>
                    ))}
                  </ul>
                )}
                {finding.rule && (
                  <div className="mt-2">
                    <ActionButton action={addRankingRule.bind(null, finding.rule)}>Add as a ranking rule</ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {funnel[0]?.count > 0 && (
          <section className="space-y-2">
            <Heading>From found to offer</Heading>
            <ol className="space-y-1.5">
              {funnel.map((step) => (
                <li key={step.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
                  <span>{step.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-mist" aria-hidden>
                    <span className="block h-full rounded-full bg-teal" style={{ width: `${step.count ? Math.max(2, (step.count / top) * 100) : 0}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs">
                    {step.count}
                    {step.rate !== null && <span className="text-slate"> · {step.rate}%</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate">Every job that ever reached a stage, and its share of the stage before. The biggest drop is where effort is lost.</p>
          </section>
        )}

        {calibration && (
          <section className="space-y-2">
            <Heading>Does your score predict replies?</Heading>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate">
                    <th className="py-1 pr-3 font-medium">Score</th>
                    <th className="py-1 pr-3 font-medium">Answered</th>
                    <th className="py-1 pr-3 font-medium">Got a reply</th>
                    <th className="py-1 font-medium">Still waiting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70 border-t border-line/70">
                  {calibration.bands.map((band) => (
                    <tr key={band.label}>
                      <td className="py-1.5 pr-3">{band.label}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{band.decided}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{band.rate === null ? (band.decided ? `${band.positive} of ${band.decided}` : "—") : `${band.rate}%`}</td>
                      <td className="py-1.5 font-mono text-xs">{band.waiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-sm ${VERDICT[calibration.verdict]}`}>{calibration.text}</p>
            <p className="text-xs text-slate">Applications still waiting are not counted as failures. A rate is shown once a band has 5 answered applications.</p>
          </section>
        )}

        {timed.length > 0 && (
          <section className="space-y-2">
            <Heading>How long each step takes</Heading>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {timed.map((step) => (
                <div key={step.label}>
                  <dt className="text-xs text-slate">{step.label}</dt>
                  <dd>
                    {step.median !== null ? (
                      <>
                        <span className="font-mono text-lg">{step.median}</span> days typical
                      </>
                    ) : (
                      <span className="text-slate">Not enough yet</span>
                    )}
                    <span className="block text-xs text-slate">
                      {step.moved} moved on{step.waiting ? `, ${step.waiting} still waiting (not in the figure)` : ""}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {setAside.total > 0 && (
          <section className="space-y-2">
            <Heading>What ranking set aside</Heading>
            <ul className="space-y-1 text-sm">
              {setAside.reasons.map((item) => (
                <li key={item.reason} className="flex justify-between gap-3">
                  <span dir="auto">{item.reason}</span>
                  <span className="font-mono text-xs text-slate">{item.count}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate">
              {setAside.total} {setAside.total === 1 ? "job" : "jobs"} excluded in all. If one reason is costing you jobs you wanted, change it in Settings or{" "}
              <Link href="/jobs?tab=excluded#departures" className="underline">
                look through them
              </Link>
              .
            </p>
          </section>
        )}
      </div>
    </Panel>
  );
}
