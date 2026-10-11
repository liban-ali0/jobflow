"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/actions";

// One large text field saved by a server action, with the result shown
// next to the button.
export function TextForm({
  action,
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  rows,
  button,
  bare = false,
}: {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  placeholder?: string;
  rows: number;
  button: string;
  // Without its own card, for use inside another card.
  bare?: boolean;
}) {
  const [result, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={bare ? "" : "card p-5"}>
      <label className="card-title" htmlFor={name}>
        {label}
      </label>
      <p className="mt-1 mb-3 text-sm text-slate">{hint}</p>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field font-mono text-[13px] leading-relaxed"
        dir="auto"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {button}
        </button>
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-teal" : "text-coral"}`}>
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
