"use client";

import { useState, useTransition } from "react";
import { saveNotes, type ActionResult } from "@/app/actions";

// A job's notes, saved with feedback.
export function NotesForm({ jobId, notes }: { jobId: number; notes: string }) {
  const [text, setText] = useState(notes);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const changed = text !== notes;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => setResult(await saveNotes(jobId, notes, text)));
      }}
    >
      <label className="sr-only" htmlFor="notes">
        Notes
      </label>
      <textarea
        id="notes"
        rows={6}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
        }}
        placeholder="Anything to remember about this job."
        className="field text-sm"
        dir="auto"
      />
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !changed} className="btn btn-quiet px-3 py-1.5 text-xs">
          {pending ? "Saving…" : "Save notes"}
        </button>
        {result && (
          <span role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
