import "server-only";
import { parseCv } from "./cv-format";
import { renderCv, type CvTemplate } from "./cv-render";
import { auditAts } from "@/vendor/career-ops/verify-ats.mjs";

// How well a template's page can be read by an ATS (single column, real text,
// safe fonts, contact details in the body, no hidden text), from career-ops'
// verify-ats (MIT). It judges the layout, not the words, so it is the same for
// every job that uses the template and is kept out of the CV's score.
export type TemplateCheck = { score: number; grade: string; issues: { severity: string; message: string }[] };

export function checkTemplates(markdown: string, templates: CvTemplate[]): Record<string, TemplateCheck> {
  const doc = parseCv(markdown);
  return Object.fromEntries(
    templates.map((template) => {
      const result = auditAts(renderCv(doc, template), { keywords: [] });
      return [template.id, { score: result.score, grade: result.grade, issues: result.issues.map(({ severity, message }: { severity: string; message: string }) => ({ severity, message })) }];
    }),
  );
}
