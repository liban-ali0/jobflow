import { notFound } from "next/navigation";
import { saveBaseCv } from "@/app/cv-actions";
import { CvEditor } from "@/components/cv-editor";
import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/data";
import { baseCvPath, readText } from "@/lib/documents";
import { listTemplates, templateFor } from "@/lib/templates";

export default async function EditBaseCvPage(props: PageProps<"/cvs/edit/base/[role]">) {
  const { role } = await props.params;
  const settings = getSettings();
  const found = settings.roles.find((item) => item.key === role);
  const markdown = found ? readText(baseCvPath(role)) : null;
  if (!found || markdown === null) notFound();

  return (
    <div>
      <PageHeader eyebrow="Base CV" title={found.label} description="Tailored CVs for this role start from this one. Your edits are kept when the profile is rebuilt." />
      <div className="mt-6">
        <CvEditor
          kind="cv"
          initial={markdown}
          templates={listTemplates()}
          initialTemplate={templateFor(role).id}
          save={saveBaseCv.bind(null, role)}
          pdfHref={`/api/cvs/${role}?format=pdf`}
          backHref="/cvs"
          backLabel="← CVs"
        />
      </div>
    </div>
  );
}
