"use client";

import { useState } from "react";

// How to connect the Jobflow browser extension: where to load it from, and
// the key it sends with each page.
export function ExtensionSetup({ token, folder }: { token: string; folder: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="border-t border-line/70 px-5 py-4 md:px-6">
      <p className="text-sm font-medium">Jobflow browser extension</p>
      <p className="mt-0.5 max-w-2xl text-sm text-slate">
        For any site, and with Codex too: on a job site, press &ldquo;Send this page to Jobflow&rdquo; and the engine for &ldquo;Import jobs from the browser&rdquo; adds the jobs on it.
      </p>
      <ol className="mt-3 max-w-2xl list-decimal space-y-2 pl-5 text-sm">
        <li>
          In Chrome, open <span className="font-mono text-xs">chrome://extensions</span>, switch on Developer mode, choose Load unpacked, and pick this folder:
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-mist px-2 py-1 font-mono text-xs break-all">{folder}</code>
            <button type="button" onClick={() => copy("folder", folder)} className="btn btn-quiet px-2.5 py-1 text-xs">
              {copied === "folder" ? "Copied" : "Copy"}
            </button>
          </span>
        </li>
        <li>
          Open the extension, and paste this key:
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-mist px-2 py-1 font-mono text-xs">{shown ? token : "•".repeat(16)}</code>
            <button type="button" onClick={() => setShown(!shown)} className="btn btn-quiet px-2.5 py-1 text-xs">
              {shown ? "Hide" : "Show"}
            </button>
            <button type="button" onClick={() => copy("key", token)} className="btn btn-quiet px-2.5 py-1 text-xs">
              {copied === "key" ? "Copied" : "Copy"}
            </button>
          </span>
        </li>
      </ol>
    </div>
  );
}
