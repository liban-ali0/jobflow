"use client";

import { useTransition } from "react";
import { stopStep } from "@/app/actions";

// Stops a running step; the page refreshes when it has ended.
export function StopButton({ runId, className = "" }: { runId: number; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        start(async () => {
          await stopStep(runId);
        });
      }}
      className={`btn btn-quiet px-3 py-1 text-xs text-coral ${className}`}
    >
      {pending ? "Stopping…" : "Stop"}
    </button>
  );
}
