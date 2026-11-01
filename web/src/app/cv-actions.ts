"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import type { TemplateOptions } from "@/lib/cv-render";
import { getDocument, getSettings, setSettings } from "@/lib/data";
import { baseCvPath, readText, writeText } from "@/lib/documents";
import { parseCv, serializeCv } from "@/lib/cv-format";

// Whether a saved CV's text really changed: compared in the editor's own
// layout, since the editor sends the CV as it lays it out.
const cvChanged = (before: string, after: string) => serializeCv(parseCv(before)).trim() !== serializeCv(parseCv(after)).trim();
import { saveDocumentText } from "@/app/document-actions";
import { launch } from "@/lib/engine";
import { DEFAULT_TEMPLATE, cleanOptions, deleteTemplate, freeId, getTemplate, saveTemplate } from "@/lib/templates";

const choices = () => getSettings().cvTemplates ?? { default: DEFAULT_TEMPLATE, byRole: {} };

export async function setDefaultTemplate(id: string): Promise<ActionResult> {
  if (!getTemplate(id)) return { ok: false, message: "That template no longer exists." };
  setSettings({ cvTemplates: { ...choices(), default: id } });
  revalidatePath("/cvs");
  return { ok: true, message: "Default template set." };
}

// An empty id goes back to the default template for that role.
export async function setRoleTemplate(role: string, id: string): Promise<ActionResult> {
  if (id && !getTemplate(id)) return { ok: false, message: "That template no longer exists." };
  const current = choices();
  const byRole = { ...current.byRole };
  if (id) byRole[role] = id;
  else delete byRole[role];
  setSettings({ cvTemplates: { ...current, byRole } });
  revalidatePath("/cvs");
  return { ok: true, message: "Saved." };
}

export async function duplicateTemplate(id: string): Promise<ActionResult & { id?: string }> {
  const source = getTemplate(id);
  if (!source) return { ok: false, message: "That template no longer exists." };
  const copy = freeId(id);
  saveTemplate(copy, { name: `${source.name} copy`, description: source.description, options: source.options, css: source.css });
  revalidatePath("/cvs");
  return { ok: true, message: "Copied.", id: copy };
}

export async function removeTemplate(id: string): Promise<ActionResult> {
  const template = getTemplate(id);
  if (!template || template.builtIn) return { ok: false, message: "Built-in templates cannot be deleted." };
  deleteTemplate(id);
  revalidatePath("/cvs");
  // An edited built-in template goes back to the original under the same id.
  if (getTemplate(id)) return { ok: true, message: "Back to the original." };
  // Choices that pointed at a deleted template fall back to the default.
  const current = choices();
  const byRole = Object.fromEntries(Object.entries(current.byRole).filter(([, value]) => value !== id));
  setSettings({ cvTemplates: { default: current.default === id ? DEFAULT_TEMPLATE : current.default, byRole } });
  return { ok: true, message: "Template deleted." };
}

export async function saveTemplateOptions(id: string, input: { name: string; options: Partial<TemplateOptions> }): Promise<ActionResult> {
  const template = getTemplate(id);
  if (!template) return { ok: false, message: "That template no longer exists." };
  const name = input.name.trim() || template.name;
  // Editing a built-in template saves a personal copy under the same id.
  saveTemplate(id, { name, description: template.description, options: cleanOptions(input.options, template.options), css: template.css });
  revalidatePath("/cvs");
  return { ok: true, message: "Template saved." };
}

const DESCRIPTION_LIMIT = 1000;

// Asks the engine to design a new template from the user's description.
export async function designTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const description = String(formData.get("description") ?? "").replace(/\s+/g, " ").trim();
  if (description.length < 10) return { ok: false, message: "Describe the template in a sentence or two." };
  if (description.length > DESCRIPTION_LIMIT) return { ok: false, message: `Keep it under ${DESCRIPTION_LIMIT} characters.` };
  try {
    launch("design-template", null, "manual", description);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Designing it now. It appears here in a minute or two; progress is on Activity." };
}

const MARKDOWN_LIMIT = 30000;

// Saves the user's edit of a base CV. It is then locked, so rebuilding the
// profile does not overwrite it.
export async function saveBaseCv(role: string, markdown: string, templateId: string): Promise<ActionResult> {
  const settings = getSettings();
  if (!settings.roles.some((item) => item.key === role)) return { ok: false, message: "That role is no longer in Settings." };
  if (markdown.length > MARKDOWN_LIMIT) return { ok: false, message: "This CV is too long." };
  // Only a changed text is written (and locked): a new template alone is a choice.
  const changed = cvChanged(readText(baseCvPath(role)) ?? "", markdown);
  if (changed) writeText(baseCvPath(role), markdown);
  const current = choices();
  const byRole = { ...current.byRole };
  if (templateId && getTemplate(templateId)) byRole[role] = templateId;
  setSettings({ cvTemplates: { ...current, byRole }, ...(changed ? { cvLocked: [...new Set([...(settings.cvLocked ?? []), role])] } : {}) });
  revalidatePath("/cvs");
  return { ok: true, message: changed ? "Saved. AI updates on rebuild are now off for this CV, so your edits stay (switch it back on in CVs)." : "Template saved." };
}

// Whether rebuilding the profile may rewrite a base CV.
export async function setAutoUpdate(role: string, allowed: boolean): Promise<ActionResult> {
  const locked = new Set(getSettings().cvLocked ?? []);
  if (allowed) locked.delete(role);
  else locked.add(role);
  setSettings({ cvLocked: [...locked] });
  revalidatePath("/cvs");
  return { ok: true, message: allowed ? "Rebuilds will update this CV." : "Rebuilds will leave this CV alone." };
}

// Saves the user's edit of a job's CV or cover letter, and its template.
export async function saveJobDocument(documentId: number, markdown: string, templateId: string): Promise<ActionResult> {
  const doc = getDocument(documentId);
  if (!doc) return { ok: false, message: "This document no longer exists." };
  // Only a changed text is saved as a new version (which waits for review again).
  const before = readText(doc.path) ?? "";
  const changed = doc.type === "cv" ? cvChanged(before, markdown) : before.trim() !== markdown.trim();
  if (changed) {
    const outcome = await saveDocumentText(documentId, markdown);
    if (!outcome.ok) return outcome;
  }
  const current = choices();
  const byJob = { ...(current.byJob ?? {}) };
  if (templateId && getTemplate(templateId)) byJob[String(doc.job_id)] = templateId;
  setSettings({ cvTemplates: { ...current, byJob } });
  revalidatePath("/cvs");
  revalidatePath(`/jobs/${doc.job_id}`);
  return { ok: true, message: changed ? "Saved. It is waiting for your review on the job page." : "Template saved." };
}
