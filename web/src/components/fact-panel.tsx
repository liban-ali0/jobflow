"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { confirmFact, requestChanges } from "@/app/document-actions";
import type { FactCheck } from "@/core/fact-check.mjs";

// The fact check of one written document: claims that the profile and facts
// do not back, each with its sentence. The user says it is true (remembered
// for later checks) or asks for a rewrite.
export function FactPanel({ documentId, check }: { documentId: number; check: FactCheck }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>) => start(async () => setResult(await action()));
  const items = check.items;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line px-3 py-2 text-sm">
        <span className="font-medium text-go">Fact check: </span>
        <span className="text-slate">the numbers, tools, employers and schools here match your profile or facts.</span>
        {check.note && <p className="mt-1 text-xs text-slate">{check.note}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-coral/50 p-3">
      <p className="text-sm">
        <span className="font-medium">Fact check: {items.length === 1 ? "1 claim" : `${items.length} claims`} to check. </span>
        <span className="text-slate">Not found in your profile or facts. Fine if true; otherwise ask for a rewrite.</span>
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.kind}:${item.value}`} className="rounded-md bg-mist/50 px-3 py-2 text-sm">
            <p>
              <span className="font-mono text-[11px] font-semibold tracking-wide text-coral uppercase">{item.label}</span>{" "}
              <span className="font-medium" dir="auto">
                {item.value}
              </span>
              {item.advisory && <span className="text-xs text-slate"> · often fine</span>}
            </p>
            {item.sentence && (
              <p className="mt-0.5 text-xs text-slate" dir="auto">
                “{item.sentence}”
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button type="button" disabled={pending} onClick={() => run(() => confirmFact(item.kind, item.value))} className="btn btn-quiet px-2.5 py-1 text-xs">
                This is true
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => requestChanges(documentId, `Fact check: "${item.value}" is not in my profile or facts. Reword it to what they say, or remove it.`, true))}
                className="btn btn-quiet px-2.5 py-1 text-xs"
              >
                Ask for a rewrite
              </button>
            </div>
          </li>
        ))}
      </ul>
      {check.forbidden.length > 0 && <p className="text-xs text-coral">Phrases you ruled out: {check.forbidden.join(", ")}.</p>}
      {check.note && <p className="text-xs text-slate">{check.note}</p>}
      {result && (
        <p role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
