"use client";

import { useState, useSyncExternalStore } from "react";
import { useJobflowExtension } from "./use-extension";

type Browser = "chrome" | "firefox";

// The browser this page is open in, to show its steps first.
const noSubscribe = () => () => {};
const isFirefox = () => /firefox\//i.test(navigator.userAgent);

function CopyField({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <code className="rounded bg-mist px-2 py-1 font-mono text-xs break-all">{text}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="btn btn-quiet px-2.5 py-1 text-xs"
        aria-label={`Copy ${label}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

const STEPS: Record<Browser, (folder: string) => React.ReactNode[]> = {
  chrome: (folder) => [
    <>
      Open a new tab and go to this address (browsers do not open it from a link):
      <CopyField text="chrome://extensions" label="the extensions address" />
      <span className="text-xs text-slate">In Edge it is edge://extensions, and the same steps follow.</span>
    </>,
    <>Switch on <b>Developer mode</b> (top right).</>,
    <>
      Press <b>Load unpacked</b> and choose this folder:
      <CopyField text={folder} label="the folder" />
    </>,
    <>Come back to this page and press <b>Connect</b> below.</>,
  ],
  firefox: (folder) => [
    <>
      Open a new tab and go to this address:
      <CopyField text="about:debugging#/runtime/this-firefox" label="the debugging address" />
    </>,
    <>
      Press <b>Load Temporary Add-on…</b> and choose the file <span className="font-mono text-xs">manifest.json</span> in this folder:
      <CopyField text={folder} label="the folder" />
    </>,
    <>Come back to this page and press <b>Connect</b> below. If the extension asks, allow it on job sites.</>,
  ],
};

// Installing and connecting the Offerbound browser extension, in Chrome (or
// Edge) and Firefox. Connect hands the extension this app's address and key,
// so nothing is pasted.
export function ExtensionSetup({ token, folder }: { token: string; folder: string }) {
  const extension = useJobflowExtension();
  const detected: Browser = useSyncExternalStore(noSubscribe, () => (isFirefox() ? "firefox" : "chrome"), () => "chrome");
  const [chosen, setChosen] = useState<Browser | null>(null);
  const browser = chosen ?? detected;
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  const status =
    extension.state === "ready"
      ? { text: `Connected${extension.version ? ` · version ${extension.version}` : ""}`, tone: "text-go" }
      : extension.state === "no-key"
        ? { text: "Installed, not connected yet", tone: "text-coral" }
        : extension.state === "missing"
          ? { text: "Not installed in this browser", tone: "text-slate" }
          : { text: "Checking…", tone: "text-slate" };

  return (
    <div className="border-t border-line/70 px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Offerbound browser extension</p>
        <p className={`text-sm font-medium ${status.tone}`} role="status">
          {status.text}
        </p>
      </div>
      <p className="mt-0.5 max-w-2xl text-sm text-slate">
        Works with any engine. It fills application forms from your approved documents and marks what it cannot fill (you always press Submit), and it sends job pages to Offerbound from sites that block automated access.
      </p>

      {extension.state !== "ready" && (
        <>
          <div className="mt-3 flex gap-1" role="tablist" aria-label="Browser">
            {(["chrome", "firefox"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={browser === key}
                onClick={() => setChosen(key)}
                className="rounded px-3 py-1 text-sm hover:bg-mist aria-selected:bg-primary aria-selected:text-on-primary"
              >
                {key === "chrome" ? "Chrome or Edge" : "Firefox"}
              </button>
            ))}
          </div>
          <ol className="mt-3 max-w-2xl list-decimal space-y-2.5 pl-5 text-sm">
            {STEPS[browser](folder).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {browser === "firefox" && (
            <p className="mt-2 max-w-2xl text-xs text-slate">Firefox removes a temporary add-on when it closes: repeat steps 1 and 2 after restarting Firefox (Offerbound stays connected).</p>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || extension.state === "missing" || extension.state === "checking"}
          onClick={async () => {
            setBusy(true);
            setResult({ ok: true, message: "Confirm in the small Offerbound window that opens…" });
            const reply = await extension.connect(token);
            setResult(
              !reply.ok
                ? { ok: false, message: reply.message ?? "" }
                : reply.pending
                  ? { ok: true, message: "When you press Connect in that window, the status above changes to Connected." }
                  : { ok: true, message: "Connected. The extension can now fill forms and send pages to Offerbound." },
            );
            setBusy(false);
          }}
          className={`btn ${extension.state === "ready" ? "btn-quiet" : "btn-primary"}`}
        >
          {extension.state === "ready" ? "Connect again" : "Connect"}
        </button>
        {extension.state === "missing" && (
          <button type="button" onClick={() => extension.recheck()} className="text-sm text-teal underline">
            I installed it: check again
          </button>
        )}
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-go" : "text-coral"}`}>
            {result.message}
          </span>
        )}
      </div>

      <details className="mt-3 max-w-2xl text-sm">
        <summary className="cursor-pointer text-slate">Connect by hand instead</summary>
        <p className="mt-2 text-slate">In the extension, open Settings and paste this key (address: this page&rsquo;s address, for example http://localhost:3000):</p>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded bg-mist px-2 py-1 font-mono text-xs">{shown ? token : "•".repeat(16)}</code>
          <button type="button" onClick={() => setShown(!shown)} className="btn btn-quiet px-2.5 py-1 text-xs">
            {shown ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={() => navigator.clipboard.writeText(token)} className="btn btn-quiet px-2.5 py-1 text-xs">
            Copy
          </button>
        </span>
      </details>
    </div>
  );
}
