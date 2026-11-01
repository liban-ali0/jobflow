import Link from "next/link";
import { addRankingRule } from "@/app/job-actions";
import { ActionButton } from "@/components/action-button";
import { Panel } from "@/components/panel";
import type { Patterns } from "@/lib/patterns";

const TONE = { good: "border-go/50", bad: "border-coral/50", info: "border-line" } as const;
const MARK = { good: "text-go", bad: "text-coral", info: "text-teal" } as const;

// "What your applications say" on Statistics (lib/patterns.ts).
export function PatternsPanel({ patterns }: { patterns: Patterns }) {
  const { findings, decided, positive, needed } = patterns;
  return (
    <Panel
      title="What your applications say"
      hint={`${decided} ${decided === 1 ? "application has" : "applications have"} an answer so far (${positive} positive). Findings appear once there is enough to go on.`}
    >
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
    </Panel>
  );
}
