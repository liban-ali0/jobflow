"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { checkListingNow, keepListing, setAsideClosed } from "@/app/job-actions";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>) => start(async () => setResult(await action()));
  return { pending, result, run };
}

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
      {result.message}
    </p>
  );
}

// On the job page when the listing has closed: before applying, the user can
// set the job aside or say it is still open; after applying it is only news.
export function ListingNotice({ jobId, reason, checked, beforeApplying }: { jobId: number; reason: string | null; checked: string | null; beforeApplying: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div className={`card space-y-2 rounded-xl p-4 ${beforeApplying ? "border-coral" : ""}`}>
      <p className="font-medium">{beforeApplying ? "This listing has closed" : "The listing has closed since you applied"}</p>
      <p className="text-sm text-slate">
        {reason}
        {checked && ` Checked ${checked}.`}
        {!beforeApplying && " It usually means they stopped taking applications; it is not a rejection."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {beforeApplying && (
          <button type="button" disabled={pending} onClick={() => run(() => setAsideClosed([jobId]))} className="btn btn-primary px-3 py-1.5 text-xs">
            Move to Excluded
          </button>
        )}
        {beforeApplying && (
          <button type="button" disabled={pending} onClick={() => run(() => keepListing(jobId))} className="btn btn-quiet px-3 py-1.5 text-xs">
            It is still open
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => checkListingNow(jobId))} className="btn btn-quiet px-3 py-1.5 text-xs">
          {pending ? "Checking…" : "Check again"}
        </button>
      </div>
      <Result result={result} />
    </div>
  );
}

// The listing's last check, in the job page's details, with "Check now".
export function ListingStatus({ jobId, label, checkable }: { jobId: number; label: string; checkable: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <span className="block space-y-1">
      <span className="block">{label}</span>
      {checkable && (
        <button type="button" disabled={pending} onClick={() => run(() => checkListingNow(jobId))} className="text-xs text-teal underline disabled:opacity-60">
          {pending ? "Checking…" : "Check now"}
        </button>
      )}
      <Result result={result} />
    </span>
  );
}
