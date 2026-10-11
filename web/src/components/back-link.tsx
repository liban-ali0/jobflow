"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Browsers do not record the previous page for moves inside the app, so the
// app keeps its own: the screen before the current one, in this tab.
const KEY = "jobflow:history";
type History = { current: string; previous: string | null };

function readHistory(): History | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

// In the layout: notes each screen the user moves to.
export function NavigationTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const here = `${pathname}${search ? `?${search}` : ""}`;
    const history = readHistory();
    if (history?.current === here) return;
    // Only a move to another screen counts; filters on the same screen do not.
    const samePage = history?.current?.split("?")[0] === pathname;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ current: here, previous: samePage ? history?.previous ?? null : history?.current ?? null }));
    } catch {
      // Storage blocked: back links use their fallback.
    }
  }, [pathname, search]);
  return null;
}

const NAMES: [RegExp, string][] = [
  [/^\/$/, "Today"],
  [/^\/board/, "Board"],
  [/^\/questions/, "Questions"],
  [/^\/assistant\/\d+/, "Conversation"],
  [/^\/assistant/, "Assistant"],
  [/^\/profile/, "Profile"],
  [/^\/cvs\/templates\//, "Template"],
  [/^\/cvs\/edit\//, "CV editor"],
  [/^\/cvs/, "CVs"],
  [/^\/jobs\/\d+/, "Job"],
  [/^\/activity/, "Activity"],
  [/^\/settings/, "Settings"],
  [/^\/setup/, "Setup"],
];
const nameOf = (path: string) => NAMES.find(([pattern]) => pattern.test(path.split("?")[0]))?.[1] ?? "Back";

// "← <where you came from>" at the top of a record page; going back keeps
// that screen's filters and scroll position. Opened directly (a new tab, a
// link from outside), it leads to the page's natural parent instead.
export function BackLink({ fallbackHref, fallbackLabel }: { fallbackHref: string; fallbackLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [previous, setPrevious] = useState<string | null>(null);
  // Until the previous screen is known, the link just says "Back", so the
  // label does not flick from the fallback to the real one.
  const [known, setKnown] = useState(false);

  useEffect(() => {
    const history = readHistory();
    // This runs before the tracker (in the layout) has noted this screen, so
    // "current" may still be the screen the user came from.
    const came = history && history.current.split("?")[0] !== pathname ? history.current : history?.previous;
    // Reading storage only exists in the browser, after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (came && came.split("?")[0] !== pathname) setPrevious(came);
    setKnown(true);
  }, [pathname]);

  const className = "inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm font-medium text-slate hover:text-ink";
  if (!previous) {
    return (
      <Link href={fallbackHref} className={className}>
        <span aria-hidden>←</span> {known ? fallbackLabel : "Back"}
      </Link>
    );
  }
  return (
    <a
      href={previous}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.back();
      }}
      className={className}
    >
      <span aria-hidden>←</span> {nameOf(previous)}
    </a>
  );
}
