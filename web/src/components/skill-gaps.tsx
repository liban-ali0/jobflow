"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { haveSkill, lackSkill, restoreSkill } from "@/app/skill-actions";
import type { SkillGap } from "@/lib/skill-gaps";

// Profile → Skills your jobs ask for: each one the candidate either has
// (written to the facts, with where it was used) or does not (hidden).
export function SkillGaps({ gaps, jobs, dismissed }: { gaps: SkillGap[]; jobs: number; dismissed: string[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [all, setAll] = useState(false);
  const shown = all ? gaps : gaps.slice(0, 10);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const top = gaps[0]?.weight ?? 1;

  const run = (task: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) after?.();
    });
  const save = (skill: string) =>
    run(
      () => haveSkill(skill, evidence),
      () => {
        setOpen(null);
        setEvidence("");
      },
    );

  return (
    <section className="card p-5" id="skills">
      <h2 className="card-title">Skills your jobs ask for</h2>
      <p className="mt-0.5 text-sm text-slate">
        From {jobs} saved {jobs === 1 ? "job" : "jobs"}: the skills they ask for most that your profile, facts and CVs do not show. Jobs that fit you better count more. If you have one, say where you used it and every CV Offerbound writes can show it.
      </p>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </p>
      )}
      {gaps.length === 0 ? (
        <p className="mt-3 text-sm text-slate">{jobs < 5 ? "Not enough jobs yet: this fills in as jobs are collected." : "Nothing your jobs keep asking for is missing from your profile."}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
          {shown.map((gap) => (
            <li key={gap.skill} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-32 font-medium" dir="auto">
                  {gap.skill}
                </span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-mist" aria-hidden>
                  <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.max(8, (gap.weight / top) * 100)}%` }} />
                </span>
                <span className="text-sm text-slate">
                  {gap.jobs} {gap.jobs === 1 ? "job" : "jobs"} ({gap.share}%){gap.must ? ` · a must in ${gap.must}` : ""}
                </span>
                <span className="ml-auto flex gap-1">
                  <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => setOpen(open === gap.skill ? null : gap.skill)}>
                    I have it
                  </button>
                  <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => lackSkill(gap.skill))}>
                    I don&rsquo;t
                  </button>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate">
                For example{" "}
                {gap.examples.map((example, index) => (
                  <span key={example.id}>
                    {index > 0 && ", "}
                    <Link href={`/jobs/${example.id}`} className="underline">
                      {example.title} · {example.company}
                    </Link>
                  </span>
                ))}
              </p>
              {open === gap.skill && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Where you used ${gap.skill}`}
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      save(gap.skill);
                    }}
                    placeholder="Where and how, e.g. used it daily at Acme for reports"
                    className="field w-full sm:w-[28rem]"
                    dir="auto"
                  />
                  <button type="button" className="btn btn-primary px-3 py-1 text-sm" disabled={pending || !evidence.trim()} onClick={() => save(gap.skill)}>
                    Add to my facts
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {gaps.length > 10 && (
        <button type="button" className="mt-3 text-sm text-teal underline" onClick={() => setAll(!all)}>
          {all ? "Show the top 10" : `Show all ${gaps.length}`}
        </button>
      )}
      {dismissed.length > 0 && (
        <div className="mt-3 text-sm">
          <button type="button" className="text-teal underline" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? "Hide" : "Show"} the {dismissed.length} you said you don&rsquo;t have
          </button>
          {showHidden && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {dismissed.map((skill) => (
                <li key={skill}>
                  <button type="button" className="chip" disabled={pending} onClick={() => run(() => restoreSkill(skill))} title="Show it again">
                    {skill} ↺
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
