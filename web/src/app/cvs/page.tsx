import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { runStage } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { AutoUpdateSwitch, DesignTemplateForm, PagePreview, RoleTemplateSelect, TemplateActions } from "@/components/cv-actions";
import { PageHeader } from "@/components/page-header";
import { ROOT, getSettings, hasCv, listAllDocuments, listRuns } from "@/lib/data";
import { baseCvPath, readText } from "@/lib/documents";
import { AtsBadge } from "@/components/ats-panel";
import { checkCv } from "@/lib/ats";
import { targetForJob, targetForRole } from "@/lib/ats-keywords";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_TEMPLATE, getTemplate, listTemplates } from "@/lib/templates";
import { STATUS_LABELS } from "@/lib/types";

const REVIEW = {
  draft: { label: "Waiting for review", tone: "bg-teal-soft text-teal" },
  approved: { label: "Approved", tone: "bg-go-soft text-go" },
  changes_requested: { label: "Changes requested", tone: "bg-coral-soft text-coral" },
} as const;

function Heading({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="mt-0.5 text-sm text-slate">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function ReviewChip({ review }: { review: keyof typeof REVIEW }) {
  const { label, tone } = REVIEW[review];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

const updatedAt = (relative: string) => {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.statSync(file).mtime.toISOString() : null;
};

export default function CvsPage() {
  const settings = getSettings();
  const templates = listTemplates();
  const choice = settings.cvTemplates ?? { default: DEFAULT_TEMPLATE, byRole: {} };
  const defaultTemplate = getTemplate(choice.default) ?? getTemplate(DEFAULT_TEMPLATE);
  const designing = listRuns(20).some((run) => run.stage === "design-template" && run.status === "running");
  const building = listRuns(20).some((run) => run.stage === "build-profile" && run.status === "running");
  const locked = new Set(settings.cvLocked ?? []);

  // Tailored CVs and cover letters, one row per job.
  const byJob = new Map<number, { title: string; company: string; status: string; docs: ReturnType<typeof listAllDocuments> }>();
  for (const doc of listAllDocuments(["cv", "cover_letter"])) {
    const row = byJob.get(doc.job_id) ?? { title: doc.job_title, company: doc.job_company, status: doc.job_status, docs: [] };
    row.docs.push(doc);
    byJob.set(doc.job_id, row);
  }

  return (
    <div className="max-w-6xl">
      <AutoRefresh active={designing || building} />
      <PageHeader
        eyebrow="Templates, base CVs, tailored CVs"
        title="CVs"
        description="How your CVs and cover letters look, the base CV for each role you search for, and the ones tailored to each job."
      />

      <section className="mt-10 space-y-5">
        <Heading title="Templates" hint="Every CV and cover letter is laid out with one of these. All are readable by CV-reading software (ATS)." />
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const isDefault = template.id === defaultTemplate?.id;
            return (
              <li key={template.id} className={`card flex gap-4 rounded-xl p-4 ${isDefault ? "border-primary ring-2 ring-primary/15" : ""}`}>
                <Link href={`/cvs/templates/${template.id}`} className="shrink-0" aria-label={`Edit ${template.name}`}>
                  <PagePreview src={`/api/templates/${template.id}`} title={`${template.name} preview`} width={120} />
                </Link>
                <div className="flex min-w-0 flex-col gap-2">
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-wide uppercase">{template.name}</h3>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {isDefault && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary">Default</span>}
                      <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] text-slate">
                        {template.builtIn ? (template.edited ? "Built in, edited" : "Built in") : "Yours"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate">{template.description}</p>
                  </div>
                  <div className="mt-auto">
                    <TemplateActions id={template.id} isDefault={isDefault} builtIn={template.builtIn} edited={Boolean(template.edited)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="card rounded-xl p-5">
          {designing ? (
            <p className="flex items-center gap-2 text-sm">
              <span className="fresh-dot size-2 rounded-full bg-saffron" aria-hidden />
              Designing a new template. It appears above when ready.
            </p>
          ) : (
            <DesignTemplateForm />
          )}
          <p className="mt-3 text-xs text-slate">Or use Copy on any template above and adjust it in the editor.</p>
        </div>
      </section>

      <section className="mt-14 space-y-5">
        <Heading title="Base CVs by role" hint="One for each role in Settings, built from your profile. Tailored CVs start from these.">
          <ActionButton action={runStage.bind(null, "build-profile", null)} disabled={!hasCv() || building} title={hasCv() ? undefined : "Add your CV in Setup first"}>
            {building ? "Rebuilding…" : "Rebuild all from profile"}
          </ActionButton>
        </Heading>
        {settings.roles.length === 0 ? (
          <p className="rounded-lg bg-mist px-4 py-6 text-center text-sm text-slate">
            No roles yet. Add the kinds of job you want in{" "}
            <Link href="/settings#roles" className="text-teal underline">
              Settings
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {settings.roles.map((role) => {
              const built = updatedAt(baseCvPath(role.key));
              return (
                <li key={role.key} className="card flex gap-4 rounded-xl p-4">
                  {built ? (
                    <a href={`/api/cvs/${role.key}`} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Open the ${role.label} CV`}>
                      <PagePreview src={`/api/cvs/${role.key}`} title={`${role.label} CV`} width={150} />
                    </a>
                  ) : (
                    <div className="grid h-[212px] w-[150px] shrink-0 place-items-center rounded-md border border-dashed border-field p-3 text-center text-xs text-slate">
                      Not built yet
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-wide uppercase">
                        {role.label}
                        {built && <AtsBadge score={checkCv(readText(baseCvPath(role.key)) ?? "", targetForRole(role.key)).score} />}
                      </h3>
                      <p className="text-xs text-slate">{built ? `Built ${formatDateTime(built)}` : "Use Rebuild all from profile."}</p>
                    </div>
                    <RoleTemplateSelect
                      role={role.key}
                      value={choice.byRole?.[role.key] ?? ""}
                      options={templates.map((template) => ({ id: template.id, name: template.name }))}
                      defaultName={defaultTemplate?.name ?? "Classic"}
                    />
                    {built && <AutoUpdateSwitch role={role.key} allowed={!locked.has(role.key)} />}
                    {built && (
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Link href={`/cvs/edit/base/${role.key}`} className="btn btn-primary px-3 py-1.5 text-xs">
                          Edit
                        </Link>
                        <a href={`/api/cvs/${role.key}?format=pdf`} className="btn btn-quiet px-3 py-1.5 text-xs">
                          Download PDF
                        </a>
                        <a href={`/api/cvs/${role.key}`} target="_blank" rel="noreferrer" className="btn btn-quiet px-3 py-1.5 text-xs">
                          Open
                        </a>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-14 space-y-5">
        <Heading title="Tailored for jobs" hint="Written for each job you research. Review and approve them on the job's page." />
        {byJob.size === 0 ? (
          <p className="rounded-lg bg-mist px-4 py-6 text-center text-sm text-slate">
            None yet. Select jobs on Today and use Research: the tailored CV and cover letter follow automatically.
          </p>
        ) : (
          <div className="card overflow-x-auto rounded-xl">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-slate">
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium">CV</th>
                  <th className="px-4 py-2.5 font-medium">Cover letter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {[...byJob.entries()].map(([jobId, row]) => (
                  <tr key={jobId} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${jobId}#documents`} className="font-medium hover:text-teal" dir="auto">
                        {row.title}
                      </Link>
                      <div className="text-xs text-slate" dir="auto">
                        {row.company} · {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}
                      </div>
                    </td>
                    {(["cv", "cover_letter"] as const).map((type) => {
                      const doc = row.docs.find((item) => item.type === type);
                      return (
                        <td key={type} className="px-4 py-3">
                          {doc ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ReviewChip review={doc.review} />
                                {type === "cv" && <AtsBadge score={checkCv(readText(doc.path) ?? "", targetForJob(jobId)).score} />}
                              </div>
                              <div className="flex gap-3 text-xs">
                                <Link href={`/cvs/edit/document/${doc.id}`} className="text-teal underline">
                                  Edit
                                </Link>
                                <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-teal underline">
                                  Open
                                </a>
                                <a href={`/api/documents/${doc.id}?format=pdf`} className="text-teal underline">
                                  PDF
                                </a>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate">Not written</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
