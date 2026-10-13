"use client";

import { useState, useTransition } from "react";
import { signOutDevices } from "@/app/actions";

// Opening Offerbound on a phone: through Tailscale, with a pairing link that
// gives that device its access cookie once. Signing devices out makes a new key.
export function OtherDevices({ links, path }: { links: string[]; path: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="max-w-2xl text-slate">
        Offerbound only answers this computer. Other devices reach it through Tailscale: install Tailscale on the phone, sign in to the same account, then open the link below on the phone once.
        The link is a key: share it with no one.
      </p>
      {(links.length ? links : [path]).map((link) => (
        <span key={link} className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-mist px-2 py-1 font-mono text-xs break-all">{link}</code>
          <button type="button" onClick={() => copy(link)} className="btn btn-quiet px-2.5 py-1 text-xs">
            {copied === link ? "Copied" : "Copy"}
          </button>
        </span>
      ))}
      {!links.length && <p className="text-xs text-slate">Put this computer&rsquo;s Tailscale address in front, for example http://100.x.y.z:3000{path.slice(0, 6)}…</p>}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await signOutDevices();
              setMessage(result.message);
            })
          }
          className="btn btn-quiet"
        >
          {pending ? "Signing out…" : "Sign out every other device"}
        </button>
        {message && (
          <span role="status" className="text-sm text-go">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
