import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ROOT, getSettings } from "./data";
import { FONTS, type CvTemplate, type TemplateOptions } from "./cv-render";

// Built-in templates ship in templates/cv/. The user's own templates (copies
// and new ones) live in candidate/templates/, private to their copy.
const BUILT_IN = path.join(ROOT, "templates", "cv");
const CUSTOM = path.join(ROOT, "candidate", "templates");

export const DEFAULT_TEMPLATE = "classic";
const SAFE_ID = /^[a-z0-9-]{1,40}$/;

const DEFAULT_OPTIONS: TemplateOptions = {
  font: "arial",
  accent: "#1f2937",
  size: 10.5,
  margin: 15,
  spacing: "normal",
  sectionOrder: ["summary", "experience", "education", "projects", "skills", "certificates", "languages"],
};

function read(folder: string, id: string, builtIn: boolean): CvTemplate | null {
  const dir = path.join(folder, id);
  const file = path.join(dir, "template.json");
  if (!fs.existsSync(file)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(file, "utf8"));
    const cssFile = path.join(dir, "style.css");
    return {
      id,
      name: String(meta.name ?? id),
      description: String(meta.description ?? ""),
      builtIn,
      options: { ...DEFAULT_OPTIONS, ...meta.options },
      css: fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "",
    };
  } catch {
    return null;
  }
}

const idsIn = (folder: string) =>
  fs.existsSync(folder) ? fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];

// Built-in templates first (showing the user's edits where there are any),
// then the user's own.
export function listTemplates(): CvTemplate[] {
  const builtInIds = idsIn(BUILT_IN);
  const builtIn = builtInIds.map((id) => {
    const edited = read(CUSTOM, id, false);
    return edited ? { ...edited, builtIn: true, edited: true } : read(BUILT_IN, id, true);
  });
  const custom = idsIn(CUSTOM)
    .filter((id) => !builtInIds.includes(id))
    .map((id) => read(CUSTOM, id, false));
  return [...builtIn, ...custom].filter((template): template is CvTemplate => Boolean(template));
}

// A custom template with the same id as a built-in one replaces it, so
// editing a built-in template saves a personal copy.
export function getTemplate(id: string): CvTemplate | null {
  if (!SAFE_ID.test(id)) return null;
  return read(CUSTOM, id, false) ?? read(BUILT_IN, id, true);
}

// The template for a document: the job's own choice, else the role's, else
// the default.
export function templateFor(role?: string | null, jobTemplate?: string | null): CvTemplate {
  const choice = getSettings().cvTemplates ?? { default: DEFAULT_TEMPLATE, byRole: {} };
  const ids = [jobTemplate, role ? choice.byRole?.[role] : null, choice.default, DEFAULT_TEMPLATE];
  for (const id of ids) {
    const template = id ? getTemplate(id) : null;
    if (template) return template;
  }
  throw new Error("No CV template found. The templates folder is missing.");
}

export function cleanOptions(input: Partial<TemplateOptions>, base: TemplateOptions): TemplateOptions {
  const number = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    font: typeof input.font === "string" && input.font in FONTS ? input.font : base.font,
    accent: typeof input.accent === "string" && /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent.toLowerCase() : base.accent,
    size: number(input.size, base.size, 8, 13),
    margin: number(input.margin, base.margin, 8, 30),
    spacing: input.spacing === "tight" || input.spacing === "airy" || input.spacing === "normal" ? input.spacing : base.spacing,
    sectionOrder: Array.isArray(input.sectionOrder) ? input.sectionOrder.map(String).filter((key) => /^[\p{L}\p{N}-]{1,40}$/u.test(key)).slice(0, 20) : base.sectionOrder,
  };
}

export function saveTemplate(id: string, template: { name: string; description: string; options: TemplateOptions; css?: string }) {
  if (!SAFE_ID.test(id)) throw new Error("Template names may use letters, numbers, and dashes.");
  const dir = path.join(CUSTOM, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    `${JSON.stringify({ name: template.name.slice(0, 60), description: template.description.slice(0, 300), options: template.options }, null, 2)}\n`,
  );
  if (template.css !== undefined) fs.writeFileSync(path.join(dir, "style.css"), template.css);
}

export function deleteTemplate(id: string) {
  if (!SAFE_ID.test(id)) return;
  fs.rmSync(path.join(CUSTOM, id), { recursive: true, force: true });
}

// A free id for a copy, like "modern-2".
export function freeId(base: string) {
  const root = base.replace(/-\d+$/, "").slice(0, 34) || "template";
  for (let n = 2; ; n++) {
    const id = `${root}-${n}`;
    if (!getTemplate(id)) return id;
  }
}
