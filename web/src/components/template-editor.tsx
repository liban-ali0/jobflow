"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { saveTemplateOptions } from "@/app/cv-actions";
import { parseCv } from "@/lib/cv-format";
import { FONTS, renderCv, type CvTemplate, type TemplateOptions } from "@/lib/cv-render";

const SPACING: { value: TemplateOptions["spacing"]; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "airy", label: "Airy" },
];

const PREVIEW_WIDTH = 560;

function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  const id = `range-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label mb-0" htmlFor={id}>
          {label}
        </label>
        <span className="font-mono text-xs text-slate">
          {value}
          {unit}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full accent-teal" />
    </div>
  );
}

// Edits a template's options with a live preview of the user's own CV.
export function TemplateEditor({ template, sample }: { template: CvTemplate; sample: string }) {
  const [name, setName] = useState(template.name);
  const [options, setOptions] = useState(template.options);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [saved, setSaved] = useState(JSON.stringify({ name: template.name, options: template.options }));
  const set = <K extends keyof TemplateOptions>(key: K, value: TemplateOptions[K]) => setOptions((current) => ({ ...current, [key]: value }));

  const doc = useMemo(() => parseCv(sample), [sample]);

  const html = useMemo(() => renderCv(doc, { ...template, name, options }), [doc, template, name, options]);
  const dirty = JSON.stringify({ name, options }) !== saved;
  const scale = PREVIEW_WIDTH / 794;

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <form
        className="settings card h-fit space-y-5 rounded-xl p-5 lg:sticky lg:top-32"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const outcome = await saveTemplateOptions(template.id, { name, options });
            setResult(outcome);
            if (outcome.ok) setSaved(JSON.stringify({ name, options }));
          });
        }}
      >
        <div>
          <label className="label" htmlFor="template-name">
            Name
          </label>
          <input id="template-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="template-font">
            Font
          </label>
          <select id="template-font" value={options.font} onChange={(event) => set("font", event.target.value)} className="field">
            {Object.entries(FONTS).map(([key, font]) => (
              <option key={key} value={key}>
                {font.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="template-accent">
            Accent colour
          </label>
          <div className="flex items-center gap-2">
            <input
              id="template-accent"
              type="color"
              value={options.accent}
              onChange={(event) => set("accent", event.target.value)}
              className="h-10 w-12 cursor-pointer rounded-md border border-field bg-surface p-1"
            />
            <input
              aria-label="Accent colour as hex"
              value={options.accent}
              onChange={(event) => /^#[0-9a-f]{6}$/i.test(event.target.value) && set("accent", event.target.value.toLowerCase())}
              className="field font-mono"
            />
          </div>
        </div>
        <Range label="Text size" value={options.size} min={8} max={13} step={0.25} unit=" pt" onChange={(value) => set("size", value)} />
        <Range label="Page margins" value={options.margin} min={8} max={30} step={1} unit=" mm" onChange={(value) => set("margin", value)} />
        <fieldset>
          <legend className="label">Spacing</legend>
          <div className="inline-flex rounded-md border border-field p-0.5">
            {SPACING.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => set("spacing", item.value)}
                aria-pressed={options.spacing === item.value}
                className="rounded px-3 py-1 text-sm aria-pressed:bg-primary aria-pressed:text-on-primary"
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="submit" disabled={pending || !dirty} className="btn btn-primary">
            {pending ? "Saving…" : "Save template"}
          </button>
          {dirty ? (
            <span className="text-sm">
              <span className="text-coral">*</span> Unsaved
            </span>
          ) : (
            result && (
              <span role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
                {result.message}
              </span>
            )
          )}
        </div>
        {template.builtIn && !template.edited && <p className="text-xs text-slate">Saving keeps a personal copy; the original can be restored with Reset.</p>}
      </form>

      <div className="min-w-0">
        <p className="mb-2 text-xs text-slate">Preview with {doc.name ? `${doc.name}'s CV` : "a sample CV"}. Downloads fit the CV to one page where possible.</p>
        <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm" style={{ width: PREVIEW_WIDTH, height: Math.round(1123 * scale), maxWidth: "100%" }}>
          <iframe srcDoc={html} title="Template preview" className="origin-top-left border-0" style={{ width: 794, height: 1123, transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>
  );
}
