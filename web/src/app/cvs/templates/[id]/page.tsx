import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { TemplateEditor } from "@/components/template-editor";
import { previewCvMarkdown } from "@/lib/documents";
import { listTemplates } from "@/lib/templates";

export default async function TemplatePage(props: PageProps<"/cvs/templates/[id]">) {
  const { id } = await props.params;
  // From the list, which knows whether a built-in template was edited.
  const template = listTemplates().find((item) => item.id === id);
  if (!template) notFound();

  return (
    <div className="max-w-6xl">
      <BackLink fallbackHref="/cvs" fallbackLabel="CVs" />
      <div className="mt-3">
        <PageHeader eyebrow="Template" title={template.name} description={template.description} />
      </div>
      <div className="mt-8">
        <TemplateEditor template={template} sample={previewCvMarkdown()} />
      </div>
    </div>
  );
}
