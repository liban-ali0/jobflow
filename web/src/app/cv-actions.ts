"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import type { TemplateOptions } from "@/lib/cv-render";
import { getSettings, setSettings } from "@/lib/data";
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
