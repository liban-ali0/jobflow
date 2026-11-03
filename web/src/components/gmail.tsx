"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionResult } from "@/app/actions";
import { useJobflowExtension } from "@/components/use-extension";

export type GmailEmail = { jobId: number; kind: "follow_up" | "thank_you" | "application"; url: string; to: string; attach: string[] };

function Note({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-xs ${result.ok ? "text-slate" : "text-coral"}`}>
      {result.message}
    </p>
  );
}

// Opens a written email in Gmail's own compose window, filled in. With the
// extension, pressing Send there is recorded here; without it, the user
// marks it as sent.
export function OpenInGmail({ email, className = "btn btn-quiet px-3 py-1.5 text-xs" }: { email: GmailEmail; className?: string }) {
  const extension = useJobflowExtension();
  const [result, setResult] = useState<ActionResult | null>(null);
  const open = async () => {
    if (extension.state === "ready") {
      const reply = await extension.compose({ jobId: email.jobId, kind: email.kind, url: email.url, to: email.to });
      if (reply.ok) return setResult({ ok: true, message: `${reply.message} Offerbound notes it as sent when you do.` });
    }
    window.open(email.url, "_blank", "noopener");
    setResult({ ok: true, message: "Opened in Gmail. After you press Send there, mark it as sent here." });
  };
  return (
    <>
      <button type="button" onClick={open} className={className}>
        Open in Gmail
      </button>
      {(result || email.attach.length > 0) && (
        <div className="basis-full space-y-0.5">
          {email.attach.length > 0 && <p className="text-xs text-slate">Attach in Gmail: {email.attach.join(", ")}.</p>}
          <Note result={result} />
        </div>
      )}
    </>
  );
}

// Reads new Gmail now through the extension (it also checks every 15 minutes).
export function CheckMailButton({ className = "btn btn-quiet px-3 py-1.5 text-xs" }: { className?: string }) {
  const extension = useJobflowExtension();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const missing = extension.state === "missing" || extension.state === "no-key";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || extension.state === "checking"}
        onClick={async () => {
          if (missing) {
            setResult({ ok: false, message: "Needs the Offerbound extension in this browser, connected in Settings → Sources." });
            return;
          }
          setBusy(true);
          const reply = await extension.checkMail();
          setBusy(false);
          setResult({ ok: reply.ok, message: reply.message ?? (reply.ok ? "Checked." : "Could not check.") });
          router.refresh();
        }}
        className={className}
      >
        {busy ? "Checking Gmail…" : "Check Gmail now"}
      </button>
      <Note result={result} />
    </span>
  );
}
