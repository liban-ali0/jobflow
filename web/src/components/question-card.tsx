"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { answer, dismiss, type ActionResult } from "@/app/actions";
import type { Question } from "@/lib/types";

// One question from an engine. Fixed answers are buttons; a text box covers
// open answers and anything the buttons miss.
export function QuestionCard({ question, jobTitle }: { question: Question; jobTitle?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [text, setText] = useState("");

  const send = (value: string) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("answer", value);
      setResult(await answer(question.id, data));
    });

  return (
    <article className="card rounded-xl p-5 shadow-sm">
      <p className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-slate uppercase">
        <span aria-hidden className="fresh-dot size-1.5 rounded-full bg-saffron" />Q-{String(question.id).padStart(3, "0")} · waiting for you
      </p>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium" dir="auto">
          {question.text}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await dismiss(question.id)))}
          className="shrink-0 text-xs text-slate underline hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      {question.why && <p className="mt-1 text-sm text-slate">{question.why}</p>}
      {question.job_id && (
        <p className="mt-1 text-xs">
          About{" "}
          <Link href={`/jobs/${question.job_id}`} className="text-teal underline">
            {jobTitle ?? `job ${question.job_id}`}
          </Link>
        </p>
      )}

      {question.options && (
        <div className="mt-3 flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button key={option} type="button" disabled={pending} onClick={() => send(option)} className="btn btn-quiet">
              {option}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) send(text.trim());
        }}
      >
        <label className="sr-only" htmlFor={`answer-${question.id}`}>
          Your answer
        </label>
        <input
          id={`answer-${question.id}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={question.options ? "Or write your own answer" : "Your answer"}
          className="field"
          dir="auto"
        />
        <button type="submit" disabled={pending || !text.trim()} className="btn btn-primary shrink-0">
          Answer
        </button>
      </form>
      {result && !result.ok && (
        <p role="status" className="mt-2 text-xs text-coral">
          {result.message}
        </p>
      )}
    </article>
  );
}
