import { notFound } from "next/navigation";
import { saveJobDocument } from "@/app/cv-actions";
import { CvEditor } from "@/components/cv-editor";
import { BackLink } from "@/components/back-link";
import { getDocument, getJob, getSettings } from "@/lib/data";
import { PRINTABLE, fileVersion, readText } from "@/lib/documents";
import { stageRunning } from "@/lib/engine";
import { AutoRefresh } from "@/components/auto-refresh";
import { listTemplates, templateFor } from "@/lib/templates";
import { targetForJob } from "@/lib/ats-keywords";

export default async function EditJobDocumentPage(props: PageProps<"/cvs/edit/document/[id]">) {
  const { id } = await props.params;
  const doc = getDocument(Number(id));
  const job = doc ? getJob(doc.job_id) : null;
  const markdown = doc ? readText(doc.path) : null;
  if (!doc || !job || markdown === null || !PRINTABLE.has(doc.type)) notFound();
  const kind = doc.type === "cover_letter" ? "cover_letter" : "cv";
  const improving = stageRunning("improve-cv", job.id);

  return (
    <div>
      <AutoRefresh active={improving} />
      <BackLink fallbackHref={`/jobs/${job.id}#documents`} fallbackLabel="Job" />
      <div className="mt-3">
        <CvEditor
          key={fileVersion(doc.path)}
          kind={kind}
          heading={{
            code: `JF-${String(job.id).padStart(3, "0")}`,
            kind: kind === "cv" ? "Tailored CV" : "Cover letter",
            title: job.title,
            subtitle: job.company,
            note: "Saving sends it back for your review. Approve it on the job page when it is right.",
            review: doc.review,
          }}
          initial={markdown}
          templates={listTemplates()}
          initialTemplate={templateFor(job.role, getSettings().cvTemplates?.byJob?.[String(job.id)]).id}
          save={saveJobDocument.bind(null, doc.id)}
          pdfSrc={`/api/documents/${doc.id}`}
          target={targetForJob(job.id)}
          improve={kind === "cv" ? { target: `doc:${doc.id}`, running: improving } : undefined}
          keywordSource="this job's keywords"
        />
      </div>
    </div>
  );
}
