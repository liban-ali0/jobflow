import { notFound } from "next/navigation";
import { saveBaseCv } from "@/app/cv-actions";
import { CvEditor } from "@/components/cv-editor";
import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/data";
import { baseCvPath, fileVersion, readText } from "@/lib/documents";
import { stageRunning } from "@/lib/engine";
import { AutoRefresh } from "@/components/auto-refresh";
import { listTemplates, templateFor } from "@/lib/templates";
import { targetForRole } from "@/lib/ats-keywords";

export default async function EditBaseCvPage(props: PageProps<"/cvs/edit/base/[role]">) {
  const { role } = await props.params;
  const settings = getSettings();
  const found = settings.roles.find((item) => item.key === role);
  const markdown = found ? readText(baseCvPath(role)) : null;
  if (!found || markdown === null) notFound();
  // An improvement with no job is a base CV's.
  const improving = stageRunning("improve-cv", null);

  return (
    <div>
      <PageHeader eyebrow="Base CV" title={found.label} description="Tailored CVs for this role start from this one. Your edits are kept when the profile is rebuilt." />
      <div className="mt-6">
        <AutoRefresh active={improving} />
        <CvEditor
          key={fileVersion(baseCvPath(role))}
          kind="cv"
          initial={markdown}
          templates={listTemplates()}
          initialTemplate={templateFor(role).id}
          save={saveBaseCv.bind(null, role)}
          pdfHref={`/api/cvs/${role}?format=pdf`}
          backHref="/cvs"
          backLabel="← CVs"
          target={targetForRole(role)}
          improve={{ target: `base:${role}`, running: improving }}
          keywordSource={`the ${found.label} search keywords`}
        />
      </div>
    </div>
  );
}
