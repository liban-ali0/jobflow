"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

// A button that calls a server action and shows its answer next to itself.
export function ActionButton({
  action,
  children,
  variant = "quiet",
  disabled = false,
  title,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: "primary" | "quiet" | "board";
  disabled?: boolean;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        title={title}
        disabled={disabled || pending}
        className={`btn ${variant === "primary" ? "btn-primary" : variant === "board" ? "btn-board" : "btn-quiet"}`}
        onClick={() => startTransition(async () => setResult(await action()))}
      >
        {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {children}
      </button>
      {result && !(variant === "board" && result.ok) && (
        <span role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
          {result.message}
        </span>
      )}
    </span>
  );
}
