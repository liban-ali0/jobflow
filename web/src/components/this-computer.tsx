"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { setStartAtSignIn } from "@/app/actions";

type Status = {
  mode: "background" | "terminal" | "development";
  autostart: boolean;
  autostartSupported: boolean;
  since: string | null;
  log: string;
};

// Chrome and Edge offer installing a site as an app through this event.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const MODE_TEXT: Record<Status["mode"], string> = {
  background: "Running in the background: no window to keep open, and started again if it stops.",
  terminal: "Running from a terminal window (npm start): closing that window stops Offerbound.",
  development: "Running the development server (npm run app): closing its window stops Offerbound.",
};

// Settings → This computer: Offerbound as a desktop app. Starting at sign-in
// saves at once (it is not part of the settings form), and installing uses
// the browser's own "install as app".
export function ThisComputer({ status }: { status: Status }) {
  const [pending, start] = useTransition();
  const [autostart, setOptimistic] = useOptimistic(status.autostart);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () => setInstalled(standalone.matches);
    sync();
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setPrompt(null);
      setInstalled(true);
    };
    standalone.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      standalone.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  return (
    <div className="divide-y divide-line/70 text-sm">
      <div className="px-5 py-3.5 md:px-6">
        <p className="font-medium">{status.mode === "background" ? "In the background" : "In a window"}</p>
        <p className="mt-0.5 text-xs text-slate">{MODE_TEXT[status.mode]}</p>
      </div>

      <label className={`flex items-center justify-between gap-6 px-5 py-3.5 md:px-6 ${status.autostartSupported ? "cursor-pointer hover:bg-mist/50" : ""}`}>
        <span className={`min-w-0 ${status.autostartSupported ? "" : "opacity-60"}`}>
          <span className="text-sm font-medium">Start when I sign in to this computer</span>
          <span className="mt-0.5 block text-xs text-slate">
            Off until you turn it on. Offerbound then starts in the background each time you sign in (Windows, macOS or Linux), so the schedule, the extension and your phone always find it. Saved at once.
            {status.mode !== "background" && " It takes effect from the next sign-in; to switch over now, close this window and run node scripts/service.mjs start."}
          </span>
        </span>
        {/* No name: this is not part of the settings form. */}
        <input
          type="checkbox"
          role="switch"
          checked={autostart}
          disabled={!status.autostartSupported || pending}
          onChange={(event) => {
            const on = event.target.checked;
            start(async () => {
              setOptimistic(on);
              const result = await setStartAtSignIn(on);
              setMessage({ ok: result.ok, text: result.message });
            });
          }}
          className="switch"
        />
      </label>

      <div className="space-y-2 px-5 py-3.5 md:px-6">
        <p className="font-medium">Install as an app</p>
        {installed ? (
          <p className="text-xs text-slate">Installed: Offerbound has its own window, taskbar icon and Start menu entry.</p>
        ) : (
          <>
            <p className="max-w-2xl text-xs text-slate">
              Gives Offerbound its own window, a taskbar icon and a Start menu entry, like any other app. It still runs on this computer only.
              {!prompt && " In Chrome or Edge, use the install icon at the right of the address bar, or the menu: Cast, save and share → Install page as app (Edge: Apps → Install this site as an app). On a Mac, Safari can do it too: File → Add to Dock."}
            </p>
            {prompt && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await prompt.prompt();
                  const choice = await prompt.userChoice;
                  if (choice.outcome === "accepted") setPrompt(null);
                }}
              >
                Install Offerbound
              </button>
            )}
          </>
        )}
      </div>

      <div className="space-y-1 px-5 py-3.5 md:px-6">
        <p className="font-medium">Updates and the log</p>
        <p className="max-w-2xl text-xs text-slate">
          To get the latest version, run <code className="font-mono">node scripts/service.mjs update</code> in the Offerbound folder: it downloads it, installs it and restarts
          Offerbound. {status.log && <>The background log is in <code className="font-mono break-all">{status.log}</code>.</>}
        </p>
      </div>

      {message && (
        <p role="status" className={`px-5 py-3 md:px-6 ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
