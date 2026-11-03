"use client";

import { useState, useTransition } from "react";
import { debriefInterview, practiceInterview } from "@/app/interview-actions";
import { OpenInGmail, type GmailEmail } from "@/components/gmail";

type Match = { requirement: string; stories: { id: number; title: string; confirmed: boolean; fit: number }[] };

// The job page at the interview stage: which of your stories fit this job's
// requirements (matched in code), a practice interview in the Assistant, and
// after the interview, your notes → debrief, new stories, thank-you note.
export function InterviewPrep({
  jobId,
  matches,
  storyCount,
  running,
  hasDebrief,
  thankYou,
}: {
  jobId: number;
  matches: Match[];
  storyCount: number;
  running: boolean;
  hasDebrief: boolean;
  thankYou: GmailEmail | null;
}) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) after?.();
    });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-mono text-[11px] tracking-widest text-slate uppercase">Your stories for this job</h3>
        {matches.length === 0 ? (
          <p className="text-sm text-slate">
            {storyCount === 0
              ? "No stories in your bank yet. The interview pack adds the ones it builds from your profile; you confirm them on Profile."
              : "None of your stories matches this job's requirements yet. The interview pack adds stories for them."}
          </p>
        ) : (
          <ul className="divide-y divide-line/70 border-y border-line/70 text-sm">
            {matches.map((row) => (
              <li key={row.requirement} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                <span className="min-w-40 font-medium" dir="auto">
                  {row.requirement}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {row.stories.map((story) => (
                    <span key={story.id} className={`rounded-full px-2 py-0.5 text-xs ${story.confirmed ? "bg-teal-soft text-teal" : "bg-mist text-slate"}`} title={story.confirmed ? "Confirmed by you" : "Not confirmed yet: check it on Profile"} dir="auto">
                      {story.title}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
        <p className="text-sm">
          <span className="font-medium">Practise first. </span>
          <span className="text-slate">A mock interview in the Assistant: one question at a time, honest feedback on each answer.</span>
        </p>
        <form action={practiceInterview.bind(null, jobId)}>
          <button type="submit" className="btn btn-quiet px-3 py-1.5 text-xs">
            Practise with the Assistant
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h3 className="font-mono text-[11px] tracking-widest text-slate uppercase">After the interview</h3>
        <label htmlFor={`debrief-${jobId}`} className="block text-sm">
          How did it go? What did they ask, what did you answer, what did they say matters, what happens next?
        </label>
        <textarea
          id={`debrief-${jobId}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          placeholder={"Rough notes are fine, for example:\n- Asked about my SQL work, answered with the KPI story, they wanted numbers\n- They care most about stakeholder updates\n- Next: technical round next week"}
          className="field w-full"
          dir="auto"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" disabled={pending || running || !notes.trim()} onClick={() => run(() => debriefInterview(jobId, notes), () => setNotes(""))}>
            {running ? "Writing…" : hasDebrief ? "Debrief this round" : "Write the debrief"}
          </button>
          {thankYou ? (
            <OpenInGmail email={thankYou} className="btn btn-quiet px-3 py-1.5 text-xs" />
          ) : (
            <button type="button" className="btn btn-quiet px-3 py-1.5 text-xs" disabled={pending || running} onClick={() => run(() => debriefInterview(jobId, ""))}>
              Write a thank-you note only
            </button>
          )}
        </div>
        <p className="text-xs text-slate">The debrief says what to fix for the next round, notes warning signs about the employer, adds new stories to your bank, and writes the thank-you note. Nothing is sent: you send the note yourself.</p>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-go" : "text-coral"}`}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
