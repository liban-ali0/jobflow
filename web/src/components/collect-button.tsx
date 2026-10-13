"use client";

import { useState, useTransition } from "react";
import { useJobflowExtension } from "./use-extension";

// "Collect in your browser": the extension reads the sites that block
// automated access (Settings → Sources). Shown when the extension is connected.
export function CollectButton({ sites }: { sites: string[] }) {
  const extension = useJobflowExtension();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (extension.state !== "ready" || sites.length === 0) return null;
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        title={`Reads ${sites.join(", ")} in your browser, a few pages at a time`}
        onClick={() =>
          start(async () => {
            const reply = await extension.collect();
            setMessage({ ok: reply.ok, text: reply.message ?? "" });
          })
        }
        className="btn btn-quiet"
      >
        Collect in your browser
      </button>
      {message && (
        <span role="status" className={`max-w-xs text-xs ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </span>
      )}
    </span>
  );
}
