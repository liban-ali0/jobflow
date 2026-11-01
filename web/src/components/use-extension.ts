"use client";

import { useCallback, useEffect, useState } from "react";

// Talks to the Offerbound browser extension through its bridge script on this
// page (extension/bridge.js): is it installed, and open application forms.

type Reply = { ok: boolean; message?: string; version?: string; connected?: boolean; pending?: boolean; kept?: number };

let counter = 0;

function ask(type: "ping" | "apply" | "connect" | "collect" | "checkMail" | "compose" | "checkListings", jobIds: number[] = [], timeout = 1500, token?: string, payload?: unknown): Promise<Reply | null> {
  return new Promise((resolve) => {
    const id = `jobflow-${Date.now()}-${(counter += 1)}`;
    const done = (reply: Reply | null) => {
      window.removeEventListener("message", listen);
      clearTimeout(timer);
      resolve(reply);
    };
    const listen = (event: MessageEvent) => {
      if (event.source === window && event.data?.source === "jobflow-extension" && event.data.id === id) done(event.data as Reply);
    };
    const timer = setTimeout(() => done(null), timeout);
    window.addEventListener("message", listen);
    window.postMessage({ source: "jobflow-app", id, type, jobIds, token, payload }, window.location.origin);
  });
}

export type ExtensionState = "checking" | "missing" | "no-key" | "ready";

export function useJobflowExtension() {
  const [state, setState] = useState<ExtensionState>("checking");

  const [version, setVersion] = useState<string | null>(null);
  const check = useCallback(async () => {
    const reply = await ask("ping");
    setState(!reply ? "missing" : reply.connected ? "ready" : "no-key");
    setVersion(reply?.version ?? null);
  }, []);

  useEffect(() => {
    let live = true;
    const ping = () => live && check();
    // The bridge loads after the page; it says hello when it is there.
    const hello = (event: MessageEvent) => {
      if (event.source === window && event.data?.source === "jobflow-extension" && event.data.type === "hello") ping();
    };
    window.addEventListener("message", hello);
    ping();
    return () => {
      live = false;
      window.removeEventListener("message", hello);
    };
  }, [check]);

  const apply = useCallback(async (jobIds: number[]) => {
    const reply = await ask("apply", jobIds, 30000);
    return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
  }, []);

  // Gives the extension this app's address and key.
  const connect = useCallback(
    async (token: string) => {
      const reply = await ask("connect", [], 5000, token);
      // The first time, the user confirms in the extension's own window.
      if (reply?.pending) {
        for (let i = 0; i < 60; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const ping = await ask("ping");
          if (ping?.connected) break;
        }
      }
      await check();
      return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
    },
    [check],
  );

  // Starts a collect run in the extension (it answers at once).
  const collect = useCallback(async () => {
    const reply = await ask("collect", [], 10000);
    return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
  }, []);

  // Reads new Gmail now (otherwise the extension checks every 15 minutes).
  const checkMail = useCallback(async () => {
    const reply = await ask("checkMail", [], 60000);
    return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
  }, []);

  // Opens an email in Gmail's compose window; the extension notes when it is sent.
  const compose = useCallback(async (email: { jobId: number; kind: string; url: string; to: string }) => {
    const reply = await ask("compose", [], 10000, undefined, email);
    return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
  }, []);

  // Checks Indeed listings in this browser (it answers at once).
  const checkListings = useCallback(async () => {
    const reply = await ask("checkListings", [], 10000);
    return reply ?? { ok: false, message: "The Offerbound extension did not answer. Reload this page and try again." };
  }, []);

  return { state, version, apply, connect, collect, checkMail, compose, checkListings, recheck: check };
}
