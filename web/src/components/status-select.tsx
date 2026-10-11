"use client";

import { useState, useTransition } from "react";
import { setStatus, type ActionResult } from "@/app/actions";
import { STATUS_LABELS, type Status } from "@/lib/types";

export function StatusSelect({ jobId, status }: { jobId: number; status: Status }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div>
      <label className="label" htmlFor="status">
        Status
      </label>
      <select
        id="status"
        className="field"
        value={status}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => setResult(await setStatus(jobId, next)));
        }}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {result && !result.ok && (
        <p role="status" className="mt-1 text-xs text-coral">
          {result.message}
        </p>
      )}
    </div>
  );
}
