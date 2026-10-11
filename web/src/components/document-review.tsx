"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { approveDocument, requestChanges, rewriteDocuments, saveDocumentText } from "@/app/document-actions";
import { PagePreview } from "@/components/cv-actions";
import { Markdown } from "@/components/markdown";

export type ReviewDoc = {
  id: number;
  type: string;
  label: string;
  review: "draft" | "approved" | "changes_requested";
  note: string | null;
  text: string;
  printable: boolean;
  // Needs approval before the job is ready (everything except the research).
  inPackage: boolean;
  version: string;
};

const REVIEW = {
  draft: { label: "Waiting for review", dot: "bg-teal", chip: "bg-teal-soft text-teal" },
  approved: { label: "Approved", dot: "bg-go", chip: "bg-go-soft text-go" },
  changes_requested: { label: "Changes requested", dot: "bg-coral", chip: "bg-coral-soft text-coral" },
} as const;

export function DocumentReview({ jobId, docs, rewriting }: { jobId: number; docs: ReviewDoc[]; rewriting: boolean }) {
  const [current, setCurrent] = useState(docs.find((doc) => doc.inPackage && doc.review !== "approved")?.id ?? docs[0]?.id);
  const [mode, setMode] = useState<"read" | "edit" | "changes">("read");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const doc = docs.find((item) => item.id === current) ?? docs[0];
  if (!doc) return null;
  const packageDocs = docs.filter((item) => item.inPackage);
  const approved = packageDocs.filter((item) => item.review === "approved").length;
  const needsRewrite = docs.some((item) => item.review === "changes_requested");
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) after?.();
    });
  const open = (id: number) => {
    setCurrent(id);
    setMode("read");
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">
            {approved} of {packageDocs.length}
          </span>{" "}
          approved{approved === packageDocs.length ? " · ready to apply" : ". Approve all to mark the job ready to apply."}
        </p>
        {(needsRewrite || rewriting) && (
          <button type="button" disabled={pending || rewriting} onClick={() => run(() => rewriteDocuments(jobId))} className="btn btn-primary">
            {rewriting ? "Rewriting…" : "Rewrite requested changes"}
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Documents" className="flex flex-wrap gap-1.5 border-b border-line pb-2">
        {docs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === doc.id}
            onClick={() => open(item.id)}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-mist aria-selected:bg-primary aria-selected:text-on-primary"
          >
            {item.inPackage && <span className={`size-2 rounded-full ${REVIEW[item.review].dot}`} aria-hidden />}
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {doc.inPackage && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${REVIEW[doc.review].chip}`}>{REVIEW[doc.review].label}</span>}
          <div className="ml-auto flex flex-wrap gap-1.5">
            {doc.inPackage && doc.review !== "approved" && mode === "read" && (
              <button type="button" disabled={pending} onClick={() => run(() => approveDocument(doc.id))} className="btn btn-primary px-3 py-1.5 text-xs">
                Approve
              </button>
            )}
            {doc.inPackage && mode === "read" && (
              <button type="button" onClick={() => setMode("changes")} className="btn btn-quiet px-3 py-1.5 text-xs">
                Request changes
              </button>
            )}
            {mode === "read" &&
              (doc.printable ? (
                <Link href={`/cvs/edit/document/${doc.id}`} className="btn btn-quiet px-3 py-1.5 text-xs">
                  Edit
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(doc.text);
                    setMode("edit");
                  }}
                  className="btn btn-quiet px-3 py-1.5 text-xs"
                >
                  Edit
                </button>
              ))}
            {doc.printable && (
              <a href={`/api/documents/${doc.id}?format=pdf`} className="btn btn-quiet px-3 py-1.5 text-xs">
                Download PDF
              </a>
            )}
            {!doc.printable && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(doc.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="btn btn-quiet px-3 py-1.5 text-xs"
              >
                {copied ? "Copied" : "Copy text"}
              </button>
            )}
          </div>
        </div>

        {doc.review === "changes_requested" && doc.note && mode === "read" && (
          <p className="rounded-md bg-coral-soft px-3 py-2 text-sm">
            <span className="font-medium text-coral">Requested: </span>
            {doc.note}
          </p>
        )}

        {mode === "changes" && (
          <form
            className="space-y-2 rounded-lg border border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => requestChanges(doc.id, note), () => {
                setNote("");
                setMode("read");
              });
            }}
          >
            <label className="block text-sm font-medium" htmlFor="change-note">
              What should change?
            </label>
            <textarea
              id="change-note"
              autoFocus
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Shorter summary, lead with the payment system project, mention Docker."
              className="field"
              dir="auto"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={pending || !note.trim()} className="btn btn-primary px-3 py-1.5 text-xs">
                Save request
              </button>
              <button type="button" onClick={() => setMode("read")} className="btn btn-quiet px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === "edit" ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => saveDocumentText(doc.id, draft), () => setMode("read"));
            }}
          >
            <textarea
              aria-label={`${doc.label} text`}
              rows={22}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="field font-mono text-[13px] leading-relaxed"
              dir="auto"
            />
            {doc.printable && <p className="text-xs text-slate">Keep the layout lines as they are (#, ##, ###, and the | separators) so the template can lay it out.</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1.5 text-xs">
                Save
              </button>
              <button type="button" onClick={() => setMode("read")} className="btn btn-quiet px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </form>
        ) : doc.printable ? (
          <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="block w-fit" title="Open the full page">
            <PagePreview src={`/api/documents/${doc.id}?v=${doc.version}`} title={doc.label} width={560} />
          </a>
        ) : (
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-line bg-surface p-4">
            {/* An email is shown exactly as written, line by line. */}
            {doc.type === "email" ? <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="auto">{doc.text}</p> : <Markdown text={doc.text} />}
          </div>
        )}

        {result && (
          <p role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
