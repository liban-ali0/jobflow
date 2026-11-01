"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { archiveJobs, excludeJobs, rankJobs, removeFromSelected, restoreJobs, selectAndResearch, selectJobs, unarchiveJobs } from "@/app/job-actions";
import { ExcludeForm } from "@/components/job-actions";

// Which actions the bar offers, by what the table holds; "all" offers every one.
export type BulkMode = "all" | "unranked" | "ranked" | "selected" | "preparing" | "excluded" | "archived";
const ACTIONS: Record<BulkMode, string[]> = {
  all: ["select", "remove", "rank", "exclude", "restore", "archive"],
  unranked: ["rank", "exclude", "archive"],
  ranked: ["select", "rank", "exclude", "archive"],
  selected: ["remove", "exclude", "archive"],
  preparing: ["archive"],
  excluded: ["restore", "rank", "archive"],
  archived: ["unarchive"],
};

// Wraps a departures board: tracks the ticked rows (checkboxes named "job")
// and shows a bar of actions for them. The "select all" box ticks every row on
// the current page.
export function BulkSelection({ children, mode = "all" }: { children: React.ReactNode; mode?: BulkMode }) {
  const offers = (action: string) => ACTIONS[mode].includes(action);
  const area = useRef<HTMLDivElement>(null);
  const [ids, setIds] = useState<number[]>([]);
  const [excluding, setExcluding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const boxes = () => [...(area.current?.querySelectorAll<HTMLInputElement>('input[name="job"]') ?? [])];
  const read = () => {
    const all = boxes();
    const ticked = all.filter((box) => box.checked).map((box) => Number(box.value));
    // One "select all" in the desktop header, one in the phone sort strip.
    for (const toggle of area.current?.querySelectorAll<HTMLInputElement>("input[data-select-all]") ?? []) {
      toggle.checked = all.length > 0 && ticked.length === all.length;
      toggle.indeterminate = ticked.length > 0 && ticked.length < all.length;
    }
    setIds(ticked);
  };
  const clear = () => {
    for (const box of boxes()) box.checked = false;
    setExcluding(false);
    read();
  };

  // The last change, and how to take it back (an excluded or archived job
  // is easy to lose track of in a long list).
  const [undo, setUndo] = useState<(() => Promise<ActionResult>) | null>(null);
  const run = (action: () => Promise<ActionResult>, reverse?: (ids: number[]) => Promise<ActionResult>) =>
    startTransition(async () => {
      const changed = ids;
      const outcome = await action();
      setResult(outcome);
      setUndo(() => (outcome.ok && reverse ? () => reverse(changed) : null));
      if (outcome.ok) clear();
    });

  return (
    <div
      ref={area}
      onChange={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.dataset.selectAll !== undefined) for (const box of boxes()) box.checked = target.checked;
        if (target.name === "job" || target.dataset.selectAll !== undefined) {
          setResult(null);
          read();
        }
      }}
    >
      {children}

      {(ids.length > 0 || result) && (
        <div className="sticky bottom-4 z-10 mt-3">
          <div className="card flex flex-wrap items-center gap-2 border-primary px-4 py-3 shadow-lg">
            {ids.length > 0 ? (
              <>
                <span className="mr-2 text-sm font-medium">
                  <span className="font-mono">{ids.length}</span> selected
                </span>
                {offers("select") && (
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => selectAndResearch(ids))} title="Select them and start their research now, one at a time">
                    Select and research
                  </button>
                )}
                {offers("select") && (
                  <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run(() => selectJobs(ids), removeFromSelected)}>
                    Select only
                  </button>
                )}
                {offers("unarchive") && (
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => unarchiveJobs(ids), archiveJobs)}>
                    Bring back
                  </button>
                )}
                {offers("remove") && (
                  <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run(() => removeFromSelected(ids), selectJobs)}>
                    Remove from selected
                  </button>
                )}
                {offers("rank") && (
                  <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run(() => rankJobs(ids))}>
                    Rank / re-rank
                  </button>
                )}
                {offers("exclude") && (
                  <button type="button" className="btn btn-quiet text-coral" disabled={pending} onClick={() => setExcluding(true)}>
                    Not interested
                  </button>
                )}
                {offers("restore") && (
                  <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run(() => restoreJobs(ids))}>
                    Restore
                  </button>
                )}
                {offers("archive") && (
                  <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => run(() => archiveJobs(ids), unarchiveJobs)}>
                    Archive
                  </button>
                )}
                <a href={`/export?ids=${ids.join(",")}`} className="btn btn-quiet" download>
                  Export
                </a>
                <button type="button" className="ml-auto text-xs text-teal underline" onClick={clear}>
                  Clear selection
                </button>
              </>
            ) : null}
            {result && (
              <p role="status" className={`flex w-full flex-wrap items-center gap-2 text-sm ${result.ok ? "text-go" : "text-coral"}`}>
                {result.message}
                {undo && (
                  <button type="button" disabled={pending} onClick={() => run(undo)} className="font-semibold text-teal underline">
                    Undo
                  </button>
                )}
              </p>
            )}
            {excluding && ids.length > 0 && (
              <div className="w-full max-w-md pt-2">
                <ExcludeForm pending={pending} onSubmit={(reason, asRule) => run(() => excludeJobs(ids, reason, asRule), restoreJobs)} onCancel={() => setExcluding(false)} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
