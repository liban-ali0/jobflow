"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// Buttons for plain server-action forms.

// Disabled while its form is being sent, so a double click sends once.
export function PendingSubmit({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {children}
    </button>
  );
}

// For actions that cannot be undone: the first press asks, the second sends.
export function ConfirmSubmit({ label, confirm, className = "" }: { label: string; confirm: string; className?: string }) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={className}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={`${className} text-coral`}>
        {pending ? "Working…" : confirm}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-xs text-slate underline">
        Cancel
      </button>
    </span>
  );
}
