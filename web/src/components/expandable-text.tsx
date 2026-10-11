"use client";

import { useState } from "react";

// Long text shown as a preview that fades out, with a button for the rest.
export function ExpandableText({ text, previewLines = 12 }: { text: string; previewLines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > previewLines || text.length > previewLines * 110;
  return (
    <div>
      <div className={`relative ${!open && long ? "max-h-72 overflow-hidden" : ""}`}>
        <p className="text-sm leading-relaxed whitespace-pre-line" dir="auto">
          {text.trim()}
        </p>
        {!open && long && <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-surface to-transparent" />}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 text-sm font-medium text-teal hover:underline">
          {open ? "Show less" : "Show full listing"}
        </button>
      )}
    </div>
  );
}
