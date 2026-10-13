"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { bulkOutcome } from "@/app/tracking-actions";

// Ticking applications on the Board, then one outcome for all of them.
// The rows carry <input name="application" value={id}> boxes.
export function ApplicationsBulk({ children }: { children: React.ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const [ids, setIds] = useState<number[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const boxes = () => [...(area.current?.querySelectorAll<HTMLInputElement>('input[name="application"]') ?? [])];
  const read = () => setIds(boxes().filter((box) => box.checked).map((box) => Number(box.value)));
  const run = (status: string) =>
    start(async () => {
      const outcome = await bulkOutcome(ids, status);
      setResult(outcome);
      if (outcome.ok) {
        for (const box of boxes()) box.checked = false;
        read();
      }
    });
  return (
    <div
      ref={area}
      onChange={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.dataset.selectGroup !== undefined) {
          for (const box of target.closest("[data-group]")?.querySelectorAll<HTMLInputElement>('input[name="application"]') ?? []) box.checked = target.checked;
        }
        if (target.name === "application" || target.dataset.selectGroup !== undefined) {
          setResult(null);
          read();
        }
      }}
    >
      {children}
      {(ids.length > 0 || result) && (
        <div className="sticky bottom-4 z-10 mt-3">
          <div className="card flex flex-wrap items-center gap-2 border-primary px-4 py-3 shadow-lg">
            {ids.length > 0 && (
              <>
                <span className="mr-2 text-sm font-medium">
                  {ids.length} {ids.length === 1 ? "application" : "applications"}
                </span>
                <button type="button" disabled={pending} onClick={() => run("replied")} className="btn btn-quiet">
                  Replied
                </button>
                <button type="button" disabled={pending} onClick={() => run("rejected")} className="btn btn-quiet text-coral">
                  Rejected
                </button>
                <button type="button" disabled={pending} onClick={() => run("no_response")} className="btn btn-quiet">
                  No response
                </button>
              </>
            )}
            {result && (
              <span role="status" className={`ml-auto text-sm ${result.ok ? "text-go" : "text-coral"}`}>
                {result.message}
                <button type="button" onClick={() => setResult(null)} className="ml-2 text-xs text-slate underline">
                  Dismiss
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
