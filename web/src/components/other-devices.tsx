"use client";

import { useState, useTransition } from "react";
import { signOutDevices } from "@/app/actions";

type Lan = { enabled: boolean; open: boolean; links: { link: string; qr: string }[] };

// Opening Offerbound on a phone: on the home Wi-Fi (lib/lan.ts) or through
// Tailscale, with a pairing link that gives that device its access cookie
// once. Signing devices out makes a new key.
export function OtherDevices({ links, path, lan }: { links: string[]; path: string; lan: Lan }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const copy = async (text: string) => {
    // The clipboard API needs https; over plain http the old way works.
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };
  const linkRow = (link: string) => (
    <span key={link} className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-mist px-2 py-1 font-mono text-xs break-all">{link}</code>
      <button type="button" onClick={() => copy(link)} className="btn btn-quiet px-2.5 py-1 text-xs">
        {copied === link ? "Copied" : "Copy"}
      </button>
    </span>
  );
  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-3">
        <h4 className="font-medium">On your home Wi-Fi</h4>
        {!lan.enabled ? (
          <p className="max-w-2xl text-slate">Switch on “Open on my home Wi-Fi” above and save; the code to scan appears here.</p>
        ) : lan.links.length === 0 ? (
          <p className="max-w-2xl text-coral">This computer is not on a home network right now (no Wi-Fi or cable address found).</p>
        ) : (
          <>
            <p className="max-w-2xl text-slate">
              {lan.open ? "Open now." : "Opening within a minute."} On the phone, join the same Wi-Fi and scan the code with the camera (or open the link). That signs the phone in; after that,
              the address without the key is enough. The code is a key: show it to no one.
            </p>
            <ul className="flex flex-wrap gap-6">
              {lan.links.map(({ link, qr }) => (
                <li key={link} className="space-y-2">
                  {/* The code as an image, made on the server from the link. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Pairing code: scan it with the phone's camera" width={176} height={176} className="rounded-lg bg-white p-2" />
                  {linkRow(link)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">Anywhere, through Tailscale</h4>
        <p className="max-w-2xl text-slate">
          Away from home, Tailscale connects the phone to this computer privately: install it on both, sign in to the same account, run <code className="font-mono text-xs">tailscale serve --bg 3000</code> on this
          computer, and open the pairing link below on the phone once.
        </p>
        {(links.length ? links : [path]).map(linkRow)}
        {!links.length && <p className="text-xs text-slate">Put the address tailscale serve shows in front, for example https://your-pc.your-tailnet.ts.net{path.slice(0, 6)}…</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-4">
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
