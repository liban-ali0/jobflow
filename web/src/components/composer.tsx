"use client";

import { useActionState, useRef } from "react";
import type { ActionResult } from "@/app/actions";

// Message box for a conversation. Enter sends, Shift+Enter adds a line.
export function Composer({
  action,
  busy,
}: {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  busy: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [result, formAction, pending] = useActionState(async (state: ActionResult | null, formData: FormData) => {
    const outcome = await action(state, formData);
    if (outcome.ok) form.current?.reset();
    return outcome;
  }, null);
  const disabled = busy || pending;

  return (
    <form ref={form} action={formAction} className="card border-field p-3 focus-within:border-ink focus-within:ring-2 focus-within:ring-teal/30">
      <label htmlFor="message" className="sr-only">
        Message
      </label>
      <textarea
        id="message"
        name="message"
        rows={3}
        placeholder={busy ? "Waiting for the answer…" : "Write a message"}
        disabled={disabled}
        className="w-full resize-y bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate disabled:opacity-60"
        dir="auto"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3 px-2 pt-2">
        <span role="status" className="text-xs text-coral">
          {result && !result.ok ? result.message : ""}
        </span>
        <button type="submit" disabled={disabled} className="btn btn-primary">
          Send
        </button>
      </div>
    </form>
  );
}
