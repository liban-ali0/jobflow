"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { parseCv, parseLetter, sectionKey, serializeCv, type CvDocument, type CvEntry, type CvSection } from "@/lib/cv-format";
import { renderCv, renderLetter, type CvTemplate } from "@/lib/cv-render";
import { checkCv, type AtsTarget } from "@/lib/ats";
import { AtsPanel } from "@/components/ats-panel";

const PREVIEW_WIDTH = 520;
const NEW_SECTIONS = ["Summary", "Experience", "Education", "Projects", "Skills", "Certificates", "Languages", "Awards", "Volunteering"];

// Moves an item one place up or down in a list.
function move<T>(items: T[], index: number, by: -1 | 1) {
  const to = index + by;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function MoveDelete({ index, count, onMove, onDelete, label }: { index: number; count: number; onMove: (by: -1 | 1) => void; onDelete: () => void; label: string }) {
  const button = "grid size-8 place-items-center rounded-md text-slate hover:bg-mist hover:text-ink disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={button} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>
        ▲
      </button>
      <button type="button" className={button} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>
        ▼
      </button>
      <button type="button" className={`${button} text-lg hover:bg-coral-soft hover:text-coral`} onClick={onDelete} aria-label={`Remove ${label}`}>
        ×
      </button>
    </div>
  );
}

function Bullets({ items, onChange, label }: { items: string[]; onChange: (items: string[]) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <span aria-hidden className="pt-2 text-slate">
            •
          </span>
          <textarea
            value={item}
            rows={Math.min(5, Math.max(1, Math.ceil(item.length / 80)))}
            onChange={(event) => onChange(items.map((other, at) => (at === index ? event.target.value.replace(/\n/g, " ") : other)))}
            aria-label={`${label} bullet ${index + 1}`}
            className="field min-h-9 py-1.5 text-sm"
            dir="auto"
          />
          <MoveDelete index={index} count={items.length} label={`bullet ${index + 1}`} onMove={(by) => onChange(move(items, index, by))} onDelete={() => onChange(items.filter((_, at) => at !== index))} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className="text-sm font-medium text-teal hover:underline">
        + Add bullet
      </button>
    </div>
  );
}

function EntryEditor({ entry, onChange }: { entry: CvEntry; onChange: (entry: CvEntry) => void }) {
  const field = (key: "title" | "org" | "place" | "dates", label: string, placeholder: string) => (
    <label className="block text-xs font-medium text-slate">
      {label}
      <input value={entry[key]} placeholder={placeholder} onChange={(event) => onChange({ ...entry, [key]: event.target.value })} className="field mt-1 text-sm" dir="auto" />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {field("title", "Title", "e.g. Backend Developer (part-time)")}
        {field("org", "Organisation", "e.g. Company or school")}
        {field("place", "Place", "e.g. Dubai, UAE")}
        {field("dates", "Dates", "e.g. Feb 2024 - Present")}
      </div>
      <Bullets items={entry.bullets} onChange={(bullets) => onChange({ ...entry, bullets })} label={entry.title || "entry"} />
    </div>
  );
}

// Sections that list jobs, schools, or projects get entries; the rest are
// paragraphs and bullets.
const HAS_ENTRIES = new Set(["experience", "education", "projects", "volunteering", "awards"]);

function SectionEditor({ section, onChange }: { section: CvSection; onChange: (section: CvSection) => void }) {
  const withEntries = section.entries.length > 0 || HAS_ENTRIES.has(section.key);
  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-slate">
        Section title
        <input
          value={section.title}
          onChange={(event) => onChange({ ...section, title: event.target.value, key: sectionKey(event.target.value) })}
          className="field mt-1 text-sm font-semibold"
          dir="auto"
        />
      </label>
      {(section.text.length > 0 || !withEntries) && (
        <label className="block text-xs font-medium text-slate">
          Text
          <textarea
            value={section.text.join("\n\n")}
            rows={Math.max(2, section.text.join(" ").length / 90 + 1)}
            onChange={(event) => onChange({ ...section, text: event.target.value.split(/\n\s*\n/) })}
            className="field mt-1 text-sm"
            dir="auto"
          />
        </label>
      )}
      {(section.bullets.length > 0 || !withEntries) && <Bullets items={section.bullets} onChange={(bullets) => onChange({ ...section, bullets })} label={section.title} />}
      {withEntries && (
        <div className="space-y-3">
          {section.entries.map((entry, index) => (
            <div key={index} className="rounded-lg border border-line bg-mist/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold" dir="auto">
                  {entry.title || "New entry"}
                  {entry.org && <span className="font-normal text-slate"> · {entry.org}</span>}
                </span>
                <MoveDelete
                  index={index}
                  count={section.entries.length}
                  label={entry.title || "entry"}
                  onMove={(by) => onChange({ ...section, entries: move(section.entries, index, by) })}
                  onDelete={() => onChange({ ...section, entries: section.entries.filter((_, at) => at !== index) })}
                />
              </div>
              <EntryEditor entry={entry} onChange={(next) => onChange({ ...section, entries: section.entries.map((other, at) => (at === index ? next : other)) })} />
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...section, entries: [...section.entries, { title: "", org: "", place: "", dates: "", bullets: [""], text: [] }] })}
            className="text-sm font-medium text-teal hover:underline"
          >
            + Add entry
          </button>
        </div>
      )}
    </div>
  );
}

function CvForm({ doc, onChange }: { doc: CvDocument; onChange: (doc: CvDocument) => void }) {
  const missing = NEW_SECTIONS.filter((title) => !doc.sections.some((section) => section.key === sectionKey(title)));
  return (
    <div className="space-y-4">
      <div className="card space-y-3 rounded-xl p-4">
        <h3 className="font-display text-base font-semibold tracking-wide uppercase">Header</h3>
        <label className="block text-xs font-medium text-slate">
          Name
          <input value={doc.name} onChange={(event) => onChange({ ...doc, name: event.target.value })} className="field mt-1 text-sm" dir="auto" />
        </label>
        <label className="block text-xs font-medium text-slate">
          Headline
          <input value={doc.headline} placeholder="e.g. Backend Developer · Java, Spring Boot" onChange={(event) => onChange({ ...doc, headline: event.target.value })} className="field mt-1 text-sm" dir="auto" />
        </label>
        <label className="block text-xs font-medium text-slate">
          Contact, separated by |
          <input
            value={doc.contact.join(" | ")}
            onChange={(event) => onChange({ ...doc, contact: event.target.value.split("|").map((item) => item.trimStart()) })}
            className="field mt-1 text-sm"
          />
        </label>
      </div>
      {doc.sections.map((section, index) => (
        <div key={index} className="card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold tracking-wide uppercase" dir="auto">
              {section.title || "New section"}
            </h3>
            <MoveDelete
              index={index}
              count={doc.sections.length}
              label={section.title || "section"}
              onMove={(by) => onChange({ ...doc, sections: move(doc.sections, index, by) })}
              onDelete={() => onChange({ ...doc, sections: doc.sections.filter((_, at) => at !== index) })}
            />
          </div>
          <SectionEditor section={section} onChange={(next) => onChange({ ...doc, sections: doc.sections.map((other, at) => (at === index ? next : other)) })} />
        </div>
      ))}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate">Add a section:</span>
          {missing.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => onChange({ ...doc, sections: [...doc.sections, { title, key: sectionKey(title), entries: [], bullets: [], text: [] }] })}
              className="chip"
            >
              + {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Edits a CV (as a form or as text) or a cover letter (as text), with a live
// preview in its template.
export function CvEditor({
  kind,
  initial,
  templates,
  initialTemplate,
  save,
  pdfHref,
  backHref,
  backLabel,
  target = { text: "", keywords: [] },
  keywordSource = "the keywords",
  improve,
}: {
  kind: "cv" | "cover_letter";
  initial: string;
  templates: CvTemplate[];
  initialTemplate: string;
  save: (markdown: string, templateId: string) => Promise<ActionResult>;
  pdfHref: string;
  backHref: string;
  backLabel: string;
  // What the ATS score checks the CV against: the job's listing or the role.
  target?: AtsTarget;
  keywordSource?: string;
  // "Fix with AI" for this CV, and whether it is running now.
  improve?: { target: string; running: boolean };
}) {
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [savedTemplate, setSavedTemplate] = useState(initialTemplate);
  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const [mode, setMode] = useState<"form" | "text">(kind === "cv" ? "form" : "text");
  const [doc, setDoc] = useState(() => parseCv(initial));
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  // The form and the text stay in step: whichever is being edited is the source.
  const markdown = mode === "form" ? serializeCv(doc) : text;
  const dirty = markdown.trim() !== saved.trim() || templateId !== savedTemplate;
  const html = useMemo(
    () => (kind === "cv" ? renderCv(parseCv(markdown), template) : renderLetter(parseLetter(markdown), template)),
    [kind, markdown, template],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // "+" on a missing keyword: adds it to an "Other skills" line in Skills,
  // where it can be moved or reworded.
  const addKeyword = (term: string) => {
    const add = (current: CvDocument): CvDocument => {
      const sections = [...current.sections];
      let at = sections.findIndex((section) => /skill/.test(section.key));
      if (at < 0) {
        sections.push({ title: "Skills", key: "skills", entries: [], bullets: [], text: [] });
        at = sections.length - 1;
      }
      const bullets = [...sections[at].bullets];
      const line = bullets.findIndex((bullet) => /^(\*\*)?other skills:?(\*\*)?/i.test(bullet));
      if (line >= 0) bullets[line] = `${bullets[line].replace(/[\s,]+$/, "")}, ${term}`;
      else bullets.push(`Other skills: ${term}`);
      sections[at] = { ...sections[at], bullets };
      return { ...current, sections };
    };
    if (mode === "form") setDoc(add(doc));
    else setText(serializeCv(add(parseCv(text))));
  };

  const switchTo = (next: "form" | "text") => {
    if (next === mode) return;
    if (next === "text") setText(serializeCv(doc));
    else setDoc(parseCv(text));
    setMode(next);
  };
  const scale = PREVIEW_WIDTH / 794;
  const ats = useMemo(() => (kind === "cv" ? checkCv(markdown, target) : null), [kind, markdown, target]);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-4">
        <div className="sticky top-28 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
          {kind === "cv" && (
            <div className="inline-flex rounded-md border border-field p-0.5" role="group" aria-label="Edit as">
              {(["form", "text"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={mode === item} onClick={() => switchTo(item)} className="rounded px-3 py-1 text-sm aria-pressed:bg-primary aria-pressed:text-on-primary">
                  {item === "form" ? "Form" : "Text"}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const outcome = await save(markdown, templateId);
                setResult(outcome);
                if (outcome.ok) {
                  setSaved(markdown);
                  setSavedTemplate(templateId);
                }
              })
            }
            className="btn btn-primary"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {dirty ? (
            <span className="text-sm">
              <span className="text-coral">*</span> Unsaved changes
            </span>
          ) : (
            result && (
              <span role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
                {result.message}
              </span>
            )
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate">Template</span>
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="field w-auto py-1.5 text-sm">
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <a
              href={pdfHref}
              aria-disabled={dirty}
              onClick={(event) => dirty && event.preventDefault()}
              title={dirty ? "Save first: the PDF is made from the saved version" : "Download the saved version as PDF"}
              className="btn btn-quiet px-3 py-1.5 text-xs aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            >
              Download PDF
            </a>
            <Link href={backHref} className="text-sm text-slate hover:text-ink">
              {backLabel}
            </Link>
          </div>
        </div>

        {ats && (
          <div className="xl:hidden">
            <AtsPanel
              result={ats}
              source={keywordSource}
              onAddKeyword={addKeyword}
              improve={improve && { ...improve, blocked: dirty ? "Save your changes first, so the AI works on your latest version." : undefined }}
            />
          </div>
        )}

        {mode === "form" ? (
          <CvForm doc={doc} onChange={setDoc} />
        ) : (
          <div className="space-y-2">
            <textarea
              aria-label="Text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={32}
              className="field font-mono text-[13px] leading-relaxed"
              dir="auto"
            />
            <p className="text-xs text-slate">
              {kind === "cv"
                ? "Keep the layout lines (#, ##, ### and the | separators) so the template can lay it out."
                : "Blank lines separate the blocks: header, date, recipient, greeting, each paragraph, and the sign-off."}
            </p>
          </div>
        )}
      </div>

      <div className="hidden xl:block" style={{ width: PREVIEW_WIDTH }}>
        <div className="sticky top-28 max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto pb-4">
          {ats && <AtsPanel
              result={ats}
              source={keywordSource}
              onAddKeyword={addKeyword}
              improve={improve && { ...improve, blocked: dirty ? "Save your changes first, so the AI works on your latest version." : undefined }}
            />}
          <p className="mb-2 text-xs text-slate">Live preview · {template.name} template</p>
          <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm" style={{ width: PREVIEW_WIDTH, height: Math.round(1123 * scale) }}>
            <iframe srcDoc={html} title="Preview" className="origin-top-left border-0" style={{ width: 794, height: 1123, transform: `scale(${scale})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
