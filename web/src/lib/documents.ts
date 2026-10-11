import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parseCv, parseLetter } from "./cv-format";
import { renderCv, renderLetter, type CvTemplate } from "./cv-render";
import { ROOT, getDocument, getJob, getSettings } from "./data";
import { templateFor } from "./templates";

// Documents that are laid out with a template and can become PDFs.
export const PRINTABLE = new Set(["cv", "cover_letter"]);

const inside = (relative: string) => {
  const full = path.resolve(ROOT, relative);
  // Only files inside the project's private folders can be read this way.
  const allowed = [path.join(ROOT, "jobs"), path.join(ROOT, "candidate")].some((dir) => full.startsWith(dir + path.sep));
  return allowed ? full : null;
};

export function readText(relative: string) {
  const full = inside(relative);
  return full && fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

export function writeText(relative: string, text: string) {
  const full = inside(relative);
  if (!full) throw new Error("This file cannot be edited here.");
  fs.writeFileSync(full, text.endsWith("\n") ? text : `${text}\n`);
}

export const baseCvPath = (roleKey: string) => `candidate/base-cv-${roleKey}.md`;

export function renderMarkdown(type: string, markdown: string, template: CvTemplate) {
  return type === "cover_letter" ? renderLetter(parseLetter(markdown), template) : renderCv(parseCv(markdown), template);
}

const fileSafe = (text: string) => text.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

// A job document as a page and a download name, in its job's template.
export function jobDocumentPage(id: number, templateId?: string | null) {
  const document = getDocument(id);
  if (!document || !PRINTABLE.has(document.type)) return null;
  const job = getJob(document.job_id);
  const markdown = readText(document.path);
  if (!job || markdown === null) return null;
  const template = templateFor(job.role, templateId ?? getSettings().cvTemplates?.byJob?.[String(job.id)]);
  const html = renderMarkdown(document.type, markdown, template);
  const name = parseCv(markdown).name || "CV";
  const label = document.type === "cv" ? "CV" : "Cover letter";
  return { html, fileName: `${fileSafe(`${name} - ${label} - ${job.company}`)}.pdf`, fitOnePage: document.type === "cv" };
}

// A base CV (one per role in Settings) as a page and a download name.
export function baseCvPage(roleKey: string, templateId?: string | null) {
  const role = getSettings().roles.find((item) => item.key === roleKey);
  if (!role) return null;
  const markdown = readText(baseCvPath(roleKey));
  if (markdown === null) return null;
  const html = renderMarkdown("cv", markdown, templateFor(roleKey, templateId));
  const name = parseCv(markdown).name || "CV";
  return { html, fileName: `${fileSafe(`${name} - CV - ${role.label}`)}.pdf`, fitOnePage: true };
}

// The CV shown in template previews: the user's first base CV, or a sample
// when there is none yet.
export function previewCvMarkdown() {
  for (const role of getSettings().roles) {
    const markdown = readText(baseCvPath(role.key));
    if (markdown) return markdown;
  }
  return fs.readFileSync(path.join(ROOT, "templates", "sample-cv.md"), "utf8");
}

// When a file last changed, so screens can reload after the engine edits it.
export function fileVersion(relative: string) {
  const full = inside(relative);
  return full && fs.existsSync(full) ? String(fs.statSync(full).mtimeMs) : "missing";
}
