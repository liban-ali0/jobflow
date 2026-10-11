"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { parseCv, parseLetter, replaceLine, sectionKey, serializeCv, type CvDocument, type CvEntry, type CvSection } from "@/lib/cv-format";
import { renderCv, renderLetter, type CvTemplate } from "@/lib/cv-render";
import { checkCv, type AtsTarget } from "@/lib/ats";
import { AtsPanel, type KeywordState } from "@/components/ats-panel";
import { PdfViewer } from "@/components/pdf-viewer";
import { weaveKeyword, weaveResult } from "@/app/ats-actions";

const PREVIEW_WIDTH = 520;
const NEW_SECTIONS = ["Summary", "Experience", "Education", "Projects", "Skills", "Certificates", "Languages", "Awards", "Volunteering"];
// Sections that list jobs, schools, or projects get entries; the rest are
// paragraphs and bullets.
const HAS_ENTRIES = new Set(["experience", "education", "projects", "volunteering", "awards"]);
// Where each part of the form starts, for the "Go to" links.
const partId = (index: number | "header") => `cv-part-${index}`;

const REVIEW = {
  draft: { label: "Waiting for review", chip: "bg-teal-soft text-teal" },
  approved: { label: "Approved", chip: "bg-go-soft text-go" },
  changes_requested: { label: "Changes requested", chip: "bg-coral-soft text-coral" },
} as const;

const band = (score: number) => (score >= 75 ? "Strong" : score >= 60 ? "Fair" : "Weak");
const bandColour = (score: number) => (score >= 75 ? "var(--go)" : score >= 60 ? "var(--link)" : "var(--stop)");

// What the document is, shown on the pass at the top.
export type EditorHeading = {
  code?: string;
  kind: string;
  title: string;
  subtitle?: string;
  note: string;
  review?: keyof typeof REVIEW;
};

// Moves an item one place up or down in a list.
function move<T>(items: T[], index: number, by: -1 | 1) {
  const to = index + by;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// Up, down, and remove. "quiet" ones only show on hover or focus (and always
// on touch screens), so long lists of bullets stay calm.
function MoveDelete({
  index,
  count,
  onMove,
  onDelete,
  label,
  quiet = false,
}: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  label: string;
  quiet?: boolean;
}) {
  const button = "grid size-8 place-items-center rounded-md text-xs text-slate hover:bg-mist hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <div
      className={`flex shrink-0 items-center ${quiet ? "opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100" : ""}`}
    >
      <button type="button" className={button} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>
        ▲
      </button>
      <button type="button" className={button} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>
        ▼
      </button>
      <button type="button" className={`${button} text-base hover:bg-coral-soft hover:text-coral`} onClick={onDelete} aria-label={`Remove ${label}`}>
        ×
      </button>
    </div>
  );
}

function AddLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded text-sm font-medium text-teal hover:underline">
      + {children}
    </button>
  );
}

function Bullets({ items, onChange, label }: { items: string[]; onChange: (items: string[]) => void; label: string }) {
  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={index} className="group flex items-start gap-2">
          <span aria-hidden className="mt-[0.95rem] size-1.5 shrink-0 rounded-full bg-slate/60" />
          <textarea
            value={item}
            rows={1}
            onChange={(event) => onChange(items.map((other, at) => (at === index ? event.target.value.replace(/\n/g, " ") : other)))}
            aria-label={`${label} bullet ${index + 1}`}
            className="field min-h-9 resize-none py-1.5 leading-relaxed field-sizing-content"
            dir="auto"
          />
          <MoveDelete
            quiet
            index={index}
            count={items.length}
            label={`bullet ${index + 1}`}
            onMove={(by) => onChange(move(items, index, by))}
            onDelete={() => onChange(items.filter((_, at) => at !== index))}
          />
        </div>
      ))}
      <div className="pt-1 pl-3.5">
        <AddLink onClick={() => onChange([...items, ""])}>Add bullet</AddLink>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, onChange, wide = false }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <label className={`block text-xs font-medium text-slate ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="field mt-1" dir="auto" />
    </label>
  );
}

function EntryEditor({ entry, onChange }: { entry: CvEntry; onChange: (entry: CvEntry) => void }) {
  const set = (key: "title" | "org" | "place" | "dates") => (value: string) => onChange({ ...entry, [key]: value });
  return (
    <div className="space-y-3">
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
        <Field label="Title" value={entry.title} placeholder="e.g. Backend Developer (part-time)" onChange={set("title")} />
        <Field label="Organisation" value={entry.org} placeholder="e.g. Company or school" onChange={set("org")} />
        <Field label="Place" value={entry.place} placeholder="e.g. Dubai, UAE" onChange={set("place")} />
        <Field label="Dates" value={entry.dates} placeholder="e.g. Feb 2024 - Present" onChange={set("dates")} />
      </div>
      <Bullets items={entry.bullets} onChange={(bullets) => onChange({ ...entry, bullets })} label={entry.title || "entry"} />
    </div>
  );
}

// One part of the CV: its title is edited in place, in the heading.
function Part({
  id,
  number,
  title,
  onTitle,
  controls,
  children,
}: {
  id: string;
  number: number;
  title: string;
  onTitle?: (title: string) => void;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-60 overflow-hidden rounded-xl shadow-sm">
      <header className="flex items-center gap-3 border-b border-line/70 py-2.5 pr-3 pl-5">
        <span aria-hidden className="font-mono text-[11px] tracking-widest text-slate">
          {String(number).padStart(2, "0")}
        </span>
        {onTitle ? (
          <input
            value={title}
            placeholder="Section title"
            onChange={(event) => onTitle(event.target.value)}
            aria-label="Section title"
            title="Rename this section"
            className="-mx-1.5 min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 font-display text-lg font-semibold tracking-wide uppercase placeholder:text-slate hover:bg-mist focus:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            dir="auto"
          />
        ) : (
          <h3 className="flex-1 py-1 font-display text-lg font-semibold tracking-wide uppercase">{title}</h3>
        )}
        {controls}
      </header>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
  );
}

function SectionBody({ section, onChange }: { section: CvSection; onChange: (section: CvSection) => void }) {
  const withEntries = section.entries.length > 0 || HAS_ENTRIES.has(section.key);
  // A paragraph box only when there is text, or nothing else to hold the content.
  const showText = section.text.length > 0 || (!withEntries && section.bullets.length === 0);
  const showBullets = section.bullets.length > 0 || !withEntries;
  return (
    <>
      {showText && (
        <textarea
          value={section.text.join("\n\n")}
          rows={2}
          onChange={(event) => onChange({ ...section, text: event.target.value.split(/\n\s*\n/) })}
          aria-label={`${section.title} text`}
          placeholder="A short paragraph."
          className="field min-h-16 leading-relaxed field-sizing-content"
          dir="auto"
        />
      )}
      {showBullets && <Bullets items={section.bullets} onChange={(bullets) => onChange({ ...section, bullets })} label={section.title} />}
      {!showText && !withEntries && <AddLink onClick={() => onChange({ ...section, text: [""] })}>Add paragraph</AddLink>}
      {withEntries && (
        <div>
          <ol className="divide-y divide-line/70">
            {section.entries.map((entry, index) => (
              <li key={index} className="py-4 first:pt-0">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm" dir="auto">
                    <span className="font-semibold">{entry.title || "New entry"}</span>
                    {entry.org && <span className="text-slate"> · {entry.org}</span>}
                  </p>
                  <MoveDelete
                    index={index}
                    count={section.entries.length}
                    label={entry.title || "entry"}
                    onMove={(by) => onChange({ ...section, entries: move(section.entries, index, by) })}
                    onDelete={() => onChange({ ...section, entries: section.entries.filter((_, at) => at !== index) })}
                  />
                </div>
                <EntryEditor entry={entry} onChange={(next) => onChange({ ...section, entries: section.entries.map((other, at) => (at === index ? next : other)) })} />
              </li>
            ))}
          </ol>
          <div className="border-t border-line/70 pt-3">
            <AddLink onClick={() => onChange({ ...section, entries: [...section.entries, { title: "", org: "", place: "", dates: "", bullets: [""], text: [] }] })}>
              Add entry
            </AddLink>
          </div>
        </div>
      )}
    </>
  );
}

function CvForm({ doc, onChange }: { doc: CvDocument; onChange: (doc: CvDocument) => void }) {
  const missing = NEW_SECTIONS.filter((title) => !doc.sections.some((section) => section.key === sectionKey(title)));
  return (
    <div className="space-y-5">
      <Part id={partId("header")} number={1} title="Header">
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
          <Field label="Name" value={doc.name} onChange={(name) => onChange({ ...doc, name })} />
          <Field label="Headline" value={doc.headline} placeholder="e.g. Backend Developer · Java, Spring Boot" onChange={(headline) => onChange({ ...doc, headline })} wide />
          <label className="block text-xs font-medium text-slate sm:col-span-2">
            Contact <span className="font-normal">· separate each with |</span>
            <input
              value={doc.contact.join(" | ")}
              onChange={(event) => onChange({ ...doc, contact: event.target.value.split("|").map((item) => item.trimStart()) })}
              className="field mt-1"
            />
          </label>
        </div>
      </Part>
      {doc.sections.map((section, index) => {
        const change = (next: CvSection) => onChange({ ...doc, sections: doc.sections.map((other, at) => (at === index ? next : other)) });
        return (
          <Part
            key={index}
            id={partId(index)}
            number={index + 2}
            title={section.title}
            onTitle={(title) => change({ ...section, title, key: sectionKey(title) })}
            controls={
              <MoveDelete
                index={index}
                count={doc.sections.length}
                label={section.title || "section"}
                onMove={(by) => onChange({ ...doc, sections: move(doc.sections, index, by) })}
                onDelete={() => onChange({ ...doc, sections: doc.sections.filter((_, at) => at !== index) })}
              />
            }
          >
            <SectionBody section={section} onChange={change} />
          </Part>
        );
      })}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-field px-5 py-4">
          <span className="mr-1 text-sm text-slate">Add a section</span>
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

// The top of the page, drawn like the job's boarding pass: what this document
// is on the pass, and how it scores right now on the stub.
function Pass({ heading, stub }: { heading: EditorHeading; stub: React.ReactNode }) {
  return (
    <section aria-label="Document" className="relative grid overflow-hidden rounded-xl border border-chrome-line bg-chrome text-chrome-text shadow-md md:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 px-6 pt-5 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.2em] text-chrome-dim uppercase">
            {heading.code ? `${heading.code} · ${heading.kind}` : heading.kind}
          </span>
          {heading.review && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${REVIEW[heading.review].chip}`}>{REVIEW[heading.review].label}</span>}
        </div>
        <h1 className="mt-2.5 font-display text-3xl leading-tight font-semibold tracking-tight uppercase md:text-4xl" dir="auto">
          {heading.title}
          {heading.subtitle && <span className="text-chrome-dim"> · {heading.subtitle}</span>}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-chrome-dim">{heading.note}</p>
      </div>
      <div className="relative flex items-center gap-4 border-t-2 border-dashed border-chrome-line px-6 py-4 md:flex-col md:items-start md:justify-center md:border-t-0 md:border-l-2">
        <span aria-hidden className="absolute -top-2.5 -left-2.5 hidden size-5 rounded-full border border-chrome-line bg-mist md:block" />
        <span aria-hidden className="absolute -bottom-2.5 -left-2.5 hidden size-5 rounded-full border border-chrome-line bg-mist md:block" />
        {stub}
      </div>
    </section>
  );
}

// Edits a CV (as a form or as text) or a cover letter (as text), with a live
// preview in its template.
export function CvEditor({
  kind,
  heading,
  initial,
  templates,
  initialTemplate,
  save,
  pdfSrc,
  target = { text: "", keywords: [] },
  keywordSource = "the keywords",
  improve,
}: {
  kind: "cv" | "cover_letter";
  heading: EditorHeading;
  initial: string;
  templates: CvTemplate[];
  initialTemplate: string;
  save: (markdown: string, templateId: string) => Promise<ActionResult>;
  // The saved document; "?format=pdf" is added for the PDF.
  pdfSrc: string;
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
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [doc, setDoc] = useState(() => parseCv(initial));
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [side, setSide] = useState<"preview" | "ats">("preview");
  const [viewing, setViewing] = useState(false);

  // The form and the text stay in step: whichever is being edited is the source.
  const markdown = mode === "form" ? serializeCv(doc) : text;
  // A CV is compared in the form's own layout, so a file written by hand or by
  // the engine does not count as changed just by opening it.
  const same = (a: string, b: string) => (kind === "cv" ? serializeCv(parseCv(a)).trim() === serializeCv(parseCv(b)).trim() : a.trim() === b.trim());
  const dirty = !same(markdown, saved) || templateId !== savedTemplate;
  // The latest text, for requests that run after a wait (see weave).
  const markdownRef = useRef(markdown);
  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);
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
    setKeywordState((current) => ({ ...current, [term]: { state: "added", note: "added to Skills, on the “Other skills” line." } }));
  };

  // "Work it into my experience": the engine proposes one changed line, which
  // replaces the original in the unsaved CV so the preview shows it.
  const [keywordState, setKeywordState] = useState<Record<string, KeywordState>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const setState = (term: string, value: KeywordState) => {
    if (mounted.current) setKeywordState((current) => ({ ...current, [term]: value }));
  };

  // Keywords clicked while one is being worked in wait their turn.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const weave = (term: string, confirmed?: { evidence: string }) => {
    if (!improve) return;
    setState(term, { state: "working" });
    queue.current = queue.current.then(() => weaveOne(term, confirmed));
  };

  const weaveOne = async (term: string, confirmed?: { evidence: string }) => {
    if (!improve) return;
    // The CV as it is now, not as it was when the keyword was clicked.
    const started = await weaveKeyword(improve.target, markdownRef.current, term, confirmed);
    if (!started.ok || !started.id) return setState(term, { state: "failed", note: started.message });
    let result = await weaveResult(improve.target, started.id);
    while (result.status === "working" && mounted.current) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      result = await weaveResult(improve.target, started.id);
    }
    if (result.status === "added") {
      // Applied to the CV as it is now (the latest text), in the user's mode.
      const current = parseCv(markdownRef.current);
      const next = replaceLine(current, result.before, result.after);
      const applied = next !== current;
      if (applied) {
        if (modeRef.current === "form") setDoc(next);
        else setText(serializeCv(next));
      }
      setState(
        term,
        applied
          ? { state: "added", note: `worked into ${result.where || "your experience"} (not saved yet). ${result.reason}` }
          : { state: "failed", note: `the line changed while it was working. Suggested wording: “${result.after}”` },
      );
    } else if (result.status === "not-supported") {
      setState(term, { state: "skipped", note: `not added. ${result.reason}` });
    } else if (result.status === "failed") {
      setState(term, { state: "failed", note: result.reason });
    }
  };

  const onKeyword = (term: string, how: "skills" | "weave" | "confirm", evidence = "") =>
    how === "skills" ? addKeyword(term) : weave(term, how === "confirm" ? { evidence } : undefined);

  const switchTo = (next: "form" | "text") => {
    if (next === mode) return;
    if (next === "text") setText(serializeCv(doc));
    else setDoc(parseCv(text));
    setMode(next);
  };
  const onSave = () =>
    start(async () => {
      const outcome = await save(markdown, templateId);
      setResult(outcome);
      if (outcome.ok) {
        setSaved(markdown);
        setSavedTemplate(templateId);
      }
    });
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const scale = PREVIEW_WIDTH / 794;
  const ats = useMemo(() => (kind === "cv" ? checkCv(markdown, target) : null), [kind, markdown, target]);
  const words = useMemo(
    () => (kind === "cover_letter" ? parseLetter(markdown).blocks.flat().join(" ").split(/\s+/).filter(Boolean).length : 0),
    [kind, markdown],
  );
  const atsPanel = ats && (
    <AtsPanel
      result={ats}
      source={keywordSource}
      onKeyword={onKeyword}
      keywordState={keywordState}
      improve={improve && { ...improve, blocked: dirty ? "Save your changes first, so the AI works on your latest version." : undefined }}
      flat
    />
  );
  const pdfButton = (className = "") => (
    <button
      type="button"
      disabled={dirty}
      onClick={() => setViewing(true)}
      title={dirty ? "Save first: the PDF is made from the saved version" : "The saved version, exactly as the recruiter receives it"}
      className={`btn btn-quiet px-3 py-1.5 text-xs ${className}`}
    >
      View as PDF
    </button>
  );

  return (
    <div className="space-y-5">
      <Pass
        heading={heading}
        stub={
          ats ? (
            <>
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">ATS score</p>
                <p className="font-display leading-none font-bold">
                  <span className="text-5xl tabular-nums">{ats.score}</span>
                  <span className="ml-1 text-base text-chrome-dim">/100</span>
                </p>
              </div>
              <div>
                <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-wide uppercase">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: bandColour(ats.score) }} />
                  {band(ats.score)}
                </p>
                <p className="text-xs text-chrome-dim">{dirty ? "Live, with your unsaved changes" : "As saved"}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-chrome-dim uppercase">Length</p>
              <p className="font-display leading-none font-bold">
                <span className="text-5xl tabular-nums">{words}</span>
                <span className="ml-1 text-base text-chrome-dim">words</span>
              </p>
              <p className="mt-1.5 text-xs text-chrome-dim">{words > 400 ? "Long: most letters land at 250 to 400" : words < 150 ? "Short: most letters land at 250 to 400" : "A good length"}</p>
            </div>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-5">
          {/* The toolbar stays in view: how to edit, the template, and Save. */}
          <div className="sticky top-28 z-10 rounded-xl border border-line bg-surface/95 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              {kind === "cv" && (
                <div className="inline-flex rounded-md border border-field p-0.5" role="group" aria-label="Edit as">
                  {(["form", "text"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={mode === item}
                      onClick={() => switchTo(item)}
                      className="rounded px-3 py-1 text-sm hover:bg-mist aria-pressed:bg-primary aria-pressed:text-on-primary"
                    >
                      {item === "form" ? "Form" : "Text"}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate">Template</span>
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="field w-auto py-1.5">
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {pdfButton("xl:hidden")}
              <div className="ml-auto flex items-center gap-3">
                {dirty ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden className="size-2 rounded-full bg-coral" />
                    Unsaved
                  </span>
                ) : (
                  result && (
                    <span role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
                      {result.message}
                    </span>
                  )
                )}
                <button type="button" disabled={pending || !dirty} onClick={onSave} className="btn btn-primary min-w-24">
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {mode === "form" && (
              <nav aria-label="Go to section" className="flex gap-1 overflow-x-auto border-t border-line/70 px-3 py-1.5">
                {[{ id: partId("header"), title: "Header" }, ...doc.sections.map((section, index) => ({ id: partId(index), title: section.title || "New section" }))].map(
                  (part, index) => (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => jump(part.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap text-slate hover:bg-mist hover:text-ink"
                    >
                      <span className="mr-1 font-mono text-[10px]">{String(index + 1).padStart(2, "0")}</span>
                      {part.title}
                    </button>
                  ),
                )}
              </nav>
            )}
          </div>

          {atsPanel && <div className="xl:hidden">{atsPanel}</div>}

          {mode === "form" ? (
            <CvForm doc={doc} onChange={setDoc} />
          ) : (
            <div className="card space-y-2 rounded-xl p-4 shadow-sm">
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

        {/* Beside the form: the page as it will look, or the ATS check. */}
        <div className="hidden xl:block" style={{ width: PREVIEW_WIDTH }}>
          <div className="sticky top-28 flex max-h-[calc(100dvh-8rem)] flex-col">
            <div className="mb-3 flex items-center gap-2">
              {ats ? (
                <div role="tablist" aria-label="Beside the form" className="inline-flex rounded-md border border-field bg-surface p-0.5">
                  {(
                    [
                      ["preview", "Preview"],
                      ["ats", `ATS check · ${ats.score}`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={side === key}
                      onClick={() => setSide(key)}
                      className="rounded px-3 py-1 text-sm hover:bg-mist aria-selected:bg-primary aria-selected:text-on-primary"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium">Preview</p>
              )}
              <div className="ml-auto">{pdfButton()}</div>
            </div>
            <div className="min-h-0 overflow-y-auto pb-4" role={ats ? "tabpanel" : undefined}>
              {side === "ats" && atsPanel ? (
                atsPanel
              ) : (
                <>
                  <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm" style={{ width: PREVIEW_WIDTH, height: Math.round(1123 * scale) }}>
                    <iframe srcDoc={html} title="Preview" className="origin-top-left border-0" style={{ width: 794, height: 1123, transform: `scale(${scale})` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    {template.name} template · {dirty ? "showing your unsaved changes" : "as saved"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <PdfViewer open={viewing} onClose={() => setViewing(false)} src={pdfSrc} title={heading.kind} />
    </div>
  );
}
