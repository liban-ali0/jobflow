import Link from "next/link";
import type { JobReport, Requirement } from "@/core/report.mjs";
import type { Fact } from "@/lib/report";

// The job report on the job page: the verdict first, then how the listing's
// requirements match (weighted in code), the gaps and how to answer them,
// level and pay, and whether the posting looks real. Facts Offerbound knows
// from its own data sit next to the research's judgments, marked apart.

const CALL: Record<JobReport["verdict"]["call"], { label: string; tone: string }> = {
  apply: { label: "Apply", tone: "border-go bg-go-soft" },
  consider: { label: "Consider", tone: "border-teal bg-teal-soft" },
  research_first: { label: "Find out more first", tone: "border-saffron bg-saffron-soft" },
  skip: { label: "Skip", tone: "border-coral bg-coral-soft" },
};
const MATCH: Record<Requirement["match"], { label: string; tone: string }> = {
  strong: { label: "Strong", tone: "text-go" },
  partial: { label: "Partial", tone: "text-signal" },
  missing: { label: "Missing", tone: "text-coral" },
  na: { label: "Not a skill", tone: "text-slate" },
};
const BASIS: Record<Requirement["basis"], string> = {
  stated: "the listing says so",
  structural: "from where the listing puts it",
  inferred: "a judgment, not in the listing",
};
const LEGIT: Record<JobReport["legitimacy"]["tier"], { label: string; tone: string }> = {
  high: { label: "Looks real and active", tone: "text-go" },
  caution: { label: "Mixed signals", tone: "text-signal" },
  suspicious: { label: "Suspicious: check before spending time", tone: "text-coral" },
};
const WEIGHT_TONE = { positive: "text-go", neutral: "text-slate", concerning: "text-coral" } as const;
const FACT_MARK = { ok: { mark: "✓", tone: "text-go" }, warn: { mark: "!", tone: "text-coral" }, info: { mark: "i", tone: "text-slate" } } as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[11px] tracking-widest text-slate uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function JobReportView({
  report,
  match,
  requirements,
  facts,
}: {
  report: JobReport;
  match: { percent: number; decisive: { met: number; partial: number; missing: number; total: number } } | null;
  requirements: Requirement[];
  facts: Fact[];
}) {
  const call = CALL[report.verdict.call];
  const legit = LEGIT[report.legitimacy.tier];
  return (
    <div className="space-y-6">
      <div className={`rounded-lg border-l-4 px-4 py-3 ${call.tone}`}>
        <p className="text-lg font-semibold">{call.label}</p>
        <p className="text-sm">{report.verdict.reason}</p>
      </div>

      {report.summary && <p className="text-sm leading-relaxed" dir="auto">{report.summary}</p>}

      {(report.role.level || report.role.function || report.role.work_mode || report.role.team) && (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {[
            ["Level", report.role.level],
            ["The work", report.role.function],
            ["Where", report.role.work_mode],
            ["Team", report.role.team],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate">{label}</dt>
                <dd dir="auto">{value}</dd>
              </div>
            ))}
        </dl>
      )}

      <Block title="Requirements">
        {match && (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                <span className="font-mono text-2xl font-semibold">{match.percent}%</span> <span className="text-slate">match, weighted by importance</span>
              </span>
              {match.decisive.total > 0 && (
                <span className="text-slate">
                  Must-haves: {match.decisive.met} of {match.decisive.total} met
                  {match.decisive.partial ? `, ${match.decisive.partial} partly` : ""}
                  {match.decisive.missing ? `, ${match.decisive.missing} missing` : ""}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist" aria-hidden>
              <div className={`h-full rounded-full ${match.percent >= 70 ? "bg-go" : match.percent >= 45 ? "bg-teal" : "bg-coral"}`} style={{ width: `${Math.max(4, match.percent)}%` }} />
            </div>
          </div>
        )}
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate">
                <th className="py-1.5 pr-3 font-medium">Requirement</th>
                <th className="py-1.5 pr-3 font-medium">Matters</th>
                <th className="py-1.5 pr-3 font-medium">You</th>
                <th className="py-1.5 font-medium">Evidence or gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 border-t border-line/70">
              {requirements.map((row) => (
                <tr key={row.requirement} className="align-top">
                  <td className="py-2 pr-3" dir="auto">
                    {row.requirement}
                    {row.quote && <span className="mt-0.5 block text-xs text-slate italic">&ldquo;{row.quote}&rdquo;</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="capitalize">{row.importance}</span>
                    <span className="block text-xs text-slate">{BASIS[row.basis]}</span>
                  </td>
                  <td className={`py-2 pr-3 font-medium whitespace-nowrap ${MATCH[row.match].tone}`}>{MATCH[row.match].label}</td>
                  <td className="py-2 text-slate" dir="auto">
                    {row.evidence ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      {report.gaps.length > 0 && (
        <Block title="Gaps and how to answer them">
          <ul className="space-y-3">
            {report.gaps.map((gap) => (
              <li key={gap.requirement} className="rounded-md bg-mist/60 px-3 py-2 text-sm">
                <p className="font-medium" dir="auto">
                  {gap.requirement}
                  {gap.blocker && <span className="ml-2 rounded-full bg-coral-soft px-2 py-0.5 text-xs text-coral">Likely a blocker</span>}
                </p>
                {gap.risk && (
                  <p className="mt-1" dir="auto">
                    <span className="text-slate">Risk: </span>
                    {gap.risk}
                  </p>
                )}
                {gap.mitigation && (
                  <p className="mt-0.5" dir="auto">
                    <span className="text-slate">Answer: </span>
                    {gap.mitigation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {(report.level.asked || report.level.pitch) && (
        <Block title="Level">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {report.level.asked && (
              <div>
                <dt className="text-xs text-slate">They ask for</dt>
                <dd dir="auto">{report.level.asked}</dd>
              </div>
            )}
            {report.level.yours && (
              <div>
                <dt className="text-xs text-slate">Your level for this</dt>
                <dd dir="auto">{report.level.yours}</dd>
              </div>
            )}
            {report.level.pitch && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate">How to pitch it, truthfully</dt>
                <dd dir="auto">{report.level.pitch}</dd>
              </div>
            )}
            {report.level.if_lower && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate">If they offer a lower level</dt>
                <dd dir="auto">{report.level.if_lower}</dd>
              </div>
            )}
          </dl>
        </Block>
      )}

      {(report.pay.range || report.pay.ask) && (
        <Block title="Pay">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {report.pay.range && (
              <div>
                <dt className="text-xs text-slate">Market range</dt>
                <dd dir="auto">{report.pay.range}</dd>
              </div>
            )}
            {report.pay.ask && (
              <div>
                <dt className="text-xs text-slate">Ask for</dt>
                <dd dir="auto">{report.pay.ask}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate">How reliable</dt>
              <dd className="capitalize">{report.pay.reliability}</dd>
            </div>
            {report.pay.basis && <dd className="text-xs text-slate sm:col-span-3">{report.pay.basis}</dd>}
          </dl>
        </Block>
      )}

      <Block title="Is it real?">
        <p className={`text-sm font-medium ${legit.tone}`}>{legit.label}</p>
        <ul className="space-y-1.5 text-sm">
          {facts.map((fact) => (
            <li key={fact.label} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center font-mono font-bold ${FACT_MARK[fact.state].tone}`} aria-hidden>
                {FACT_MARK[fact.state].mark}
              </span>
              <span>
                <span className="text-slate">{fact.label}: </span>
                {fact.href ? (
                  <Link href={fact.href} className="underline">
                    {fact.text}
                  </Link>
                ) : (
                  fact.text
                )}
              </span>
            </li>
          ))}
          {report.legitimacy.signals.map((signal) => (
            <li key={signal.signal} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center ${WEIGHT_TONE[signal.weight]}`} aria-hidden>
                •
              </span>
              <span dir="auto">
                <span className="text-slate">{signal.signal}: </span>
                {signal.finding}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate">Lines with ✓, ! or i come from Offerbound&rsquo;s own data; the rest from the research.</p>
      </Block>

      {report.cv_changes.length > 0 && (
        <Block title="What the documents should stress">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.cv_changes.map((change) => (
              <li key={`${change.section}-${change.change}`} dir="auto">
                <span className="font-medium">{change.section}: </span>
                {change.change}
                {change.why && <span className="text-slate"> ({change.why})</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {report.questions.length > 0 && (
        <Block title="Ask them">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.questions.map((question) => (
              <li key={question} dir="auto">
                {question}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}
