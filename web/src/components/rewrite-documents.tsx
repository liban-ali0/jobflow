"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { rewriteChosen } from "@/app/document-actions";

const TYPES = [
  { type: "cv", label: "CV" },
  { type: "cover_letter", label: "Cover letter" },
  { type: "email", label: "Outreach email" },
  { type: "answers", label: "Form answers" },
];

// "Rewrite documents": choose which ones, say what should change, and the
// tailoring step writes them again.
export function RewriteDocuments({ jobId, docs, disabled }: { jobId: number; docs: { type: string; approved: boolean }[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const available = TYPES.filter((item) => docs.some((doc) => doc.type === item.type));
  const [chosen, setChosen] = useState(() => new Set(available.filter((item) => !docs.find((doc) => doc.type === item.type)?.approved).map((item) => item.type)));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="relative">
      <button type="button" disabled={disabled || pending} onClick={() => setOpen(!open)} aria-expanded={open} className="btn btn-quiet">
        Rewrite documents
      </button>
      {open && (
        <form
          className="card absolute right-0 z-30 mt-2 w-80 space-y-3 rounded-xl p-4 shadow-lg"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const outcome = await rewriteChosen(jobId, [...chosen], note);
              setResult(outcome);
              if (outcome.ok) setOpen(false);
            });
          }}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Which ones?</legend>
            <div className="space-y-1.5">
              {available.map((item) => {
                const approved = docs.find((doc) => doc.type === item.type)?.approved;
                return (
                  <label key={item.type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.has(item.type)}
                      onChange={(event) => {
                        const next = new Set(chosen);
                        if (event.target.checked) next.add(item.type);
                        else next.delete(item.type);
                        setChosen(next);
                      }}
                      className="size-4 accent-teal"
                    />
                    {item.label}
                    {approved && <span className="text-xs text-go">approved</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="block text-sm font-medium" htmlFor={`rewrite-note-${jobId}`}>
            What should change? (optional)
          </label>
          <textarea
            id={`rewrite-note-${jobId}`}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. More focus on backend APIs and the payment system project."
            className="field text-sm"
            dir="auto"
          />
          <p className="text-xs text-slate">The chosen documents, including your own edits to them, are replaced. They come back for your review.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending || chosen.size === 0} className="btn btn-primary px-3 py-1.5 text-xs">
              {pending ? "Starting…" : `Rewrite ${chosen.size || ""}`.trim()}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}
      {result && !result.ok && (
        <p role="status" className="mt-1 text-xs text-coral">
          {result.message}
        </p>
      )}
    </div>
  );
}
