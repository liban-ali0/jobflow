import { inline, type CvDocument, type CvEntry, type LetterDocument } from "./cv-format";

// What a template can change without touching its stylesheet.
export type TemplateOptions = {
  font: string;
  accent: string;
  size: number; // body text, points
  margin: number; // page margin, millimetres
  spacing: "tight" | "normal" | "airy";
  sectionOrder: string[];
};

// builtIn: shipped with Jobflow; edited: a built-in one the user has changed.
export type CvTemplate = { id: string; name: string; description: string; builtIn: boolean; edited?: boolean; options: TemplateOptions; css: string };

// Fonts that exist on Windows and macOS (with close stand-ins), so the PDF
// looks the same on every machine and CV readers can extract the text.
export const FONTS: Record<string, { label: string; stack: string }> = {
  arial: { label: "Arial", stack: "Arial, Helvetica, 'Liberation Sans', sans-serif" },
  calibri: { label: "Calibri", stack: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif" },
  helvetica: { label: "Helvetica", stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  georgia: { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  garamond: { label: "Garamond", stack: "Garamond, 'EB Garamond', 'Times New Roman', serif" },
  times: { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
};

const GAPS = { tight: 7, normal: 11, airy: 15 };

const ARABIC = /[؀-ۿ]/g;
const isRtl = (text: string) => (text.match(ARABIC)?.length ?? 0) > text.replace(/\s/g, "").length * 0.3;

// Shared layout every template builds on; templates restyle it.
const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: var(--cv-font); font-size: var(--cv-size); line-height: 1.38; color: #111827; background: #fff; }
.page { padding: var(--cv-margin); }
@media print { .page { padding: 0; } }
.cv-header h1 { font-size: 2em; line-height: 1.15; }
.cv-headline { margin-top: 2px; }
.cv-contact { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 4px; font-size: 0.92em; color: #374151; }
.cv-contact span + span::before { content: "·"; margin-inline-end: 10px; color: #9ca3af; }
.cv-section { margin-top: var(--cv-gap); break-inside: auto; }
.cv-section h2 { margin-bottom: calc(var(--cv-gap) * 0.45); break-after: avoid; }
.cv-entry { margin-top: calc(var(--cv-gap) * 0.55); break-inside: avoid; }
.cv-entry:first-of-type { margin-top: 0; }
.cv-entry-head { display: flex; flex-wrap: wrap; gap: 0 6px; align-items: baseline; }
.cv-entry-head .cv-entry-dates { margin-inline-start: auto; white-space: nowrap; color: #4b5563; }
.cv-entry-org::before, .cv-entry-place::before { content: "· "; color: #9ca3af; }
.cv-entry-head > span:first-child::before { content: none; }
.cv-entry-place { color: #4b5563; }
ul { margin-top: 2px; padding-inline-start: 1.1em; }
li { margin-top: 1.5px; }
p + p { margin-top: 3px; }
.letter .letter-block { margin-top: calc(var(--cv-gap) * 0.9); }
.letter .letter-block p + p { margin-top: 0; }
.letter .letter-body { line-height: 1.5; }
`;

const escape = (text: string) => inline(text);

function entryHtml(entry: CvEntry) {
  const head = [
    entry.title && `<span class="cv-entry-title">${escape(entry.title)}</span>`,
    entry.org && `<span class="cv-entry-org">${escape(entry.org)}</span>`,
    entry.place && `<span class="cv-entry-place">${escape(entry.place)}</span>`,
    entry.dates && `<span class="cv-entry-dates">${escape(entry.dates)}</span>`,
  ]
    .filter(Boolean)
    .join("");
  return `<div class="cv-entry"><div class="cv-entry-head">${head}</div>${listHtml(entry.bullets)}${entry.text.map((line) => `<p>${escape(line)}</p>`).join("")}</div>`;
}

const listHtml = (items: string[]) => (items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : "");

function variables(options: TemplateOptions) {
  const font = FONTS[options.font] ?? FONTS.arial;
  return `:root { --cv-font: ${font.stack}; --cv-accent: ${options.accent}; --cv-size: ${options.size}pt; --cv-margin: ${options.margin}mm; --cv-gap: ${GAPS[options.spacing] ?? GAPS.normal}pt; }
@page { size: A4; margin: ${options.margin}mm; }`;
}

function page(title: string, body: string, template: CvTemplate, rtl: boolean, extraClass = "") {
  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>${variables(template.options)}${BASE_CSS}${template.css}</style></head>
<body class="${extraClass}"><div class="page">${body}</div></body></html>`;
}

function headerHtml(name: string, headline: string, contact: string[]) {
  return `<header class="cv-header"><h1>${escape(name)}</h1>${headline ? `<p class="cv-headline">${escape(headline)}</p>` : ""}${
    contact.length ? `<p class="cv-contact">${contact.map((item) => `<span>${escape(item)}</span>`).join("")}</p>` : ""
  }</header>`;
}

export function renderCv(doc: CvDocument, template: CvTemplate) {
  const order = template.options.sectionOrder;
  const rank = (key: string) => {
    const at = order.indexOf(key);
    return at < 0 ? order.length : at;
  };
  const sections = [...doc.sections].sort((a, b) => rank(a.key) - rank(b.key));
  const body =
    headerHtml(doc.name, doc.headline, doc.contact) +
    sections
      .map(
        (section) =>
          `<section class="cv-section" data-section="${section.key}"><h2>${escape(section.title)}</h2>${section.text
            .map((line) => `<p>${escape(line)}</p>`)
            .join("")}${listHtml(section.bullets)}${section.entries.map(entryHtml).join("")}</section>`,
      )
      .join("");
  const text = JSON.stringify(doc);
  return page(`${doc.name} - CV`, body, template, isRtl(text), "cv");
}

export function renderLetter(letter: LetterDocument, template: CvTemplate) {
  const blocks = letter.blocks.map((block) => `<div class="letter-block">${block.map((line) => `<p>${escape(line)}</p>`).join("")}</div>`).join("");
  const body = headerHtml(letter.name, "", letter.contact) + `<div class="letter-body">${blocks}</div>`;
  return page(`${letter.name} - Cover letter`, body, template, isRtl(JSON.stringify(letter)), "letter");
}
