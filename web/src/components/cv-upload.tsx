"use client";

import { useActionState } from "react";
import { uploadCv } from "@/app/actions";

export function CvUpload({ current }: { current: string | null }) {
  const [result, action, pending] = useActionState(uploadCv, null);

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">
        {current ? (
          <>
            Current CV: <span className="font-mono text-xs">{current}</span>
          </>
        ) : (
          <span className="text-slate">No CV yet.</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="cv" accept="application/pdf,.pdf" required className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {current ? "Replace CV" : "Upload CV"}
        </button>
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
