"use client";

import { useEffect, useRef } from "react";

// The real PDF, full screen, exactly as a recruiter receives it: the same
// file that downloads, shown in the browser's own PDF viewer.
export function PdfViewer({ open, onClose, src, title }: { open: boolean; onClose: () => void; src: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const view = `${src}${src.includes("?") ? "&" : "?"}format=pdf&view=1`;
  const download = `${src}${src.includes("?") ? "&" : "?"}format=pdf`;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed backdrop closes it.
        if (event.target === dialog.current) onClose();
      }}
      aria-label={`${title} as PDF`}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-[oklch(0.2_0.02_260/0.7)]"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <h2 className="mr-auto font-display text-lg font-semibold tracking-wide uppercase" dir="auto">
              {title}
              <span className="ml-2 font-sans text-xs font-normal tracking-normal text-slate normal-case">As the recruiter receives it</span>
            </h2>
            <a href={download} className="btn btn-quiet px-3 py-1.5 text-xs">
              Download PDF
            </a>
            <a href={view} target="_blank" rel="noreferrer" className="btn btn-quiet px-3 py-1.5 text-xs">
              Open in new tab ↗
            </a>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md text-xl text-slate hover:bg-mist hover:text-ink" aria-label="Close">
              ×
            </button>
          </header>
          <iframe src={view} title={`${title} PDF`} className="min-h-0 w-full flex-1 border-0 bg-mist" />
        </div>
      )}
    </dialog>
  );
}
