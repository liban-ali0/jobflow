"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmStory, deleteStory } from "@/app/interview-actions";
import type { Story } from "@/core/stories.mjs";

// Profile → Your interview stories: the bank every interview pack, debrief
// and practice uses. A story counts as true once the user confirms it.
export function StoryBank({ stories }: { stories: Story[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
    });
  const waiting = stories.filter((story) => !story.confirmed).length;

  return (
    <section className="card p-5" id="stories">
      <h2 className="card-title">Your interview stories</h2>
      <p className="mt-0.5 text-sm text-slate">
        Situation, task, action, result and what you learned: reused in every interview pack, debrief and practice. The interview steps add them from your profile and your notes; check each one and confirm it, or remove it.
        {waiting > 0 && <span className="text-ink"> {waiting} waiting for you.</span>}
      </p>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </p>
      )}
      {stories.length === 0 ? (
        <p className="mt-3 text-sm text-slate">None yet. They are added when an interview pack or debrief is written.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
          {stories.map((story) => (
            <li key={story.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" className="text-left font-medium hover:text-teal" aria-expanded={open === story.id} onClick={() => setOpen(open === story.id ? null : story.id)} dir="auto">
                  {story.title}
                </button>
                {story.theme && <span className="text-xs text-slate">{story.theme}</span>}
                <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase ${story.confirmed ? "bg-teal-soft text-teal" : "bg-saffron/20 text-ink"}`}>{story.confirmed ? "Confirmed" : "Check it"}</span>
                <span className="ml-auto flex gap-1">
                  {!story.confirmed && (
                    <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => confirmStory(story.id))}>
                      It is true
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => deleteStory(story.id))} aria-label={`Remove ${story.title}`}>
                    Remove
                  </button>
                </span>
              </div>
              {story.skills.length > 0 && <p className="mt-0.5 text-xs text-slate">{story.skills.join(" · ")}</p>}
              {!story.confirmed && story.unbacked.length > 0 && (
                <p className="mt-1 text-xs text-coral">Not in your profile or facts: {story.unbacked.join(", ")}. Confirm only if these are right.</p>
              )}
              {open === story.id && (
                <dl className="mt-2 grid gap-2 rounded-md bg-mist/60 px-3 py-2 text-sm">
                  {(
                    [
                      ["Situation", story.situation],
                      ["Task", story.task],
                      ["Action", story.action],
                      ["Result", story.result],
                      ["What I learned", story.reflection],
                    ] as const
                  )
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-slate">{label}</dt>
                        <dd dir="auto">{value}</dd>
                      </div>
                    ))}
                  {story.source.job_id && (
                    <Link href={`/jobs/${story.source.job_id}`} className="text-xs text-teal underline">
                      From this job&rsquo;s interview
                    </Link>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate">To change a story, ask the Assistant, for example &ldquo;make the KPI story shorter&rdquo;.</p>
    </section>
  );
}
