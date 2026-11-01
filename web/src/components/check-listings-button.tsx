"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { runStage } from "@/app/actions";
import { useJobflowExtension } from "@/components/use-extension";

// "Check listings": Offerbound checks most listings itself; with the
// extension, the Indeed ones are checked in this browser at the same time.
export function CheckListingsButton({ ownReady }: { ownReady: boolean }) {
  const extension = useJobflowExtension();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={(!ownReady && extension.state !== "ready") || pending}
        title="Checks whether your saved jobs' listings still take applications (also part of the daily run). With the extension, Indeed listings are checked in this browser."
        className="btn btn-quiet"
        onClick={() =>
          start(async () => {
            const own = ownReady ? await runStage("check-open", null) : null;
            const browser = extension.state === "ready" ? await extension.checkListings() : null;
            setResult({
              ok: Boolean(own?.ok || browser?.ok),
              message: [own ? (own.ok ? "Checking listings; results show on Activity." : own.message) : null, browser?.message ?? null].filter(Boolean).join(" "),
            });
          })
        }
      >
        {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        Check listings
      </button>
      {result && (
        <span role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </span>
      )}
    </span>
  );
}
