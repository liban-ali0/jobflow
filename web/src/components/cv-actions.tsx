"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { designTemplate, duplicateTemplate, removeTemplate, setDefaultTemplate, setRoleTemplate } from "@/app/cv-actions";

// A document page shrunk into a card: an A4 page (794 × 1123 px) scaled to fit.
export function PagePreview({ src, title, width = 220 }: { src: string; title: string; width?: number }) {
  const scale = width / 794;
  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm" style={{ width, height: Math.round(1123 * scale) }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none origin-top-left border-0"
        style={{ width: 794, height: 1123, transform: `scale(${scale})` }}
      />
    </div>
  );
}

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-xs ${result.ok ? "text-go" : "text-coral"}`}>
      {result.message}
    </p>
  );
}

export function TemplateActions({ id, isDefault, builtIn, edited }: { id: string; isDefault: boolean; builtIn: boolean; edited: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  const run = (action: () => Promise<ActionResult & { id?: string }>) =>
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok && outcome.id) router.push(`/cvs/templates/${outcome.id}`);
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {!isDefault && (
          <button type="button" disabled={pending} onClick={() => run(() => setDefaultTemplate(id))} className="btn btn-primary px-3 py-1.5 text-xs">
            Make default
          </button>
        )}
        <Link href={`/cvs/templates/${id}`} className="btn btn-quiet px-3 py-1.5 text-xs">
          Edit
        </Link>
        <button type="button" disabled={pending} onClick={() => run(() => duplicateTemplate(id))} className="btn btn-quiet px-3 py-1.5 text-xs">
          Copy
        </button>
        {(!builtIn || edited) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => removeTemplate(id))}
            className="btn btn-quiet px-3 py-1.5 text-xs text-coral"
            title={edited ? "Undo your changes to this built-in template" : "Delete this template"}
          >
            {edited ? "Reset" : "Delete"}
          </button>
        )}
      </div>
      <Status result={result} />
    </div>
  );
}

export function RoleTemplateSelect({ role, value, options, defaultName }: { role: string; value: string; options: { id: string; name: string }[]; defaultName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <label className="label" htmlFor={`template-${role}`}>
        Template
      </label>
      <select
        id={`template-${role}`}
        defaultValue={value}
        disabled={pending}
        onChange={(event) => start(async () => setResult(await setRoleTemplate(role, event.target.value)))}
        className="field py-1.5 text-sm"
      >
        <option value="">Default ({defaultName})</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <Status result={result} />
    </div>
  );
}

export function DesignTemplateForm() {
  const [result, action, pending] = useActionState(designTemplate, null);
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="design-description">
        Describe a new template
      </label>
      <textarea
        id="design-description"
        name="description"
        rows={3}
        maxLength={1000}
        placeholder="e.g. Like Modern but with a dark green accent, a thin rule under the name, and slightly larger section titles."
        className="field"
        dir="auto"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Starting…" : "Design it"}
        </button>
        <span className="text-xs text-slate">Claude builds it in a minute or two, keeping it readable by CV-reading software.</span>
      </div>
      <Status result={result} />
    </form>
  );
}
