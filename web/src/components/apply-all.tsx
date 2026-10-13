"use client";

import { useState, useTransition } from "react";
import { useJobflowExtension } from "./use-extension";

// "Apply to all": the extension opens each ready job's form in turn, filled.
// Shown only when the extension is installed and connected.
export function ApplyAllButton({ jobIds }: { jobIds: number[] }) {
  const extension = useJobflowExtension();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (extension.state !== "ready" || jobIds.length === 0) return null;
  return (
    <span className="ml-auto flex items-baseline gap-2">
      {message && (
        <span role="status" className={`text-xs ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const reply = await extension.apply(jobIds);
            setMessage({ ok: reply.ok, text: reply.message ?? "" });
          })
        }
        className="btn btn-primary px-3 py-1.5 text-sm"
      >
        {jobIds.length === 1 ? "Open and fill its form" : `Apply to all ${jobIds.length}, one by one`}
      </button>
    </span>
  );
}
