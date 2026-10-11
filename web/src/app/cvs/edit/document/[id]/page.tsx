import { notFound } from "next/navigation";
import { saveJobDocument } from "@/app/cv-actions";
import { CvEditor } from "@/components/cv-editor";
import { PageHeader } from "@/components/page-header";
import { getDocument, getJob, getSettings } from "@/lib/data";
import { PRINTABLE, readText } from "@/lib/documents";
import { listTemplates, templateFor } from "@/lib/templates";

export default async function EditJobDocumentPage(props: PageProps<"/cvs/edit/document/[id]">) {
  const { id } = await props.params;
  const doc = getDocument(Number(id));
  const job = doc ? getJob(doc.job_id) : null;
  const markdown = doc ? readText(doc.path) : null;
  if (!doc || !job || markdown === null || !PRINTABLE.has(doc.type)) notFound();
  const kind = doc.type === "cover_letter" ? "cover_letter" : "cv";

  return (
    <div>
      <PageHeader
        eyebrow={kind === "cv" ? "Tailored CV" : "Cover letter"}
        title={`${job.title} · ${job.company}`}
        description="Saving puts it back to waiting for your review. Approve it on the job page when it is right."
      />
      <div className="mt-6">
        <CvEditor
          kind={kind}
          initial={markdown}
          templates={listTemplates()}
          initialTemplate={templateFor(job.role, getSettings().cvTemplates?.byJob?.[String(job.id)]).id}
          save={saveJobDocument.bind(null, doc.id)}
          pdfHref={`/api/documents/${doc.id}?format=pdf`}
          backHref={`/jobs/${job.id}#documents`}
          backLabel="← Job"
        />
      </div>
    </div>
  );
}
