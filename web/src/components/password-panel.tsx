"use client";

import { useState, useTransition } from "react";
import { removePassword, savePassword, signOutOtherBrowsers } from "@/app/actions";

const MIN_LENGTH = 8;

// Settings → This computer → Password. It sits inside the settings form, so
// its fields have no names (they are not settings) and Enter does not save
// the form; each button saves at once.
export function PasswordPanel({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setCurrent("");
        setNext("");
        setAgain("");
      }
    });

  const save = () => {
    if (next.length < MIN_LENGTH) return setMessage({ ok: false, text: `The password needs at least ${MIN_LENGTH} characters.` });
    if (next !== again) return setMessage({ ok: false, text: "The two new passwords are not the same." });
    run(() => savePassword(current, next));
  };
  const enter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    save();
  };

  const field = (id: string, label: string, value: string, set: (value: string) => void, autoComplete: string) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="password" value={value} onChange={(event) => set(event.target.value)} onKeyDown={enter} autoComplete={autoComplete} className="field w-full sm:w-64" />
    </div>
  );

  return (
    <div className="space-y-3 px-5 py-3.5 md:px-6">
      <div>
        <p className="font-medium">
          Password{" "}
          <span className={`ml-1 rounded-full px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase ${on ? "bg-teal-soft text-teal" : "bg-mist text-slate"}`}>{on ? "On" : "Off"}</span>
        </p>
        <p className="mt-0.5 max-w-2xl text-xs text-slate">
          {on
            ? "Every browser and device signs in with it, on this computer too. The extension keeps working with its own key."
            : "Off until you set one. With a password, Offerbound asks for it before opening, on this computer and on other devices: useful when other people use this computer. The extension keeps working with its own key."}
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {on && field("password-current", "Current password", current, setCurrent, "current-password")}
        {field("password-new", on ? "New password" : "Password", next, setNext, "new-password")}
        {field("password-again", "Once more", again, setAgain, "new-password")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className="btn btn-primary">
          {pending ? "Saving…" : on ? "Change password" : "Set password"}
        </button>
        {on && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => (current ? run(() => removePassword(current)) : setMessage({ ok: false, text: "Type the current password to remove it." }))}
              className="btn btn-quiet"
            >
              Remove password
            </button>
            <button type="button" disabled={pending} onClick={() => run(signOutOtherBrowsers)} className="btn btn-quiet">
              Sign out other devices
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                // A full load on purpose: the sign-in page comes from the
                // request proxy, not from the app's router.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/?login=out");
              }}
              className="btn btn-quiet"
            >
              Sign out
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-go" : "text-coral"}`}>
          {message.text}
        </p>
      )}
      <p className="text-xs text-slate">
        Forgot it? Run <code className="font-mono">node scripts/password.mjs off</code> in the Offerbound folder on this computer.
      </p>
    </div>
  );
}
